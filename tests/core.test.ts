import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { homeDestination, localDate, locateEvidence, nextInterviewTurn, validateAudio, validatePlan } from '../src/lib/core';
import { baselineQuestions, lessons, sampleJob, type SkillId } from '../src/lib/content';
import { buildBaselineGuide, demoBaselineReview, validateBaselineSources, baselineReason } from '../src/lib/baseline';
const directory = mkdtempSync(join(tmpdir(), 'ai-career-lab-test-'));
const databasePath = join(directory, 'test.db');
process.env.DATABASE_URL = 'file:' + databasePath.replaceAll('\\', '/');
process.env.OPENAI_API_KEY = '';
let service: typeof import('../src/lib/service');
let database: typeof import('../src/lib/db');
before(async () => {
  const sqlite = new DatabaseSync(databasePath);
  sqlite.exec('PRAGMA foreign_keys=ON;');
  for (const folder of readdirSync(resolve('prisma/migrations')).filter(f => /^\d/.test(f)).sort()) sqlite.exec(readFileSync(resolve('prisma/migrations', folder, 'migration.sql'), 'utf8'));
  sqlite.close();
  database = await import('../src/lib/db');
  service = await import('../src/lib/service');
  const { seed } = await import('../src/lib/seed'); await seed(); await seed();
});
after(async () => { await database.db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
test('home: real state routes correctly; date respects user timezone', () => {
  assert.equal(homeDestination('', false, false), '/onboarding');
  assert.equal(homeDestination('AI PM', true, false, '/learn/l01'), '/onboarding');
  assert.equal(homeDestination('AI PM', true, true, '/learn/l01'), '/learn/l01');
  assert.equal(homeDestination('AI PM', true, true), '/roadmap');
  assert.equal(localDate('Asia/Shanghai', new Date('2026-10-27T20:00:00Z')), '2026-10-28');
});
test('seed is repeatable; daily quote persists and can only switch deliberately', async () => {
  assert.equal(await database.db.lesson.count(), 12);
  assert.equal(await database.db.projectTask.count(), 4);
  const a = await service.homeView(); const b = await service.homeView();
  assert.equal(a.contentId, b.contentId);
  assert.notEqual((await service.homeView(true)).contentId, a.contentId);
  assert.equal(await database.db.homeContentView.count(), 1);
  assert.equal(await database.db.homeContent.count({ where: { type: 'news' } }), 0);
  assert.equal((await service.getState()).homeAction.label, '开始我的第一步');
});
test('onboarding shows feedback before creating a plan; demo evidence never becomes ability', async () => {
  await assert.rejects(() => service.buildPlan());
  await service.saveProfile({ background: '运营转行', experience: '暂无产品经验', targetRole: '初级 AI 产品经理', dailyMinutes: 30, timezone: 'Asia/Shanghai', onboardingStep: 1 });
  await service.saveJob(sampleJob, true);
  const state = await service.getState();
  const analysis = JSON.parse(state.job!.analysis);
  for (const item of analysis.requirements) assert.ok(sampleJob.includes(item.quote));
  await service.confirmJob(analysis);
  const answers = Object.fromEntries(baselineQuestions.map(q => [q.id, `我会先明确用户和使用场景，并验证相关假设。${q.question}`]));
  await service.saveBaseline(answers);
  assert.deepEqual(JSON.parse((await service.getState()).assessment!.answers), answers);
  await service.finishBaseline(); await service.finishBaseline();
  const completed = await service.getState();
  assert.ok(completed.assessment!.completedAt);
  assert.equal(completed.plans.length, 0);
  assert.equal(completed.homeAction.href, '/onboarding/report');
  assert.equal(completed.baselineGuide!.items.length, 6);
  const recommendedLessons = completed.baselineGuide!.items.filter(i => completed.baselineGuide!.priorities.includes(i.questionId)).map(i => i.lessonId);
  assert.ok(recommendedLessons.includes(completed.suggestions[0].resourceId));
  assert.equal(completed.evidence.length, 0);
  assert.equal(completed.evaluations[0].demo, true);
  assert.ok(JSON.parse(completed.evaluations[0].result).items.every((i: {level: number | null}) => i.level === null));
  assert.equal(completed.evaluations.filter(e => e.sourceType === 'baseline').length, 1);
  await service.buildPlan(); await service.buildPlan();
  const planned = await service.getState();
  assert.equal(planned.plans.length, 1); assert.equal(planned.plans[0].items.length, 17);
  assert.equal(planned.user.onboardingStep, 3);
  assert.equal(planned.homeAction.href, '/roadmap');
  assert.match(planned.plans[0].items.find(i => i.resourceId === 'l10')!.reason, /第 3 题/);
  await assert.rejects(() => service.saveBaseline({ ...answers, b1: '改动已完成原文' }));
});
test('baseline text checks respond to each answer, trace only its own source, and never grade keyword presence', () => {
  const answers = { b1: '我会梳理工作流程与场景。', b2: '我选择检索文档，注意幻觉，制度每次更新要核对版本。', b3: '我不太清楚，请帮我从异常流程开始。', b4: '先检查准确率与一致性。', b5: '先做核心查询，其他风险我不知道。', b6: '我想做一个文件工具，目前只是计划，还没有测试数据。' };
  const guide = buildBaselineGuide(answers);
  assert.deepEqual(guide.priorities, ['b3', 'b5']);
  assert.match(guide.summary, /第 3、5 题/);
  assert.equal(guide.items[1].checks[2].mentioned, true);
  assert.equal(guide.items[3].checks[2].mentioned, false);
  assert.match(guide.items[3].nextAction, /正常题之外|分母|判定/);
  for (const item of guide.items) {
    for (const check of item.checks) if (check.evidence) assert.equal(item.answer.slice(check.evidence.startOffset, check.evidence.endOffset), check.evidence.quote);
    assert.ok(lessons.some(l => l.id === item.lessonId));
  }
  const review = validateBaselineSources(demoBaselineReview(answers));
  assert.equal(new Set(review.items.map(i => i.nextActions.join(''))).size, 6);
  for (const item of review.items) {
    assert.equal(item.level, null);
    const questionId = baselineQuestions.find(q => q.skillId === item.skillId)!.id;
    for (const ref of item.evidenceReferences) { assert.equal(ref.sourceId, questionId); assert.ok(answers[questionId as keyof typeof answers].includes(ref.quote)); }
  }
  const negation = demoBaselineReview({ ...answers, b2: '没有风险，绝不会幻觉。' });
  assert.equal(negation.items[1].level, null);
  assert.ok(negation.items[1].strengths.every(s => !/正确|优秀|掌握/.test(s) || /正确性/.test(s)));
  assert.match(baselineReason('l10', guide), /第 3 题/);
  assert.match(baselineReason('l11', guide), /第 5 题/);
});
test('baseline cross-question references are rejected and existing plan arrangements are preserved', async () => {
  const review = demoBaselineReview({ b1: '工作场景', b2: '检索资料', b3: '不知道', b4: '指标', b5: '范围', b6: '计划' });
  review.items[2].evidenceReferences = [{ sourceId: 'b1', quote: '工作场景' }];
  assert.throws(() => validateBaselineSources(review), /其他题目/);
  const initial = await service.getState();
  const item = initial.plans[0].items[2];
  await service.planAction(item.id, undefined, '2026-11-17', 22);
  await database.db.userProfile.update({ where: { id: 'local-learner' }, data: { onboardingStep: 2 } });
  const before = await service.getState();
  assert.equal(before.homeAction.href, '/onboarding/report');
  await service.buildPlan();
  const after = await service.getState();
  assert.deepEqual(after.plans, before.plans);
  assert.equal(after.assessment!.answers, before.assessment!.answers);
  assert.deepEqual(after.evaluations, before.evaluations);
  assert.equal(after.user.onboardingStep, 3);
});
test('quiz drafts persist and concurrent retry earns XP only once', async () => {
  await service.saveQuiz('l01', { 0: 1 }, false);
  assert.equal(JSON.parse((await database.db.lessonProgress.findFirst())!.answers)['0'], 1);
  const answers = Object.fromEntries(lessons[0].quiz.map((q, i) => [i, q.answer]));
  await Promise.all([service.serialized(() => service.saveQuiz('l01', answers, true)), service.serialized(() => service.saveQuiz('l01', answers, true))]);
  assert.equal(await database.db.growthEvent.count({ where: { type: 'lesson' } }), 1);
  assert.equal((await database.db.growthEvent.findFirst({ where: { type: 'lesson' } }))!.xp, 20);
});
test('formal versions and reviews survive new drafts; database rejects source modification', async () => {
  await service.saveDraft('stage-a', '草稿一');
  assert.equal((await database.db.submission.findFirst({ where: { isDraft: true } }))!.content, '草稿一');
  const [a, duplicate] = await Promise.all([service.serialized(() => service.submitProject('stage-a', '目标用户是新员工。核心问题是制度版本不清晰，假设待验证。', 'test-submit-version-1')), service.serialized(() => service.submitProject('stage-a', '目标用户是新员工。核心问题是制度版本不清晰，假设待验证。', 'test-submit-version-1'))]);
  assert.equal(a.id, duplicate.id);
  await service.reviewSubmission(a.id); await service.reviewSubmission(a.id);
  const b = await service.submitProject('stage-a', '版本二：补充最近一次报销的访谈问题，优先验证有效制度的查找。', 'test-submit-version-2');
  assert.equal(b.version, 2); assert.equal(a.version, 1);
  assert.equal((await database.db.submission.findUnique({ where: { id: a.id } }))!.content, a.content);
  assert.equal(await database.db.evaluation.count({ where: { sourceId: a.id } }), 1);
  await assert.rejects(() => database.db.submission.update({ where: { id: a.id }, data: { content: '覆盖旧版本' } }));
  await service.portfolio(a.id, true);
  const markdown = await service.exportSubmission(a.id);
  assert.match(markdown, /训练项目/); assert.match(markdown, /版本：v1/); assert.match(markdown, /假设/); assert.ok(markdown.includes(a.content)); assert.ok(!markdown.includes(b.content));
  assert.equal(await database.db.growthEvent.count({ where: { type: 'project' } }), 1);
});
test('evidence validates exact source, allowed dimensions, null versus zero and invalid resource IDs', () => {
  const base = { summary: '本次小范围表现', items: [{ skillId: 'user_insight' as SkillId, level: 0, evidenceReferences: [{ sourceId: 'real', quote: '直接做 AI' }], strengths: [], gaps: [], nextActions: [] }] };
  const result = locateEvidence(base, { real: '我想直接做 AI。' }, ['user_insight']);
  assert.equal(result[0].level, 0); assert.equal(result[0].evidenceReferences[0].startOffset, 2);
  assert.equal(locateEvidence(base, { real: '我想直接做 AI。' }, ['user_insight'], true)[0].level, null);
  assert.throws(() => locateEvidence(base, { real: '没有这句话' }, ['user_insight']));
  assert.throws(() => locateEvidence(base, { real: '直接做 AI' }, ['evaluation']));
  assert.throws(() => validatePlan({ items: [{ resourceId: 'invented-id', reason: '幻觉课程' }] }));
});
test('interview state: pause/resume, duplicate answers, bounded followups, finish/review are idempotent', async () => {
  const session = await service.startInterview('text', undefined, 'test-start-interview');
  assert.equal((await service.startInterview('text', undefined, 'test-start-interview')).id, session.id);
  await service.interviewStatus(session.id, 'paused');
  let current = (await service.getState()).interviews.find(s => s.id === session.id)!;
  await assert.rejects(() => service.answerInterview(session.id, current.turns[0].id, '回答', 'test-paused-answer'));
  await service.interviewStatus(session.id, 'active');
  for (let i = 0; i < 10; i++) {
    current = (await service.getState()).interviews.find(s => s.id === session.id)!;
    if (current.status === 'ended') break;
    const turn = current.turns.at(-1)!;
    const key = 'test-answer-' + turn.id;
    await service.saveInterviewDraft(session.id, turn.id, '先找最近一次使用场景。');
    await service.serialized(() => service.answerInterview(session.id, turn.id, '我会先确认资料与权限，准备测试样例验证。', key));
    await service.serialized(() => service.answerInterview(session.id, turn.id, '我会先确认资料与权限，准备测试样例验证。', key));
  }
  current = (await service.getState()).interviews.find(s => s.id === session.id)!;
  assert.equal(current.status, 'ended'); assert.equal(current.turns.length, 10);
  assert.equal(current.turns.filter(t => t.parentId).length, 5);
  assert.ok(current.turns.every(t => t.answer));
  await service.endInterview(session.id); await service.endInterview(session.id);
  await assert.rejects(() => service.interviewStatus(session.id, 'active'));
  await service.reviewInterview(session.id); await service.reviewInterview(session.id);
  assert.equal(await database.db.evaluation.count({ where: { sourceId: session.id } }), 1);
  assert.equal(await database.db.growthEvent.count({ where: { sourceId: session.id } }), 1);
  assert.equal(await database.db.skillEvidence.count(), 0);
});
test('early finish does not treat unanswered questions as wrong or award completion XP', async () => {
  const s = await service.startInterview('text', undefined, 'test-empty-interview');
  await service.endInterview(s.id);
  await assert.rejects(() => service.reviewInterview(s.id));
  assert.equal(await database.db.growthEvent.count({ where: { sourceId: s.id } }), 0);
  assert.equal(nextInterviewTurn({ mainIndex: 5, parentId: 'parent', answer: '已回答' }, true), null);
});
test('voice rejects empty, oversized and forged audio; valid magic bytes are required', () => {
  assert.throws(() => validateAudio(new Uint8Array(), 'audio/webm', 1));
  assert.throws(() => validateAudio(new Uint8Array(10 * 1024 * 1024 + 1), 'audio/webm', 1));
  assert.throws(() => validateAudio(new TextEncoder().encode('not actual audio'), 'audio/webm', 1));
  assert.throws(() => validateAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), 'audio/webm', 121));
  assert.equal(validateAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 1]), 'audio/webm;codecs=opus', 2), 'webm');
});
test('home: submitted unchanged draft is not pending; all finished tasks offer roadmap exploration', async () => {
  await database.db.planItem.updateMany({ data: { status: 'done' } });
  const state = await service.getState();
  assert.equal(state.homeAction.href, '/roadmap');
  assert.equal(state.homeAction.label, '看看接下来练什么');
  await database.db.planItem.updateMany({ where: { resourceId: 'l02' }, data: { status: 'todo' } });
  assert.equal((await service.getState()).homeAction.label, '继续今天的成长');
});

