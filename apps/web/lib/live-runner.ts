import { chromium, type Browser, type Locator, type Page } from "playwright";
import type {
  ActionResult,
  AgentPersona,
  AgentRunInput,
  AgentRunResult,
  AgentStepRecord,
  Decision,
  LoadState,
  PageState,
} from "@chaos-swarm/agent-core";
import type { DemoScenarioDefinition } from "./scenarios";

interface LiveSwarmCallbacks {
  onAgentStart?: (run: AgentRunResult) => Promise<void> | void;
  onAgentStep?: (run: AgentRunResult, step: AgentStepRecord) => Promise<void> | void;
  onAgentComplete?: (run: AgentRunResult) => Promise<void> | void;
}

interface LiveSwarmOptions extends LiveSwarmCallbacks {
  scenario: DemoScenarioDefinition;
  targetUrl: string;
  goal: string;
  maxSteps: number;
  personas: AgentPersona[];
  runId: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function initialFrustration(persona: AgentPersona) {
  if (persona.archetype === "ChaosAgent") {
    return 0.28;
  }

  if (persona.archetype === "Speedrunner") {
    return 0.18;
  }

  return 0.1;
}

function initialConfidence(persona: AgentPersona) {
  return clamp(0.44 + persona.skillLevel * 0.48, 0.3, 0.95);
}

function viewportForPersona(persona: AgentPersona) {
  if (persona.archetype === "Novice") {
    return { width: 1365, height: 900 };
  }

  if (persona.archetype === "ChaosAgent") {
    return { width: 1440, height: 860 };
  }

  return { width: 1512, height: 920 };
}

function paceMs(persona: AgentPersona, intent: "load" | "scan" | "type" | "click") {
  const base =
    persona.archetype === "Novice"
      ? { load: 1200, scan: 1050, type: 950, click: 700 }
      : persona.archetype === "ChaosAgent"
        ? { load: 350, scan: 220, type: 180, click: 120 }
        : { load: 520, scan: 320, type: 260, click: 220 };

  return base[intent];
}

function buildAgentId(persona: AgentPersona, index: number) {
  return `${persona.archetype.toLowerCase()}-${String(index + 1).padStart(2, "0")}`;
}

function summarizeTargets(targets: string[]) {
  return targets.length ? targets.slice(0, 4).join(", ") : "no obvious targets";
}

function summarizeStep(step: number, page: PageState, frustration: number, persona: AgentPersona, details: string) {
  return [
    `step ${step}`,
    `${page.loadState} page at ${page.url}`,
    `targets: ${summarizeTargets(page.visibleTargets)}`,
    `frustration=${frustration.toFixed(2)}`,
    `persona=${persona.archetype}`,
    details,
  ].join(" | ");
}

async function currentLoadState(page: Page): Promise<LoadState> {
  try {
    const state = await page.evaluate(() => document.readyState);

    if (state === "complete") {
      return "complete";
    }

    if (state === "interactive") {
      return "interactive";
    }

    return "loading";
  } catch {
    return "error";
  }
}

async function extractVisibleTargets(page: Page): Promise<string[]> {
  try {
    return await page
      .locator("button, a, input, textarea, select, [role='button'], [aria-label], [placeholder]")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => {
            const element = node as HTMLElement;
            const label =
              element.innerText?.trim() ||
              element.getAttribute("aria-label") ||
              element.getAttribute("placeholder") ||
              (element as HTMLInputElement).value ||
              "";

            return label.replace(/\s+/g, " ").trim();
          })
          .filter(Boolean)
          .slice(0, 10),
      );
  } catch {
    return [];
  }
}

async function extractErrorFlags(page: Page, extra: string[] = []): Promise<string[]> {
  const flags = new Set(extra);
  const title = await page.title().catch(() => "");

  if (/invalid ssl certificate|attention required|cloudflare/i.test(title)) {
    flags.add(title);
  }

  try {
    const errorTexts = await page
      .locator(".error-message-container, .message-error, .mage-error, [role='alert'], [aria-invalid='true']")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .slice(0, 4),
      );

    for (const text of errorTexts) {
      flags.add(text);
    }
  } catch {
    // Ignore extraction failures and keep any explicit flags.
  }

  return [...flags];
}

