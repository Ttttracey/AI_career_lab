import { db, USER_ID, parse } from './db';
import { catalogSchema, validateCatalog, normalizeText, type CatalogInput } from './catalog-schema';
import { digest, snapshot } from './history';
import { lessons, skills, anchors, type SkillId } from './content';

export const catalogHash = (item: CatalogInput) => digest(JSON.stringify([item.kind, normalizeText(item.body), item.options.map(normalizeText)]));
export function catalogValue(item: { skillIds: string; lessonIds: string; options: string } & Record<string, unknown>): CatalogInput {
  return validateCatalog({ ...item, skillIds: parse(item.skillIds, []), lessonIds: parse(item.lessonIds, []), options: parse(item.options, []) });
}
function stored(item: CatalogInput) { return { ...item, skillIds: JSON.stringify(item.skillIds), lessonIds: JSON.stringify(item.lessonIds), options: JSON.stringify(item.options), hash: catalogHash(item) }; }
export type PreviewRow = { index: number; item?: CatalogInput; error?: string; duplicate?: boolean };

// RFC 4180-style quoted fields, including embedded commas and newlines.
export function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else if (!field || quoted) quoted = !quoted; else throw new Error('CSV 引号位置不正确。'); }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(field.replace(/\r$/, '')); field = ''; if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; } }
    else field += c;
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号。');
  row.push(field.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map(h => h.trim().replace(/^\uFEFF/, '')) ?? [];
  if (!headers.includes('body') || new Set(headers).size !== headers.length) throw new Error('CSV 需要不重复的字段名，并包含 body；请使用下载的模板。');
  return rows.map(values => {
    if (values.length !== headers.length) throw new Error('CSV 列数不一致，请核对引号和分隔符。');
    const item: Record<string, unknown> = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    for (const key of ['skillIds', 'lessonIds', 'options']) if (typeof item[key] === 'string') item[key] = item[key] ? JSON.parse(item[key] as string) : [];
    if (typeof item.answerIndex === 'string') item.answerIndex = item.answerIndex === '' ? null : Number(item.answerIndex);
    return item;
  });
}
export async function previewImport(filename: string, text: string, requestKey: string, defaults: Partial<CatalogInput> = {}, documentId?: string) {
  const old = await db.importBatch.findUnique({ where: { requestKey } }); if (old) return old;
  let values: unknown[];
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'json') { let data: unknown; try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('JSON 无法解析，请检查引号、逗号或使用下载的模板。'); } values = Array.isArray(data) ? data : (data as { items?: unknown[] })?.items ?? [data]; }
  else if (ext === 'csv') { try { values = parseCsv(text); } catch (e) { throw new Error(e instanceof Error && /[\u4e00-\u9fff]/.test(e.message) ? e.message : 'CSV 数组字段格式不正确，请按模板把能力、课程和选项填写为 JSON 数组。'); } }
  else values = [{ ...defaults, title: filename.replace(/\.[^.]+$/, ''), body: text }];
  if (!values.length || values.length > 300) throw new Error('每批导入需要 1–300 条内容。');
  const seen = new Set<string>(); const rows: PreviewRow[] = [];
  for (const [index, value] of values.entries()) {
    try {
      const item = validateCatalog({ kind: 'material', sourceLabel: filename, ...defaults, ...(typeof value === 'object' ? value : {}) });
      const hash = catalogHash(item); const duplicate = seen.has(hash) || Boolean(await db.catalogItem.findUnique({ where: { userId_hash: { userId: USER_ID, hash } } })); seen.add(hash);
      rows.push({ index, item, duplicate });
    } catch (e) { rows.push({ index, error: e instanceof Error && !('issues' in e) ? e.message : '字段缺失或格式不正确；请按模板补齐标题、正文、能力标签和来源。' }); }
  }
  return db.importBatch.create({ data: { userId: USER_ID, filename, requestKey, preview: JSON.stringify({ rows, documentId }) } });
}
export async function commitImport(id: string, selected: number[]) {
  const batch = await db.importBatch.findFirstOrThrow({ where: { id, userId: USER_ID } });
  if (batch.status === 'committed') return parse(batch.result, {});
  const preview = parse<{ rows: PreviewRow[]; documentId?: string }>(batch.preview, { rows: [] });
  if (!selected.length || selected.some(i => !preview.rows.some(r => r.index === i && r.item && !r.error))) throw new Error('请选择格式有效的条目。');
  return db.$transaction(async tx => {
    let added = 0, duplicates = 0;
    for (const index of new Set(selected)) {
      const item = validateCatalog(preview.rows[index].item); const data = stored(item);
      if (await tx.catalogItem.findUnique({ where: { userId_hash: { userId: USER_ID, hash: data.hash } } })) { duplicates++; continue; }
      const created = await tx.catalogItem.create({ data: { ...data, userId: USER_ID, documentId: preview.documentId } });
      await snapshot(tx, 'catalog', created.id, item.title, item); added++;
    }
    const result = { added, duplicates };
    await tx.importBatch.update({ where: { id }, data: { status: 'committed', committedAt: new Date(), result: JSON.stringify(result) } });
    return result;
  });
}
export async function saveCatalog(id: string | undefined, input: unknown) {
  const item = validateCatalog(input); const data = stored(item);
  return db.$transaction(async tx => {
    const duplicate = await tx.catalogItem.findUnique({ where: { userId_hash: { userId: USER_ID, hash: data.hash } } });
    if (duplicate && duplicate.id !== id) throw new Error('正文与选项相同的内容已经存在，请直接查看原条目。');
    const row = id ? await tx.catalogItem.update({ where: { id, userId: USER_ID }, data: { ...data, status: 'pending', verifiedAt: null, verificationNote: '' } }) : await tx.catalogItem.create({ data: { ...data, userId: USER_ID, origin: 'manual' } });
    await snapshot(tx, 'catalog', row.id, row.title, item); return row;
  });
}
export async function verifyCatalog(id: string, status: 'verified' | 'rejected', note: string) {
  const row = await db.catalogItem.findFirstOrThrow({ where: { id, userId: USER_ID } }); const item = catalogValue(row);
  if (!note.trim()) throw new Error('请留下核对依据或退回原因。');
  if (status === 'verified' && item.kind === 'question' && (!item.reference.trim() || !item.rubric.trim())) throw new Error('题目需要参考要点和评价标准，补齐后再核对启用。');
  return db.$transaction(async tx => {
    await snapshot(tx, 'catalog_review', id, row.title + ' · 核对记录', { status, note, contentHash: row.hash });
    return tx.catalogItem.update({ where: { id }, data: { status, verificationNote: note, verifiedAt: status === 'verified' ? new Date() : null } });
  });
}
export async function verifiedItem(id: string) {
  const row = await db.catalogItem.findFirst({ where: { id, userId: USER_ID, status: 'verified' } });
  if (!row) throw new Error('内容尚未核对、已退回或不存在，请先到资料与题库确认后再使用。');
  return row;
}
export async function addCatalogPlan(id: string) {
  const item = await verifiedItem(id); const plan = await db.learningPlan.findFirst({ where: { userId: USER_ID }, orderBy: { version: 'desc' } });
  if (!plan) throw new Error('请先建立成长路线。');
  const existing = await db.planItem.findFirst({ where: { planId: plan.id, resourceId: 'lib:' + id } }); if (existing) return existing;
  const count = await db.planItem.aggregate({ where: { planId: plan.id }, _max: { position: true } });
  return db.planItem.create({ data: { planId: plan.id, resourceId: 'lib:' + id, kind: 'library', position: (count._max.position ?? 0) + 1, minutes: 15, skills: item.skillIds, reason: `你主动加入的已核对${item.kind === 'question' ? '练习题' : '资料'}：${item.sourceLabel}。`, prerequisites: '[]' } });
}
export async function finishMaterial(id: string) {
  const item = await verifiedItem(id);
  if (item.kind === 'question') throw new Error('练习题需要保存回答后完成。');
  return db.planItem.updateMany({ where: { resourceId: 'lib:' + id, plan: { userId: USER_ID } }, data: { status: 'done' } });
}
export async function seedCatalog() {
  const originals: CatalogInput[] = lessons.flatMap(l => l.quiz.map((q, index) => validateCatalog({ kind: 'question', title: l.title + ' · 练习 ' + (index + 1), body: q.question, skillIds: l.skills, lessonIds: [l.id], questionType: 'single', options: q.options, answerIndex: q.answer, reference: q.explanation, rubric: '依课程概念选择最适合的选项；不以选择题形成能力等级。', sourceLabel: '练习场原创课程', locator: l.id + ' / 小测 ' + (index + 1) })));
  const scenarios: Record<SkillId, string[]> = {
    user_insight: ['财务收到很多重复报销咨询。你会怎样核实这是高频需求，并确定第一批用户和场景？', '新员工分不清制度版本。请设计三条访谈问题，并说明什么证据会让你调整优先级。'],
    ai_judgment: ['内部资料每周变化且有不同可见权限。请选择搜索、RAG 或 Agent，解释取舍及一个失败条件。', '制度查询可以直接搜索。什么条件下值得增加生成回答？请设计一个可比较的小实验。'],
    product_design: ['助手引用了两份互相冲突的制度。请描述用户流程、界面提示与可验收的处理规则。', '用户问题缺少城市和员工级别。你会怎样设计补充信息、回答与转人工流程？'],
    evaluation: ['准备小范围试用知识助手。请列正常、无答案、冲突和权限样例，定义指标口径与试用门槛。', '助手回答流畅但偶有引用错误。你如何区分检索与生成的问题，并验证改进是否有效？'],
    delivery: ['两周和一位工程师的条件下，请提出可上线范围、暂缓内容、费用假设与回滚办法。', '试用后等待时间和费用都超出预期。你会怎样定位原因，做取舍并设置上线保护？'],
    communication: ['只依据你确实做过的练习，讲清问题、行动、取舍和结果；尚未验证的部分请明确标注。', '请讲述一次你修改训练方案的过程。没有实际经历时，按假设情境说明验证计划，不要编造数据。'],
  };
  for (const s of skills) for (const [i, body] of scenarios[s.id].entries()) originals.push(validateCatalog({ kind: 'question', title: s.short + ' · 情境 ' + (i + 1), body, skillIds: [s.id], lessonIds: [lessons.find(l => l.skills.includes(s.id))!.id], reference: `${s.description}先写具体场景与依据，再解释方法、取舍、指标和失败处理。事实不足时明确待补充，不编造经历或数据。`, rubric: anchors.map((a, j) => `${j}：${a}`).join('\n'), sourceLabel: '练习场原创平行情境题', locator: s.id + ' / ' + (i + 1) }));
  for (const item of originals) await db.catalogItem.upsert({ where: { userId_hash: { userId: USER_ID, hash: catalogHash(item) } }, update: {}, create: { ...stored(item), userId: USER_ID, origin: 'original', status: 'verified', verifiedAt: new Date(), verificationNote: '原创训练内容已按固定课程与标准校对；不代表企业真题或行业认证。' } });
}
