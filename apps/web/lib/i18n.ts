import type { DemoScenarioDefinition, DemoScenarioId } from "./scenarios";

export type Locale = "en" | "zh";

const messages = {
  en: {
    "nav.home": "Home",
    "nav.launch": "Launch run",
    "language.label": "Language",
    "language.english": "EN",
    "language.chinese": "中文",

    "home.brand": "Chaos Swarm",
    "home.hero.title": "Synthetic users. Real friction. Faster product truth.",
    "home.hero.body":
      "Release a swarm of AI personas against a live website and inspect where hesitation, confusion, delay, and brittle UX turn into abandonment.",
    "home.launch": "Launch demo swarm",
    "home.repo": "View public repo",
    "home.capability": "Capability",
    "home.targets": "Demo targets",
    "home.targetsTitle": "Start with stable public scenarios",
    "home.configure": "Configure run",
    "home.stages": "{count} stages",
    "home.mvp": "Runtime posture",
    "home.mvpTitle": "What is real in this build",
    "home.mvp.point1": "Agents are running on real public websites, not mock pages or recorded replays.",
    "home.mvp.point2": "Decisions are model-driven. Playwright executes the action and records what happened next.",
    "home.mvp.point3":
      "Strict visual mode is available, so you can measure how often the system stayed screen-first versus using DOM recovery.",
    "home.howItWorks": "How it works",
    "home.howItWorksTitle": "From goal to swarm report",
    "home.how.step1.title": "1. Give the swarm a mission",
    "home.how.step1.body":
      "Each run starts from a site, a goal, a step budget, and a persona mix. The agents do not replay a hand-written happy path.",
    "home.how.step2.title": "2. Let agents read and act",
    "home.how.step2.body":
      "Every agent observes the current page, reasons about the next move, then clicks, types, scrolls, or waits. The run records what the agent saw, why it acted, and whether the page cooperated.",
    "home.how.step3.title": "3. Read the result as evidence",
    "home.how.step3.body":
      "The dashboard turns raw telemetry into an explanation: what succeeded, where the swarm slowed down, whether the result is valid UX signal, and how much DOM recovery was needed.",
    "home.reading": "How to read the output",
    "home.readingTitle": "What the main signals actually mean",
    "home.reading.point1":
      "Completion tells you whether agents reached the goal. A high completion rate does not mean zero friction if agents hesitated or needed many steps.",
    "home.reading.point2":
      "EFI is the experience friction index. Higher means the run felt harder or more fragile to the swarm.",
    "home.reading.point3":
      "Visual purity shows how often the run stayed screen-first. DOM assist rate shows how often the runtime had to recover with structure-aware help.",

    "feature.hybrid.title": "AI-native browser reasoning",
    "feature.hybrid.body":
      "The model decides what to do next from the page state and recent history, while the runtime records whether execution stayed visual or needed recovery.",
    "feature.persona.title": "Persona-driven pressure",
    "feature.persona.body":
      "Speedrunners, novices, and chaos agents do not behave the same way. They create different hesitation, retry, and abandonment patterns.",
    "feature.report.title": "Readable report output",
    "feature.report.body":
      "Every run should answer plain-language questions: what happened, where it bent, why it failed or succeeded, and whether the signal came from UX or runtime limits.",

    "newRun.label": "Launch a swarm",
    "newRun.title": "Configure the next chaos run.",
    "newRun.body":
      "Choose a public scenario, adjust the goal and swarm size, then launch a live multi-agent run. This screen controls how many agents explore, how long they are allowed to reason, and whether DOM fallback is forbidden.",

    "composer.scenario": "Scenario",
    "composer.runControls": "Run controls",
    "composer.customMode": "Custom website",
    "composer.customModeBody":
      "Use any public URL and let the model compile a temporary scenario profile from the URL and mission before the swarm starts.",
    "composer.customUrl": "Custom URL",
    "composer.customGoal": "Custom goal",
    "composer.customHint":
      "When custom mode is enabled, the swarm ignores the preset demo card and generates a fresh AI scenario profile from your URL and goal.",
    "composer.customDataLabel": "Optional test data",
    "composer.customDataBody":
      "Keys become allowed values for the AI agent. If this field is empty, the model should avoid inventing credentials or protected inputs.",
    "composer.customGoalPlaceholder": "Find the pricing page and open a plan comparison.",
    "composer.customStepsHint":
      "Recommended 6 steps. AI-compiled scenarios keep a minimum of 4 steps so the swarm can establish and verify a goal path.",
    "composer.goalOverride": "Goal override",
    "composer.agentCount": "Agent count",
    "composer.stepBudget": "Step budget",
    "composer.recommendedSteps":
      "Recommended {recommended} steps. This scenario enforces a minimum of {minimum} so the swarm can reach a meaningful state.",
    "composer.executionMode": "Execution mode",
    "composer.executionTitle": "Local now, cloud next",
    "composer.executionBody":
      "This build currently runs a live swarm from the runtime and streams progress to the dashboard. Browserbase and Trigger.dev are the next scaling layer for public cloud fan-out.",
    "composer.strictVisualMode": "Execution mode",
    "composer.strictVisualOn": "Strict visual mode",
    "composer.strictVisualOff": "Hybrid visual mode",
    "composer.strictVisualBody":
      "Strict visual mode forbids DOM locator recovery after a visual action fails. Hybrid mode still tries screen-first execution, but it can recover with DOM assistance when the page is brittle.",
    "composer.launching": "Launching...",
    "composer.launch": "Launch chaos swarm",
    "composer.runCreationFailed": "Run creation failed.",

    "run.details": "Run details",
    "run.reportPending": "Report pending",
    "run.openReport": "Open report",
    "run.launchAnother": "Launch another",
    "run.agents": "Agents",
    "run.completed": "Completed",
    "run.averageSteps": "Average steps",
    "run.peakFrustration": "Peak frustration",
    "run.stagePressure": "Stage pressure",
    "run.stagePressureTitle": "Where the swarm slowed down",
    "run.reached": "{count} reached",
    "run.frictionHere": "{count} agents encountered visible friction here.",
    "run.warnings": "Warnings",
    "run.runtimePosture": "Runtime posture",
    "run.noWarnings": "No runtime warnings were generated for this run.",
    "run.storageExecution": "Storage / execution",
    "run.storageExecutionBody":
      "{storageMode} persistence, {executionMode} execution. The current run ID is {runId}.",
    "run.swarmBoard": "Swarm board",
    "run.swarmBoardTitle": "What each persona is doing right now",
    "run.swarmBoardLive": "Live state, refreshed every 1.2 seconds.",
    "run.swarmBoardCompleted": "Final state per agent.",
    "run.swarmBoardFailed": "Last known state before the run failed.",
    "run.noAgentState": "Agents have not emitted state yet. The first browser contexts are still warming up.",
    "run.noLatestEvent": "This agent has been allocated but has not emitted a step yet.",
    "run.why": "Why",
    "run.emotion": "Emotion",
    "run.technicalState": "Technical state",
    "run.technicalDetail": "Technical detail",
    "run.currentAgentState": "Current agent state",
    "run.observedAt": "Observed at",
    "run.persona": "Persona",
    "run.stage": "Stage",
    "run.outcome": "Outcome",
    "run.view": "View",
    "run.latestPerAgent": "Latest per agent",
    "run.fullFeed": "Full feed",
    "run.anyOutcome": "Any outcome",
    "run.outcomeSucceeded": "Succeeded",
    "run.outcomeFailed": "Failed",
    "run.allPersonas": "All personas",
    "run.allStages": "All stages",
    "run.timeline": "Timeline",
    "run.timelineTitle": "Detailed step log",
    "run.timelineFinished": "Run finished.",
    "run.timelineFailed": "Run failed.",
    "run.timelineLive": "Live polling every 1.2 seconds.",
    "run.timelineShowing": "Showing {visible} of {total} {kind}",
    "run.timelineAgentStates": "agent states",
    "run.timelineRecentEvents": "recent events",
    "run.timelineEmpty":
      "No events have been captured yet. The worker is still warming up the first browser context.",
    "run.timelineNoMatch": "No timeline entries match the current filters.",
    "run.personaSummaryCompleted": "Completed",
    "run.personaSummaryFailed": "Failed",
    "run.personaSummaryTag": "persona",
    "run.status.completed": "completed",
    "run.status.failed": "failed",
    "run.status.running": "running",
    "run.status.queued": "queued",
    "run.agentStatus.completed": "completed",
    "run.agentStatus.failed": "failed",
    "run.agentStatus.running": "running",
    "run.stepSucceeded": "Succeeded",
    "run.stepFailed": "Failed",
    "run.readerGuide": "Reader guide",
    "run.readerGuideTitle": "How to understand this run",
    "run.metricGuide": "Metric guide",
    "run.metricGuideTitle": "What to look at first",

    "report.label": "Report",
    "report.pendingTitle": "Report is still rendering",
    "report.pendingBody":
      "The swarm has not reached a terminal state yet. Wait for the run to finish, then reopen this report.",
    "report.backToRun": "Back to live run",
    "report.downloadMarkdown": "Download full markdown",
    "report.downloadJson": "Download full JSON",
    "report.portablePack": "Export full run data",
    "report.portablePackTitle": "Export everything needed for follow-up analysis",
    "report.portablePackBody":
      "The markdown export includes runtime warnings, stage and persona summaries, the full event timeline, and each agent's step log. Use it for internal sharing or for a deeper follow-up analysis.",
    "report.failureClustersMetric": "Failure clusters",
    "report.highlights": "Highlights",
    "report.heatPoints": "Heat points",
    "report.visualPurity": "Visual purity",
    "report.domAssistRate": "DOM assist rate",
    "report.efiBreakdown": "EFI breakdown",
    "report.efiTitle": "Overall friction",
    "report.contribution": "{score} / contribution {contribution}",
    "report.executionPurity": "Execution trust",
    "report.executionPurityTitle": "How much the run behaved like a real user",
    "report.strictVisualMode": "Strict visual mode",
    "report.totalInteractionActions": "Interactive actions",
    "report.visualOnlyActions": "Visual-only actions",
    "report.domAssistedActions": "DOM-assisted actions",
    "report.domOnlyActions": "DOM-only actions",
    "report.funnel": "Funnel",
    "report.funnelTitle": "Where agents dropped off",
    "report.funnelDropped": "{count} agents dropped at this boundary.",
    "report.failureClusters": "Failure patterns",
    "report.failureTitle": "Main failure patterns",
    "report.noFailureClusters": "No clear failure pattern surfaced in this run.",
    "report.frictionHeat": "Friction heat",
    "report.frictionHeatTitle": "Where frustration spiked",
    "report.heatNote":
      "The current heat view uses frustration and step depth as a proxy surface until screenshot overlays are added.",
    "report.narrative": "Run narrative",
    "report.narrativeTitle": "What happened during the run",
    "report.readerSummary": "Reader summary",
    "report.readerSummaryTitle": "Start here",
    "report.readerMetrics": "Metric explanations",
    "report.readerMetricsTitle": "What the numbers mean",
    "report.readerFindings": "Key findings",
    "report.readerFindingsTitle": "Where the run bent or held",
    "report.agentStories": "Representative agents",
    "report.agentStoriesTitle": "Who succeeded, who got stuck",

    "notFound.title": "This run drifted out of range.",
    "notFound.body":
      "The requested run or report is not in the active demo store. Start a new swarm to generate fresh telemetry.",
    "notFound.launch": "Launch a swarm",
    "notFound.back": "Back to overview",
  },
  zh: {
    "nav.home": "首页",
    "nav.launch": "启动运行",
    "language.label": "语言",
    "language.english": "EN",
    "language.chinese": "中文",

    "home.brand": "Chaos Swarm",
    "home.hero.title": "合成用户，真实阻力，更快看清产品真相。",
    "home.hero.body":
      "把一群 AI 人格释放到真实网站上，直接观察犹豫、困惑、延迟和脆弱交互如何一步步演变成流失。",
    "home.launch": "启动演示蜂群",
    "home.repo": "查看公开仓库",
    "home.capability": "能力",
    "home.targets": "演示场景",
    "home.targetsTitle": "先从稳定的公开场景开始",
    "home.configure": "配置运行",
    "home.stages": "{count} 个阶段",
    "home.mvp": "当前形态",
    "home.mvpTitle": "这一版里哪些能力已经是真的",
    "home.mvp.point1": "Agent 正在真实公开网站上运行，不是静态假页面，也不是录屏回放。",
    "home.mvp.point2": "下一步动作由模型决策，Playwright 负责执行并记录页面后续反馈。",
    "home.mvp.point3":
      "现在已经支持严格视觉模式，可以直接看见系统到底有多依赖屏幕操作，又有多少动作需要 DOM 兜底。",
    "home.howItWorks": "工作方式",
    "home.howItWorksTitle": "从任务目标到蜂群报告",
    "home.how.step1.title": "1. 给蜂群一个任务",
    "home.how.step1.body": "每次运行都从站点、目标、步数预算和人格配比开始，而不是回放一条手写 happy path。",
    "home.how.step2.title": "2. 让 Agent 观察并行动",
    "home.how.step2.body":
      "每个 Agent 都会先观察当前页面，再推理下一步，然后点击、输入、滚动或等待。系统会记录它看见了什么、为什么这么做，以及页面是否配合。",
    "home.how.step3.title": "3. 把结果读成证据",
    "home.how.step3.body":
      "仪表盘会把原始遥测翻译成结论：哪里成功、哪里变慢、结果是不是有效 UX 信号，以及运行时到底用了多少 DOM 恢复。",
    "home.reading": "如何阅读结果",
    "home.readingTitle": "这些核心信号分别说明什么",
    "home.reading.point1":
      "完成率表示有多少 Agent 走到了目标，但高完成率不等于零阻力，因为过程中仍然可能出现犹豫、绕路和大量步骤。",
    "home.reading.point2": "EFI 是体验阻力指数。数值越高，说明这条路径对蜂群来说越困难、越脆弱。",
    "home.reading.point3":
      "视觉纯度表示运行有多像真人用户；DOM 兜底率表示系统有多少次不得不用结构化恢复来补救。",

    "feature.hybrid.title": "AI Native 浏览器推理",
    "feature.hybrid.body":
      "模型根据页面状态和最近历史决定下一步，运行时再把执行是否保持视觉优先、是否需要 DOM 恢复记录下来。",
    "feature.persona.title": "人格化压力测试",
    "feature.persona.body":
      "速度型、新手型和混乱型不会产生同样的行为，它们会暴露出不同的犹豫、重试和放弃模式。",
    "feature.report.title": "可读的报告输出",
    "feature.report.body":
      "每次运行都应该回答人话问题：发生了什么、哪里弯了、为什么成功或失败、这些信号来自 UX 还是运行时限制。",

    "newRun.label": "启动蜂群",
    "newRun.title": "配置下一次 Chaos Run。",
    "newRun.body":
      "选择一个公开场景，调整目标和蜂群规模，然后启动一次真实多智能体运行。这个页面控制 Agent 数量、可推理步数，以及是否禁止 DOM 兜底。",

    "composer.scenario": "场景",
    "composer.runControls": "运行控制",
    "composer.customMode": "自定义网站",
    "composer.customModeBody":
      "输入任意公开 URL，让模型在蜂群启动前根据 URL 和任务自动编译一个临时场景配置。",
    "composer.customUrl": "自定义 URL",
    "composer.customGoal": "自定义目标",
    "composer.customHint":
      "启用后，系统会忽略预设演示卡片，直接根据你的 URL 和目标生成新的 AI 场景配置。",
    "composer.customDataLabel": "可选测试数据",
    "composer.customDataBody":
      "这些键值会变成 AI Agent 可以安全使用的测试输入。如果留空，模型应避免臆造凭证或受保护字段。",
    "composer.customGoalPlaceholder": "例如：找到 pricing 页面并打开套餐对比。",
    "composer.customStepsHint": "建议 6 步。AI 编译场景会至少保留 4 步，让蜂群先建立再验证目标路径。",
    "composer.goalOverride": "目标覆盖",
    "composer.agentCount": "Agent 数量",
    "composer.stepBudget": "步数预算",
    "composer.recommendedSteps": "建议 {recommended} 步。该场景至少要求 {minimum} 步，才能进入有意义的状态。",
    "composer.executionMode": "执行模式",
    "composer.executionTitle": "先本地，后云端",
    "composer.executionBody":
      "当前版本会直接运行真实蜂群，并把进度流式推送到仪表盘。Browserbase 和 Trigger.dev 是下一层公网上线能力。",
    "composer.strictVisualMode": "执行方式",
    "composer.strictVisualOn": "严格视觉模式",
    "composer.strictVisualOff": "混合视觉模式",
    "composer.strictVisualBody":
      "严格视觉模式会在视觉动作失败后禁止 DOM 恢复。混合模式仍然以屏幕操作为主，但当页面太脆时允许 DOM 辅助恢复。",
    "composer.launching": "启动中...",
    "composer.launch": "启动 Chaos Swarm",
    "composer.runCreationFailed": "创建运行失败。",

    "run.details": "运行详情",
    "run.reportPending": "报告生成中",
    "run.openReport": "打开报告",
    "run.launchAnother": "再启动一个",
    "run.agents": "Agent 数",
    "run.completed": "已完成",
    "run.averageSteps": "平均步数",
    "run.peakFrustration": "最高挫败值",
    "run.stagePressure": "阶段压力",
    "run.stagePressureTitle": "蜂群主要在哪些地方慢了下来",
    "run.reached": "到达 {count}",
    "run.frictionHere": "有 {count} 个 Agent 在这里出现明显阻力。",
    "run.warnings": "警告",
    "run.runtimePosture": "运行状态",
    "run.noWarnings": "这次运行没有产生运行时警告。",
    "run.storageExecution": "存储 / 执行",
    "run.storageExecutionBody": "当前使用 {storageMode} 持久化，{executionMode} 执行。本次 run ID 是 {runId}。",
    "run.swarmBoard": "蜂群看板",
    "run.swarmBoardTitle": "每个 Persona 现在在做什么",
    "run.swarmBoardLive": "实时状态，每 1.2 秒刷新一次。",
    "run.swarmBoardCompleted": "每个 Agent 的最终状态。",
    "run.swarmBoardFailed": "运行失败前的最后状态。",
    "run.noAgentState": "Agent 还没有发出状态，第一批浏览器上下文仍在预热。",
    "run.noLatestEvent": "这个 Agent 已被分配，但还没有产生 step。",
    "run.why": "原因",
    "run.emotion": "情绪",
    "run.technicalState": "技术状态",
    "run.technicalDetail": "技术细节",
    "run.currentAgentState": "当前 Agent 状态",
    "run.observedAt": "记录时间",
    "run.persona": "人格",
    "run.stage": "阶段",
    "run.outcome": "结果",
    "run.view": "视图",
    "run.latestPerAgent": "每个 Agent 最新状态",
    "run.fullFeed": "完整事件流",
    "run.anyOutcome": "所有结果",
    "run.outcomeSucceeded": "成功",
    "run.outcomeFailed": "失败",
    "run.allPersonas": "所有人格",
    "run.allStages": "所有阶段",
    "run.timeline": "时间线",
    "run.timelineTitle": "详细步骤日志",
    "run.timelineFinished": "运行已结束。",
    "run.timelineFailed": "运行失败。",
    "run.timelineLive": "每 1.2 秒实时轮询。",
    "run.timelineShowing": "当前显示 {visible}/{total} 条 {kind}",
    "run.timelineAgentStates": "Agent 状态",
    "run.timelineRecentEvents": "最近事件",
    "run.timelineEmpty": "还没有捕获到事件，Worker 正在预热第一个浏览器上下文。",
    "run.timelineNoMatch": "当前筛选条件下没有匹配的时间线条目。",
    "run.personaSummaryCompleted": "完成",
    "run.personaSummaryFailed": "失败",
    "run.personaSummaryTag": "人格",
    "run.status.completed": "已完成",
    "run.status.failed": "失败",
    "run.status.running": "运行中",
    "run.status.queued": "排队中",
    "run.agentStatus.completed": "已完成",
    "run.agentStatus.failed": "失败",
    "run.agentStatus.running": "运行中",
    "run.stepSucceeded": "成功",
    "run.stepFailed": "失败",
    "run.readerGuide": "阅读指引",
    "run.readerGuideTitle": "这次运行该怎么看",
    "run.metricGuide": "指标说明",
    "run.metricGuideTitle": "先看哪几个数字",

    "report.label": "报告",
    "report.pendingTitle": "报告仍在生成",
    "report.pendingBody": "蜂群尚未到达终态。等运行结束后，再重新打开这份报告。",
    "report.backToRun": "回到实时运行",
    "report.downloadMarkdown": "下载完整 Markdown",
    "report.downloadJson": "下载完整 JSON",
    "report.portablePack": "导出完整运行数据",
    "report.portablePackTitle": "导出后续分析所需的全部信息",
    "report.portablePackBody":
      "Markdown 导出会包含运行时警告、阶段和人格摘要、完整事件时间线，以及每个 Agent 的步骤日志。它既适合内部分享，也适合后续做更深入的分析。",
    "report.failureClustersMetric": "失败簇",
    "report.highlights": "高光片段",
    "report.heatPoints": "热区点位",
    "report.visualPurity": "视觉纯度",
    "report.domAssistRate": "DOM 兜底率",
    "report.efiBreakdown": "EFI 拆解",
    "report.efiTitle": "整体阻力",
    "report.contribution": "{score} / 贡献 {contribution}",
    "report.executionPurity": "执行可信度",
    "report.executionPurityTitle": "这次运行有多像真实用户",
    "report.strictVisualMode": "严格视觉模式",
    "report.totalInteractionActions": "交互动作数",
    "report.visualOnlyActions": "纯视觉动作",
    "report.domAssistedActions": "DOM 辅助动作",
    "report.domOnlyActions": "纯 DOM 动作",
    "report.funnel": "漏斗",
    "report.funnelTitle": "Agent 主要在哪些边界流失",
    "report.funnelDropped": "有 {count} 个 Agent 在这个边界流失。",
    "report.failureClusters": "失败模式",
    "report.failureTitle": "主要失败模式",
    "report.noFailureClusters": "这次运行没有出现清晰的失败模式。",
    "report.frictionHeat": "阻力热度",
    "report.frictionHeatTitle": "挫败值主要在哪些位置升高",
    "report.heatNote": "在截图叠加热图上线前，当前热视图先用挫败值和步骤深度作为代理。",
    "report.narrative": "运行叙事",
    "report.narrativeTitle": "这次运行发生了什么",
    "report.readerSummary": "读者摘要",
    "report.readerSummaryTitle": "先看这里",
    "report.readerMetrics": "指标解释",
    "report.readerMetricsTitle": "这些数字分别代表什么",
    "report.readerFindings": "关键发现",
    "report.readerFindingsTitle": "哪里顺、哪里弯、哪里卡住",
    "report.agentStories": "代表性 Agent",
    "report.agentStoriesTitle": "谁顺利，谁卡住",

    "notFound.title": "这次运行已经漂移出可见范围。",
    "notFound.body": "请求的运行或报告不在当前 demo store 中。重新启动一个新的 swarm，才能生成新的遥测数据。",
    "notFound.launch": "启动蜂群",
    "notFound.back": "回到总览",
  },
} as const;

