import type { Metadata } from 'next';
import './globals.css';
import './atmosphere.css';
export const metadata: Metadata = { title: 'AI 转行练习场 · 慢慢学，认真练', description: '把学过的 AI 知识，变成能做出来、也能讲清楚的产品能力。中文本地单用户训练应用。' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
