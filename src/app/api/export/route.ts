import { exportSubmission, getState } from '@/lib/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('submission');
  try {
    const body = id ? await exportSubmission(id) : JSON.stringify(await getState(), null, 2);
    return new Response(body, { headers: { 'Content-Type': id ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${id ? 'training-project-' + id + '.md' : 'ai-career-lab-data.json'}"`, 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: '指定版本不存在。' }, { status: 404 }); }
}