export type TranslationKey = keyof typeof messages.en | keyof typeof messages.zh;

type TranslationValues = Record<string, string | number>;

const scenarioTranslations: Record<
  DemoScenarioId,
  Omit<
    DemoScenarioDefinition,
    | "recommendedMaxSteps"
    | "minimumMaxSteps"
    | "frames"
    | "id"
    | "inputSeeds"
    | "domainAllowlist"
    | "successDefinition"
    | "aiHints"
  > & {
    frames: Record<string, string>;
  }
> = {
  saucedemo: {
    name: "SauceDemo 结账探针",
    siteLabel: "SauceDemo",
    targetUrl: "https://www.saucedemo.com/",
    goal: "登录并把一个热门库存商品加入购物车。",
    description: "稳定的公开电商演示站点，适合作为登录理解与加购 CTA 清晰度的基线场景。",
    frames: {
      login: "凭证关口",
      inventory: "商品浏览",
      cart: "购物车复核",
    },
  },
  automationexercise: {
    name: "Automation Exercise 搜索到加购探针",
    siteLabel: "Automation Exercise",
    targetUrl: "https://automationexercise.com/products",
    goal: "搜索 Blue Top，查看商品详情，并加入购物车。",
    description: "面向自动化练习的公开商店，具备真实搜索、详情页和购物车，但几乎没有激进反机器人策略。",
    frames: {
      catalog: "商品目录",
      "search-results": "搜索结果",
      "product-detail": "商品详情",
      "cart-review": "购物车复核",
    },
  },
  theinternet: {
    name: "The Internet 安全登录探针",
    siteLabel: "The Internet",
    targetUrl: "https://the-internet.herokuapp.com/",
    goal: "打开 Form Authentication 模块并进入 secure area。",
    description: "极简公开认证练习站，适合隔离信息气味、表单清晰度和 secure area 确认问题。",
    frames: {
      directory: "模块目录",
      "auth-form": "认证表单",
      "secure-area": "安全区域",
    },
  },
  expandtesting: {
    name: "Expand Testing 表单校验探针",
    siteLabel: "Expand Testing",
    targetUrl: "https://practice.expandtesting.com/form-validation",
    goal: "用合法输入完成校验表单并到达确认页。",
    description: "通用公开表单场景，覆盖文本、电话、日期和下拉控件，能体现非电商网站的交互覆盖能力。",
    frames: {
      "validation-form": "校验表单",
      confirmation: "确认页面",
    },
  },
  parabank: {
    name: "ParaBank 注册探针",
    siteLabel: "ParaBank",
    targetUrl: "https://parabank.parasoft.com/parabank/register.htm",
    goal: "创建一个新的演示银行账户并到达已登录仪表盘。",
    description: "金融开户风格场景，注册表单更密集，提交后会进入账户服务页面。",
    frames: {
      "registration-form": "注册表单",
      "account-services": "账户服务",
    },
  },
};

