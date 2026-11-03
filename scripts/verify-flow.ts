import assert from 'node:assert/strict';
import { mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { baselineQuestions, lessons, sampleJob } from '../src/lib/content';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
async function main() {
if (process.argv.includes('--prepare')) {
  mkdirSync('test-results', { recursive: true });
  const path = resolve(process.env.TEST_DB_PATH || 'test-results/browser.db');
  if (!existsSync(path)) {
    const sqlite = new DatabaseSync(path);
    for (const folder of readdirSync('prisma/migrations').filter(f => /^\d/.test(f)).sort()) sqlite.exec(readFileSync(resolve('prisma/migrations', folder, 'migration.sql'), 'utf8'));
    sqlite.close();
  }
  process.env.DATABASE_URL = 'file:' + path.replaceAll('\\', '/');
  const { seed } = await import('../src/lib/seed'); const { db } = await import('../src/lib/db');
  await seed(); await db.$disconnect();
  console.log('隔离浏览器测试库已准备：' + path);
} else {
  async function state() { const res = await fetch(base + '/api/state'); assert.equal(res.status, 200); return res.json() as Promise<import('../src/lib/service').AppState>; }
  async function act(action: string, data: unknown = {}, expected = 200) { const res = await fetch(base + '/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ action, data }) }); const value = await res.json(); assert.equal(res.status, expected, JSON.stringify(value)); return value.result; }
  for (const path of ['/', '/onboarding', '/onboarding/report', '/dashboard', '/roadmap', '/learn/l01', '/projects', '/projects/knowledge-assistant', '/interviews', '/profile']) assert.equal((await fetch(base + path)).status, 200, path);
  const first = await state(); const quote = first.home.contentId;
  assert.equal((await state()).home.contentId, quote);
  await act('profile', { background: '【验证数据】内容运营，希望理解 AI 产品工作', experience: '【验证数据】暂无实际产品项目，先完成训练', targetRole: '初级 AI 产品经理', dailyMinutes: 30, timezone: 'Asia/Shanghai', onboardingStep: 1 });
  await act('job', { original: sampleJob, analyze: true });
  await act('confirmJob', { analysis: JSON.parse((await state()).job!.analysis) });
  const answers = Object.fromEntries(baselineQuestions.map((q, i) => [q.id, [
    '我会问最近一次查制度的情境、用了什么方法、卡在哪里，再判断核心问题。尚未访谈，先把它记为假设。',
    '优先验证检索有效制度再回答的 RAG 方案。但检索会漏文件，仍需权限和版本过滤，不能保证没有幻觉。',
    '找不到依据时说明当前资料未覆盖，展示相关原文目录，允许转行政同事，不生成无依据的金额。',
    '准备正常、无答案、冲突与越权样例，逐条判定引用和事实正确性，分开计算不同题型的分母。',
    '两周只验证只读制度查询，限制资料和人数，检查费用与延迟；越权失败就停止扩量。',
    '这是模拟训练项目。我计划完成场景和测试样例，尚未上线，也没有效率提升数据。下一步先验证用户需求。',
  ][i]]));
  await act('baseline', { answers });
  assert.deepEqual(JSON.parse((await state()).assessment!.answers), answers);
  await act('finishBaseline');
  assert.equal((await state()).plans.length, 0);
  assert.equal((await state()).homeAction.href, '/onboarding/report');
  const guide = (await state()).baselineGuide!;
  assert.equal(guide.items.length, 6);
  await act('buildPlan');
  assert.equal((await state()).homeAction.href, '/roadmap');
  const item = (await state()).plans[0].items[0];
  await act('plan', { id: item.id, status: 'active' });
  assert.equal((await state()).homeAction.href, '/learn/l01');
  const quiz = Object.fromEntries(lessons[0].quiz.map((q, i) => [i, q.answer]));
  await act('quiz', { lessonId: 'l01', answers: quiz, submit: true }); await act('quiz', { lessonId: 'l01', answers: quiz, submit: true });
  assert.equal((await state()).events.filter(e => e.type === 'lesson').length, 1);
  await act('draft', { taskId: 'stage-a', content: '# 验证草稿\n\n员工报销前需要找到当前生效的制度，优先验证版本辨识是否困难。' });
  const one = await act('submit', { taskId: 'stage-a', content: '# 用户场景与需求优先级\n\n【模拟背景】禾川设计的新员工在报销前查制度。\n\n【假设】当前核心困难是分不清有效版本，尚未访谈。\n\n## 访谈问题\n1. 最近一次报销前怎样找制度？\n2. 卡住时问了谁？\n3. 怎样判断文件是否生效？\n\n## 优先级\n先验证有效版本查找，再考虑语言归纳。依据是错误制度可能导致报销返工，但频率与损失仍待验证。\n\n【目标指标】访谈后定义，不视为结果。\n【已验证结果】暂无真实业务测试。', requestKey: 'http-test-submit-one' });
  const again = await act('submit', { taskId: 'stage-a', content: '重复请求不会覆盖第一份内容', requestKey: 'http-test-submit-one' });
  assert.equal(one.id, again.id);
  await act('reviewSubmission', { id: one.id });
  const two = await act('submit', { taskId: 'stage-a', content: one.content + '\n\n## 下一步\n分别访问行政和新员工，记录最近一次查找路径，验证优先级。', requestKey: 'http-test-submit-two' });
  assert.equal(two.version, one.version + 1);
  await act('portfolio', { id: one.id, included: true });
  const markdown = await (await fetch(base + '/api/export?submission=' + one.id)).text();
  assert.ok(markdown.includes(one.content)); assert.ok(markdown.includes('版本：v1')); assert.ok(!markdown.includes('分别访问行政'));
  await act('ask', { contextId: 'l01', question: '怎样把一个模糊想法变成可验收的需求？', requestKey: 'http-test-tutor-question' });
  const interview = await act('startInterview', { mode: 'text', projectId: 'knowledge-assistant', requestKey: 'http-test-interview-start' });
  let current = (await state()).interviews.find(s => s.id === interview.id)!;
  await act('interviewDraft', { sessionId: interview.id, turnId: current.turns[0].id, draft: '【草稿】先辨别当前有效制度。' });
  await act('interviewStatus', { sessionId: interview.id, status: 'paused' });
  assert.equal((await state()).interviews.find(s => s.id === interview.id)!.status, 'paused');
  await act('interviewStatus', { sessionId: interview.id, status: 'active' });
  for (let i = 0; i < 10; i++) {
    current = (await state()).interviews.find(s => s.id === interview.id)!;
    if (current.status === 'ended') break;
    const turn = current.turns.at(-1)!;
    const payload = { sessionId: interview.id, turnId: turn.id, answer: answers[baselineQuestions[turn.mainIndex - 1].id], requestKey: 'http-answer-' + turn.id };
    await act('answerInterview', payload); await act('answerInterview', payload);
  }
  await act('reviewInterview', { sessionId: interview.id });
  const final = await state();
  assert.equal(final.evidence.length, 0); assert.equal(final.interviews[0].status, 'ended'); assert.ok(final.interviews[0].turns.length <= 10);
  const audio = await fetch(base + '/api/audio?kind=transcribe', { method: 'POST', headers: { Origin: base } });
  assert.equal(audio.status, 400); assert.match((await audio.json()).error, /尚未配置/);
  const crossOrigin = await fetch(base + '/api/actions', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'switchQuote', data: {} }) });
  assert.equal(crossOrigin.status, 400);
  const badKey = await fetch(base + '/api/actions', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'answerInterview', data: {} }) }); assert.equal(badKey.status, 400);
  console.log(JSON.stringify({ ok: true, pages: 10, baselineQuestions: guide.items.length, feedbackBeforePlan: true, lessons: final.progress.length, formalVersions: final.submissions.filter(s => !s.isDraft).length, interviewTurns: final.interviews[0].turns.length, demoEvidenceCount: final.evidence.length, reportId: interview.id }, null, 2));
}
}
main().catch(e => { console.error(e); process.exitCode = 1; });
