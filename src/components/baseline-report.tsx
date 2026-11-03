'use client';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, ClipboardCheck, FolderOpen, MessageSquareText } from 'lucide-react';
import { useApp, unpack, stamp, PageHeading, Empty } from './application';
import { Button } from './ui/button';
import { EvaluationView, Rubric } from './feedback';
import type { Review } from '@/lib/core';

export function BaselineReport() {
  const { state, act, busy, go } = useApp();
  const guide = state.baselineGuide;
  const evaluation = state.evaluations.find(e => e.sourceType === 'baseline');
  if (!state.assessment?.completedAt || !guide) {
    return <Empty title="先留下六份真实想法" text="完成情境题后，这里会逐题展示回答依据、可以补充的地方与下一步练习。草稿可以随时继续。" href="/onboarding" label="继续初步诊断" />;
  }

  const isReal = Boolean(evaluation && !evaluation.demo);
  const review = unpack<Review>(evaluation?.result, { summary: '', items: [] });
  const realPriorities = isReal
    ? [...review.items].filter(i => i.level !== null).sort((a, b) => a.level! - b.level!).slice(0, 2)
    : [];
  const priorities = realPriorities.length
    ? realPriorities.map(item => guide.items.find(i => i.skillId === item.skillId)!).filter(Boolean)
    : guide.priorities.map(id => guide.items.find(i => i.questionId === id)!);
  const existingPlan = Boolean(state.plans.length);
  const visibleClues = guide.items.filter(i => i.checks.some(c => c.mentioned)).slice(0, 2);

  async function continueToPlan() {
    // The server acknowledges this step and reuses an existing plan unchanged.
    await act('buildPlan');
    go('/roadmap');
  }

  return <div className="baseline-report">
    <Link href="/onboarding" className="back-link"><ArrowLeft size={15} />查看我的六道题</Link>
    <PageHeading eyebrow="初步反馈 · 先理解起点，再安排路线" title="先看看，你的回答带来了什么。">
      {state.user.targetRole} · 六道情境题 · {stamp(state.assessment.completedAt)}
    </PageHeading>

    <section className="card baseline-summary" aria-labelledby="baseline-summary-title">
      <div className="section-title">
        <h2 id="baseline-summary-title"><ClipboardCheck size={19} />这一次的起点</h2>
        <span className={'pill ' + (isReal ? 'green' : 'peach')}>{isReal ? '真实 AI · 本次回答范围' : '原文规则检查 · 演示模式'}</span>
      </div>
      <p className="baseline-summary-text">{isReal ? review.summary : guide.summary}</p>
      {!isReal && <p className="baseline-disclosure">本页采用原文规则检查，未调用真实 AI。以下按你逐题的原文，识别明确措辞与主动表达的困惑，并提供对应练习。文字提及不代表理解正确，未检索到也不代表你不会；所有能力仍为“待评估”。</p>}
      <div className="baseline-boundary"><span>每个维度仅一道题</span><span>原文已保存，可展开核对</span><span>建议用于安排练习，不作全面能力判断</span></div>
    </section>

    {!isReal && visibleClues.length > 0 && <section className="baseline-clues" aria-labelledby="baseline-clues-title">
      <div className="section-title"><h2 id="baseline-clues-title">你的原文里，已经出现了一些思路</h2><span className="tiny">先把它们接着展开</span></div>
      <div className="two-columns">{visibleClues.map(item => {
        const clue = item.checks.find(c => c.evidence)!;
        return <article className="card" key={item.questionId}>
          <span className="eyebrow">第 {item.number} 题 · {item.skillName}</span>
          <h3>{clue.name}</h3>
          <blockquote>{clue.evidence!.quote}</blockquote>
          <p className="tiny">这是可追溯的文字线索。接下来的实践会检查理由、适用条件与失败情况。</p>
        </article>;
      })}</div>
    </section>}

    <section className="baseline-priorities" aria-labelledby="baseline-priorities-title">
      <div className="section-title"><h2 id="baseline-priorities-title">先补这{priorities.length === 1 ? '一' : '两'}小步，别急着学完所有内容</h2><span className="tiny">每天 {state.user.dailyMinutes} 分钟 · 一次选一个点</span></div>
      <div className="two-columns">{priorities.map((item, index) => {
        const feedback = realPriorities.find(i => i.skillId === item.skillId);
        return <article className="card baseline-priority" key={item.questionId}>
          <div className="section-title"><span className="priority-number">0{index + 1}</span><span className="pill">第 {item.number} 题 · {item.skillName}</span></div>
          <h3>{item.uncertainty && !isReal ? '从你主动标记的困惑开始' : '把一个判断写成可执行的步骤'}</h3>
          {isReal && feedback ? <p className="muted">{feedback.gaps[0] ?? '根据本次实际回答，继续补充可验证的依据。'}</p> : <p className="muted">{item.uncertainty ? '你在这道题中主动标记了困惑：' : '这份原文可以先补充：'}</p>}
          {!isReal && item.uncertainty && <blockquote>{item.uncertainty.quote}</blockquote>}
          <p className="baseline-exercise">{feedback?.nextActions[0] ?? item.exercise}</p>
          <div className="baseline-resource-links">
            <Link className="text-link" href={'/learn/' + item.lessonId}><BookOpen size={15} />相关短课：{item.lessonTitle}</Link>
            <Link className="text-link" href={'/projects/knowledge-assistant?stage=' + item.taskId}><FolderOpen size={15} />把它用在{item.taskTitle.slice(0, 1)} 阶段</Link>
          </div>
        </article>;
      })}</div>
    </section>

    {isReal && evaluation ? <section className="card report-card"><EvaluationView evaluation={evaluation} /></section> : <section className="baseline-detail" aria-labelledby="baseline-detail-title">
      <div className="section-title"><h2 id="baseline-detail-title">逐题看依据，再决定怎么改</h2><span className="tiny">规则版本 {guide.version}</span></div>
      <p className="muted">下列“原文提及 / 可进一步说明”只描述文字检查结果，既不打分，也不判断方案是否正确。</p>
      {guide.items.map(item => <details key={item.questionId} className="card baseline-answer" id={'question-' + item.questionId}>
        <summary className="baseline-answer-summary"><span><span className="eyebrow">第 {item.number} 题</span><strong>{item.skillName}</strong></span><span className="baseline-answer-status"><span className="level">待评估</span><span className="tiny">展开原文与建议</span></span></summary>
        <details className="baseline-original"><summary>原题和我的完整回答</summary><p>{item.question}</p><blockquote>{item.answer}</blockquote><small>原文定位：{item.questionId} · {item.answer.length} 字符 · 已完成回答不可覆盖</small></details>
        <div className="baseline-checks">{item.checks.map(check => <div key={check.name} className="baseline-check">
          <div className="baseline-check-heading"><strong>{check.name}</strong><span className={'pill ' + (check.mentioned ? 'green' : '')}>{check.mentioned ? '原文提及' : '可进一步说明'}</span></div>
          {check.evidence ? <details><summary>查看对应原句</summary><blockquote>{check.evidence.quote}</blockquote><small>{item.questionId} · 字符 {check.evidence.startOffset}–{check.evidence.endOffset}</small></details> : <p>{check.action}</p>}
        </div>)}</div>
        <div className="baseline-small-step"><h4><MessageSquareText size={16} />可以先补的一小步</h4><p>{item.nextAction}</p></div>
      </details>)}
    </section>}

    <section className="card baseline-next">
      <div><span className="eyebrow">把反馈带进下一次练习</span><h2>{existingPlan ? '已有路线保留，带着这次反馈继续。' : '现在，按这个起点安排成长路线。'}</h2><p className="muted">{existingPlan ? '不会重排你已经安排的日期，也不会清除课程和项目进度。上面的练习建议可以按需提前开始。' : '安排原因会说明与哪道回答、哪个待补充点有关；课程的基础前置关系仍会保留。'}</p></div>
      <Button disabled={busy} onClick={() => void continueToPlan().catch(() => {})}>{busy ? '正在保存并安排…' : existingPlan ? '带着反馈，查看已有路线' : '根据反馈，生成成长路线'}<ArrowRight size={17} /></Button>
    </section>
    <Rubric />
  </div>;
}
