import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db, USER_ID } from './db';
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export async function snapshot(tx: Prisma.TransactionClient, kind: string, sourceId: string, title: string, value: unknown, origin = 'saved') {
  const content = JSON.stringify(value);
  const hash = digest(content);
  const last = await tx.archiveSnapshot.findFirst({ where: { userId: USER_ID, kind, sourceId }, orderBy: { version: 'desc' } });
  if (last?.hash === hash) return last;
  return tx.archiveSnapshot.create({ data: { userId: USER_ID, kind, sourceId, title, content, hash, version: (last?.version ?? 0) + 1, origin } });
}
export function profileValue(p: { background: string; experience: string; targetRole: string; dailyMinutes: number; timezone: string }) {
  return { background: p.background, experience: p.experience, targetRole: p.targetRole, dailyMinutes: p.dailyMinutes, timezone: p.timezone };
}
export function jobValue(job: { original: string; analysis: string; confirmedAt: Date | null; demo: boolean }) {
  return { original: job.original, analysis: job.analysis, confirmedAt: job.confirmedAt, demo: job.demo };
}
export async function backfillHistory() {
  const user = await db.userProfile.findUniqueOrThrow({ where: { id: USER_ID } });
  await db.$transaction(async tx => {
    if (!await tx.archiveSnapshot.count({ where: { userId: USER_ID, kind: 'profile' } })) await snapshot(tx, 'profile', USER_ID, '背景与目标', profileValue(user), 'existing');
    const job = await tx.jobTarget.findUnique({ where: { userId: USER_ID } });
    if (job && !await tx.archiveSnapshot.count({ where: { userId: USER_ID, kind: 'job' } })) await snapshot(tx, 'job', job.id, '招聘要求', jobValue(job), 'existing');
    const assessment = await tx.assessment.findUnique({ where: { userId: USER_ID } });
    if (assessment?.completedAt && !await tx.archiveSnapshot.count({ where: { userId: USER_ID, kind: 'baseline' } })) await snapshot(tx, 'baseline', assessment.id, '首次六题诊断', { questions: assessment.questions, answers: assessment.answers, completedAt: assessment.completedAt }, 'existing');
    for (const p of await tx.lessonProgress.findMany({ where: { userId: USER_ID } })) {
      if (!await tx.archiveSnapshot.count({ where: { userId: USER_ID, kind: 'legacy_quiz', sourceId: p.lessonId } })) await snapshot(tx, 'legacy_quiz', p.lessonId, '更新前最近一次小测记录', { lessonId: p.lessonId, answers: p.answers, result: p.result, completedAt: p.completedAt }, 'existing');
    }
  });
}