async function assertUsableSurface(page: Page) {
  const title = await page.title().catch(() => "");

  if (/invalid ssl certificate|attention required|cloudflare/i.test(title)) {
    throw new Error(title);
  }
}

async function snapshotPage(page: Page, fallbackUrl: string, explicitFlags: string[] = []): Promise<PageState> {
  const url = page.url() || fallbackUrl;
  const title = await page.title().catch(() => undefined);
  const visibleTargets = await extractVisibleTargets(page);
  const errorFlags = await extractErrorFlags(page, explicitFlags);
  let loadState = await currentLoadState(page);

  if (errorFlags.length > 0 && loadState !== "complete") {
    loadState = "error";
  }

  return {
    url,
    title,
    screenshot: undefined,
    visibleTargets,
    loadState,
    errorFlags,
  };
}

async function clickWithFallback(page: Page, label: string, candidates: Array<() => Locator>) {
  let lastError: Error | undefined;

  for (const buildLocator of candidates) {
    const locator = buildLocator().first();

    try {
      if ((await locator.count()) === 0) {
        continue;
      }

      await locator.scrollIntoViewIfNeeded().catch(() => undefined);

      if (await locator.isVisible().catch(() => false)) {
        await locator.click({ timeout: 8_000 });
        return { method: "locator" as const, target: label };
      }

      const box = await locator.boundingBox();

      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        return { method: "coordinates" as const, target: label };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error(`Unable to locate ${label}`);
}

async function selectMagentoOption(page: Page, dimension: "size" | "color") {
  const selector =
    dimension === "size"
      ? ".swatch-attribute.size .swatch-option"
      : ".swatch-attribute.color .swatch-option";

  return clickWithFallback(page, `${dimension} option`, [
    () => page.locator(selector),
    () => page.locator(`[option-label][data-option-type='${dimension === "size" ? "0" : "1"}']`),
  ]);
}

function buildEmotion(
  persona: AgentPersona,
  current: { frustration: number; confidence: number },
  decision: Decision,
  action: ActionResult,
  errorFlags: string[],
) {
  let frustration = current.frustration;
  let confidence = current.confidence;

  if (decision.kind === "wait") {
    frustration += 0.06 * (1 - persona.patience);
    confidence -= 0.02;
  }

  if (decision.kind === "scroll" && persona.archetype === "Novice") {
    frustration -= 0.02;
    confidence += 0.01;
  }

  if (decision.kind === "retry") {
    frustration += 0.08;
    confidence -= 0.04;
  }

  if (errorFlags.length > 0) {
    frustration += 0.14;
    confidence -= 0.08;
  }

  if (action.ok) {
    frustration -= 0.05 * Math.max(persona.skillLevel, 0.35);
    confidence += 0.05 * Math.max(persona.skillLevel, 0.35);
  } else {
    frustration += 0.18;
    confidence -= 0.16;
  }

  return {
    frustration: clamp(frustration, 0, 1),
    confidence: clamp(confidence, 0, 1),
  };
}

function buildRunningSnapshot(
  input: AgentRunInput,
  agentId: string,
  startedAt: string,
  finishedAt: string,
  finalPage: PageState,
  steps: AgentStepRecord[],
  completed: boolean,
  failed: boolean,
): AgentRunResult {
  const terminal = completed ? "completed" : failed ? "failed" : "running";

  return {
    agentId,
    persona: input.persona,
    config: input.config,
    startedAt,
    finishedAt,
    completed,
    failed,
    finalPage,
    summary: `${input.persona.archetype} agent ${terminal} ${steps.length} live steps for "${input.config.goal}"`,
    steps: [...steps],
  };
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => consume()));
  return results;
}

