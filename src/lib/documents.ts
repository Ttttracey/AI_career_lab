import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { db, USER_ID } from './db';
import { digest } from './history';
import { previewImport } from './catalog';
import type { CatalogInput } from './catalog-schema';
const exec = promisify(execFile);
const root = resolve('.local/uploads');
export async function removeUnusedDocuments(keys: string[]) {
  for (const key of new Set(keys)) if (/^[a-f0-9]{64}\.(pdf|json|csv|md|txt)$/.test(key) && !await db.sourceDocument.findFirst({ where: { storageKey: key } })) await rm(join(root, key), { force: true });
}
export async function documentBytes(id: string) {
  const row = await db.sourceDocument.findFirstOrThrow({ where: { id, userId: USER_ID } });
  if (!/^[a-f0-9]{64}\.(pdf|json|csv|md|txt)$/.test(row.storageKey)) throw new Error('文件记录无效。');
  return { row, bytes: await readFile(join(root, row.storageKey)) };
}
export async function importFile(file: File, requestKey: string, defaults: Partial<CatalogInput>) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !['pdf', 'json', 'csv', 'md', 'txt'].includes(ext)) throw new Error('支持 PDF、JSON、CSV、Markdown 和 TXT；表格请先另存为 CSV。');
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('文件不能为空，且不能超过 10 MB。');
  const bytes = Buffer.from(await file.arrayBuffer()); const sha256 = digest(bytes);
  if (ext === 'pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('文件不是有效的 PDF。');
  const storageKey = sha256 + '.' + ext; await mkdir(root, { recursive: true }); await writeFile(join(root, storageKey), bytes);
  let text = '', pageCount = 0;
  if (ext === 'pdf') {
    const bundled = join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
    const python = process.env.PYTHON_EXECUTABLE || (existsSync(bundled) ? bundled : 'python');
    const script = 'import sys,json\nfrom pypdf import PdfReader\nr=PdfReader(sys.argv[1])\nif len(r.pages)>100: raise ValueError("PDF exceeds 100 pages")\nsys.stdout.buffer.write(json.dumps([p.extract_text() or "" for p in r.pages],ensure_ascii=False).encode("utf-8"))';
    let pages: string[];
    try { const output = await exec(python, ['-c', script, join(root, storageKey)], { timeout: 20000, maxBuffer: 12 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }); pages = JSON.parse(output.stdout); }
    catch { throw new Error('PDF 文字提取失败。仅支持 100 页以内的文字型 PDF；扫描件请先做文字识别，或改用 Markdown / TXT。请检查服务端 Python 与 pypdf 配置。'); }
    pageCount = pages.length;
    const items = pages.flatMap((body, i) => {
      const clean = body.replace(/\u0000/g, '').trim();
      return Array.from({ length: Math.ceil(clean.length / 20000) }, (_, part) => ({ ...defaults, kind: 'material', title: file.name.replace(/\.pdf$/i, '') + ` · 第 ${i + 1} 页` + (clean.length > 20000 ? `（${part + 1}）` : ''), body: clean.slice(part * 20000, (part + 1) * 20000), sourceLabel: defaults.sourceLabel || file.name, locator: `PDF 第 ${i + 1} 页` }));
    });
    if (!items.length) throw new Error('PDF 中没有可提取的文字，请先做文字识别。');
    text = JSON.stringify(items);
  } else { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (text.includes('\u0000')) throw new Error('文本编码无效，请另存为 UTF-8。'); }
  const document = await db.sourceDocument.upsert({ where: { userId_sha256: { userId: USER_ID, sha256 } }, update: {}, create: { userId: USER_ID, name: file.name.slice(0, 240), mime: ext === 'pdf' ? 'application/pdf' : 'text/plain', bytes: bytes.length, sha256, storageKey, pageCount } });
  return previewImport(ext === 'pdf' ? file.name + '.json' : file.name, text, requestKey, defaults, document.id);
}
