import type { DemoScenarioDefinition, DemoScenarioId } from "./scenarios";

export type Locale = "en" | "zh";

export type TranslationKey = keyof typeof messages.en;

type TranslationValues = Record<string, string | number>;

const messages = {
  en: {
    "language.label": "Language",
    "language.english": "EN",
    "language.chinese": "中文",
    "home.brand": "Chaos Swarm",
    "home.hero.title": "Synthetic users. Real friction. Faster product truth.",
    "home.hero.body":
      "Release a swarm of persona-shaped agents against public websites and inspect where confusion, delay, brittle forms, and misleading affordances turn into abandonment.",
    "home.launch": "Launch demo swarm",
    "home.repo": "View public repo",
    "home.capability": "Capability",
    "home.targets": "First-wave targets",
    "home.targetsTitle": "Launch with stable public demos",
    "home.configure": "Configure run",
    "home.stages": "{count} stages",
    "home.mvp": "MVP posture",
    "home.mvpTitle": "Cloud-first demo loop",
    "home.mvp.point1": "No login gate in v1. Every page is optimized for investor-visible speed.",
    "home.mvp.point2": "Local Playwright execution is live now; Browserbase and Trigger.dev are the next scale upgrades.",
    "home.mvp.point3": "Supabase schema is already checked in, so persistence can switch from memory to Postgres cleanly.",
    "feature.hybrid.title": "Hybrid browser reasoning",
    "feature.hybrid.body":
      "Visual understanding drives decisions while DOM-grade execution stays available for stable automation later.",
    "feature.persona.title": "Persona-driven stress",
    "feature.persona.body":
      "Speedrunners, novices, and chaos agents produce differentiated hesitation, retries, and rage-click behavior.",
    "feature.report.title": "Report-first output",
    "feature.report.body":
      "Each swarm ends in EFI, funnel loss, failure clusters, and a replay-ready timeline instead of raw machine logs.",
    "newRun.label": "Launch a swarm",
    "newRun.title": "Configure the first chaos run.",
    "newRun.body":
      "Pick one of the seeded public targets across commerce, auth, forms, and banking, then launch a live local Playwright swarm. This build streams progress in-memory now and can be promoted to Browserbase / Trigger.dev once cloud orchestration is wired in.",
    "composer.scenario": "Scenario",
    "composer.runControls": "Run controls",
    "composer.goalOverride": "Goal override",
    "composer.agentCount": "Agent count",
    "composer.stepBudget": "Step budget",
    "composer.recommendedSteps":
      "Recommended {recommended} steps. This scenario enforces a floor of {minimum} so the swarm can reach a meaningful end state.",
    "composer.executionMode": "Execution mode",
    "composer.executionTitle": "Live local execution, cloud-ready",
    "composer.executionBody":
      "This build executes flows with local Playwright contexts and streams timeline updates live. Browserbase and Trigger.dev remain the next scale layer for cloud fan-out.",
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
    "run.swarmBoardLive": "Live state, refreshed every 1.2s.",
    "run.swarmBoardCompleted": "Final state per agent.",
    "run.swarmBoardFailed": "Last known state before the run failed.",
    "run.noAgentState": "Agents have not emitted any state yet. The first browser contexts are still warming up.",
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
    "run.timelineTitle": "Synthetic event stream",
    "run.timelineFinished": "Run finished.",
    "run.timelineFailed": "Run failed.",
    "run.timelineLive": "Live polling every 1.2s.",
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
    "report.label": "Report",
    "report.pendingTitle": "Report is still rendering",
    "report.pendingBody":
      "The swarm has not reached a terminal state yet. Wait for the run to finish, then reopen this report.",
    "report.backToRun": "Back to live run",
    "report.downloadMarkdown": "Download full markdown",
    "report.downloadJson": "Download full JSON",
    "report.portablePack": "Portable analysis pack",
    "report.portablePackTitle": "Hand off the whole run, not just the dashboard",
    "report.portablePackBody":
      "The full markdown export contains runtime warnings, stage and persona summaries, the full event timeline, and each agent's step log. Paste that document back into Codex to continue diagnosis without losing execution context.",
    "report.failureClustersMetric": "Failure clusters",
    "report.highlights": "Highlights",
    "report.heatPoints": "Heat points",
    "report.efiBreakdown": "EFI breakdown",
    "report.efiTitle": "Experience friction index",
    "report.contribution": "{score} / contribution {contribution}",
    "report.funnel": "Funnel",
    "report.funnelTitle": "Synthetic drop-off",
    "report.funnelDropped": "{count} agents dropped at this boundary.",
    "report.failureClusters": "Failure clusters",
    "report.failureTitle": "What bent the swarm",
    "report.noFailureClusters": "No failure clusters were observed in this run.",
    "report.frictionHeat": "Friction heat",
    "report.frictionHeatTitle": "Telemetry intensity map",
    "report.heatNote":
      "The current heatmap uses frustration and step depth as a proxy surface until screenshot overlays are added.",
    "report.narrative": "Narrative",
    "report.narrativeTitle": "Analyst summary",
    "notFound.title": "This run drifted out of range.",
    "notFound.body":
      "The requested run or report is not in the active demo store. Start a new swarm to generate fresh telemetry.",
    "notFound.launch": "Launch a swarm",
    "notFound.back": "Back to overview",
  },
  zh: {
    "language.label": "语言",
    "language.english": "EN",
    "language.chinese": "中文",
    "home.brand": "Chaos Swarm",
    "home.hero.title": "合成用户，真实阻力，更快看清产品真相。",
    "home.hero.body":
      "向公开网站释放一群具备人格特征的智能体，观察困惑、延迟、脆弱表单和误导性界面如何一步步演变成流失。",
    "home.launch": "启动演示蜂群",
    "home.repo": "查看公开仓库",
    "home.capability": "能力",
    "home.targets": "首批目标场景",
    "home.targetsTitle": "用稳定的公开站点启动演示",
    "home.configure": "配置任务",
    "home.stages": "{count} 个阶段",
    "home.mvp": "MVP 姿态",
    "home.mvpTitle": "云优先的演示闭环",
    "home.mvp.point1": "V1 不设登录门槛，所有页面都为投资人演示速度优化。",
    "home.mvp.point2": "当前已支持本地 Playwright 真执行；Browserbase 和 Trigger.dev 是下一步扩展层。",
    "home.mvp.point3": "Supabase schema 已入库，后续可从内存持久化平滑切到 Postgres。",
    "feature.hybrid.title": "混合式浏览器推理",
    "feature.hybrid.body": "视觉理解负责判断，DOM 级执行负责稳定落地，后续可继续扩到更强自动化能力。",
    "feature.persona.title": "人格化压力测试",
    "feature.persona.body": "速通型、新手型和混沌型智能体会产生明显不同的犹豫、重试和狂点行为。",
    "feature.report.title": "报告优先输出",
    "feature.report.body": "每次蜂群运行都会产出 EFI、漏斗流失、失败簇和可回放时间线，而不是一堆机器日志。",
    "newRun.label": "启动蜂群",
    "newRun.title": "配置第一次 Chaos Run。",
    "newRun.body":
      "从电商、认证、表单和银行开户这几类公开站点里选一个场景，然后启动本地 Playwright 真执行。当前版本先用内存实时流式更新，后续再平滑升级到 Browserbase / Trigger.dev 云编排。",
    "composer.scenario": "场景",
    "composer.runControls": "运行控制",
    "composer.goalOverride": "目标覆盖",
    "composer.agentCount": "Agent 数量",
    "composer.stepBudget": "步数预算",
    "composer.recommendedSteps": "推荐 {recommended} 步。这个场景最低要求 {minimum} 步，才能到达有意义的结束状态。",
    "composer.executionMode": "执行模式",
    "composer.executionTitle": "本地真执行，随时可上云",
    "composer.executionBody": "当前版本会用本地 Playwright context 真跑流程，并实时推送时间线。Browserbase 和 Trigger.dev 是下一阶段的云端扇出层。",
    "composer.launching": "启动中...",
    "composer.launch": "启动 Chaos Swarm",
    "composer.runCreationFailed": "创建运行失败。",
    "run.details": "运行详情",
    "run.reportPending": "报告生成中",
    "run.openReport": "打开报告",
    "run.launchAnother": "再启动一个",
    "run.agents": "Agents",
    "run.completed": "已完成",
    "run.averageSteps": "平均步数",
    "run.peakFrustration": "最高挫败值",
    "run.stagePressure": "阶段压力",
    "run.stagePressureTitle": "蜂群在哪些地方慢了下来",
    "run.reached": "到达 {count}",
    "run.frictionHere": "有 {count} 个 agent 在这里遇到了明显阻力。",
    "run.warnings": "警告",
    "run.runtimePosture": "运行时姿态",
    "run.noWarnings": "这次运行没有产生运行时警告。",
    "run.storageExecution": "存储 / 执行",
    "run.storageExecutionBody": "当前使用 {storageMode} 持久化、{executionMode} 执行。当前 run ID 为 {runId}。",
    "run.swarmBoard": "蜂群看板",
    "run.swarmBoardTitle": "每个 persona 现在在做什么",
    "run.swarmBoardLive": "实时状态，每 1.2 秒刷新一次。",
    "run.swarmBoardCompleted": "每个 agent 的最终状态。",
    "run.swarmBoardFailed": "运行失败前的最后状态。",
    "run.noAgentState": "Agent 还没有发出状态，第一批浏览器上下文仍在预热。",
    "run.noLatestEvent": "这个 agent 已被分配，但还没有发出任何 step。",
    "run.why": "原因",
    "run.emotion": "情绪",
    "run.technicalState": "技术状态",
    "run.technicalDetail": "技术细节",
    "run.currentAgentState": "当前 agent 状态",
    "run.observedAt": "记录时间",
    "run.persona": "人格",
    "run.stage": "阶段",
    "run.outcome": "结果",
    "run.view": "视图",
    "run.latestPerAgent": "每个 agent 最新状态",
    "run.fullFeed": "完整事件流",
    "run.anyOutcome": "所有结果",
    "run.outcomeSucceeded": "成功",
    "run.outcomeFailed": "失败",
    "run.allPersonas": "所有人格",
    "run.allStages": "所有阶段",
    "run.timeline": "时间线",
    "run.timelineTitle": "合成事件流",
    "run.timelineFinished": "运行已结束。",
    "run.timelineFailed": "运行失败。",
    "run.timelineLive": "每 1.2 秒实时轮询。",
    "run.timelineShowing": "当前显示 {visible}/{total} 条{kind}",
    "run.timelineAgentStates": "agent 状态",
    "run.timelineRecentEvents": "最近事件",
    "run.timelineEmpty": "还没有捕获到事件，worker 正在预热第一个浏览器上下文。",
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
    "report.label": "报告",
    "report.pendingTitle": "报告仍在生成",
    "report.pendingBody": "蜂群还没有到达终态。等运行结束后，再重新打开这份报告。",
    "report.backToRun": "回到实时运行",
    "report.downloadMarkdown": "下载完整 Markdown",
    "report.downloadJson": "下载完整 JSON",
    "report.portablePack": "可移交分析包",
    "report.portablePackTitle": "交付整次运行，而不只是仪表盘",
    "report.portablePackBody":
      "完整 Markdown 导出包含运行时警告、阶段和人格汇总、完整事件时间线，以及每个 agent 的 step 日志。把这份文档直接贴回 Codex，就能在不丢上下文的前提下继续诊断。",
    "report.failureClustersMetric": "失败簇",
    "report.highlights": "高光片段",
    "report.heatPoints": "热区点位",
    "report.efiBreakdown": "EFI 拆解",
    "report.efiTitle": "体验阻力指数",
    "report.contribution": "{score} / 贡献 {contribution}",
    "report.funnel": "漏斗",
    "report.funnelTitle": "合成流失漏斗",
    "report.funnelDropped": "有 {count} 个 agent 在这个边界流失。",
    "report.failureClusters": "失败簇",
    "report.failureTitle": "蜂群是在哪里被掰弯的",
    "report.noFailureClusters": "这次运行没有观察到失败簇。",
    "report.frictionHeat": "阻力热度",
    "report.frictionHeatTitle": "遥测强度图",
    "report.heatNote": "在加入截图叠加前，当前热力图先用挫败值和步数深度作为代理坐标面。",
    "report.narrative": "叙事总结",
    "report.narrativeTitle": "分析员摘要",
    "notFound.title": "这次运行已经漂移出可视范围。",
    "notFound.body": "请求的运行或报告不在当前 demo store 里。重新启动一个新 swarm 才能生成新的遥测数据。",
    "notFound.launch": "启动蜂群",
    "notFound.back": "回到总览",
  },
} as const;

