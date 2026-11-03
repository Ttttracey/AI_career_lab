import { z } from 'zod';
import { skillIds, lessons } from './content';
export const catalogSchema = z.object({
  kind: z.enum(['material', 'question', 'job']),
  title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(24000),
  skillIds: z.array(z.enum(skillIds)).min(1).max(6),
  lessonIds: z.array(z.string()).max(12).default([]),
  questionType: z.enum(['scenario', 'single']).default('scenario'),
  options: z.array(z.string().trim().min(1).max(1000)).max(8).default([]),
  answerIndex: z.number().int().min(0).max(7).nullable().default(null),
  reference: z.string().max(5000).default(''), rubric: z.string().max(3000).default(''),
  sourceLabel: z.string().trim().min(1).max(200), sourceUrl: z.string().max(2000).default(''),
  locator: z.string().max(200).default(''), publishedDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default(''),
});
export type CatalogInput = z.infer<typeof catalogSchema>;
export function validateCatalog(input: unknown) {
  const item = catalogSchema.parse(input);
  if (item.sourceUrl && !/^https?:\/\//i.test(item.sourceUrl)) throw new Error('来源链接只支持 http 或 https。');
  if (item.sourceUrl) { try { new URL(item.sourceUrl); } catch { throw new Error('来源链接格式不正确。'); } }
  if (item.publishedDate && (!Number.isFinite(Date.parse(item.publishedDate)) || new Date(item.publishedDate).toISOString().slice(0, 10) !== item.publishedDate)) throw new Error('原文发布日期无效，未知时请留空。');
  if (item.lessonIds.some(id => !lessons.some(l => l.id === id))) throw new Error('关联课程不存在。');
  if (new Set(item.skillIds).size !== item.skillIds.length) throw new Error('能力标签不能重复。');
  if (item.kind === 'question' && item.questionType === 'single' && (item.options.length < 2 || item.answerIndex === null || item.answerIndex >= item.options.length)) throw new Error('选择题需要至少两个选项和有效的正确选项编号。');
  return item;
}
export function normalizeText(text: string) { return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase(); }