test('catalog import validates rows, previews duplicates, commits once and blocks unverified learning', async () => {
  const catalog = await import('../src/lib/catalog'); const retests = await import('../src/lib/retests');
  assert.equal(await database.db.catalogItem.count({ where: { origin: 'original' } }), 48);
  const valid = { kind: 'question', title: '导入测试', body: '如何在制度缺失时保留用户下一步？', skillIds: ['product_design'], reference: '说明缺失并转人工', rubric: '评估流程与依据', sourceLabel: '测试原文', locator: '第 1 段' };
  const batch = await catalog.previewImport('test.json', JSON.stringify([valid, valid, { title: '无正文字段' }]), 'import-test-batch');
  const rows = JSON.parse(batch.preview).rows;
  assert.equal(rows[0].duplicate, false); assert.equal(rows[1].duplicate, true); assert.ok(rows[2].error);
  assert.deepEqual(await catalog.commitImport(batch.id, [0, 1]), { added: 1, duplicates: 1 });
  assert.deepEqual(await catalog.commitImport(batch.id, [0]), { added: 1, duplicates: 1 });
  const item = await database.db.catalogItem.findFirstOrThrow({ where: { title: '导入测试' } });
  await assert.rejects(() => retests.practice(item.id, '回答', 'practice-pending'));
  await assert.rejects(() => service.askQuestion('lib:' + item.id, '解释一下', 'ask-pending-question'));
  await assert.rejects(() => catalog.addCatalogPlan(item.id));
  await assert.rejects(() => catalog.verifyCatalog(item.id, 'verified', ''));
  await catalog.verifyCatalog(item.id, 'verified', '已核对测试来源、题目与标准。');
  await catalog.addCatalogPlan(item.id); await catalog.addCatalogPlan(item.id);
  assert.equal(await database.db.planItem.count({ where: { resourceId: 'lib:' + item.id } }), 1);
  await service.askQuestion('lib:' + item.id, '如何理解转人工？', 'ask-verified-question');
});
test('CSV preserves quoted commas and newlines; malformed inputs cannot become resources', async () => {
  const { parseCsv } = await import('../src/lib/catalog'); const { validateCatalog } = await import('../src/lib/catalog-schema');
  const rows = parseCsv('body,title,skillIds,sourceLabel\n"正文,含逗号\n和换行",题目,"[""evaluation""]",本地资料');
  assert.equal(rows[0].body, '正文,含逗号\n和换行'); assert.deepEqual(rows[0].skillIds, ['evaluation']);
  assert.throws(() => parseCsv('body,title\n"未闭合,标题'));
  assert.throws(() => validateCatalog({ kind:'material',title:'标题',body:'原文',skillIds:['invented'],sourceLabel:'来源' }));
  assert.throws(() => validateCatalog({ kind:'material',title:'标题',body:'原文',skillIds:['evaluation'],sourceLabel:'来源',lessonIds:['missing'] }));
});
test('practice snapshots survive source edits; retries do not duplicate attempts or evidence', async () => {
  const catalog = await import('../src/lib/catalog'); const retests = await import('../src/lib/retests');
  const item = await database.db.catalogItem.findFirstOrThrow({ where: { title: '导入测试' } });
  const attempt = await retests.practice(item.id, '先说明没有依据，再给出转人工入口；金额待核实。', 'practice-once-key');
  assert.equal((await retests.practice(item.id, attempt.answer, 'practice-once-key')).id, attempt.id);
  await assert.rejects(() => retests.practice(item.id, '另一个回答', 'practice-once-key'));
  await retests.reviewPractice(attempt.id); await retests.reviewPractice(attempt.id);
  assert.equal(await database.db.evaluation.count({ where: { sourceId: attempt.id } }), 1);
  const before = attempt.questionSnapshot;
  await catalog.saveCatalog(item.id, { ...catalog.catalogValue(item), title:'修改后的标题', body:item.body+'请写验收条件。' });
  assert.equal((await database.db.catalogItem.findUniqueOrThrow({where:{id:item.id}})).status,'pending');
  assert.equal((await database.db.practiceAttempt.findUniqueOrThrow({where:{id:attempt.id}})).questionSnapshot,before);
  await assert.rejects(() => database.db.practiceAttempt.update({where:{id:attempt.id},data:{answer:'覆盖原文'}}));
  assert.equal(await database.db.skillEvidence.count(),0);
});
test('profile history records meaningful changes once and retains A to B to A', async () => {
  const original = (await service.getState()).user;
  const form = {background:original.background,experience:original.experience,targetRole:original.targetRole,dailyMinutes:original.dailyMinutes,timezone:original.timezone,onboardingStep:original.onboardingStep};
  const count = await database.db.archiveSnapshot.count({where:{kind:'profile'}});
  await service.saveProfile(form); assert.equal(await database.db.archiveSnapshot.count({where:{kind:'profile'}}),count);
  await service.saveProfile({...form,background:'新的真实背景记录'}); await service.saveProfile(form);
  assert.equal(await database.db.archiveSnapshot.count({where:{kind:'profile'}}),count+2);
  const record=await database.db.archiveSnapshot.findFirstOrThrow({where:{kind:'profile'}});
  await assert.rejects(()=>database.db.archiveSnapshot.update({where:{id:record.id},data:{content:'覆盖'}}));
});
test('retest pauses, resumes, finishes immutably; parallel questions change and demo stays ungraded', async () => {
  const retests = await import('../src/lib/retests');
  const first=await retests.startRetest('retest-start-once');
  assert.equal((await retests.startRetest('retest-start-once')).id,first.id);
  assert.equal((await retests.startRetest('different-start-key')).id,first.id);
  const questions=JSON.parse(first.questions) as import('../src/lib/retests').RetestQuestion[];
  assert.equal(questions.length,6); assert.equal(new Set(questions.map(q=>q.skillId)).size,6);
  await assert.rejects(()=>retests.saveRetest(first.id,{},'completed'));
  await retests.saveRetest(first.id,{r0:'先核实使用情境'},'paused');
  assert.equal((await database.db.retestSession.findUniqueOrThrow({where:{id:first.id}})).status,'paused');
  const answers=Object.fromEntries(questions.map(q=>[q.sourceId,'这是训练假设：先核对原文和用户场景，再验证方案取舍。']));
  await retests.saveRetest(first.id,answers,'active'); await retests.saveRetest(first.id,answers,'completed');
  await retests.saveRetest(first.id,answers,'completed');
  await assert.rejects(()=>retests.saveRetest(first.id,{...answers,r0:'覆盖原答案'},'completed'));
  await assert.rejects(()=>database.db.retestSession.update({where:{id:first.id},data:{questions:'[]'}}));
  const evaluation=await retests.reviewRetest(first.id);await retests.reviewRetest(first.id);
  const review=JSON.parse(evaluation.result);
  assert.equal(review.items.length,6);assert.ok(review.items.every((i:{level:number|null})=>i.level===null));
  for(const item of review.items)for(const ref of item.evidenceReferences){const q=questions.find(q=>first.id+':'+q.sourceId===ref.sourceId)!;assert.equal(item.skillId,q.skillId);assert.ok(answers[q.sourceId].includes(ref.quote));}
  assert.equal(await database.db.skillEvidence.count(),0);
  const second=await retests.startRetest('retest-start-second');
  const secondQuestions=JSON.parse(second.questions) as import('../src/lib/retests').RetestQuestion[];
  assert.ok(secondQuestions.every(q=>!questions.some(p=>p.id===q.id)));
});
test('explicit quiz attempts preserve each submission; retry key is unique and XP remains once', async () => {
  const answers=Object.fromEntries(lessons[0].quiz.map((q,i)=>[i,q.answer]));
  const before=await database.db.quizAttempt.count();
  await service.saveQuiz('l01',answers,true,'explicit-quiz-key');await service.saveQuiz('l01',answers,true,'explicit-quiz-key');
  assert.equal(await database.db.quizAttempt.count(),before+1);
  await service.saveQuiz('l01',answers,true,'explicit-second-quiz-key');
  assert.equal(await database.db.quizAttempt.count(),before+2);
  assert.equal(await database.db.growthEvent.count({where:{type:'lesson',sourceId:'l01'}}),1);
});
test('unchanged job drafts do not manufacture new history versions', async () => {
  const job=await database.db.jobTarget.findUniqueOrThrow({where:{userId:'local-learner'}});
  const before=await database.db.archiveSnapshot.count({where:{kind:'job'}});
  await service.saveJob(job.original);await service.saveJob(job.original);
  assert.equal(await database.db.archiveSnapshot.count({where:{kind:'job'}}),before);
});
test('confirmed reset clears practice references and private history without deleting curriculum', async () => {
  await service.resetData();
  assert.equal(await database.db.practiceAttempt.count(),0);assert.equal(await database.db.quizAttempt.count(),0);
  assert.equal(await database.db.retestSession.count(),0);assert.equal(await database.db.evaluation.count(),0);
  assert.equal(await database.db.catalogItem.count(),48);assert.equal(await database.db.lesson.count(),12);
  assert.equal((await service.getState()).user.targetRole,'');
});
test('decision scenarios persist deliberate choices without grading or duplicate snapshots', async () => {
  const {scenarios}=await import('../src/lib/scenarios');assert.equal(Object.keys(scenarios).length,12);
  const before=await database.db.growthEvent.count();
  const a=await service.saveLessonDecision('l01',0);const duplicate=await service.saveLessonDecision('l01',0);assert.equal(a.id,duplicate.id);
  const b=await service.saveLessonDecision('l01',1);assert.equal(b.version,a.version+1);
  assert.equal(JSON.parse(b.content).selected,scenarios.l01.choices[1].label);
  await assert.rejects(()=>service.saveLessonDecision('missing',0));await assert.rejects(()=>service.saveLessonDecision('l01',2));
  assert.equal(await database.db.growthEvent.count(),before);assert.equal(await database.db.skillEvidence.count(),0);
});
test('continuation honors real available plan items, prerequisites and manual active choices', async () => {
  const {nextPlanStep}=await import('../src/lib/navigation');
  const item=(id:string,position:number,prerequisites:string[]=[],status='todo')=>({id,resourceId:id,status,position,prerequisites:JSON.stringify(prerequisites),minutes:12,reason:'训练安排'});
  const items=[item('l01',0,[],'done'),item('l02',1,['l01']),item('l03',2,['l02']),item('unknown',3),item('lib:pending',4)];
  assert.equal(nextPlanStep(items,'l01',[{id:'pending',title:'待核对',status:'pending'}])!.resourceId,'l02');
  assert.equal(nextPlanStep([...items,item('l04',5,[],'active')],'l01')!.resourceId,'l04');
  assert.equal(nextPlanStep([item('l01',0,[],'done')],'l01'),null);
});
test('return navigation keeps known local context and blocks external or malformed destinations', async () => {
  const {safeReturn,withReturn}=await import('../src/lib/navigation');
  assert.equal(safeReturn('/profile/library?q=RAG&filter=question'),'/profile/library?q=RAG&filter=question');
  assert.equal(safeReturn('https://external.example'),'/roadmap');assert.equal(safeReturn('//external.example'),'/roadmap');
  assert.equal(safeReturn('/\\external.example'),'/roadmap');assert.equal(safeReturn('/api/actions'),'/roadmap');
  assert.match(withReturn('/projects/knowledge-assistant?stage=stage-b','/learn/l06'),/stage=stage-b&from=%2Flearn%2Fl06/);
});
