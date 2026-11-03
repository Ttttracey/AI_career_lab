'use client';
import { useRef, useState } from 'react';
import { ArrowRight, ArrowLeft, Check, CornerDownRight, GitBranch, BookmarkCheck } from 'lucide-react';
import { useApp, useAutosave, unpack } from './application';
import { Button } from './ui/button';
import type { LessonContent } from '@/lib/content';
import { scenarios } from '@/lib/scenarios';
import { nextPlanStep, withReturn } from '@/lib/navigation';

export function DecisionLab({lessonId}:{lessonId:string}) {
  const {state,act,busy}=useApp();const [saving,setSaving]=useState(false);const scenario=scenarios[lessonId];
  const saved=state.snapshots.filter(s=>s.kind==='lesson_decision'&&s.sourceId===lessonId).sort((a,b)=>b.version-a.version)[0];
  const chosen=unpack<{choice?:number}>(saved?.content,{}).choice;
  if(!scenario)return null;
  const decision=chosen===0||chosen===1?scenario.choices[chosen]:null;
  async function choose(choice:number){if(saving)return;setSaving(true);try{await act('lessonDecision',{lessonId,choice},true);}finally{setSaving(false);}}
  return <section className="decision-lab card" id="lesson-decision" aria-labelledby="decision-title"><div className="section-title"><span className="eyebrow"><GitBranch size={14}/>产品决策小剧场</span><span className="tiny">原创假设情境 · 不计分</span></div><div className="decision-scene"><span className="scene-role">你现在是：{scenario.role}</span><h2 id="decision-title">{scenario.situation}</h2><p>先选一条路，再看看要面对什么。</p></div><div className="decision-choices">{scenario.choices.map((c,i)=><button key={i} aria-pressed={chosen===i} aria-controls="decision-consequence" disabled={busy||saving} className={'decision-choice '+(chosen===i?'selected':'')} onClick={()=>void choose(i).catch(()=>{})}><span className="decision-letter">{i===0?'A':'B'}</span><strong>{c.label}</strong>{chosen===i?<Check size={17}/>:<ArrowRight size={17}/>}</button>)}</div><div id="decision-consequence" aria-live="polite">{decision&&<div className="decision-reveal"><div className="decision-reveal-label"><CornerDownRight size={17}/>沿着这条路，接下来呢？</div><p>{decision.outcome}</p><div className="decision-question"><strong>留一个问题，带进下面的短课</strong><p>{decision.question}</p></div><small><BookmarkCheck size={13}/>这次选择已保存在我的资料。可以换一条路比较；不把选择当成能力结论。</small></div>}</div></section>;
}
export function LessonQuiz({lesson}:{lesson:LessonContent}) {
  const {state,act,busy}=useApp();const progress=state.progress.find(p=>p.lessonId===lesson.id);
  const initial=unpack<Record<string,number>>(progress?.answers,{});
  const savedAttempt=state.quizAttempts.find(a=>a.lessonId===lesson.id&&a.answers===JSON.stringify(initial));
  const [answers,setAnswers]=useState(initial);const [result,setResult]=useState(Boolean(savedAttempt));
  const [index,setIndex]=useState(lesson.quiz.findIndex((_,i)=>initial[i]===undefined)>=0?lesson.quiz.findIndex((_,i)=>initial[i]===undefined):0);
  const [advancing,setAdvancing]=useState(false);
  const key=useRef(crypto.randomUUID());const header=useRef<HTMLHeadingElement>(null);
  const saveStatus=useAutosave(answers,value=>act('quiz',{lessonId:lesson.id,answers:value,submit:false},true));
  const answered=lesson.quiz.filter((_,i)=>answers[i]!==undefined).length;
  const correct=lesson.quiz.filter((q,i)=>q.answer===answers[i]).length;
  function move(to:number){setIndex(to);setResult(false);requestAnimationFrame(()=>header.current?.focus({preventScroll:true}));}
  async function advance(){if(advancing)return;setAdvancing(true);try{await act('quiz',{lessonId:lesson.id,answers,submit:false},true);move(index+1);}finally{setAdvancing(false);}}
  async function submit(){await act('quiz',{lessonId:lesson.id,answers,submit:true,requestKey:key.current});key.current=crypto.randomUUID();setResult(true);}
  return <section className="card quiz quiz-workbench" id="lesson-quiz"><div className="section-title"><div><span className="eyebrow">想明白，再往前一步</span><h2 ref={header} tabIndex={-1}>三个问题，检查理解</h2></div><span className="save-status">{advancing?'正在记下本题…':saveStatus}</span></div><p className="tiny">三题全对即可完成本课。重复完成不重复增加经验值；小测不提高能力等级。</p><div className="quiz-waypoints" aria-label="小测题目导航">{lesson.quiz.map((_,i)=><button key={i} type="button" disabled={advancing} aria-label={'小测第 '+(i+1)+' 题'+(answers[i]!==undefined?'，已选择':'，未选择')} aria-current={!result&&i===index?'step':undefined} className={(answers[i]!==undefined?'answered ':'')+(!result&&i===index?'current':'')} onClick={()=>move(i)}><span>{i+1}</span><span>{answers[i]!==undefined?'已选择':'想一想'}</span></button>)}<small>{answered} / 3 已作答</small></div>{result?<div className="quiz-recap" role="status"><div className="quiz-recap-heading"><span className="recap-symbol">{correct===3?<Check size={24}/>:<CornerDownRight size={24}/>}</span><div><h3>{correct===3?'这节课，先走到这里。':'有些取舍，值得再想一次。'}</h3><p>本次答对 {correct} / 3 题 · {correct===3?'理解检查已完成':'原回答已保存，可以修正后再试'}</p></div></div>{lesson.quiz.map((q,i)=><details key={i} className="quiz-recap-item"><summary><span>{answers[i]===q.answer?'✓':'待修正'}</span>{q.question}</summary><p>你的选择：{q.options[answers[i]]??'未作答'}</p><p>参考选择：{q.options[q.answer]}</p><p>{q.explanation}</p>{answers[i]!==q.answer&&<Button size="sm" variant="secondary" onClick={()=>move(i)}>回到这一题</Button>}</details>)}<Button variant="ghost" size="sm" onClick={()=>move(lesson.quiz.findIndex((q,i)=>q.answer!==answers[i])>=0?lesson.quiz.findIndex((q,i)=>q.answer!==answers[i]):0)}>再想一轮</Button></div>:<form onSubmit={e=>{e.preventDefault();void (index<2?advance():submit()).catch(()=>{});}}><fieldset key={index} disabled={advancing||busy} className="quiz-question-card"><legend><span>第 {index+1} 题</span>{lesson.quiz[index].question}</legend>{lesson.quiz[index].options.map((o,i)=><label className={'quiz-option '+(answers[index]===i?'chosen':'')} key={i}><input type="radio" name={'quiz-'+index} checked={answers[index]===i} onChange={()=>{setAnswers({...answers,[index]:i});key.current=crypto.randomUUID();}}/><span>{o}</span>{answers[index]===i&&<Check size={16}/>}</label>)}</fieldset><div className="actions quiz-navigation">{index>0&&<Button variant="ghost" type="button" disabled={advancing} onClick={()=>move(index-1)}><ArrowLeft size={15}/>上一题</Button>}<Button type="submit" disabled={busy||advancing||answers[index]===undefined||(index===2&&answered<3)}>{index<2?'记下选择，下一题':'提交三题，看看理解'}<ArrowRight size={16}/></Button></div></form>}{result&&correct===3&&<NextStep currentId={lesson.id} from={'/learn/'+lesson.id}/>}</section>;
}
export function NextStep({currentId,from}:{currentId:string;from:string}) {
  const {state,act,busy,go}=useApp();const next=nextPlanStep(state.plans[0]?.items??[],currentId,state.catalog);
  if(!state.plans.length)return <div className="next-step-card"><span className="eyebrow">把这次练习放回路线</span><p>你的记录已经保存。回到今日成长，确认接下来的安排。</p><Button variant="secondary" onClick={()=>go('/dashboard')}>回到今日成长<ArrowRight size={15}/></Button></div>;
  async function proceed(){if(!next)return;await act('plan',{id:next.id,status:'active'},true);go(withReturn(next.href,from));}
  return <div className="next-step-card"><span className="eyebrow">下一站 · 按你的现有安排</span><h3>{next?.title??'回看这一轮留下的作品'}</h3><p>{next?`${next.minutes} 分钟 · ${next.missing.length?'还有前置未完成，可以选择提前开始。':'前置已满足。'}`:'本轮任务已完成，可以整理成果，再选择需要验证的地方。'}</p>{next&&<details><summary>为什么接着练这一步？</summary><p>{next.reason}</p></details>}<Button disabled={busy} variant="secondary" onClick={()=>next?void proceed().catch(()=>{}):go('/profile')}>{next?'继续这一小步':'打开成长档案'}<ArrowRight size={16}/></Button></div>;
}
