import { db, USER_ID, parse } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const template = [{ kind: 'question', title: '示例：知识助手的无依据处理', body: '用户询问差旅金额但找不到有效制度时，你会怎样设计处理流程？', skillIds: ['product_design'], lessonIds: ['l10'], questionType: 'scenario', options: [], answerIndex: null, reference: '说明证据缺失；提供澄清问题、可靠资料入口与转人工；不能编金额。', rubric: '依 0–4 级表现标准，检查流程、依据、异常与验收条件。', sourceLabel: '请替换为你实际使用的来源', sourceUrl: '', locator: '请填写页码、段落或原题编号', publishedDate: '' }];
  const data = url.searchParams.has('template') ? template : await db.catalogItem.findMany({ where: { userId: USER_ID }, orderBy: { createdAt: 'asc' } });
  const clean = url.searchParams.has('template') ? data : data.map(item => ({ ...item, skillIds: parse((item as { skillIds: string }).skillIds, []), lessonIds: parse((item as { lessonIds: string }).lessonIds, []), options: parse((item as { options: string }).options, []) }));
  return new Response(JSON.stringify(clean, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${url.searchParams.has('template') ? 'import-template' : 'content-library'}.json"`, 'Cache-Control': 'no-store' } });
}
