import { z } from 'zod';
import { skillIds, type SkillId, lessons, projectTasks } from './content';
export const referenceSchema = z.object({ sourceId: z.string().min(1).max(120), quote: z.string().min(1).max(1500) });
export const reviewSchema = z.object({
  summary: z.string().min(1).max(2000),
  items: z.array(z.object({ skillId: z.enum(skillIds), level: z.number().int().min(0).max(4).nullable(), evidenceReferences: z.array(referenceSchema).max(8), strengths: z.array(z.string().max(600)).max(5), gaps: z.array(z.string().max(600)).max(5), nextActions: z.array(z.string().max(600)).max(5) })).max(6),
});
export type Review = z.infer<typeof reviewSchema>;
export const jobSchema = z.object({ responsibilities: z.array(z.string().max(600)).max(12), requirements: z.array(z.object({ skillId: z.enum(skillIds), requirement: z.string().max(600), quote: z.string().max(1500), inferred: z.boolean() })).max(12), uncertainties: z.array(z.string().max(600)).max(8) });
export type JobAnalysis = z.infer<typeof jobSchema>;
export const resourceIds: string[] = [...lessons.map(l => l.id), ...projectTasks.map(t => t.id), 'interview'];
export const planSchema = z.object({ items: z.array(z.object({ resourceId: z.string(), reason: z.string().min(1).max(600) })).min(1).max(17) });
export function validatePlan(plan: z.infer<typeof planSchema>) {
  const seen = new Set<string>();
  for (const item of plan.items) {
    if (!resourceIds.includes(item.resourceId) || seen.has(item.resourceId)) throw new Error('计划包含未知或重复资源，未写入计划。');
    seen.add(item.resourceId);
  }
  return plan;
}
export function locateEvidence(review: Review, sources: Record<string, string>, covered: SkillId[], demo = false) {
  const seen = new Set<string>();
  return review.items.map(item => {
    if (!covered.includes(item.skillId) || seen.has(item.skillId)) throw new Error('评价维度超出范围或重复，未写入评价。');
    seen.add(item.skillId);
    const references = item.evidenceReferences.map(ref => {
      const text = sources[ref.sourceId];
      const startOffset = text?.indexOf(ref.quote) ?? -1;
      if (startOffset < 0 || !ref.quote.trim()) throw new Error('评价引用不能定位到用户原文，未写入评价。请重试。');
      return { ...ref, startOffset, endOffset: startOffset + ref.quote.length };
    });
    if (!demo && item.level !== null && references.length === 0) throw new Error('评价缺少原文证据，未写入能力记录。');
    return { ...item, level: demo ? null : item.level, evidenceReferences: references };
  });
}
export function validateJob(analysis: JobAnalysis, original: string) {
  for (const r of analysis.requirements) if (!r.inferred && (!r.quote.trim() || !original.includes(r.quote))) throw new Error('招聘分析的引用与原文不符，请重试。');
  return analysis;
}
export function localDate(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function homeDestination(targetRole: string, confirmed: boolean, assessed: boolean, activeHref?: string) {
  if (!targetRole || !confirmed) return '/onboarding';
  if (!assessed) return '/onboarding';
  return activeHref || '/roadmap';
}
export function nextInterviewTurn(turn: { mainIndex: number; parentId: string | null; answer: string | null }, wantFollowup: boolean) {
  if (!turn.answer?.trim()) throw new Error('请先提交本题回答。');
  if (!turn.parentId && wantFollowup) return { mainIndex: turn.mainIndex, followup: true };
  if (turn.mainIndex >= 5) return null;
  return { mainIndex: turn.mainIndex + 1, followup: false };
}
export function validateAudio(buffer: Uint8Array, mime: string, duration: number) {
  if (buffer.byteLength === 0 || buffer.byteLength > 10 * 1024 * 1024) throw new Error('录音必须非空且不超过 10 MB。');
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120) throw new Error('录音时长应在 0–120 秒内。');
  const type = mime.split(';')[0];
  const ascii = (start: number, end: number) => String.fromCharCode(...buffer.slice(start, end));
  const webm = type === 'audio/webm' && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  const mp4 = ['audio/mp4', 'audio/x-m4a'].includes(type) && ascii(4, 8) === 'ftyp';
  const wav = ['audio/wav', 'audio/x-wav'].includes(type) && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
  if (!webm && !mp4 && !wav) throw new Error('录音格式无效。支持 WebM、MP4/M4A 与 WAV。请重录或切换文字。');
  return webm ? 'webm' : mp4 ? 'm4a' : 'wav';
}
