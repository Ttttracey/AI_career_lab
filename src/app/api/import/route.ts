import { sameOrigin, errorResponse } from '@/lib/http';
import { serialized } from '@/lib/service';
import { importFile } from '@/lib/documents';
import { z } from 'zod';
import { skillIds } from '@/lib/content';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const chunks: Uint8Array[] = []; let size = 0; const reader = request.body?.getReader();
    if (!reader) throw new Error('请选择文件。');
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 11 * 1024 * 1024) { await reader.cancel(); throw new Error('上传不能超过 10 MB。'); } chunks.push(value); }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
    const file = form.get('file'); if (!(file instanceof File)) throw new Error('请选择文件。');
    const key = z.string().min(8).max(150).parse(form.get('requestKey'));
    const skill = z.enum(skillIds).parse(form.get('skillId'));
    const label = z.string().max(200).parse(form.get('sourceLabel') || file.name.slice(0, 200));
    const batch = await serialized(() => importFile(file, key, { skillIds: [skill], sourceLabel: label }));
    return Response.json({ ok: true, batch });
  } catch (e) { return errorResponse(e); }
}
