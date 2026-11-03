import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { safeReturn, withReturn } from '@/lib/navigation';
import type { AppState } from '@/lib/service';
import type { Review } from '@/lib/core';
import { skills, anchors } from '@/lib/content';
import { useApp, unpack, stamp } from './application';
type Evaluation = AppState['evaluations'][number];
export function Rubric() { return <details className="rubric"><summary>查看 0–4 级评价标准</summary><p className="muted">证据不足为“待评估”，与 0 级不同。只评价本次任务覆盖的维度。</p><ol start={0}>{anchors.map((a, i) => <li key={a}><strong>{i} 级</strong> {a}</li>)}</ol><p className="tiny">标准版本 skills-v1.0 · AI 判断指能解释技术适用条件；PRD 指产品需求文档；RAG 指检索增强生成。</p></details>; }
export function EvaluationView({ evaluation }: { evaluation: Evaluation }) {
  const { state } = useApp();
  const params=useSearchParams();const pathname=usePathname();
  const returnTo=pathname==='/profile'?'/profile':safeReturn(params.get('from'),'/projects');
  const review = unpack<Review>(evaluation.result, { summary: '', items: [] });
  const submission=state.submissions.find(s=>s.id===evaluation.sourceId&&!s.isDraft&&evaluation.sourceType==='submission');
  const sources: Record<string, string> = {};
  state.submissions.filter(s => !s.isDraft).forEach(s => { sources[s.id] = s.content; });
  Object.assign(sources, unpack(state.assessment?.answers, {}));
  state.interviews.forEach(s => s.turns.forEach(t => { if (t.answer) sources[t.id] = t.answer; }));
  state.practice.forEach(p=>{sources[p.id]=p.answer;});
  state.retests.forEach(r=>Object.entries(unpack<Record<string,string>>(r.answers,{})).forEach(([id,answer])=>{sources[r.id+':'+id]=answer;}));
  return <section className="evaluation"><div className="section-title"><h2>本次反馈</h2><span className={'pill ' + (evaluation.demo ? 'peach' : 'green')}>{evaluation.demo ? '演示结果 · 不计入能力' : 'AI 评价 · 有效证据已核验'}</span></div><div className="evaluation-scope"><strong>评价范围与版本</strong><p>{evaluation.scope}</p><small>{stamp(evaluation.createdAt)} · {evaluation.rubricVersion} · {evaluation.promptVersion} · {evaluation.model}</small></div><p>{review.summary}</p><Rubric />{review.items.map(item => <article key={item.skillId} className="feedback-item"><div className="section-title"><h3>{skills.find(s => s.id === item.skillId)?.name}</h3><span className="level">{item.level === null ? '待评估' : item.level + ' / 4 级'}</span></div><div className="feedback-grid"><div><h4>本次表现</h4>{item.strengths.map(s => <p key={s}>{s}</p>)}</div><div><h4>对照标准与缺口</h4>{item.level !== null && <p>{anchors[item.level]}</p>}{item.gaps.map(s => <p key={s}>{s}</p>)}</div></div><details className="evidence"><summary>原文证据 · {item.evidenceReferences.length} 处可追溯引用</summary>{item.evidenceReferences.map((ref, i) => { const text = sources[ref.sourceId] ?? ''; const start = text.indexOf(ref.quote); return <div key={i} className="evidence-entry"><blockquote>{ref.quote}</blockquote><small>来源 ID：{ref.sourceId} · 字符 {start}–{start + ref.quote.length}</small><details><summary>展开完整原文</summary><pre className="source-text">{text || '原文不可用'}</pre></details></div>; })}</details><h4>具体改进与后续验证</h4><ul>{item.nextActions.map(s => <li key={s}>{s}</li>)}</ul>{submission&&item.nextActions.length>0&&<Link className="feedback-to-revision" href={withReturn('/projects/knowledge-assistant?stage='+submission.taskId+'&revise='+submission.id+'&focus='+item.skillId,returnTo)+'#project-draft'}>带着这条建议去改稿 →</Link>}</article>)}<p className="tiny">本次结论只适用于展示的回答与提交，不代表全面能力或录用判断。<Link href="/profile">查看能力历史</Link></p></section>;
}