const scenarioTranslations: Record<DemoScenarioId, Omit<DemoScenarioDefinition, "recommendedMaxSteps" | "minimumMaxSteps" | "frames" | "id"> & { frames: Record<string, string> }> = {
  saucedemo: {
    name: "SauceDemo 结账探针",
    siteLabel: "SauceDemo",
    targetUrl: "https://www.saucedemo.com/",
    goal: "登录并把一个热门库存商品加入购物车。",
    description: "稳定的公开电商演示站，最适合作为登录理解与加购 CTA 清晰度的基线场景。",
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
    goal: "打开 Form Authentication 模块并登录 secure area。",
    description: "极简公开认证练习站，适合隔离信息气味、表单清晰度和 secure-area 确认问题。",
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
  const template = messages[locale][key] ?? messages.en[key];

  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token) => String(values[token] ?? `{${token}}`));
}

export function localizeScenario(locale: Locale, scenario: DemoScenarioDefinition): DemoScenarioDefinition {
  if (locale === "en") {
    return scenario;
  }

  const translated = scenarioTranslations[scenario.id];

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

export function localizeScenarioName(locale: Locale, scenario: DemoScenarioDefinition, currentName: string) {
  return currentName === scenario.name ? localizeScenario(locale, scenario).name : currentName;
}

export function localizeScenarioGoal(locale: Locale, scenario: DemoScenarioDefinition, currentGoal: string) {
  return currentGoal === scenario.goal ? localizeScenario(locale, scenario).goal : currentGoal;
}

export function localizeStageLabel(locale: Locale, scenario: DemoScenarioDefinition, label: string | null) {
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

  return scenarioTranslations[scenario.id].frames[matchedFrame.id] ?? label;
}
