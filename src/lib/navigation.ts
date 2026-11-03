import { lessons, projectTasks } from './content';
export function safeReturn(value: string | null | undefined, fallback = '/roadmap') {
  if (!value || value.length > 2000 || !value.startsWith('/') || value.startsWith('//')) return fallback;
  try {
    const url = new URL(value, 'http://local.invalid');
    if (url.origin !== 'http://local.invalid') return fallback;
    const allowed = ['/dashboard', '/roadmap', '/projects', '/profile', '/profile/library', '/profile/records'];
    if (!allowed.includes(url.pathname) && !lessons.some(l => url.pathname === '/learn/' + l.id)) return fallback;
    return url.pathname + url.search;
  } catch { return fallback; }
}
export function resourceLink(id: string) {
  if (lessons.some(l => l.id === id)) return '/learn/' + id;
  if (projectTasks.some(t => t.id === id)) return '/projects/knowledge-assistant?stage=' + id;
  if (id === 'interview') return '/interviews';
  if (/^lib:[a-z0-9_-]+$/i.test(id)) return '/profile/library/' + id.slice(4);
  return null;
}
export function withReturn(href: string, from: string) {
  const url = new URL(href, 'http://local.invalid'); url.searchParams.set('from', safeReturn(from, '/roadmap'));
  return url.pathname + url.search;
}
export function returnLabel(href: string) {
  return href === '/profile' ? '成长档案' : href === '/profile/records' ? '我的资料与历史' : href === '/dashboard' ? '今日成长' : href.startsWith('/learn/') ? '返回刚才的短课' : href.startsWith('/profile/library') ? '返回资料与题库' : href === '/projects' ? '项目练习' : '成长路线';
}
type Item = { id:string; resourceId:string; status:string; prerequisites:string; position:number; minutes:number; reason:string };
export function nextPlanStep(items: Item[], currentId: string, catalog: {id:string;status:string;title:string}[] = []) {
  const remaining = items.filter(i => i.status !== 'done' && i.resourceId !== currentId && resourceLink(i.resourceId) && (!i.resourceId.startsWith('lib:') || catalog.some(c => 'lib:' + c.id === i.resourceId && c.status === 'verified'))).sort((a,b) => a.position-b.position);
  const unmet = (i:Item) => { let ids:string[]=[];try{ids=JSON.parse(i.prerequisites);}catch{}return ids.filter(id=>id!==currentId && !items.some(p=>p.resourceId===id&&p.status==='done')); };
  const item = remaining.find(i=>i.status==='active') ?? remaining.find(i=>!unmet(i).length) ?? remaining[0];
  if(!item)return null;
  return { ...item, href:resourceLink(item.resourceId)!, title:lessons.find(l=>l.id===item.resourceId)?.title ?? projectTasks.find(t=>t.id===item.resourceId)?.title ?? catalog.find(c=>'lib:'+c.id===item.resourceId)?.title ?? '模拟面试 · 讲清你的判断', missing:unmet(item) };
}
