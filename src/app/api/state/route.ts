import { getState } from '@/lib/service';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET() {
  try { return Response.json(await getState(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: '本地数据暂不可用。请先运行 pnpm setup，再重试。' }, { status: 503 }); }
}
