import { scenarios } from './scenarios';
import { snapshot, profileValue, jobValue, digest } from './history';
import { verifiedItem } from './catalog';
import type { LessonContent } from './content';
import { Prisma } from '@prisma/client';
import { db, USER_ID, parse } from './db';
import { provider, capabilities, promptVersion } from './ai';
import { lessons, skills, baselineQuestions, projectTasks, rubricVersion, type SkillId } from './content';
import { localDate, homeDestination, locateEvidence, nextInterviewTurn, validatePlan, validateJob, type Review, jobSchema } from './core';
import { buildBaselineGuide, baselineReason, validateBaselineSources } from './baseline';

// Local single-user service. Serialize writes and AI transitions; database constraints
// remain the final guard. Never keep a SQLite transaction open during network calls.
const globalLocks = globalThis as unknown as { trainingQueue?: Promise<unknown> };
export async function serialized<T>(work: () => Promise<T>): Promise<T> {
  const previous = globalLocks.trainingQueue ?? Promise.resolve();
  let release!: () => void;
  globalLocks.trainingQueue = new Promise<void>(r => { release = r; });
  await previous.catch(() => {});
  try { return await work(); } finally { release(); }
}
function requireResource(id: string) { if (!lessons.some(l => l.id === id) && !projectTasks.some(t => t.id === id) && id !== 'interview') throw new Error('学习资源不存在。'); }
function resourceHref(id: string) { if (id.startsWith('lib:')) return '/profile/library/' + id.slice(4); return id === 'interview' ? '/interviews' : id.startsWith('stage-') ? '/projects/knowledge-assistant?stage=' + id : '/learn/' + id; }
async function growth(tx: Prisma.TransactionClient, type: string, sourceId: string, xp: number) {
  await tx.growthEvent.upsert({ where: { userId_type_sourceId: { userId: USER_ID, type, sourceId } }, update: {}, create: { userId: USER_ID, type, sourceId, xp } });
}
export async function homeView(switchContent = false) {
  const user = await db.userProfile.findUniqueOrThrow({ where: { id: USER_ID } });
  const date = localDate(user.timezone);
  const contents = await db.homeContent.findMany({ where: { enabled: true, OR: [{ type: { in: ['thought', 'encouragement'] } }, { type: 'news', verified: true, sourceUrl: { not: null }, publishedAt: { not: null } }] }, orderBy: { id: 'asc' } });
  if (!contents.length) throw new Error('没有可用的首屏内容，请运行种子脚本。');
  const current = await db.homeContentView.findUnique({ where: { userId_localDate: { userId: USER_ID, localDate: date } } });
  const existingIndex = contents.findIndex(c => c.id === current?.contentId);
  const previous = !current ? await db.homeContentView.findFirst({ where: { userId: USER_ID, localDate: { lt: date } }, orderBy: { localDate: 'desc' } }) : null;
  const previousIndex = contents.findIndex(c => c.id === previous?.contentId);
  const index = switchContent ? (existingIndex + 1) % contents.length : existingIndex >= 0 ? existingIndex : (previousIndex + 1) % contents.length;
  return db.homeContentView.upsert({ where: { userId_localDate: { userId: USER_ID, localDate: date } }, update: switchContent || existingIndex < 0 ? { contentId: contents[index].id } : {}, create: { userId: USER_ID, localDate: date, contentId: contents[index].id }, include: { content: true } });
}
export async function getState() {
  const [user, job, assessment, plans, progress, submissions, evaluations, evidence, interviews, conversations, events, suggestions, home] = await Promise.all([
    db.userProfile.findUniqueOrThrow({ where: { id: USER_ID } }), db.jobTarget.findUnique({ where: { userId: USER_ID } }), db.assessment.findUnique({ where: { userId: USER_ID } }),
    db.learningPlan.findMany({ where: { userId: USER_ID }, include: { items: { orderBy: { position: 'asc' } } }, orderBy: { version: 'desc' } }), db.lessonProgress.findMany({ where: { userId: USER_ID } }),
    db.submission.findMany({ where: { userId: USER_ID }, orderBy: [{ createdAt: 'desc' }, { version: 'desc' }] }), db.evaluation.findMany({ where: { userId: USER_ID }, orderBy: { createdAt: 'desc' } }),
    db.skillEvidence.findMany({ where: { userId: USER_ID }, orderBy: { createdAt: 'desc' } }), db.interviewSession.findMany({ where: { userId: USER_ID }, include: { turns: { orderBy: { position: 'asc' } } }, orderBy: { createdAt: 'desc' } }),
    db.learningConversation.findMany({ where: { userId: USER_ID }, include: { messages: { orderBy: { createdAt: 'asc' } } } }), db.growthEvent.findMany({ where: { userId: USER_ID }, orderBy: { createdAt: 'desc' } }),
    db.planSuggestion.findMany({ where: { evaluation: { userId: USER_ID } }, orderBy: { createdAt: 'desc' } }), homeView(),
  ]);
  const [snapshots, documents, imports, catalog, quizAttempts, practice, retests, storedLessons] = await Promise.all([
    db.archiveSnapshot.findMany({where:{userId:USER_ID},orderBy:{createdAt:'desc'}}),
    db.sourceDocument.findMany({where:{userId:USER_ID},select:{id:true,name:true,mime:true,bytes:true,pageCount:true,createdAt:true}}),
    db.importBatch.findMany({where:{userId:USER_ID},orderBy:{createdAt:'desc'}}),
    db.catalogItem.findMany({where:{userId:USER_ID},orderBy:{createdAt:'desc'}}),
    db.quizAttempt.findMany({where:{userId:USER_ID},orderBy:{createdAt:'desc'}}),
    db.practiceAttempt.findMany({where:{userId:USER_ID},orderBy:{createdAt:'desc'}}),
    db.retestSession.findMany({where:{userId:USER_ID},orderBy:{createdAt:'desc'}}),
    db.lesson.findMany({orderBy:{id:'asc'}}),
  ]);
  const activeSession = interviews.find(i => i.status !== 'ended');
  const activeItem = plans[0]?.items.find(i => i.status === 'active');
  const activeDraft = submissions.find(s => s.isDraft && s.content.trim() && s.content !== submissions.find(v => !v.isDraft && v.taskId === s.taskId)?.content);
  const baselineGuide = assessment?.completedAt ? buildBaselineGuide(parse<Record<string, string>>(assessment.answers, {})) : null;
  const needsReport = Boolean(assessment?.completedAt && user.onboardingStep < 3);
  const href = homeDestination(user.targetRole, Boolean(job?.confirmedAt), Boolean(assessment?.completedAt), needsReport ? '/onboarding/report' : activeSession ? `/interviews?session=${activeSession.id}` : activeItem ? resourceHref(activeItem.resourceId) : activeDraft ? resourceHref(activeDraft.taskId) : undefined);
  const hasRecord = Boolean(user.targetRole || events.length || submissions.length);
  const hasPending = needsReport || !assessment?.completedAt || !job?.confirmedAt || !plans.length || plans[0].items.some(i => i.status !== 'done') || Boolean(activeSession || activeDraft);
  const label = !hasRecord ? '开始我的第一步' : hasPending ? '继续今天的成长' : '看看接下来练什么';
  return { snapshots, documents, imports, catalog, quizAttempts, practice, retests, lessons: storedLessons.map(l => parse<LessonContent>(l.content, lessons.find(c=>c.id===l.id)!)), user, job, assessment, baselineGuide, plans, progress, submissions, evaluations, evidence, interviews, conversations, events, suggestions, home, homeAction: { href, label }, capabilities: capabilities() };
}
export type AppState = Awaited<ReturnType<typeof getState>>;
export async function saveProfile(data: { background: string; experience: string; targetRole: string; dailyMinutes: number; onboardingStep: number; timezone: string }) {
  try { new Intl.DateTimeFormat('zh', { timeZone: data.timezone }); } catch { throw new Error('时区无效。'); }
  const current = await db.userProfile.findUniqueOrThrow({ where: { id: USER_ID } });
  await db.$transaction(async tx => {
    await snapshot(tx, 'profile', USER_ID, '背景与目标', profileValue(current), 'existing');
    await tx.userProfile.update({ where: { id: USER_ID }, data });
    await snapshot(tx, 'profile', USER_ID, '背景与目标', profileValue(data));
    if (current.targetRole && current.targetRole !== data.targetRole) {
      await tx.jobTarget.updateMany({ where: { userId: USER_ID }, data: { confirmedAt: null } });
    }
  });
}
export async function saveJob(original: string, analyze = false) {
  const old = await db.jobTarget.findUnique({ where: { userId: USER_ID } });
  if (old?.original === original && !analyze) return;
  await db.jobTarget.upsert({ where: { userId: USER_ID }, create: { userId: USER_ID, original }, update: { original, ...(old?.original !== original ? { confirmedAt: null, analysis: '{}' } : {}) } });
  const saved = await db.jobTarget.findUniqueOrThrow({where:{userId:USER_ID}});
  await db.$transaction(async tx => { if(old) await snapshot(tx,'job',old.id,'招聘要求',jobValue(old),'existing'); await snapshot(tx,'job',saved.id,'招聘要求',jobValue(saved)); });
  if (!analyze) return;
  const ai = provider();
  const result = validateJob(await ai.analyzeJob(original), original);
  const analyzed = await db.jobTarget.update({ where: { userId: USER_ID }, data: { analysis: JSON.stringify(result), demo: ai.demo, confirmedAt: null } });
  await db.$transaction(tx=>snapshot(tx,'job',analyzed.id,'招聘要求',jobValue(analyzed)));
}
export async function confirmJob(analysis: unknown) {
  const job = await db.jobTarget.findUniqueOrThrow({ where: { userId: USER_ID } });
  const value = validateJob(jobSchema.parse(analysis), job.original);
  await db.$transaction(async tx => {
    const confirmed=await tx.jobTarget.update({ where: { id: job.id }, data: { analysis: JSON.stringify(value), confirmedAt: job.confirmedAt??new Date() } });
    await snapshot(tx,'job',job.id,'招聘要求',jobValue(confirmed));
    await tx.userProfile.update({ where: { id: USER_ID }, data: { onboardingStep: 2 } });
  });
}
export async function saveBaseline(answers: Record<string, string>) {
  if (Object.keys(answers).some(id => !baselineQuestions.some(q => q.id === id))) throw new Error('诊断题不存在。');
  const current = await db.assessment.findUniqueOrThrow({ where: { userId: USER_ID } });
  if (current.completedAt && current.answers !== JSON.stringify(answers)) throw new Error('已完成的初步诊断作为历史证据保留，不能覆盖原回答。可以通过项目和面试提供新证据。');
  await db.assessment.update({ where: { userId: USER_ID }, data: { answers: JSON.stringify(answers) } });
}
export async function saveEvaluation(sourceType: string, sourceId: string, scope: string, review: Review, sources: Record<string, string>, covered: SkillId[]) {
  const ai = provider();
  const items = locateEvidence(review, sources, covered, ai.demo);
  return db.$transaction(async tx => {
    const existing = await tx.evaluation.findUnique({ where: { userId_sourceType_sourceId: { userId: USER_ID, sourceType, sourceId } } });
    if (existing) return existing;
    const evaluation = await tx.evaluation.create({ data: { userId: USER_ID, sourceType, sourceId, scope, demo: ai.demo, result: JSON.stringify({ ...review, items }), model: ai.model, promptVersion, rubricVersion } });
    if (!ai.demo) for (const item of items) {
      if (item.level !== null) for (const ref of item.evidenceReferences) await tx.skillEvidence.create({ data: { userId: USER_ID, evaluationId: evaluation.id, skillId: item.skillId, level: item.level, sourceId: ref.sourceId, quote: ref.quote, startOffset: ref.startOffset, endOffset: ref.endOffset } });
    }
    const gradedFocus = [...items].filter(i => i.level !== null).sort((a, b) => a.level! - b.level!)[0]?.skillId;
    const guide = sourceType === 'baseline' ? buildBaselineGuide(sources) : null;
    const baselineFocus = guide?.items.find(i => i.skillId === gradedFocus) ?? guide?.items.find(i => i.questionId === guide.priorities[0]);
    const resource = baselineFocus ? lessons.find(l => l.id === baselineFocus.lessonId) : lessons.find(l => l.skills.includes(gradedFocus ?? covered[0]));
    const reason = guide && resource ? baselineReason(resource.id, guide) : `${scope}后，可回到「${resource?.title}」补充方法并再次练习。`;
    if (resource) await tx.planSuggestion.create({ data: { evaluationId: evaluation.id, resourceId: resource.id, reason: `${reason}${ai.demo ? ' 这是演示练习建议，不代表能力结论。' : ' 建议需你确认后才调整安排。'}` } });
    return evaluation;
  });
}
export async function finishBaseline() {
  const profile = await db.userProfile.findUniqueOrThrow({ where: { id: USER_ID } });
  const target = await db.jobTarget.findUnique({ where: { userId: USER_ID } });
  if (!profile.targetRole.trim() || !target?.confirmedAt) throw new Error('请先设置目标岗位并确认招聘要求，再完成初步诊断。草稿已经保留。');
  const a = await db.assessment.findUniqueOrThrow({ where: { userId: USER_ID } });
  const answers = parse<Record<string, string>>(a.answers, {});
  if (!baselineQuestions.every(q => answers[q.id]?.trim())) throw new Error('请先回答六道题，或保存草稿稍后继续。');
  const existing = await db.evaluation.findUnique({ where: { userId_sourceType_sourceId: { userId: USER_ID, sourceType: 'baseline', sourceId: a.id } } });
  if (!existing) {
    const review = await provider().assessBaseline({ scope: '初步诊断（每维度仅一道题）', sources: answers, covered: skills.map(s => s.id), rubric: baselineQuestions.map(q => `${q.id}→${q.skillId}: ${q.question}`).join('\n') });
    validateBaselineSources(review);
    await saveEvaluation('baseline', a.id, '初步诊断 · 六道情境题', review, answers, skills.map(s => s.id));
  }
  await db.assessment.update({ where: { id: a.id }, data: { completedAt: a.completedAt ?? new Date() } });
  await db.$transaction(tx => snapshot(tx,'baseline',a.id,'首次六题诊断',{questions:a.questions,answers:a.answers}));
}
export async function buildPlan() {
  const user = await db.userProfile.findUniqueOrThrow({ where: { id: USER_ID } });
  const job = await db.jobTarget.findUnique({ where: { userId: USER_ID } });
  const assessment = await db.assessment.findUniqueOrThrow({ where: { userId: USER_ID } });
  if (!user.targetRole.trim() || !job?.confirmedAt || !assessment.completedAt) throw new Error('请先完成目标确认与六题初步反馈，再安排成长路线。');
  if (await db.learningPlan.count({ where: { userId: USER_ID } })) {
    await db.userProfile.update({ where: { id: USER_ID }, data: { onboardingStep: 3 } });
    return;
  }
  const evidence = await db.skillEvidence.findMany({ where: { userId: USER_ID } });
  const answers = parse<Record<string, string>>(assessment.answers, {});
  const diagnosticGuide = buildBaselineGuide(answers);
  const evaluation = await db.evaluation.findUnique({ where: { userId_sourceType_sourceId: { userId: USER_ID, sourceType: 'baseline', sourceId: assessment.id } } });
  const plan = validatePlan(await provider().buildLearningPlan(JSON.stringify({ user, job, evidence, answers, diagnosticGuide, evaluation })));
  // Complete the known curriculum if an AI response leaves resources out.
  const canonical = await new (await import('./ai')).DemoAI().buildLearningPlan();
  for (const item of canonical.items) if (!plan.items.some(p => p.resourceId === item.resourceId)) plan.items.push(item);
  // Enforce canonical prerequisite graph even if a model suggests a different order.
  const ordered = canonical.items.map(c => plan.items.find(p => p.resourceId === c.resourceId)!);
  let day = 0, used = 0;
  const start = localDate(user.timezone);
  await db.learningPlan.create({ data: { userId: USER_ID, version: 1, items: { create: ordered.map((item, index) => {
    const lesson = lessons.find(l => l.id === item.resourceId);
    const stage = projectTasks.find(t => t.id === item.resourceId);
    const minutes = lesson?.minutes ?? (stage ? 25 : 20);
    if (used && used + minutes > user.dailyMinutes) { day++; used = 0; }
    used += minutes;
    const date = new Date(start + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + day);
    const connection = baselineReason(item.resourceId, diagnosticGuide);
    return { ...item, position: index, minutes, skills: JSON.stringify(lesson?.skills ?? stage?.skills ?? ['communication']), prerequisites: JSON.stringify(index ? [ordered[index - 1].resourceId] : []), kind: lesson ? 'lesson' : stage ? 'project' : 'interview', reason: `${connection || item.reason} 结合目标「${user.targetRole}」与每天 ${user.dailyMinutes} 分钟安排；文字检查不代表能力等级，基础前置顺序保留。`, scheduledDate: date.toISOString().slice(0, 10) };
  }) } } });
  await db.userProfile.update({ where: { id: USER_ID }, data: { onboardingStep: 3 } });
}
export async function planAction(id: string, status: string | undefined, date: string | undefined, position: number | undefined) {
  const item = await db.planItem.findFirstOrThrow({ where: { id, plan: { userId: USER_ID } } });
  if (status === 'active' && item.status === 'done') throw new Error('已完成任务可以复习，不重复开启奖励。');
  if (status === 'active') await db.planItem.updateMany({ where: { planId: item.planId, status: 'active' }, data: { status: 'todo' } });
  await db.planItem.update({ where: { id }, data: { ...(status ? { status } : {}), ...(date !== undefined ? { scheduledDate: date || null } : {}), ...(position !== undefined ? { position } : {}) } });
}
export async function saveLessonDecision(lessonId: string, choice: number) {
  const scenario = scenarios[lessonId];
  if (!scenario || !Number.isInteger(choice) || !scenario.choices[choice]) throw new Error('情境或选项不存在。');
  return db.$transaction(tx=>snapshot(tx,'lesson_decision',lessonId,lessons.find(l=>l.id===lessonId)!.title+' · 我的产品判断',{lessonId,scenario:scenario.situation,choice,selected:scenario.choices[choice].label,tradeoff:scenario.choices[choice].outcome,nextQuestion:scenario.choices[choice].question}));
}
export async function saveQuiz(lessonId: string, answers: Record<string, number>, submit: boolean, requestKey?: string) {
  const lesson = lessons.find(l => l.id === lessonId);
  if (!lesson) throw new Error('课程不存在。');
  if (Object.entries(answers).some(([k, v]) => !['0', '1', '2'].includes(k) || !Number.isInteger(v) || v < 0 || v > 2)) throw new Error('小测答案无效。');
  if (submit && lesson.quiz.some((_, i) => answers[i] === undefined)) throw new Error('请回答三道小测后提交。');
  const key = requestKey ?? 'quiz:' + digest(JSON.stringify([lessonId,answers]));
  const attempted = submit ? await db.quizAttempt.findUnique({where:{requestKey:key}}) : null;
  if(attempted) { if(attempted.lessonId!==lessonId || attempted.answers!==JSON.stringify(answers)) throw new Error('提交标识冲突。'); return parse(attempted.result,{}); }
  const correct = lesson.quiz.filter((q, i) => q.answer === answers[i]).length;
  return db.$transaction(async tx => {
    const prior = await tx.lessonProgress.findUnique({ where: { userId_lessonId: { userId: USER_ID, lessonId } } });
    const complete = submit && correct === 3;
    await tx.lessonProgress.upsert({ where: { userId_lessonId: { userId: USER_ID, lessonId } }, create: { userId: USER_ID, lessonId, answers: JSON.stringify(answers), result: submit ? JSON.stringify({ correct, total: 3 }) : '{}', completedAt: complete ? new Date() : null }, update: { answers: JSON.stringify(answers), ...(submit ? { result: JSON.stringify({ correct, total: 3 }) } : {}), completedAt: prior?.completedAt ?? (complete ? new Date() : null) } });
    if(submit) await tx.quizAttempt.create({data:{userId:USER_ID,lessonId,questionSnapshot:JSON.stringify(lesson.quiz),answers:JSON.stringify(answers),result:JSON.stringify({correct,total:3,completed:complete||Boolean(prior?.completedAt)}),requestKey:key}});
    if (complete) { await growth(tx, 'lesson', lessonId, 20); await tx.planItem.updateMany({ where: { resourceId: lessonId, plan: { userId: USER_ID } }, data: { status: 'done' } }); }
    return { correct, total: 3, completed: complete || Boolean(prior?.completedAt) };
  });
}
export async function saveDraft(taskId: string, content: string) {
  if (!projectTasks.some(t => t.id === taskId)) throw new Error('阶段不存在。');
  return db.submission.upsert({ where: { userId_taskId_version: { userId: USER_ID, taskId, version: 0 } }, create: { userId: USER_ID, taskId, version: 0, isDraft: true, content, requestKey: `draft:${USER_ID}:${taskId}` }, update: { content } });
}
export async function submitProject(taskId: string, content: string, requestKey: string) {
  if (!content.trim()) throw new Error('提交内容不能为空。');
  const existing = await db.submission.findUnique({ where: { requestKey } });
  if (existing) { if (existing.taskId !== taskId) throw new Error('幂等标识冲突。'); return existing; }
  await saveDraft(taskId, content);
  return db.$transaction(async tx => {
    const max = await tx.submission.aggregate({ where: { userId: USER_ID, taskId }, _max: { version: true } });
    const submission = await tx.submission.create({ data: { userId: USER_ID, taskId, content, version: (max._max.version ?? 0) + 1, requestKey } });
    await growth(tx, 'project', taskId, 40);
    await tx.planItem.updateMany({ where: { resourceId: taskId, plan: { userId: USER_ID } }, data: { status: 'done' } });
    return submission;
  });
}
export async function reviewSubmission(id: string) {
  const submission = await db.submission.findFirstOrThrow({ where: { id, userId: USER_ID, isDraft: false } });
  const existing = await db.evaluation.findUnique({ where: { userId_sourceType_sourceId: { userId: USER_ID, sourceType: 'submission', sourceId: id } } });
  if (existing) return existing;
  const task = projectTasks.find(t => t.id === submission.taskId)!;
  const input = { scope: `${task.title} / v${submission.version}`, sources: { [submission.id]: submission.content }, covered: task.skills, rubric: task.rubric };
  const review = await provider().reviewSubmission(input);
  return saveEvaluation('submission', id, input.scope, review, input.sources, task.skills);
}
export async function portfolio(id: string, included: boolean) { return db.submission.update({ where: { id, userId: USER_ID, isDraft: false }, data: { portfolio: included } }); }
export async function askQuestion(contextId: string, question: string, requestKey: string) {
  const library = contextId.startsWith('lib:') ? await verifiedItem(contextId.slice(4)) : null;
  if (!library) requireResource(contextId);
  const conversation = await db.learningConversation.upsert({ where: { userId_contextId: { userId: USER_ID, contextId } }, update: {}, create: { userId: USER_ID, contextId } });
  const old = await db.message.findUnique({ where: { requestKey: requestKey + ':ai' } });
  if (old) return old;
  await db.message.upsert({ where: { requestKey }, update: {}, create: { conversationId: conversation.id, role: 'user', content: question, requestKey } });
  const history = await db.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'desc' }, take: 8 });
  const materials = (await db.catalogItem.findMany({where:{userId:USER_ID,status:'verified',kind:'material'}})).filter(m => parse<string[]>(m.lessonIds,[]).includes(contextId)).slice(0,4).map(m=>({id:m.id,title:m.title,body:m.body.slice(0,6000),source:m.sourceLabel,locator:m.locator}));
  const context = JSON.stringify({ materials, library, resource: lessons.find(l => l.id === contextId) ?? projectTasks.find(t => t.id === contextId), history: history.reverse() });
  const ai = provider();
  const answer = await ai.answerLearningQuestion(context, question);
  return db.message.create({ data: { conversationId: conversation.id, role: 'assistant', content: answer, requestKey: requestKey + ':ai', demo: ai.demo } });
}
export async function startInterview(mode: string, projectId: string | undefined, requestKey: string) {
  const existing = await db.interviewSession.findUnique({ where: { requestKey } });
  if (existing) return existing;
  const active = await db.interviewSession.findFirst({ where: { userId: USER_ID, status: { not: 'ended' } } });
  if (active) return active;
  if (projectId && projectId !== 'knowledge-assistant') throw new Error('项目不存在。');
  const user = await db.userProfile.findUniqueOrThrow({ where: { id: USER_ID } });
  const submissions = projectId ? await db.submission.findMany({ where: { userId: USER_ID, isDraft: false }, orderBy: { createdAt: 'desc' }, take: 4 }) : [];
  const context = submissions.length ? submissions.map(s => `${s.id} / ${s.taskId} v${s.version}\n${s.content}`).join('\n').slice(0, 16000) : '';
  const ai = provider();
  const question = await ai.generateInterviewQuestion({ mainIndex: 1, followup: false, previousAnswer: '', role: user.targetRole || '初级 AI 产品经理', projectContext: context, history: '' });
  return db.interviewSession.create({ data: { userId: USER_ID, role: user.targetRole || '初级 AI 产品经理', mode, projectId: projectId || null, projectContext: context, demo: ai.demo, requestKey, turns: { create: { position: 1, mainIndex: 1, ...question } } } });
}
export async function saveInterviewDraft(sessionId: string, turnId: string, draft: string) {
  const turn = await db.interviewTurn.findFirstOrThrow({ where: { id: turnId, sessionId, session: { userId: USER_ID, status: { not: 'ended' } } } });
  if (turn.answer !== null) return;
  await db.interviewTurn.update({ where: { id: turnId }, data: { draft } });
}
export async function answerInterview(sessionId: string, turnId: string, answer: string, requestKey: string) {
  let session = await db.interviewSession.findFirstOrThrow({ where: { id: sessionId, userId: USER_ID }, include: { turns: { orderBy: { position: 'asc' } } } });
  const turn = session.turns.find(t => t.id === turnId);
  if (!turn) throw new Error('面试问题不存在。');
  if (turn.answerKey && turn.answerKey !== requestKey) throw new Error('这道题已提交，请继续下一题。');
  if (turn.answerKey === requestKey && (session.turns.some(t => t.position > turn.position) || session.status === 'ended')) return session;
  if (session.status !== 'active') throw new Error('请先恢复面试。');
  if (!turn.answerKey) {
    if (!answer.trim()) throw new Error('不能提交空答案。');
    if (session.turns[session.turns.length - 1].id !== turnId) throw new Error('请回答当前问题。');
    await db.interviewTurn.update({ where: { id: turnId }, data: { answer, draft: '', answerKey: requestKey, answeredAt: new Date() } });
  }
  const actualAnswer = turn.answer ?? answer;
  // At most one follow-up for each main question; short answers invite clarification.
  const next = nextInterviewTurn({ ...turn, answer: actualAnswer }, actualAnswer.trim().length < 180);
  if (!next) { await endInterview(sessionId); return; }
  const ai = provider();
  if (ai.demo !== session.demo) throw new Error('服务配置已变化，请结束本场后开始新面试。已提交回答仍保留。');
  const question = await ai.generateInterviewQuestion({ ...next, previousAnswer: actualAnswer, role: session.role, projectContext: session.projectContext, history: JSON.stringify(session.turns.map(t => ({ question: t.question, answer: t.id === turnId ? actualAnswer : t.answer }))) });
  await db.interviewTurn.create({ data: { sessionId, position: turn.position + 1, mainIndex: next.mainIndex, parentId: next.followup ? turnId : null, ...question } });
}
export async function interviewStatus(sessionId: string, status: 'paused' | 'active' | 'ended') {
  const session = await db.interviewSession.findFirstOrThrow({ where: { id: sessionId, userId: USER_ID } });
  if (session.status === 'ended' && status !== 'ended') throw new Error('已结束的面试不能恢复，可开始新一场。');
  if (status === 'ended') return endInterview(sessionId);
  await db.interviewSession.update({ where: { id: sessionId }, data: { status } });
}
export async function interviewMode(sessionId: string, mode: 'text' | 'voice') {
  await db.interviewSession.update({ where: { id: sessionId, userId: USER_ID, status: { not: 'ended' } }, data: { mode } });
}
export async function endInterview(sessionId: string) {
  return db.$transaction(async tx => {
    const session = await tx.interviewSession.findFirstOrThrow({ where: { id: sessionId, userId: USER_ID } });
    await tx.interviewSession.update({ where: { id: session.id }, data: { status: 'ended', endedAt: session.endedAt ?? new Date() } });
    const count = await tx.interviewTurn.count({ where: { sessionId, answer: { not: null } } });
    if (count) { await growth(tx, 'interview', sessionId, 30); await tx.planItem.updateMany({ where: { resourceId: 'interview', plan: { userId: USER_ID } }, data: { status: 'done' } }); }
  });
}
export async function reviewInterview(sessionId: string) {
  const s = await db.interviewSession.findFirstOrThrow({ where: { id: sessionId, userId: USER_ID, status: 'ended' }, include: { turns: true } });
  const existing = await db.evaluation.findUnique({ where: { userId_sourceType_sourceId: { userId: USER_ID, sourceType: 'interview', sourceId: sessionId } } });
  if (existing) return existing;
  const answered = s.turns.filter(t => t.answer?.trim());
  if (!answered.length) throw new Error('本场尚无已回答问题，没有足够材料生成评价。完整问题记录仍可查看。');
  if (provider().demo !== s.demo) throw new Error('服务配置已变化，不能将演示面试转换为真实能力评价。');
  const covered = [...new Set([...answered.map(t => t.skillId as SkillId), 'communication' as const])];
  const sources = Object.fromEntries(answered.map(t => [t.id, t.answer!]));
  const scope = `模拟面试 / ${answered.length} 条已回答，未回答题不评价`;
  const review = await provider().reviewInterview({ scope, sources, covered, rubric: '按问题范围评价。项目表达只基于实际回答的清楚程度、事实边界与论证；不推断全面能力。问题对照：' + JSON.stringify(answered.map(t => ({ sourceId: t.id, question: t.question, skillId: t.skillId }))) });
  return saveEvaluation('interview', sessionId, scope, review, sources, covered);
}
export async function resolveSuggestion(id: string, accept: boolean) {
  const suggestion = await db.planSuggestion.findFirstOrThrow({ where: { id, evaluation: { userId: USER_ID }, status: 'pending' } });
  await db.$transaction(async tx => {
    await tx.planSuggestion.update({ where: { id }, data: { status: accept ? 'accepted' : 'dismissed' } });
    if (accept) await tx.planItem.updateMany({ where: { resourceId: suggestion.resourceId, status: 'todo', plan: { userId: USER_ID } }, data: { scheduledDate: localDate('Asia/Shanghai'), reason: suggestion.reason + '（用户已确认）' } });
  });
}
export async function resetData() {
  const documents = await db.sourceDocument.findMany({ where: { userId: USER_ID }, select: { storageKey: true } });
  await db.$transaction(async tx => {
    // Remove restrictive question references before deleting the local identity.
    await tx.practiceAttempt.deleteMany({ where: { userId: USER_ID } });
    await tx.userProfile.delete({ where: { id: USER_ID } });
  });
  await (await import('./documents')).removeUnusedDocuments(documents.map(d => d.storageKey));
  await (await import('./seed')).seed();
}
export async function exportSubmission(id: string) {
  const s = await db.submission.findFirstOrThrow({ where: { id, userId: USER_ID, isDraft: false } });
  const t = projectTasks.find(t => t.id === s.taskId)!;
  return `# 训练项目：企业内部知识库问答助手\n\n阶段：${t.title}\n版本：v${s.version}\n版本 ID：${s.id}\n提交时间：${s.createdAt.toISOString()}\n\n> 模拟企业背景，非真实上线项目。文中未被证据验证的数值和结论均为假设或目标，不能视为已经验证的结果。请在正文分别标明【假设】【目标指标】【已验证结果及依据】；未提供实测依据时，已验证结果为“暂无”。\n\n---\n\n${s.content}\n`;
}
export { resourceHref };
