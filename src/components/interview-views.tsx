'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, Mic, Square, Pause, Play, Volume2, MessageSquareText, Check, RotateCcw, FileText } from 'lucide-react';
import type { AppState } from '@/lib/service';
import { useApp, useAutosave, stamp, PageHeading, Empty } from './application';
import { Button } from './ui/button';
import { EvaluationView } from './feedback';
import { Markdown } from './training-views';
type Session = AppState['interviews'][number];
type Turn = Session['turns'][number];
export function Interviews() {
  const { state, act, busy, go } = useApp();
  const params = useSearchParams();
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [projectId, setProjectId] = useState(state.submissions.some(s => !s.isDraft) ? 'knowledge-assistant' : '');
  const key = useRef(crypto.randomUUID());
  const explicit = state.interviews.find(s => s.id === params.get('session'));
  const active = explicit ?? state.interviews.find(s => s.status !== 'ended');
  async function start() { const result = await act('startInterview', { mode, projectId: projectId || undefined, requestKey: key.current }) as { id: string }; go('/interviews?session=' + result.id); key.current = crypto.randomUUID(); }
  return <><PageHeading eyebrow="模拟面试" title={active && active.status !== 'ended' ? '一次只想清楚一个问题。' : '把做过的事，讲得更清楚。'}>五道主问题，每道最多一次追问。未回答的问题不记作错误，你可以暂停后再回来。</PageHeading>{active ? active.status === 'ended' ? <section className="card interview-ended"><Check size={30} /><h2>这一场的思考，已经留下来了。</h2><p>共保存 {active.turns.filter(t => t.answer).length} 条回答。现在可以查看完整问答并生成复盘。</p><Button asChild><Link href={`/interviews/${active.id}/report`}>查看本场复盘<ArrowRight size={16} /></Link></Button><Button variant="ghost" onClick={() => go('/interviews')}>开始新的面试</Button></section> : <InterviewWorkspace session={active} /> : <section className="card interview-setup"><div className="setup-icon"><MessageSquareText size={32} strokeWidth={1.5} /></div><h2>准备一场安心的练习</h2><p className="muted">有项目就围绕已有成果聊；还没有项目，就从具体情境练起。无需编造经历。</p><label>面试岗位<input readOnly value={state.user.targetRole || '初级 AI 产品经理'} /></label><Link className="text-link" href="/onboarding">修改目标岗位<ArrowRight size={13} /></Link><label>关联训练项目<select value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">不关联 · 情境面试</option><option value="knowledge-assistant">知识库问答助手 · 仅使用已提交版本</option></select></label><fieldset className="mode-choice"><legend>选择回答方式</legend><label className={mode === 'text' ? 'chosen' : ''}><input type="radio" name="mode" checked={mode === 'text'} onChange={() => setMode('text')} /><FileText size={20} /><strong>文字练习</strong><span>先想清楚，再写下来</span></label><label className={mode === 'voice' ? 'chosen' : ''}><input type="radio" name="mode" checked={mode === 'voice'} onChange={() => setMode('voice')} /><Mic size={20} /><strong>按轮语音</strong><span>录音 → 转写 → 确认</span></label></fieldset>{mode === 'voice' && <p className="note">{state.capabilities.transcription ? '录音将发送至配置的 OpenAI 转写服务。单次最多 2 分钟 / 10 MB，本机不保存原始录音，只保存你确认后的文字。' : '尚未配置转写服务。可进入查看语音流程并切换文字，系统不会生成假转写。'}</p>}<span className="pill peach">{state.capabilities.demo ? '演示面试 · 规则示例，不形成能力评分' : '真实 AI 面试 · 只依据你的回答'}</span><Button disabled={busy} onClick={() => void start().catch(() => {})}>开始这一场练习<ArrowRight size={17} /></Button></section>}{!active && state.interviews.length > 0 && <section className="profile-section"><h2>之前的练习</h2><div className="card">{state.interviews.slice(0, 5).map(s => <div key={s.id} className="record-line"><div><strong>{s.role}</strong><small>{stamp(s.createdAt)} · {s.turns.filter(t => t.answer).length} 条回答</small></div><Link className="text-link" href={`/interviews/${s.id}/report`}>查看复盘<ArrowRight size={14} /></Link></div>)}</div></section>}</>;
}
function InterviewWorkspace({ session }: { session: Session }) {
  const { state, act, busy, go } = useApp();
  const [mode, setMode] = useState(session.mode);
  const [ending, setEnding] = useState(false);
  const current = session.turns[session.turns.length - 1];
  async function end() { await act('interviewStatus', { sessionId: session.id, status: 'ended' }); go(`/interviews/${session.id}/report`); }
  return <><div className="interview-status"><span className="pill peach">{session.demo ? '演示面试 · 不计入能力' : 'AI 面试'}</span><span>{session.role} · {session.projectContext ? '关联已提交的训练成果' : '情境练习'}</span><span>已回答 {session.turns.filter(t => t.answer !== null).length} 题</span></div>{session.status === 'paused' ? <section className="card pause-card"><Pause size={28} /><h2>先停一会儿，也没关系。</h2><p>问题、已确认回答和文字草稿都已保存。录音原始内容不会保留。</p><Button disabled={busy} onClick={() => void act('interviewStatus', { sessionId: session.id, status: 'active' }).catch(() => {})}>恢复面试<Play size={16} /></Button></section> : <section className="interview-question card"><div className="section-title"><span className="eyebrow">主问题 {current.mainIndex} / 5 {current.parentId ? '· 追问' : ''}</span><span className="tiny">当前第 {current.position} 轮 / 最多 10 轮</span></div><h2>{current.question}</h2><QuestionSpeech key={'speech:' + current.id} turnId={current.id} enabled={mode === 'voice' && state.capabilities.speech} />{mode === 'voice' && !state.capabilities.speech && <p className="tiny">提问朗读服务尚未配置，阅读问题仍可继续。</p>}<AnswerEditor key={'answer:' + current.id} sessionId={session.id} turn={current} mode={mode} onTextMode={() => { setMode('text'); void act('interviewMode', { sessionId: session.id, mode: 'text' }, true).catch(() => {}); }} /></section>}<div className="interview-controls"><Button variant="secondary" disabled={busy} onClick={() => void act('interviewStatus', { sessionId: session.id, status: session.status === 'paused' ? 'active' : 'paused' }).catch(() => {})}>{session.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}{session.status === 'paused' ? '继续' : '暂停，稍后继续'}</Button><Button variant="ghost" disabled={busy} onClick={() => setEnding(v => !v)}>提前结束本场</Button></div>{ending && <div className="note end-confirm"><p>结束后将保留已回答内容，未回答的题目不计入评价。</p><Button variant="secondary" disabled={busy} onClick={() => void end().catch(() => {})}>结束并查看复盘</Button></div>}<details className="card interview-history"><summary>查看本场已完成问答（{session.turns.filter(t => t.answer).length} 条）</summary>{session.turns.filter(t => t.answer).map(t => <div className="qa-record" key={t.id}><strong>{t.position}. {t.question}</strong><p>{t.answer}</p></div>)}</details></>;
}
function AnswerEditor({ sessionId, turn, mode, onTextMode }: { sessionId: string; turn: Turn; mode: string; onTextMode: () => void }) {
  const { act, busy } = useApp();
  const [answer, setAnswer] = useState(turn.answer ?? turn.draft);
  const key = useRef(turn.answerKey ?? crypto.randomUUID());
  const saveStatus = useAutosave(answer, draft => act('interviewDraft', { sessionId, turnId: turn.id, draft }, true));
  async function submit() { await act('answerInterview', { sessionId, turnId: turn.id, answer, requestKey: key.current }); }
  return <div className="answer-editor">{mode === 'voice' && !turn.answer && <VoiceAnswer onConfirm={setAnswer} onTextMode={onTextMode} />}<label>{mode === 'voice' ? '已确认的文字（可继续修改）' : '你的回答'}<textarea rows={7} maxLength={6000} value={answer} readOnly={Boolean(turn.answer)} onChange={e => setAnswer(e.target.value)} placeholder={mode === 'voice' ? '录音转写并确认后，文字会出现在这里。也可以直接输入。' : '用自己的事实和判断来回答。不确定的地方，可以说明你会怎样验证。'} /></label><div className="answer-footer"><span className="save-status">{turn.answer ? '回答已保存 · 可重试生成下一题' : saveStatus}</span><Button disabled={busy || !answer.trim()} onClick={() => void submit().catch(() => {})}>{busy ? '保存回答并生成下一题…' : turn.answer ? '重试生成下一题' : '提交回答，继续'}<ArrowRight size={16} /></Button></div><p className="tiny">只有提交后的回答用于复盘。训练期间不展示参考答案。</p></div>;
}
function QuestionSpeech({ turnId, enabled }: { turnId: string; enabled: boolean }) {
  const [status, setStatus] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  async function play() {
    setStatus('正在生成朗读…');
    controller.current?.abort(); controller.current = new AbortController();
    try {
      const response = await fetch('/api/audio?kind=speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnId }), signal: controller.current.signal });
      if (!response.ok) throw new Error((await response.json()).error);
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(await response.blob());
      audio.current = new Audio(url.current);
      audio.current.onended = () => setStatus('');
      audio.current.onerror = () => setStatus('播放失败，可以直接阅读问题并继续。');
      await audio.current.play(); setStatus('正在朗读 · AI 生成语音');
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setStatus('朗读暂不可用，可以阅读问题继续，或重试。'); }
  }
  useEffect(() => { if (enabled) void play(); return () => { controller.current?.abort(); audio.current?.pause(); if (url.current) URL.revokeObjectURL(url.current); }; }, [enabled, turnId]);
  if (!enabled) return null;
  return <div className="question-speech"><Button variant="ghost" size="sm" onClick={() => void play()}><Volume2 size={16} />朗读问题</Button><span className="tiny" role="status">{status || '提问语音由 AI 生成'}</span></div>;
}
function VoiceAnswer({ onConfirm, onTextMode }: { onConfirm: (text: string) => void; onTextMode: () => void }) {
  const { state } = useApp();
  const [status, setStatus] = useState<'idle' | 'recording' | 'recorded' | 'uploading' | 'transcribing' | 'confirm' | 'error'>('idle');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [text, setText] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const upload = useRef<XMLHttpRequest | null>(null);
  const canceled = useRef(false);
  const alive = useRef(true);
  const began = useRef(0);
  const duration = useRef(0);
  function release() { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; if (timer.current) clearInterval(timer.current); timer.current = null; }
  useEffect(() => { alive.current = true; return () => { alive.current = false; canceled.current = true; if (recorder.current?.state === 'recording') recorder.current.stop(); release(); upload.current?.abort(); }; }, []);
  function stop(cancel = false) { canceled.current = cancel; duration.current = Math.max(0.1, Math.min(120, (performance.now() - began.current) / 1000)); if (recorder.current?.state === 'recording') recorder.current.stop(); release(); if (cancel) { setBlob(null); setStatus('idle'); } }
  async function record() {
    setError(''); setBlob(null); setText(''); canceled.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('浏览器不支持录音，请切换文字。');
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
      if (!mime) throw new Error('没有可用的录音格式，请切换文字。');
      const captured = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { captured.getTracks().forEach(t => t.stop()); return; }
      stream.current = captured;
      const chunks: BlobPart[] = [];
      recorder.current = new MediaRecorder(captured, { mimeType: mime });
      recorder.current.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.current.onstop = () => {
        release();
        if (!alive.current || canceled.current) return;
        const recording = new Blob(chunks, { type: mime });
        if (!recording.size || recording.size > 10 * 1024 * 1024) { setError('录音为空或超过 10 MB，请重录或切换文字。'); setStatus('error'); return; }
        setBlob(recording); setStatus('recorded');
      };
      recorder.current.onerror = () => { release(); setStatus('error'); setError('录音中断，请重录或切换文字。'); };
      recorder.current.start(1000); began.current = performance.now(); setSeconds(0); setStatus('recording');
      timer.current = setInterval(() => { const elapsed = Math.floor((performance.now() - began.current) / 1000); setSeconds(elapsed); if (elapsed >= 120) stop(); }, 250);
    } catch (e) { release(); setStatus('error'); setError(e instanceof DOMException && e.name === 'NotAllowedError' ? '麦克风权限被拒绝。你可以在浏览器授权后重试，或直接切换文字。' : e instanceof Error ? e.message : '无法开启麦克风，请切换文字。'); }
  }
  function transcribe() {
    if (!blob) return;
    setError(''); setStatus('uploading');
    const form = new FormData(); form.append('audio', blob, blob.type.startsWith('audio/mp4') ? 'answer.m4a' : 'answer.webm'); form.append('duration', String(duration.current));
    const request = new XMLHttpRequest(); upload.current = request;
    request.open('POST', '/api/audio?kind=transcribe'); request.timeout = 55000;
    request.upload.onload = () => { if (alive.current) setStatus('transcribing'); };
    request.onload = () => { if (!alive.current) return; try { const data = JSON.parse(request.responseText); if (request.status >= 400 || !data.text?.trim()) throw new Error(data.error || '未识别到文字，请重录。'); setText(data.text); setBlob(null); setStatus('confirm'); } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : '转写失败，请重试。'); } };
    request.onerror = request.ontimeout = () => { if (alive.current) { setStatus('error'); setError('转写服务连接失败。可重试当前录音，或切换文字。'); } };
    request.send(form);
  }
  function textMode() { canceled.current = true; if (recorder.current?.state === 'recording') recorder.current.stop(); release(); upload.current?.abort(); setBlob(null); onTextMode(); }
  return <section className="voice-panel"><div className="section-title"><h3><Mic size={18} />按轮语音回答</h3><span className="pill">{status === 'recording' ? '正在录音' : status === 'uploading' ? '上传中' : status === 'transcribing' ? '正在转写' : status === 'confirm' ? '等待你确认' : '单次最多 2 分钟'}</span></div><p className="tiny">录音会发送至所配置的 OpenAI 转写服务。原始录音仅用于当前请求，不保存到本机；仅保存你确认后的文字。</p>{!state.capabilities.transcription && <p className="note">未配置转写服务（需要服务端密钥及转写模型），当前可用文字回答。</p>}{error && <p className="inline-error" role="alert">{error}</p>}{status === 'recording' && <div className="recording"><span className="record-dot" /><strong>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</strong><span>正在收音，请清楚讲述你的想法</span></div>}{status === 'confirm' && <label>转写文字 · 请核对、修正后再确认<textarea rows={5} maxLength={6000} value={text} onChange={e => setText(e.target.value)} /></label>}<div className="actions">{status === 'recording' ? <><Button variant="secondary" onClick={() => stop()}><Square size={15} />停止录音</Button><Button variant="ghost" onClick={() => stop(true)}>取消录音</Button></> : status === 'confirm' ? <><Button disabled={!text.trim()} onClick={() => { onConfirm(text.trim()); setText(''); setStatus('idle'); }}><Check size={16} />确认文字</Button><Button variant="ghost" onClick={() => void record()}>重新录制</Button></> : <>{status !== 'uploading' && status !== 'transcribing' && <Button variant="secondary" disabled={!state.capabilities.transcription} onClick={() => void record()}><Mic size={16} />{blob || status === 'error' ? '重新录音' : '开始录音'}</Button>}{blob && status !== 'uploading' && status !== 'transcribing' && <Button onClick={transcribe}><RotateCcw size={16} />{status === 'error' ? '重试转写' : '上传并转写'}</Button>}</>}<Button variant="ghost" onClick={textMode}>切换文字回答</Button></div>{status === 'recorded' && <p className="tiny">已录制约 {Math.ceil(duration.current)} 秒 · {Math.ceil((blob?.size ?? 0) / 1024)} KB。确认上传前，录音只保留在当前页面内存。</p>}<p className="tiny" role="status">{status === 'uploading' ? '正在上传录音，尚未提交答案…' : status === 'transcribing' ? '上传完成，等待转写。文字需要你确认后才能提交。' : ''}</p></section>;
}
export function InterviewReport({ sessionId }: { sessionId: string }) {
  const { state, act, busy } = useApp();
  const session = state.interviews.find(s => s.id === sessionId);
  if (!session) return <Empty title="没有找到这场面试" text="请从成长档案查看已有面试。" href="/interviews" label="返回面试" />;
  if (session.status !== 'ended') return <Empty title="这场面试还在进行" text="可以先恢复回答，结束后再生成复盘。" href={'/interviews?session=' + session.id} label="恢复面试" />;
  const answered = session.turns.filter(t => t.answer?.trim());
  const evaluation = state.evaluations.find(e => e.sourceType === 'interview' && e.sourceId === sessionId);
  return <><Link href="/interviews" className="back-link"><ArrowLeft size={15} />模拟面试</Link><PageHeading eyebrow="面试复盘 · 有范围，有依据" title="把这一次，变成下一次的底气。">{session.role} · {stamp(session.createdAt)} · {answered.length} 条有效回答 · {session.demo ? '演示面试' : '真实 AI 面试'}</PageHeading><section className="card report-card">{evaluation ? <EvaluationView evaluation={evaluation} /> : <><h2>{answered.length ? '回答已完整保存，可以生成本场复盘' : '这场尚无已回答内容'}</h2><p className="muted">{answered.length ? '只评价实际回答覆盖的维度。未回答题不记错，引用不匹配时不写入正式评价。' : '没有足够证据评价能力。未回答的问题仍可在下方查看。'}</p>{answered.length > 0 && <Button disabled={busy} onClick={() => void act('reviewInterview', { sessionId }).catch(() => {})}>{busy ? '正在核对回答与证据…' : '生成本场复盘'}<ArrowRight size={16} /></Button>}</>}</section><section className="card report-card"><h2>完整问答记录</h2><p className="tiny">原文按轮次保存。以下表达整理仅引用你已提供的文字，不添加经历、结果或个人贡献。</p>{session.turns.map(turn => <article key={turn.id} className="qa-record" id={'turn-' + turn.id}><div className="question-meta">主问题 {turn.mainIndex}{turn.parentId ? ' · 追问' : ''} · 第 {turn.position} 轮</div><h3>{turn.question}</h3><div className="answer-original"><span className="eyebrow">你的原文</span><p>{turn.answer || '尚未回答 · 不计入评价'}</p></div>{turn.answer && <details><summary>只使用现有事实的表达整理</summary><p>可以先用一句话回应问题，再补依据与验证：</p><blockquote>{turn.answer}</blockquote><p className="muted">【待补充】请自行补充这段判断的实际依据、你已完成的具体交付和验证范围；没有这些事实时，不补造经历或数字。</p><p className="tiny">本段是原文组织提示，未声称你有未提供的经历。</p></details>}</article>)}</section><section className="practice-box"><div><h2>选一个判断，再做一次验证。</h2><p>回到项目，把面试中没讲清的依据补上，再提交一个新版本。</p></div><Button asChild variant="secondary"><Link href="/projects/knowledge-assistant">回到项目修改<ArrowRight size={16} /></Link></Button></section></>;
}
