import { documentBytes } from '@/lib/documents';
export const runtime = 'nodejs';
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { row, bytes } = await documentBytes((await context.params).id);
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': row.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return Response.json({ error: '原始文件不存在。' }, { status: 404 }); }
}
