import 'dotenv/config';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { db, USER_ID } from '../src/lib/db';
import { digest } from '../src/lib/history';
import { previewImport, commitImport } from '../src/lib/catalog';
import { validateCatalog } from '../src/lib/catalog-schema';

// Optional local import of the four user-supplied tutorials. These are references,
// not a claim to possess the external question bank mentioned in the tutorials.
const directory = process.argv[2];
if (!directory) throw new Error('请传入教程 PDF 所在目录，例如 D:/your-pdf-folder');
const tutorials = [
  { file:'6：vibe coding实战：搭建一个产品经理面试题库系统3-数据入库.pdf',pages:26,skill:'evaluation',lessons:['l05','l09'],title:'教程参考 · 如何整理和入库题目',body:'这份教程介绍从资料整理到题目入库的过程：先约定题目、题型、选项、参考要点、解析、能力标签和来源等字段，再清洗和检查内容。\n\n本应用采用可预览的结构化导入，重复正文和选项会跳过；不完整内容不会直接启用。导入后需要核对来源、能力标签和固定标准。\n\n教程提到的外部题库原文件并未随本次附件提供，本条也不是该题库。真实岗位要求、个人练习答案和授权资料仍需由你补充。此内容是教程方法摘要，不是企业业务事实。' },
  { file:'7：vibe coding实战：搭建一个产品经理面试题库系统4-竞品分析、功能增加.pdf',pages:31,skill:'user_insight',lessons:['l02','l03'],title:'教程参考 · 从用户问题决定功能',body:'这份教程讨论竞品分析、目标用户和个性化学习体验。可借鉴的方法是把功能与用户问题联系起来，再用实际反馈决定迭代顺序。\n\n在本应用中，六题反馈逐题展示回答依据、未展开的地方和下一步练习；用户查看后再确认路线。\n\n教程中的自适应测评方案只能作为设计参考；题量、停止条件与六维覆盖需要额外验证。本应用没有据此宣称实现统计意义上的自适应测评，也不生成岗位匹配率。此内容是教程摘要，待本地学习者核对。' },
  { file:'8：vibe coding实战：搭建一个产品经理面试题库系统5-完成功能闭环.pdf',pages:42,skill:'product_design',lessons:['l08','l09','l12'],title:'教程参考 · 诊断、学习与复测的闭环',body:'这份教程强调诊断之后应有解释、学习资源和再次检验，而不是只给分数。反馈应能定位实际回答，并给出可以执行的下一步。\n\n本应用把课程、项目、题库练习和阶段复测连在一起；核对通过的资料可以关联课程并带入答疑上下文，也可以主动加入成长路线。复测使用独立题目快照和回答记录，不覆盖首次诊断。\n\n模型失败时保留输入并允许重试；演示反馈明确标记，不混入真实能力档案。此条是方法摘要，不代表已验证的学习效果。' },
  { file:'9：vibe+coding实战：搭建一个产品经理面试题库系统6-测试.pdf',pages:41,skill:'evaluation',lessons:['l09','l10'],title:'教程参考 · 测试保存、边界与复测对比',body:'这份教程围绕功能测试、记录积累和复测体验展开。应检查数据是否保存、重复提交是否重复写入、内容不足和服务失败时能否继续，以及报告能否追溯原文。\n\n本应用保留正式项目版本、小测提交、题库回答和复测快照。复测优先换题，题库耗尽后提示重复题；只有同标准下的真实有效评价才并列展示能力表现，不从演示结果推算成长。\n\n页面打开、按钮可点与数据正确是不同检查。此条是教程方法摘要，不能作为实际岗位能力证明。' },
] as const;
async function main(){
  const root=resolve('.local/uploads');await mkdir(root,{recursive:true});
  for(const t of tutorials){
    const bytes=await readFile(join(directory,t.file));if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('文件格式不正确：'+t.file);
    const sha256=digest(bytes),storageKey=sha256+'.pdf';await writeFile(join(root,storageKey),bytes);
    const document=await db.sourceDocument.upsert({where:{userId_sha256:{userId:USER_ID,sha256}},update:{},create:{userId:USER_ID,name:basename(t.file),mime:'application/pdf',bytes:bytes.length,sha256,storageKey,pageCount:t.pages}});
    const item=validateCatalog({kind:'material',title:t.title,body:t.body,skillIds:[t.skill],lessonIds:[...t.lessons],sourceLabel:t.file,locator:`全篇方法摘要（原文共 ${t.pages} 页），需对照附件核对`});
    const batch=await previewImport(t.file+'.summary.json',JSON.stringify([item]),'tutorial-summary-v1-'+sha256,{},document.id);
    await commitImport(batch.id,[0]);
  }
  console.log('已保存 4 份教程原文件与待核对的方法摘要；未导入未提供的外部题库。');
}
main().finally(()=>db.$disconnect());
