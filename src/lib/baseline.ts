import { baselineQuestions, lessons, projectTasks, skills, type SkillId } from './content';
import type { Review } from './core';

type CheckSpec = { name: string; words: RegExp; action: string };
type DimensionSpec = { lessonId: string; taskId: string; exercise: string; checks: CheckSpec[] };
const specs: Record<SkillId, DimensionSpec> = {
  user_insight: {
    lessonId: 'l03', taskId: 'stage-a',
    exercise: '补一组访谈问题：最近一次查制度发生在什么时候？当时怎样找？卡在哪一步、造成什么影响？用回答验证你的问题假设。',
    checks: [
      { name: '具体情境与工作流程', words: /场景|情境|流程|什么时候|触发/, action: '选定一种用户与一次触发情境，例如新员工报销前查制度。' },
      { name: '过去实际发生的行为', words: /最近|上次|曾经|发生过|实际经历/, action: '补问“最近一次是怎样完成的”，把情境落到一次实际经历。' },
      { name: '阻碍带来的影响', words: /耗时|多久|频率|影响|返工|损失|耽误/, action: '追问卡住之后的耗时、返工或其他影响；没有数据时保留为待验证。' },
    ],
  },
  ai_judgment: {
    lessonId: 'l06', taskId: 'stage-b',
    exercise: '在你选的方案后补两句：制度更新时怎样保证读到有效版本？检索没有找到依据时，系统下一步怎样处理？',
    checks: [
      { name: '资料依据与检索选择', words: /检索|RAG|文档|实际资料|原文/, action: '写清答案依据来自哪里，再解释为什么选这个方案。' },
      { name: '技术限制或失败风险', words: /幻觉|局限|限制|风险|错误|不可靠/, action: '给选定方案补一个可能失败的情形，而不只列技术名称。' },
      { name: '制度更新与有效版本', words: /更新|版本|生效|过期|维护/, action: '说明怎样处理更新、旧版与冲突资料；“检索到了”不等于“仍然有效”。' },
    ],
  },
  product_design: {
    lessonId: 'l10', taskId: 'stage-b',
    exercise: '写一条“没有可靠依据”的异常流程：说明无法核实 → 给出可查的原文或制度负责人入口 → 用户选择补充信息或转人工。每一步写清用户能做什么。',
    checks: [
      { name: '无依据时的明确处理', words: /拒答|无依据|没有依据|找不到|未覆盖|无法核实|不能确认|不编造/, action: '先明确“不编金额、不下无依据结论”，再写系统给用户的提示。' },
      { name: '用户可以采取的下一步', words: /转人工|负责人|行政|原文|目录|补充信息|人工确认/, action: '给用户一个可以执行的下一步，例如查原文、补充信息或联系制度负责人。' },
      { name: '异常条件与动作顺序', words: /如果|当.*时|先.*再|步骤|流程|然后|接着/, action: '按“出现什么条件 → 系统做什么 → 用户下一步”写出流程。' },
    ],
  },
  evaluation: {
    lessonId: 'l09', taskId: 'stage-c',
    exercise: '把“准确率、完整度”等指标展开成六条测试样例。每条写问题、参考资料、期望行为和判定方法；说明准确率的分母是什么。',
    checks: [
      { name: '质量指标的具体名称', words: /准确|正确|完整|一致|满意|指标/, action: '先选一个主要质量指标，并说明它衡量什么。' },
      { name: '异常或边界样例', words: /无答案|无资料|找不到|越权|权限|冲突|异常|报错/, action: '在正常题之外，至少加入无答案、冲突和越权题。' },
      { name: '样本、分母与判定口径', words: /分母|判定|样本|复核|多少条|计算方式|[0-9一二三四五六七八九十百]+条/, action: '说明谁逐条判定、什么算正确，以及指标除以哪一组题。' },
    ],
  },
  delivery: {
    lessonId: 'l11', taskId: 'stage-c',
    exercise: '给“先做核心功能”再加三个边界：两周内只做什么、什么暂不做、出现什么问题就停止试用。再列一项成本或延迟假设及验证办法。',
    checks: [
      { name: '首期范围与优先级', words: /核心|优先|先上线|先做|只读|暂不|不做|两周|第一周/, action: '将“核心功能”写具体，例如只读查询已审核制度，暂不自动办理申请。' },
      { name: '成本或响应时间', words: /成本|预算|费用|请求量|时延|延迟|响应时间/, action: '列出请求量、重试或响应时间的一项假设，并说明怎样用试用数据验证。' },
      { name: '权限、停止或回退条件', words: /权限|越权|回滚|回退|停止|风险|人工复核|转人工/, action: '至少写一条停止条件，例如越权样例失败时不扩大试用。' },
    ],
  },
  communication: {
    lessonId: 'l12', taskId: 'stage-d',
    exercise: '从你提到的一个项目想法中选一个，按“谁遇到什么问题 → 我已完成什么或计划验证什么 → 为什么这样选 → 下一步怎样验证”写四句话。未做过的部分明确写计划。',
    checks: [
      { name: '具体用户与问题情境', words: /用户|员工|行政|学生|老师|人群|客户|角色|谁|我自己/, action: '先说清楚服务谁、在什么情境解决什么阻碍，而不只说助手会做什么。' },
      { name: '实际贡献与计划的边界', words: /我完成|我做了|我负责|已完成|尚未|还没|计划|想做|希望|未上线|模拟|训练/, action: '明确哪些已完成、哪些是计划，不把项目想法说成已验证成果。' },
      { name: '验证办法或结果依据', words: /验证|测试|数据|假设|试用|结果依据|没有结果/, action: '没有实测结果时，写出下一步验证办法，不补造效果数字。' },
    ],
  },
};

