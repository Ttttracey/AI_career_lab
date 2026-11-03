import OpenAI, { toFile } from 'openai';
import { z } from 'zod';
import { capabilities } from '@/lib/ai';
import { validateAudio } from '@/lib/core';
import { sameOrigin, errorResponse } from '@/lib/http';
import { db, USER_ID } from '@/lib/db';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const kind = new URL(request.url).searchParams.get('kind');
    const caps = capabilities();
    if (kind === 'transcribe' && !caps.transcription) throw new Error('尚未配置语音转写服务。请使用文字回答；不会用固定文本冒充录音内容。');
    if (kind === 'speech' && !caps.speech) throw new Error('尚未配置语音朗读服务，可以阅读问题并继续。');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45000, maxRetries: 0 });
    if (kind === 'speech') {
      const { turnId } = z.object({ turnId: z.string().max(150) }).parse(await request.json());
      const turn = await db.interviewTurn.findFirstOrThrow({ where: { id: turnId, session: { userId: USER_ID } } });
      const result = await client.audio.speech.create({ model: process.env.AI_SPEECH_MODEL!, voice: (process.env.AI_SPEECH_VOICE || 'coral') as 'coral', input: turn.question.slice(0, 1000), response_format: 'mp3' });
      return new Response(await result.arrayBuffer(), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
    }
    if (kind !== 'transcribe') throw new Error('未知语音操作。');
    const length = Number(request.headers.get('content-length'));
    if (!Number.isFinite(length) || length <= 0 || length > 10 * 1024 * 1024 + 32768) throw new Error('上传录音不得超过 10 MB。');
    const form = await request.formData();
    const file = form.get('audio');
    if (!(file instanceof File)) throw new Error('未收到有效录音。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = validateAudio(bytes, file.type, Number(form.get('duration')));
    // Only an in-memory buffer is sent to the configured service. No raw recording
    // is written to disk, the database, or a log; it is released after this request.
    const result = await client.audio.transcriptions.create({ model: process.env.AI_TRANSCRIBE_MODEL!, file: await toFile(bytes, `answer.${ext}`, { type: file.type.split(';')[0] }), language: 'zh' });
    const text = result.text?.trim();
    if (!text) throw new Error('没有识别到有效文字，请重录或切换文字。');
    return Response.json({ text: text.slice(0, 6000), confirmed: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return errorResponse(e); }
}