async function appendStep(
  page: Page,
  input: AgentRunInput,
  startedAt: string,
  agentId: string,
  steps: AgentStepRecord[],
  state: { frustration: number; confidence: number },
  decision: Decision,
  action: ActionResult,
  detail: string,
  callbacks: LiveSwarmCallbacks,
  explicitFlags: string[] = [],
) {
  const pageState = await snapshotPage(page, input.config.targetUrl, explicitFlags);
  const emotion = buildEmotion(input.persona, state, decision, action, pageState.errorFlags);
  state.frustration = emotion.frustration;
  state.confidence = emotion.confidence;

  const record: AgentStepRecord = {
    step: steps.length,
    observation: {
      step: steps.length,
      summary: summarizeStep(steps.length, pageState, state.frustration, input.persona, detail),
      page: pageState,
    },
    decision,
    action,
    frustration: state.frustration,
    confidence: state.confidence,
    timestamp: new Date().toISOString(),
  };

  steps.push(record);

  await callbacks.onAgentStep?.(
    buildRunningSnapshot(input, agentId, startedAt, record.timestamp, pageState, steps, false, false),
    record,
  );

  return pageState;
}

async function maybeScan(
  page: Page,
  input: AgentRunInput,
  startedAt: string,
  agentId: string,
  steps: AgentStepRecord[],
  state: { frustration: number; confidence: number },
  callbacks: LiveSwarmCallbacks,
  note: string,
) {
  if (input.persona.archetype !== "Novice" || steps.length >= input.config.maxSteps) {
    return;
  }

  await page.mouse.wheel(0, 180).catch(() => undefined);
  await sleep(paceMs(input.persona, "scan"));

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: "scroll",
      rationale: "novice persona spends extra time scanning the hierarchy",
    },
    {
      kind: "scroll",
      ok: true,
      details: note,
    },
    note,
    callbacks,
  );
}

async function runSaucedemoFlow(
  page: Page,
  input: AgentRunInput,
  startedAt: string,
  agentId: string,
  steps: AgentStepRecord[],
  state: { frustration: number; confidence: number },
  callbacks: LiveSwarmCallbacks,
) {
  await page.goto(input.config.targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await sleep(paceMs(input.persona, "load"));

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: "wait",
      rationale: "the agent waits for the login surface to render",
    },
    {
      kind: "wait",
      ok: true,
      details: "loaded the SauceDemo credential gate",
    },
    "entered the login surface",
    callbacks,
  );

  await maybeScan(page, input, startedAt, agentId, steps, state, callbacks, "lingered to read the credential hints");

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await page.getByPlaceholder("Username").fill("standard_user");
  await sleep(paceMs(input.persona, "type"));
  await page.getByPlaceholder("Password").fill("secret_sauce");
  await sleep(paceMs(input.persona, "type"));

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: "type",
      rationale: "credential entry is required before the agent can reach inventory",
      target: "login form",
      value: "standard_user / secret_sauce",
    },
    {
      kind: "type",
      ok: true,
      details: "filled the visible username and password controls",
    },
    "credentials are populated and ready for submit",
    callbacks,
  );

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickWithFallback(page, "login", [
    () => page.getByRole("button", { name: /^login$/i }),
    () => page.locator("#login-button"),
  ]);
  await page.waitForURL(/inventory/, { timeout: 12_000 });
  await sleep(paceMs(input.persona, "click"));

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: "click",
      rationale: "inventory is behind the primary login CTA",
      target: "login",
    },
    {
      kind: "click",
      ok: true,
      details: "advanced from login into the inventory grid",
    },
    "inventory grid is now visible",
    callbacks,
  );

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickWithFallback(page, "add to cart", [
    () => page.getByRole("button", { name: /add to cart/i }),
    () => page.locator("[data-test^='add-to-cart']"),
  ]);
  await sleep(paceMs(input.persona, "click"));

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: "click",
      rationale: "the agent chooses the first visible add-to-cart CTA",
      target: "inventory add to cart",
    },
    {
      kind: "click",
      ok: true,
      details: "added an inventory item to the cart",
    },
    "the primary commerce CTA succeeded",
    callbacks,
  );

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickWithFallback(page, "shopping cart", [
    () => page.locator(".shopping_cart_link"),
    () => page.getByRole("link", { name: /shopping cart/i }),
  ]);
  await page.waitForURL(/cart/, { timeout: 12_000 });
  await sleep(paceMs(input.persona, "click"));

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: "click",
      rationale: "the agent verifies the cart boundary after add-to-cart",
      target: "shopping cart",
    },
    {
      kind: "click",
      ok: true,
      details: "opened the cart review surface",
    },
    "cart review completed",
    callbacks,
  );
}

