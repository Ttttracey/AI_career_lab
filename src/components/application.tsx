'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sprout, ArrowRight, LayoutDashboard, Route, FolderOpen, MessagesSquare, UserRound, ChevronRight, LoaderCircle, CircleCheck } from 'lucide-react';
import type { AppState } from '@/lib/service';
import { Button } from './ui/button';
import { Onboarding, Dashboard, Roadmap, Profile } from './growth-views';
import { Learning, Projects, ProjectWorkspace } from './training-views';
import { Interviews, InterviewReport } from './interview-views';
import { Records, Library, LibraryItem } from './library-views';
import { Retests } from './retest-views';
import { BaselineReport } from './baseline-report';
type Context = { state: AppState; act: (action: string, data?: unknown, quiet?: boolean) => Promise<unknown>; refresh: () => Promise<void>; busy: boolean; go: (path: string) => void };
const AppContext = createContext<Context | null>(null);
export function useApp() { const c = useContext(AppContext); if (!c) throw new Error('App context missing'); return c; }
export const unpack = <T,>(text: string | null | undefined, fallback: T): T => { try { return text ? JSON.parse(text) as T : fallback; } catch { return fallback; } };
export const stamp = (date: Date | string | null | undefined) => date ? new Date(date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '尚未完成';
export function useAutosave<T>(value: T, save: (v: T) => Promise<unknown>) {
  const serialized = JSON.stringify(value);
  const latest = useRef(value); latest.current = value;
  const callback = useRef(save); callback.current = save;
  const saved = useRef(serialized);
  const [status, setStatus] = useState('已保存');
  useEffect(() => {
    if (saved.current === serialized) return;
    setStatus('等待保存…');
    const timer = setTimeout(() => {
      setStatus('保存中…');
      callback.current(latest.current).then(() => { saved.current = serialized; setStatus('已保存'); }).catch(() => setStatus('保存失败，请重试'));
    }, 650);
    return () => clearTimeout(timer);
  }, [serialized]);
  useEffect(() => () => {
    if (JSON.stringify(latest.current) !== saved.current) void callback.current(latest.current).catch(() => {});
  }, []);
  return status;
}
let recentState: {value:AppState;savedAt:number}|null=null;
export function Application({ path }: { path: string }) {
  const [state, setState] = useState<AppState | null>(()=>recentState&&Date.now()-recentState.savedAt<15000?recentState.value:null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function refresh() {
    const response = await fetch('/api/state', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    recentState={value:result as AppState,savedAt:Date.now()};
    setState(result as AppState);
  }
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, []);
  useEffect(() => { setError(''); setNotice(''); requestAnimationFrame(()=>{const id=window.location.hash.slice(1);const target=id?document.getElementById(id):null;if(target)target.scrollIntoView({block:'start'});else window.scrollTo(0,0);}); }, [path,Boolean(state)]);
  async function act(action: string, data: unknown = {}, quiet = false) {
    if (!quiet) { setBusy(true); setError(''); setNotice(''); }
    try {
      const response = await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }), keepalive: quiet });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '保存未完成，请重试。');
      await refresh();
      if (!quiet) setNotice(['draft', 'profile', 'baseline', 'interviewDraft'].includes(action) ? '已保存到本机。' : '已完成，记录已保存。');
      return result.result as unknown;
    } catch (e) { const message = e instanceof Error ? e.message : '请求失败，请重试。'; setError(message); throw e; }
    finally { if (!quiet) setBusy(false); }
  }
  const go = (href: string) => router.push(href);
  if (!state) return <main className="loading-screen"><Sprout size={30} /><p>{error || '正在打开你的练习场…'}</p>{error && <Button onClick={() => void refresh().catch(e => setError(e.message))}>重试</Button>}</main>;
  const context: Context = { state, act, refresh, busy, go };
  const route = path.split('/').filter(Boolean);
  const home = path === '/';
  const nav = [{ href: '/dashboard', label: '今日成长', icon: LayoutDashboard }, { href: '/roadmap', label: '成长路线', icon: Route }, { href: '/projects', label: '项目练习', icon: FolderOpen }, { href: '/interviews', label: '模拟面试', icon: MessagesSquare }, { href: '/profile', label: '成长档案', icon: UserRound }];
  const isNavCurrent=(href:string)=>href==='/roadmap'?(path.startsWith('/roadmap')||path.startsWith('/learn/')):href==='/dashboard'?(path.startsWith('/dashboard')||path.startsWith('/onboarding')):path.startsWith(href);
  let view: React.ReactNode;
  if (home) view = <Home />;
  else if (route[0] === 'onboarding') view = route[1] === 'report' ? <BaselineReport /> : <Onboarding />;
  else if (route[0] === 'dashboard') view = <Dashboard />;
  else if (route[0] === 'roadmap') view = <Roadmap />;
  else if (route[0] === 'learn') view = <Learning key={route[1]} lessonId={route[1]} />;
  else if (route[0] === 'projects') view = route[1] ? <ProjectWorkspace key={route[1]} projectId={route[1]} /> : <Projects />;
  else if (route[0] === 'interviews') view = route[2] === 'report' ? <InterviewReport key={route[1]} sessionId={route[1]} /> : <Interviews />;
  else if (route[0] === 'profile') view = route[1] === 'records' ? <Records /> : route[1] === 'library' ? route[2] ? <LibraryItem key={route[2]} id={route[2]} /> : <Library /> : route[1] === 'retests' ? <Retests key={route[2]??'list'} id={route[2]} /> : <Profile />;
  else view = <div className="empty"><h1>这里还没有内容</h1><Link href="/dashboard">回到今日成长</Link></div>;
  return <AppContext.Provider value={context}>
    {home ? view : <div className="app-shell"><aside className="sidebar"><Link className="brand" href="/"><span className="brand-mark"><Sprout size={20} /></span>AI 转行练习场</Link><div className="sidebar-caption">慢慢学，认真练。</div><nav aria-label="主要导航">{nav.map(n => <Link key={n.href} aria-current={isNavCurrent(n.href)?'page':undefined} className={'nav-item ' + (isNavCurrent(n.href) ? 'selected' : '')} href={n.href}><n.icon size={19} />{n.label}{isNavCurrent(n.href) && <ChevronRight size={15} className="nav-chevron" />}</Link>)}</nav><div className="sidebar-bottom"><span className="avatar">学</span><div><strong>本地学习者</strong><small>单用户 · 数据保存在本机</small></div></div></aside><div className="main-shell"><header className="topbar"><span>每一次练习，都留下点什么。</span><span className={'mode-label ' + (state.capabilities.demo ? 'demo' : '')}>{state.capabilities.demo ? '演示 AI · 本地学习' : '真实 AI · 本地学习'}</span></header><main id="main-content" className="workspace">{view}</main><footer className="app-footer">AI 转行练习场 <span>·</span> 让每一步都有依据</footer></div></div>}
    {busy && <div className="working" role="status"><LoaderCircle className="spin" size={17} />正在处理，请稍等…</div>}
    {(error || notice) && <div className={'toast ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>{error ? <span>{error}</span> : <><CircleCheck size={17} /><span>{notice}</span></>}<button aria-label="关闭提示" onClick={() => { setError(''); setNotice(''); }}>×</button></div>}
  </AppContext.Provider>;
}
function Home() {
  const { state, act, busy } = useApp();
  const h = state.home.content;
  return <div className="home"><header className="home-header"><Link className="brand" href="/"><span className="brand-mark"><Sprout size={20} /></span>AI 转行练习场</Link><Link className="home-learning" href="/dashboard">我的学习 <ArrowRight size={15} /></Link></header><main className="home-center"><div className="home-quote"><p>{(h.text.match(/[^，；]+[，；]?/g) ?? [h.text]).map((clause, i) => <span className="quote-clause" key={i}>{clause}</span>)}</p></div><Button asChild className="home-cta"><Link href={state.homeAction.href}>{state.homeAction.label}<ArrowRight size={18} /></Link></Button><div className="home-source"><span>{h.type === 'news' ? '行业动态 · 已核验' : h.type === 'encouragement' ? '原创 · 给正在出发的你' : '原创 · 一点产品思考'}</span>{h.type === 'news' && h.sourceUrl && <a href={h.sourceUrl} target="_blank" rel="noreferrer">来源 · {new Date(h.publishedAt!).toLocaleDateString('zh-CN')}</a>}<span className="source-dot">·</span><button disabled={busy} onClick={() => void act('switchQuote').catch(() => {})}>换一句</button></div></main></div>;
}
export function PageHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) { return <div className="page-heading"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{children && <p>{children}</p>}</div>; }
export function Empty({ title, text, href, label }: { title: string; text: string; href?: string; label?: string }) { return <div className="empty"><Sprout size={30} /><h2>{title}</h2><p>{text}</p>{href && <Button asChild><Link href={href}>{label}<ArrowRight size={16} /></Link></Button>}</div>; }
