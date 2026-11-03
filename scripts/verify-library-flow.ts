import assert from 'node:assert/strict';
import { baselineQuestions } from '../src/lib/content';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3002';
async function state(){const response=await fetch(base+'/api/state');assert.equal(response.status,200);return response.json() as Promise<import('../src/lib/service').AppState>;}
async function act(action:string,data:unknown={},expected=200){const response=await fetch(base+'/api/actions',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action,data})});const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result.result;}
function pdf(){
  const stream='BT /F1 14 Tf 40 700 Td (Verified local PDF material) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let out='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=out.length;out+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return out;
}
async function upload(name:string,content:string,key:string,expected=200){const form=new FormData();form.set('file',new File([content],name));form.set('requestKey',key);form.set('skillId','evaluation');form.set('sourceLabel','【验证材料】'+name);const res=await fetch(base+'/api/import',{method:'POST',headers:{Origin:base},body:form});const body=await res.json();assert.equal(res.status,expected,JSON.stringify(body));return body.batch;}
async function main(){
  for(const path of ['/profile','/profile/records','/profile/library','/profile/retests'])assert.equal((await fetch(base+path)).status,200);
  const original=(await state()).assessment!.answers;
  const item={kind:'question',title:'【验证】导入的情境题',body:'助手找不到可靠制度时，如何向用户说明并保留后续路径？',skillIds:['product_design'],lessonIds:['l10'],reference:'说明没有依据、提供有效资料入口与转人工，不编造金额。',rubric:'检查问题、依据、流程、异常与验收条件。',sourceLabel:'【验证】人工整理资料',locator:'第 1 段'};
  const batch=await upload('question.json',JSON.stringify([item,item,{title:'缺少正文'}]),'flow-import-preview-1');
  const rows=JSON.parse(batch.preview).rows;assert.equal(rows.length,3);assert.equal(rows[1].duplicate,true);assert.ok(rows[2].error);
  const committed=await act('commitImport',{id:batch.id,selected:[0,1]});assert.equal(committed.added,1);assert.equal(committed.duplicates,1);assert.deepEqual(await act('commitImport',{id:batch.id,selected:[0]}),committed);
  let current=await state();const question=current.catalog.find(c=>c.title===item.title)!;assert.equal(question.status,'pending');
  await act('practice',{id:question.id,answer:'先说明没有依据',requestKey:'pending-must-block'},400);
  await act('verifyCatalog',{id:question.id,status:'verified',note:'【验证】已核对原文、标签、参考与评价标准。'});
  await act('addCatalogPlan',{id:question.id});await act('addCatalogPlan',{id:question.id});
  const payload={id:question.id,answer:'先说明缺少可靠依据，展示有效资料入口，再提供转人工路径；不生成金额。',requestKey:'flow-library-answer'};
  const answer=await act('practice',payload);assert.equal((await act('practice',payload)).id,answer.id);
  await act('reviewPractice',{id:answer.id});
  current=await state();assert.ok(current.evaluations.find(e=>e.sourceId===answer.id));assert.equal(current.plans[0].items.filter(p=>p.resourceId==='lib:'+question.id).length,1);
  const pdfBatch=await upload('material.pdf',pdf(),'flow-real-pdf-upload');const pdfRows=JSON.parse(pdfBatch.preview).rows;assert.ok(pdfRows[0].item.body.includes('Verified local PDF material'));assert.equal(pdfRows[0].item.locator,'PDF 第 1 页');await act('commitImport',{id:pdfBatch.id,selected:[0]});
  const documentId=JSON.parse(pdfBatch.preview).documentId;const download=await fetch(base+'/api/documents/'+documentId);assert.equal(download.status,200);assert.ok((await download.text()).startsWith('%PDF-'));
  await upload('fake.pdf','not a PDF','flow-fake-pdf-upload',400);
  await upload('empty.txt','','flow-empty-upload',400);
  const csv=await upload('rows.csv','kind,title,body,skillIds,sourceLabel\nmaterial,CSV 导入测试,"原文,含逗号","[""evaluation""]",验证资料','flow-csv-upload');assert.equal(JSON.parse(csv.preview).rows[0].item.body,'原文,含逗号');
  const md=await upload('notes.md','# 我的学习材料\n\n这是需要核对的记录。','flow-md-upload');assert.equal(JSON.parse(md.preview).rows.length,1);
  const round=await act('startRetest',{requestKey:'flow-retest-start'});assert.equal((await act('startRetest',{requestKey:'flow-retest-start'})).id,round.id);
  const qs=JSON.parse(round.questions) as import('../src/lib/retests').RetestQuestion[];const answers=Object.fromEntries(qs.map(q=>[q.sourceId,'【验证回答】先确认情境与资料依据；采用小范围试用，记录失败类型与验证计划，当前没有业务结果。']));
  await act('retest',{id:round.id,answers:{r0:answers.r0},status:'paused'});assert.equal((await state()).retests[0].status,'paused');
  await act('retest',{id:round.id,answers,status:'active'});await act('retest',{id:round.id,answers,status:'completed'});await act('reviewRetest',{id:round.id});await act('reviewRetest',{id:round.id});
  const final=await state();assert.equal(final.assessment!.answers,original);assert.equal(final.evidence.length,0);assert.equal(final.evaluations.filter(e=>e.sourceId===round.id).length,1);assert.equal(final.retests[0].status,'completed');
  assert.equal((await fetch(base+'/api/library?template=1')).status,200);assert.equal((await fetch(base+'/api/export')).status,200);
  console.log(JSON.stringify({ok:true,newPages:4,importFormats:['JSON','CSV','Markdown','PDF'],baselineAnswersPreserved:baselineQuestions.length,retestId:round.id,practiceId:question.id,archiveSnapshots:final.snapshots.length,demoEvidence:final.evidence.length},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