async function runMagentoFlow(
  page: Page,
  input: AgentRunInput,
  startedAt: string,
  agentId: string,
  steps: AgentStepRecord[],
  state: { frustration: number; confidence: number },
  callbacks: LiveSwarmCallbacks,
) {
  await page.goto(input.config.targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await sleep(paceMs(input.persona, "load"));

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: "wait",
      rationale: "the agent waits for the Magento home page to settle",
    },
    {
      kind: "wait",
      ok: true,
      details: "loaded the storefront landing page",
    },
    "search entry is visible",
    callbacks,
  );

  await assertUsableSurface(page);

  await maybeScan(page, input, startedAt, agentId, steps, state, callbacks, "paused to scan the storefront chrome");

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await page.locator("#search").fill("Radiant Tee");
  await sleep(paceMs(input.persona, "type"));
  await page.locator("#search").press("Enter");
  await page.waitForURL(/catalogsearch\/result/, { timeout: 15_000 });
  await sleep(paceMs(input.persona, "click"));

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: "type",
      rationale: "the top search box is the fastest route to the target product",
      target: "search",
      value: "Radiant Tee",
    },
    {
      kind: "type",
      ok: true,
      details: "searched for the target product",
    },
    "results grid is now visible",
    callbacks,
  );

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickWithFallback(page, "Radiant Tee", [
    () => page.getByRole("link", { name: /Radiant Tee/i }),
    () => page.locator("a.product-item-link"),
  ]);
  await page.waitForURL(/radiant-tee/, { timeout: 15_000 });
  await sleep(paceMs(input.persona, "click"));

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: "click",
      rationale: "the agent drills into the first matching product card",
      target: "Radiant Tee",
    },
    {
      kind: "click",
      ok: true,
      details: "opened the product detail page",
    },
    "product options are visible",
    callbacks,
  );

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await selectMagentoOption(page, "size");
  await sleep(paceMs(input.persona, "click"));
  await selectMagentoOption(page, "color");
  await sleep(paceMs(input.persona, "click"));

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: "click",
      rationale: "size and color must be grounded before the cart CTA becomes valid",
      target: "size and color selectors",
    },
    {
      kind: "click",
      ok: true,
      details: "selected the first visible size and color swatches",
    },
    "required purchase options are resolved",
    callbacks,
  );

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickWithFallback(page, "Add to Cart", [
    () => page.locator("#product-addtocart-button"),
    () => page.getByRole("button", { name: /add to cart/i }),
  ]);
  await sleep(paceMs(input.persona, "click") + 300);

  if (input.persona.archetype === "ChaosAgent") {
    await page
      .getByRole("button", { name: /add to cart/i })
      .first()
      .click({ timeout: 2_000 })
      .catch(() => undefined);
  }

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: input.persona.archetype === "ChaosAgent" ? "retry" : "click",
      rationale:
        input.persona.archetype === "ChaosAgent"
          ? "chaos agents tend to re-trigger the CTA when success feedback is delayed"
          : "the primary CTA advances the product into cart intent",
      target: "Add to Cart",
    },
    {
      kind: input.persona.archetype === "ChaosAgent" ? "retry" : "click",
      ok: true,
      details:
        input.persona.archetype === "ChaosAgent"
          ? "re-triggered add-to-cart after a short feedback delay"
          : "sent the configured product into the cart flow",
    },
    "the cart CTA has been exercised",
    callbacks,
  );

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickWithFallback(page, "cart confirmation", [
    () => page.locator("a.action.showcart"),
    () => page.locator("a[href*='checkout/cart']"),
    () => page.getByRole("link", { name: /shopping cart/i }),
  ]).catch(async () => {
    await page.goto("https://magento.softwaretestingboard.com/checkout/cart/", {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    return { method: "navigation" as const, target: "cart page" };
  });

  await page.waitForURL(/checkout\/cart/, { timeout: 15_000 }).catch(() => undefined);
  await sleep(paceMs(input.persona, "click"));

  await appendStep(
    page,
    input,
    startedAt,
    agentId,
    steps,
    state,
    {
      kind: "click",
      rationale: "the agent validates the cart boundary after the product CTA",
      target: "cart confirmation",
    },
    {
      kind: "click",
      ok: true,
      details: "landed on the cart confirmation surface",
    },
    "cart confirmation is visible",
    callbacks,
  );
}

async function runLiveAgent(
  browser: Browser,
  scenario: DemoScenarioDefinition,
  input: AgentRunInput,
  callbacks: LiveSwarmCallbacks,
) {
  const agentId = input.agentId ?? buildAgentId(input.persona, 0);
  const startedAt = new Date().toISOString();
  const steps: AgentStepRecord[] = [];
  const state = {
    frustration: initialFrustration(input.persona),
    confidence: initialConfidence(input.persona),
  };
  const context = await browser.newContext({
    viewport: viewportForPersona(input.persona),
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });
  const page = await context.newPage();
  let finalPage: PageState = {
    url: input.config.targetUrl,
    visibleTargets: [],
    loadState: "loading",
    errorFlags: [],
  };

  await callbacks.onAgentStart?.(
    buildRunningSnapshot(input, agentId, startedAt, startedAt, finalPage, steps, false, false),
  );

  try {
    if (scenario.id === "saucedemo") {
      await runSaucedemoFlow(page, input, startedAt, agentId, steps, state, callbacks);
    } else {
      await runMagentoFlow(page, input, startedAt, agentId, steps, state, callbacks);
    }

    finalPage = await snapshotPage(page, input.config.targetUrl);
    const completed =
      scenario.id === "saucedemo"
        ? /cart/.test(finalPage.url)
        : /checkout\/cart/.test(finalPage.url) || finalPage.visibleTargets.some((target) => /checkout/i.test(target));

    return buildRunningSnapshot(
      input,
      agentId,
      startedAt,
      new Date().toISOString(),
      finalPage,
      steps,
      completed,
      !completed,
    );
  } catch (error) {
    finalPage = await snapshotPage(page, input.config.targetUrl, [
      error instanceof Error ? error.message : "Unknown execution failure.",
    ]);

    const decision: Decision = {
      kind: "escalate",
      rationale: "the page became brittle enough that the agent aborted execution",
      target: finalPage.errorFlags[0],
    };
    const action: ActionResult = {
      kind: "escalate",
      ok: false,
      details: finalPage.errorFlags[0] ?? "execution failed unexpectedly",
      nextPage: finalPage,
    };

    if (steps.length < input.config.maxSteps) {
      await appendStep(
        page,
        input,
        startedAt,
        agentId,
        steps,
        state,
        decision,
        action,
        action.details,
        callbacks,
        finalPage.errorFlags,
      );
    }

    return buildRunningSnapshot(
      input,
      agentId,
      startedAt,
      new Date().toISOString(),
      finalPage,
      steps,
      false,
      true,
    );
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function runLiveSwarm(options: LiveSwarmOptions) {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    return await runWithConcurrency(options.personas, 4, async (persona, index) => {
      const input: AgentRunInput = {
        agentId: buildAgentId(persona, index),
        persona,
        config: {
          targetUrl: options.targetUrl,
          goal: options.goal,
          maxSteps: options.maxSteps,
          seed: `${options.runId}-${index + 1}`,
          demoMode: false,
        },
      };
      const result = await runLiveAgent(browser, options.scenario, input, options);
      await options.onAgentComplete?.(result);
      return result;
    });
  } finally {
    await browser.close();
  }
}