function sentenceAt(text: string, start: number, length: number) {
  const separators = /[。！？\n]/;
  let left = start;
  let right = start + length;
  while (left > 0 && !separators.test(text[left - 1]) && start - left < 100) left--;
  while (right < text.length && !separators.test(text[right]) && right - start < 260) right++;
  return { quote: text.slice(left, right), startOffset: left, endOffset: right };
}
export function buildBaselineGuide(answers: Record<string, string>) {
  const items = baselineQuestions.map((question, index) => {
    const answer = answers[question.id] ?? '';
    const spec = specs[question.skillId as SkillId];
    const uncertainty = /(?:我|自己)(?:还|暂时|也|并)?(?:不太清楚|不清楚|不知道|不懂|不了解|没想好)|(?:这|第二|这个)(?:个)?问题[^。！？\n]{0,16}(?:不太清楚|不会|不知道)/.exec(answer);
    const checks = spec.checks.map(check => {
      const match = check.words.exec(answer);
      return { name: check.name, mentioned: Boolean(match), action: check.action, evidence: match ? sentenceAt(answer, match.index, match[0].length) : null };
    });
    const missing = checks.filter(c => !c.mentioned);
    return {
      questionId: question.id, number: index + 1, question: question.question, skillId: question.skillId as SkillId,
      skillName: skills.find(s => s.id === question.skillId)!.name, answer, checks,
      uncertainty: uncertainty ? sentenceAt(answer, uncertainty.index, uncertainty[0].length) : null,
      nextAction: missing[0]?.action ?? '选取上面的一个判断，补充为什么这样做、适用条件和实际验证办法。文字提及不等于论证已经成立。',
      exercise: spec.exercise, lessonId: spec.lessonId, taskId: spec.taskId,
      lessonTitle: lessons.find(l => l.id === spec.lessonId)!.title,
      taskTitle: projectTasks.find(t => t.id === spec.taskId)!.title,
    };
  });
  // User-declared uncertainty has priority. Missing wording is only a hint to
  // expand the answer, never a capability score or semantic correctness claim.
  const priorities = [...items].sort((a, b) => Number(Boolean(b.uncertainty)) - Number(Boolean(a.uncertainty)) || b.checks.filter(c => !c.mentioned).length - a.checks.filter(c => !c.mentioned).length || a.number - b.number).slice(0, 2);
  const uncertain = items.filter(i => i.uncertainty);
  const summary = uncertain.length
    ? `你在第 ${uncertain.map(i => i.number).join('、')} 题明确表达了不确定。先从「${priorities.map(i => skills.find(s => s.id === i.skillId)!.short).join('」和「')}」各补一个具体步骤，再把想法带进项目练习。`
    : '六份回答已经保存。下面逐题列出原文提及的线索、尚未检索到的明确描述，以及可以立刻动手的小练习。优先补写的两处不等同于能力高低判断。';
  return { version: 'baseline-text-check-v1', summary, items, priorities: priorities.map(i => i.questionId) };
}
export type BaselineGuide = ReturnType<typeof buildBaselineGuide>;
export function validateBaselineSources(review: Review) {
  for (const item of review.items) {
    const questionId = baselineQuestions.find(q => q.skillId === item.skillId)?.id;
    if (item.evidenceReferences.some(ref => ref.sourceId !== questionId)) throw new Error('初步诊断引用了其他题目的回答，未写入评价。原回答已保留，请重试。');
  }
  return review;
}
export function demoBaselineReview(answers: Record<string, string>): Review {
  const guide = buildBaselineGuide(answers);
  return {
    summary: `演示结果 · 原文规则检查，未调用真实 AI，不判断语义正确性、不形成能力等级。${guide.summary}`,
    items: guide.items.map(item => {
      const matched = item.checks.filter(c => c.evidence);
      const references = matched.map(c => ({ sourceId: item.questionId, quote: c.evidence!.quote }));
      if (item.uncertainty) references.unshift({ sourceId: item.questionId, quote: item.uncertainty.quote });
      if (!references.length && item.answer.trim()) references.push({ sourceId: item.questionId, quote: item.answer.slice(0, 200) });
      return {
        skillId: item.skillId, level: null,
        evidenceReferences: references.filter((r, i) => references.findIndex(v => v.quote === r.quote) === i),
        strengths: matched.length ? matched.map(c => `原文提及「${c.name}」相关措辞；仍需要结合理由验证其正确性。`) : ['这道题的原文已保存，暂不对表现作结论。'],
        gaps: [...(item.uncertainty ? [`你在本题明确表达了不确定：“${item.uncertainty.quote}”。可以从一个具体步骤补起。`] : []), ...item.checks.filter(c => !c.mentioned).map(c => `原文暂未检索到「${c.name}」的明确描述，不代表你没有这项能力。`)],
        nextActions: [item.nextAction, item.exercise],
      };
    }),
  };
}
export function baselineReason(resourceId: string, guide: BaselineGuide) {
  const direct = guide.items.find(i => i.lessonId === resourceId);
  const priority = guide.items.find(i => guide.priorities.includes(i.questionId) && i.taskId === resourceId);
  const item = priority ?? direct;
  if (!item) return '';
  const basis = item.uncertainty ? `你在第 ${item.number} 题写到“${item.uncertainty.quote}”` : item.checks.some(c => !c.mentioned) ? `第 ${item.number} 题的文字检查提示可补充「${item.checks.find(c => !c.mentioned)!.name}」` : `第 ${item.number} 题已经提及相关线索，接着通过实践验证`;
  return `${basis}；这一步用于：${item.nextAction}`;
}
