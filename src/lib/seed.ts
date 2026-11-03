import { seedCatalog } from './catalog';
import { backfillHistory } from './history';
import { db, USER_ID } from './db';
import { lessons, skills, anchors, rubricVersion, baselineQuestions, project, projectTasks, homeContents } from './content';
export async function seed() {
  await db.userProfile.upsert({ where: { id: USER_ID }, update: {}, create: { id: USER_ID } });
  for (const s of skills) await db.skillDefinition.upsert({ where: { id: s.id }, update: {}, create: { id: s.id, name: s.name, description: s.description, anchors: JSON.stringify(anchors), rubricVersion } });
  for (const l of lessons) await db.lesson.upsert({ where: { id: l.id }, update: {}, create: { id: l.id, title: l.title, minutes: l.minutes, skills: JSON.stringify(l.skills), content: JSON.stringify(l) } });
  await db.project.upsert({ where: { id: project.id }, update: {}, create: { ...project, constraints: JSON.stringify(project.constraints) } });
  for (const t of projectTasks) await db.projectTask.upsert({ where: { id: t.id }, update: {}, create: { ...t, projectId: project.id, skills: JSON.stringify(t.skills), requirements: JSON.stringify(t.requirements), hints: JSON.stringify(t.hints) } });
  for (const h of homeContents) await db.homeContent.upsert({ where: { id: h.id }, update: {}, create: h });
  await seedCatalog();
  await db.assessment.upsert({ where: { userId: USER_ID }, update: {}, create: { userId: USER_ID, questions: JSON.stringify(baselineQuestions) } });
  await backfillHistory();
}
