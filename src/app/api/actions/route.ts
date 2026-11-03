import { z } from 'zod';
import * as catalog from '@/lib/catalog';
import * as retests from '@/lib/retests';
import { catalogSchema } from '@/lib/catalog-schema';
import * as service from '@/lib/service';
import { sameOrigin, errorResponse } from '@/lib/http';
export const runtime = 'nodejs';
export const maxDuration = 60;
const id = z.string().min(1).max(150);
const content = z.string().max(24000);
const requestKey = z.string().min(8).max(150);
const forms = {
  saveCatalog: z.object({id:id.optional(),item:catalogSchema}),
  verifyCatalog: z.object({id,status:z.enum(['verified','rejected']),note:z.string().min(1).max(2000)}),
  commitImport: z.object({id,selected:z.array(z.number().int().min(0).max(299)).min(1).max(300)}),
  addCatalogPlan: z.object({id}),
  finishMaterial: z.object({id}),
  practice: z.object({id,answer:z.string().min(1).max(6000),requestKey}),
  reviewPractice: z.object({id}),
  startRetest: z.object({requestKey}),
  retest: z.object({id,answers:z.record(z.string(),z.string().max(4000)),status:z.enum(['active','paused','completed'])}),
  reviewRetest: z.object({id}),
  profile: z.object({ background: z.string().max(3000), experience: z.string().max(3000), targetRole: z.string().max(150), dailyMinutes: z.number().int().min(10).max(240), onboardingStep: z.number().int().min(0).max(3), timezone: z.string().max(100) }),
  job: z.object({ original: z.string().max(16000), analyze: z.boolean().default(false) }),
  confirmJob: z.object({ analysis: z.unknown() }),
  baseline: z.object({ answers: z.record(z.string(), z.string().max(4000)) }),
  finishBaseline: z.object({}),
  buildPlan: z.object({}),
  switchQuote: z.object({}),
  plan: z.object({ id, status: z.enum(['todo', 'active']).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$|^$/).optional(), position: z.number().int().min(0).max(1000).optional() }),
  lessonDecision: z.object({lessonId:id,choice:z.number().int().min(0).max(1)}),
  quiz: z.object({ lessonId: id, answers: z.record(z.string(), z.number().int()), submit: z.boolean(), requestKey: requestKey.optional() }),
  draft: z.object({ taskId: id, content }),
  submit: z.object({ taskId: id, content: content.min(1), requestKey }),
  reviewSubmission: z.object({ id }),
  portfolio: z.object({ id, included: z.boolean() }),
  ask: z.object({ contextId: id, question: z.string().min(1).max(2000), requestKey }),
  startInterview: z.object({ mode: z.enum(['text', 'voice']), projectId: z.string().max(100).optional(), requestKey }),
  interviewDraft: z.object({ sessionId: id, turnId: id, draft: z.string().max(6000) }),
  answerInterview: z.object({ sessionId: id, turnId: id, answer: z.string().min(1).max(6000), requestKey }),
  interviewStatus: z.object({ sessionId: id, status: z.enum(['active', 'paused', 'ended']) }),
  interviewMode: z.object({ sessionId: id, mode: z.enum(['text', 'voice']) }),
  reviewInterview: z.object({ sessionId: id }),
  suggestion: z.object({ id, accept: z.boolean() }),
  reset: z.object({ confirmation: z.literal('重置本地数据') }),
};
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (Number(request.headers.get('content-length')) > 180000) throw new Error('输入过长，请精简后再提交。');
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 180000) throw new Error('输入过长，请精简后再提交。');
    const { action, data } = z.object({ action: z.enum(Object.keys(forms) as [keyof typeof forms, ...Array<keyof typeof forms>]), data: z.unknown() }).parse(JSON.parse(raw));
    const parsed = forms[action].safeParse(data ?? {});
    if (!parsed.success) throw new Error('输入格式不正确，请检查必填项、长度和数值范围。');
    const result = await service.serialized(async () => {
      switch (action) {
        case 'saveCatalog': { const d=forms.saveCatalog.parse(data); return catalog.saveCatalog(d.id,d.item); }
        case 'verifyCatalog': { const d=forms.verifyCatalog.parse(data); return catalog.verifyCatalog(d.id,d.status,d.note); }
        case 'commitImport': { const d=forms.commitImport.parse(data); return catalog.commitImport(d.id,d.selected); }
        case 'finishMaterial': return catalog.finishMaterial(forms.finishMaterial.parse(data).id);
        case 'addCatalogPlan': return catalog.addCatalogPlan(forms.addCatalogPlan.parse(data).id);
        case 'practice': {const d=forms.practice.parse(data);return retests.practice(d.id,d.answer,d.requestKey);}
        case 'reviewPractice': return retests.reviewPractice(forms.reviewPractice.parse(data).id);
        case 'startRetest': return retests.startRetest(forms.startRetest.parse(data).requestKey);
        case 'retest': { const d=forms.retest.parse(data);return retests.saveRetest(d.id,d.answers,d.status); }
        case 'reviewRetest': return retests.reviewRetest(forms.reviewRetest.parse(data).id);
        case 'profile': return service.saveProfile(forms.profile.parse(data));
        case 'job': { const d = forms.job.parse(data); return service.saveJob(d.original, d.analyze); }
        case 'confirmJob': return service.confirmJob(forms.confirmJob.parse(data).analysis);
        case 'baseline': return service.saveBaseline(forms.baseline.parse(data).answers);
        case 'finishBaseline': return service.finishBaseline();
        case 'buildPlan': return service.buildPlan();
        case 'switchQuote': return service.homeView(true);
        case 'plan': { const d = forms.plan.parse(data); return service.planAction(d.id, d.status, d.date, d.position); }
        case 'lessonDecision': {const d=forms.lessonDecision.parse(data);return service.saveLessonDecision(d.lessonId,d.choice);}
        case 'quiz': { const d = forms.quiz.parse(data); return service.saveQuiz(d.lessonId, d.answers, d.submit, d.requestKey); }
        case 'draft': { const d = forms.draft.parse(data); return service.saveDraft(d.taskId, d.content); }
        case 'submit': { const d = forms.submit.parse(data); return service.submitProject(d.taskId, d.content, d.requestKey); }
        case 'reviewSubmission': return service.reviewSubmission(forms.reviewSubmission.parse(data).id);
        case 'portfolio': { const d = forms.portfolio.parse(data); return service.portfolio(d.id, d.included); }
        case 'ask': { const d = forms.ask.parse(data); return service.askQuestion(d.contextId, d.question, d.requestKey); }
        case 'startInterview': { const d = forms.startInterview.parse(data); return service.startInterview(d.mode, d.projectId, d.requestKey); }
        case 'interviewDraft': { const d = forms.interviewDraft.parse(data); return service.saveInterviewDraft(d.sessionId, d.turnId, d.draft); }
        case 'answerInterview': { const d = forms.answerInterview.parse(data); return service.answerInterview(d.sessionId, d.turnId, d.answer, d.requestKey); }
        case 'interviewStatus': { const d = forms.interviewStatus.parse(data); return service.interviewStatus(d.sessionId, d.status); }
        case 'interviewMode': { const d = forms.interviewMode.parse(data); return service.interviewMode(d.sessionId, d.mode); }
        case 'reviewInterview': return service.reviewInterview(forms.reviewInterview.parse(data).sessionId);
        case 'suggestion': { const d = forms.suggestion.parse(data); return service.resolveSuggestion(d.id, d.accept); }
        case 'reset': return service.resetData();
      }
    });
    return Response.json({ ok: true, result: result ?? null });
  } catch (e) { return errorResponse(e); }
}
