'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowRight, ArrowLeft, BookOpen, Check, Clock3, Send, MessageCircle, FileDown, History, FolderOpen, Lightbulb, Eye, PencilLine } from 'lucide-react';
import { useApp, useAutosave, unpack, stamp, PageHeading, Empty } from './application';
import { Button } from './ui/button';
import { lessons, project, projectTasks } from '@/lib/content';
import { DecisionLab, LessonQuiz, NextStep } from './learning-interactions';
import { safeReturn, returnLabel, withReturn } from '@/lib/navigation';
import type { Review } from '@/lib/core';
import { SkillTags } from './growth-views';
import { EvaluationView, Rubric } from './feedback';
export function Markdown({ text }: { text: string }) { return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>; }
export function Tutor({ contextId }: { contextId: string }) {
  const { state, act, busy } = useApp();
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const key = useRef(crypto.randomUUID());
  const conversation = state.conversations.find(c => c.contextId === contextId);
  async function ask() {
    if (!question.trim() || asking) return;
    setAsking(true);
    try { await act('ask', { contextId, question, requestKey: key.current }); setQuestion(''); key.current = crypto.randomUUID(); } finally { setAsking(false); }
  }
  return <aside className="tutor card"><div className="section-title"><h2><MessageCircle size={19} />陪你想一想</h2><span className="pill">{state.capabilities.demo ? '演示答疑' : 'AI 答疑'}</span></div><p className="muted tiny">已带入当前课程或阶段上下文。先解释方法，再引导你独立完成。</p><div className="conversation" aria-live="polite">{conversation?.messages.length ? conversation.messages.map(m => <div key={m.id} className={'chat-message ' + m.role}><small>{m.role === 'user' ? '你' : m.demo ? '教练 · 演示结果' : 'AI 学习教练'}</small><Markdown text={m.content} /></div>) : <div className="tutor-empty"><Lightbulb size={25} /><p>卡住了也没关系。<br />试着说说，你在哪一步还不确定？</p></div>}</div><form onSubmit={e => { e.preventDefault(); void ask().catch(() => {}); }}><label htmlFor={'tutor-' + contextId}>关于这一步，我想问<textarea id={'tutor-' + contextId} maxLength={2000} rows={3} value={question} onChange={e => { setQuestion(e.target.value); key.current = crypto.randomUUID(); }} placeholder="例如：怎样判断这是真问题，而不是方案偏好？" /></label><Button variant="secondary" disabled={busy || asking || !question.trim()} type="submit"><Send size={15} />{asking ? '正在整理解释…' : '发送问题'}</Button></form></aside>;
}
export function Learning({ lessonId }: { lessonId: string }) {
  const { state, act, busy } = useApp();
  const lesson = state.lessons.find(l => l.id === lessonId);
  if (!lesson) return <Empty title="这节课还不存在" text="请从成长路线选择已有课程。" href="/roadmap" label="回到路线" />;
  return <LessonWorkspace key={lessonId} lesson={lesson} />;
}
function LessonWorkspace({ lesson }: { lesson: typeof lessons[number] }) {
  const { state, act, busy } = useApp();
  const progress = state.progress.find(p => p.lessonId === lesson.id);
  const params=useSearchParams();
  const returnHref=safeReturn(params.get('from'));
  const stage=lesson.id<='l03'?'stage-a':lesson.id<='l08'?'stage-b':lesson.id<='l11'?'stage-c':'stage-d';
  return <><Link className="back-link" href={returnHref}><ArrowLeft size={15} />{returnLabel(returnHref)}</Link><PageHeading eyebrow={'短课 ' + lesson.id.slice(1) + ' / 12'} title={lesson.title}>{lesson.goal}</PageHeading><nav className="lesson-stations" aria-label="本课练习步骤"><a href="#lesson-decision"><span>01</span>做个判断</a><a href="#lesson-notes"><span>02</span>读懂方法</a><a href="#lesson-quiz"><span>03</span>检查理解</a><a href="#lesson-practice"><span>04</span>用进作品</a></nav><div className="workspace-columns"><div><div className="lesson-meta"><span><Clock3 size={15} />约 {lesson.minutes} 分钟</span><SkillTags ids={lesson.skills} />{progress?.completedAt && <span className="pill green"><Check size={13} />已完成</span>}</div><DecisionLab lessonId={lesson.id}/><article className="card lesson-content" id="lesson-notes">{lesson.sections.map((section, i) => <section key={section.title}><div className="section-number">0{i + 1}</div><h2>{section.title}</h2><p>{section.body}</p></section>)}<div className="case-box"><span className="eyebrow">把方法放进场景</span><h3>知识库助手的一个例子</h3><p>{lesson.example}</p></div><p className="tiny">原创教学内容 · 无实时价格、排行或行业新闻。未核对的外部链接不列为课程来源。</p></article>{state.catalog.some(c=>c.status==='verified'&&unpack<string[]>(c.lessonIds,[]).includes(lesson.id))&&<section className="card related-materials"><h2>结合自己的资料再练一次</h2><p className="tiny">以下内容已核对；相关学习资料也会带入本课答疑上下文。</p>{state.catalog.filter(c=>c.status==='verified'&&unpack<string[]>(c.lessonIds,[]).includes(lesson.id)).slice(0,8).map(c=><Link key={c.id} href={withReturn('/profile/library/'+c.id,'/learn/'+lesson.id)} className="record-line"><span>{c.title}<small>{c.sourceLabel} · {c.locator}</small></span><ArrowRight size={15}/></Link>)}</section>}<LessonQuiz lesson={lesson}/><section className="practice-box" id="lesson-practice"><div><span className="eyebrow">让知识变成作品</span><h2>把今天的方法用一次</h2><p>{lesson.practice}</p></div><Button asChild variant="secondary"><Link href={withReturn('/projects/knowledge-assistant?stage='+stage,'/learn/'+lesson.id)}>去项目练习<ArrowRight size={16} /></Link></Button></section></div><Tutor contextId={lesson.id} /></div></>;
}
export function Projects() {
  const { state } = useApp();
  return <><PageHeading eyebrow="项目练习" title="做一件完整的小事。">从用户的问题出发，留下能修改、能验证、也能讲清楚的产品成果。</PageHeading><article className="project-cover card"><div className="project-cover-icon"><FolderOpen size={40} strokeWidth={1.4} /></div><span className="pill peach">贯穿训练 · 模拟企业</span><h2>{project.title}</h2><p>{project.background}</p><div className="project-stage-list">{projectTasks.map(t => { const count = state.submissions.filter(s => s.taskId === t.id && !s.isDraft).length; return <Link href={'/projects/' + project.id + '?stage=' + t.id} key={t.id}><span className="stage-letter">{String.fromCharCode(64 + t.position)}</span><div><strong>{t.title.slice(4)}</strong><small>{count ? count + ' 个正式版本' : '等待你的第一份思考'}</small></div>{count ? <Check size={17} /> : <ArrowRight size={17} />}</Link>; })}</div><Button asChild><Link href={'/projects/' + project.id}>打开项目工作台<ArrowRight size={17} /></Link></Button></article></>;
}
export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const params = useSearchParams();
  const returnHref=safeReturn(params.get('from'),'/projects');
  const [stageId, setStageId] = useState(params.get('stage') ?? 'stage-a');
  useEffect(() => { setStageId(params.get('stage') ?? 'stage-a'); }, [params]);
  if (projectId !== project.id) return <Empty title="没有找到这个项目" text="目前提供企业内部知识库问答助手训练。" href="/projects" label="查看项目" />;
  const task = projectTasks.find(t => t.id === stageId) ?? projectTasks[0];
  return <><Link className="back-link" href={returnHref}><ArrowLeft size={15} />{returnLabel(returnHref)}</Link><PageHeading eyebrow="贯穿项目 · 模拟企业" title={project.title}>四个阶段，把“我想做”变成可讨论的交付。</PageHeading><details className="project-background card"><summary>项目背景、用户角色与业务约束</summary><p>{project.background}</p><ul>{project.constraints.map(c => <li key={c}>{c}</li>)}</ul></details><nav className="stage-tabs" aria-label="项目阶段">{projectTasks.map(t => <Link key={t.id} aria-current={t.id===task.id?'step':undefined} className={t.id === task.id ? 'current' : ''} href={'/projects/' + project.id + '?stage=' + t.id}><span>{String.fromCharCode(64 + t.position)}</span>{t.title.slice(4)}</Link>)}</nav><ProjectEditor key={task.id} task={task} initialVersion={params.get('version')} /></>;
}
function ProjectEditor({ task, initialVersion }: { task: typeof projectTasks[number]; initialVersion: string | null }) {
  const { state, act, busy, go } = useApp();
  const params=useSearchParams();
  const revisionId=params.get('revise');
  const focusSkill=params.get('focus');
  const draft = state.submissions.find(s => s.taskId === task.id && s.isDraft);
  const versions = state.submissions.filter(s => s.taskId === task.id && !s.isDraft).sort((a, b) => b.version - a.version);
  const [content, setContent] = useState(draft?.content ?? '');
  const [selected, setSelected] = useState(initialVersion ?? 'draft');
  useEffect(()=>{setSelected(initialVersion??'draft');},[initialVersion]);
  useEffect(()=>{if(revisionId)setSelected('draft');},[revisionId,focusSkill]);
  const [preview, setPreview] = useState(false);
  const [hints, setHints] = useState(0);
  const key = useRef(crypto.randomUUID());
  const saveStatus = useAutosave(content, value => act('draft', { taskId: task.id, content: value }, true));
  const version = versions.find(s => s.id === selected);
  const evaluation = state.evaluations.find(e => e.sourceType === 'submission' && e.sourceId === version?.id);
  const editing = selected === 'draft' || !version;
  const revision=versions.find(v=>v.id===revisionId);
  const revisionEvaluation=state.evaluations.find(e=>e.sourceType==='submission'&&e.sourceId===revision?.id);
  const revisionReview=unpack<Review>(revisionEvaluation?.result,{summary:'',items:[]});
  const focusItem=revisionReview.items.find(i=>i.skillId===focusSkill)??revisionReview.items[0];
  const revisionHref=version?withReturn('/projects/'+project.id+'?stage='+task.id+'&revise='+version.id+'&focus='+unpack<Review>(evaluation?.result,{summary:'',items:[]}).items[0]?.skillId,safeReturn(params.get('from'),'/projects'))+'#project-draft':'';
  async function submit() { const result = await act('submit', { taskId: task.id, content, requestKey: key.current }) as { id: string }; setSelected(result.id); key.current = crypto.randomUUID(); }
  return <div className="workspace-columns project-columns"><div><section className="card task-brief"><div className="section-title"><h2>{task.title}</h2><SkillTags ids={task.skills} /></div><h4>这一步要交付什么</h4><ul className="check-list">{task.requirements.map(r => <li key={r}><span>○</span>{r}</li>)}</ul><details className="rubric"><summary>本阶段固定评价标准</summary><p>{task.rubric}</p><Rubric /></details></section>{editing&&revision&&focusItem&&<section className="revision-note card" aria-label="本次改稿提示"><span className="eyebrow">随稿提示笺 · 依据正式 v{revision.version}</span><h2>这次，先把一处写具体。</h2><p>{focusItem.nextActions[0]??focusItem.gaps[0]??'补充判断的依据和验证方法。'}</p><details><summary>对照上次原文与反馈</summary>{focusItem.evidenceReferences.map((ref,i)=><blockquote key={i}>{ref.quote}</blockquote>)}{focusItem.gaps.map(g=><p key={g}>{g}</p>)}</details><small>{revisionEvaluation?.demo?'演示检查提示，不形成能力等级。':'只针对上次指定版本。'}当前草稿原样保留，修改后需要再次正式提交。</small></section>}<section className="editor card" id="project-draft"><div className="editor-toolbar"><label className="version-select"><History size={16} /><select aria-label="选择作品版本" value={editing ? 'draft' : selected} onChange={e => setSelected(e.target.value)}><option value="draft">正在编辑的草稿</option>{versions.map(v => <option key={v.id} value={v.id}>正式 v{v.version} · {stamp(v.createdAt)}</option>)}</select></label><div className="actions"><span className="save-status">{editing ? saveStatus : '不可覆盖的正式版本'}</span><Button size="sm" variant="ghost" onClick={() => setPreview(v => !v)}>{preview ? <PencilLine size={15} /> : <Eye size={15} />}{preview ? '编辑' : '预览'}</Button></div></div>{preview || !editing ? <div className="editor-preview"><Markdown text={version?.content ?? content} /></div> : <label className="editor-label"><span className="sr-only">项目 Markdown 草稿</span><textarea className="markdown-editor" maxLength={24000} value={content} onChange={e => setContent(e.target.value)} placeholder="先写下你的判断。可以使用下方模板，也可以从一个具体的用户场景开始。支持 Markdown。" /></label>}<div className="editor-bottom"><span className="tiny">{(version?.content ?? content).length} / 24,000 字符 · {editing ? '草稿自动保存到本机' : '反馈始终绑定这个版本'}</span>{editing && <Button variant="ghost" size="sm" disabled={Boolean(content.trim())} onClick={() => setContent(task.template)}>插入交付模板</Button>}</div><div className="editor-actions">{editing ? <><Button disabled={busy || !content.trim()} onClick={() => void submit().catch(() => {})}>正式提交，保存新版本<ArrowRight size={16} /></Button><Button variant="secondary" disabled={busy} onClick={() => void act('draft', { taskId: task.id, content }).catch(() => {})}>保存草稿</Button></> : <><Button variant={evaluation ? 'secondary' : 'default'} disabled={busy} onClick={() => evaluation ? go(revisionHref) : void act('reviewSubmission', { id: version!.id }).catch(() => {})}>{evaluation ? '根据反馈修改草稿' : '生成这个版本的点评'}<ArrowRight size={16} /></Button><Button variant="ghost" disabled={busy} onClick={() => void act('portfolio', { id: version!.id, included: !version!.portfolio }).catch(() => {})}>{version?.portfolio ? '移出成果档案' : '加入成果档案'}</Button><a className="text-link" href={'/api/export?submission=' + version?.id}><FileDown size={15} />导出 v{version?.version}</a></>}</div>{!editing && <p className="note">v{version?.version} 已独立保存。修改时请回到草稿，再提交新版本。点评失败时可重试，原文始终保留。</p>}</section>{evaluation && <section className="card report-card"><EvaluationView evaluation={evaluation} /><NextStep currentId={task.id} from="/projects"/></section>}</div><div className="project-aside"><section className="card hints"><div className="section-title"><h2><Lightbulb size={18} />先自己想一步</h2></div><p className="muted">不急着看答案。需要时，一次拿一条线索。</p>{task.hints.slice(0, hints).map((h, i) => <p className="hint" key={h}><strong>线索 {i + 1}</strong>{h}</p>)}<Button variant="secondary" size="sm" disabled={hints >= task.hints.length} onClick={() => setHints(i => i + 1)}>{hints >= task.hints.length ? '线索已全部展开' : '给我一条线索'}</Button><details><summary>我想看看参考思路</summary><p>{task.reference}</p><p className="tiny">请用自己的判断与依据完成，参考内容不等于你的实际成果。</p></details></section><Tutor contextId={task.id} /></div></div>;
}
