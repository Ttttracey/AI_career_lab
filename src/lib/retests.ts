import { db, USER_ID, parse } from './db';
import { verifiedItem, catalogValue } from './catalog';
import { provider } from './ai';
import { saveEvaluation } from './service';
import { rubricVersion, skills, type SkillId } from './content';
import type { Review } from './core';
import type { CatalogInput } from './catalog-schema';

export type RetestQuestion = CatalogInput & { id: string; skillId: SkillId; sourceId: string };
export async function practice(id: string, answer: string, requestKey: string) {
  const old = await db.practiceAttempt.findUnique({ where: { requestKey } }); if (old) { if (old.itemId !== id || old.answer !== answer) throw new Error('提交标识冲突。'); return old; }
  const row = await verifiedItem(id); const q = catalogValue(row);
  if (q.kind !== 'question' || !answer.trim()) throw new Error('请选择练习题，并填写回答。');
  if (q.questionType === 'single' && (!/^\d+$/.test(answer) || Number(answer) >= q.options.length)) throw new Error('请选择有效选项。');
  const attempt = await db.practiceAttempt.create({ data: { userId: USER_ID, itemId: id, answer, questionSnapshot: JSON.stringify(q), requestKey, result: JSON.stringify(q.questionType === 'single' ? { correct: Number(answer) === q.answerIndex, explanation: q.reference } : {}) } });
  await db.planItem.updateMany({ where: { resourceId: 'lib:' + id, plan: { userId: USER_ID } }, data: { status: 'done' } });
  return attempt;
}
export async function reviewPractice(id: string) {
  const attempt = await db.practiceAttempt.findFirstOrThrow({ where: { id, userId: USER_ID } });
  const q = parse<CatalogInput>(attempt.questionSnapshot, {} as CatalogInput);
  if (q.questionType !== 'scenario') throw new Error('选择题使用固定答案核对，不生成能力等级。');
  const old = await db.evaluation.findUnique({ where: { userId_sourceType_sourceId: { userId: USER_ID, sourceType: 'practice', sourceId: id } } }); if (old) return old;
  const sources = { [attempt.id]: attempt.answer };
  const review = await provider().reviewSubmission({ scope: '资料库情境练习 · ' + q.title, sources, covered: q.skillIds, rubric: q.rubric });
  return saveEvaluation('practice', id, '情境练习 · ' + q.title, review, sources, q.skillIds);
}
export async function startRetest(requestKey: string) {
  const old = await db.retestSession.findUnique({ where: { requestKey } }); if (old) return old;
  const active = await db.retestSession.findFirst({ where: { userId: USER_ID, status: { not: 'completed' } } }); if (active) return active;
  const previous = await db.retestSession.findMany({ where: { userId: USER_ID }, orderBy: { createdAt: 'desc' } });
  const used = previous.flatMap(p => parse<RetestQuestion[]>(p.questions, []).map(q => q.id));
  const candidates = await db.catalogItem.findMany({ where: { userId: USER_ID, kind: 'question', questionType: 'scenario', status: 'verified' }, orderBy: { createdAt: 'asc' } });
  const questions: RetestQuestion[] = []; const missing: string[] = [];
  for (const skill of skills) {
    const items = candidates.filter(c => parse<string[]>(c.skillIds, []).length === 1 && parse<string[]>(c.skillIds, []).includes(skill.id));
    const item = items.find(c => !used.includes(c.id)) ?? [...items].sort((a, b) => used.filter(id => id === a.id).length - used.filter(id => id === b.id).length)[0];
    if (!item) { missing.push(skill.name); continue; }
    questions.push({ ...catalogValue(item), id: item.id, skillId: skill.id, sourceId: 'r' + questions.length });
  }
  if (missing.length) throw new Error('已核对的情境题不足，缺少：' + missing.join('、') + '。请先补充题库。');
  return db.retestSession.create({ data: { userId: USER_ID, questions: JSON.stringify(questions), rubricVersion, requestKey } });
}
export async function saveRetest(id: string, answers: Record<string, string>, status: 'active' | 'paused' | 'completed') {
  const session = await db.retestSession.findFirstOrThrow({ where: { id, userId: USER_ID } });
  if (session.status === 'completed') { if (JSON.stringify(answers) !== session.answers) throw new Error('已完成复测不能覆盖，请开始新一轮。'); return session; }
  const questions = parse<RetestQuestion[]>(session.questions, []);
  if (Object.keys(answers).some(key => !questions.some(q => q.sourceId === key))) throw new Error('复测题目不存在。');
  if (status === 'completed' && questions.some(q => !answers[q.sourceId]?.trim())) throw new Error('请回答全部六题后完成；也可以暂停保存。');
  return db.retestSession.update({ where: { id }, data: { answers: JSON.stringify(answers), status, completedAt: status === 'completed' ? new Date() : null } });
}
export async function reviewRetest(id: string) {
  const session = await db.retestSession.findFirstOrThrow({ where: { id, userId: USER_ID, status: 'completed' } });
  const old = await db.evaluation.findUnique({ where: { userId_sourceType_sourceId: { userId: USER_ID, sourceType: 'retest', sourceId: id } } }); if (old) return old;
  const questions = parse<RetestQuestion[]>(session.questions, []); const answers = parse<Record<string, string>>(session.answers, {});
  const sources = Object.fromEntries(questions.map(q => [id + ':' + q.sourceId, answers[q.sourceId]]));
  const ai = provider();
  const review: Review = ai.demo ? { summary: '演示复测：已保留本轮六份回答，以下按对应问题提供检查要点。未调用真实模型，不计算能力变化。', items: questions.map(q => ({ skillId: q.skillId, level: null, evidenceReferences: [{ sourceId: id + ':' + q.sourceId, quote: answers[q.sourceId].slice(0, 160) }], strengths: ['本轮回答已作为独立记录保存，便于回看与修改。'], gaps: ['演示模式未判断回答质量，请逐项对照本题参考要点。'], nextActions: [q.reference] })) } : await ai.assessBaseline({ scope: '六维情境复测；每维度仅一道题', sources, covered: skills.map(s => s.id), rubric: JSON.stringify(questions.map(q => ({ sourceId: id + ':' + q.sourceId, skillId: q.skillId, question: q.body, rubric: q.rubric }))) });
  for (const item of review.items) if (item.evidenceReferences.some(ref => questions.find(q => id + ':' + q.sourceId === ref.sourceId)?.skillId !== item.skillId)) throw new Error('评价引用与题目维度不符，回答已保留，请重试。');
  return saveEvaluation('retest', id, '六维情境复测 · ' + new Date(session.createdAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }), review, sources, skills.map(s => s.id));
}