export function formatMessage(locale: Locale, key: TranslationKey, values?: TranslationValues) {
  const template =
    (messages[locale] as Partial<Record<TranslationKey, string>>)[key] ??
    (messages.en as Partial<Record<TranslationKey, string>>)[key] ??
    String(key);

  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match: string, token: string) =>
    String(values[token] ?? `{${token}}`),
  );
}

export function localizeScenario(locale: Locale, scenario: DemoScenarioDefinition): DemoScenarioDefinition {
  if (locale === "en") {
    return scenario;
  }

  const translated = scenarioTranslations[scenario.id];

  if (!translated) {
    return scenario;
  }

  return {
    ...scenario,
    name: translated.name,
    siteLabel: translated.siteLabel,
    goal: translated.goal,
    description: translated.description,
    frames: scenario.frames.map((frame) => ({
      ...frame,
      label: translated.frames[frame.id] ?? frame.label,
    })),
  };
}

export function localizeScenarioName(
  locale: Locale,
  scenario: DemoScenarioDefinition,
  currentName: string,
) {
  return currentName === scenario.name ? localizeScenario(locale, scenario).name : currentName;
}

export function localizeScenarioGoal(
  locale: Locale,
  scenario: DemoScenarioDefinition,
  currentGoal: string,
) {
  return currentGoal === scenario.goal ? localizeScenario(locale, scenario).goal : currentGoal;
}

export function localizeStageLabel(
  locale: Locale,
  scenario: DemoScenarioDefinition,
  label: string | null,
) {
  if (!label) {
    return null;
  }

  if (locale === "en") {
    return label;
  }

  const matchedFrame = scenario.frames.find((frame) => frame.label === label);

  if (!matchedFrame) {
    return label;
  }

  return scenarioTranslations[scenario.id]?.frames[matchedFrame.id] ?? label;
}
