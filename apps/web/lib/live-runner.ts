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

const BLOCKED_SURFACE_PATTERN = /invalid ssl certificate|attention required|cloudflare|robot or human|access denied|verify you are human|automated access/i;

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
          .slice(0, 20),
      );
  } catch {
    return [];
  }
}

async function extractErrorFlags(page: Page, extra: string[] = []): Promise<string[]> {
  const flags = new Set(extra);
  const title = await page.title().catch(() => "");

  if (BLOCKED_SURFACE_PATTERN.test(title)) {
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
  const body = ((await page.textContent("body").catch(() => "")) ?? "").slice(0, 4000);

  if (BLOCKED_SURFACE_PATTERN.test(`${title} ${body}`)) {
    throw new Error(title || "Blocked or challenge page detected.");
  }
}

async function gotoWithRetry(page: Page, url: string, options: Parameters<Page["goto"]>[1], attempts = 2) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.goto(url, options);
    } catch (error) {
      lastError = error;

      if (attempt === attempts) {
        break;
      }

      await sleep(500 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function resolveFirstHref(page: Page, candidates: Array<() => Locator>) {
  for (const buildLocator of candidates) {
    const locator = buildLocator().first();

    try {
      if ((await locator.count()) === 0) {
        continue;
      }

      const href = await locator.getAttribute("href");

      if (href) {
        return new URL(href, page.url()).toString();
      }
    } catch {
      // Ignore noisy locator reads and continue to the next candidate.
    }
  }

  return undefined;
}

interface SurfaceWaitOptions {
  label: string;
  timeout?: number;
  urlPattern?: RegExp;
  locatorBuilders?: Array<() => Locator>;
}

async function waitForSurface(page: Page, options: SurfaceWaitOptions) {
  const timeout = options.timeout ?? 12_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    await assertUsableSurface(page);

    if (options.urlPattern?.test(page.url())) {
      return;
    }

    for (const buildLocator of options.locatorBuilders ?? []) {
      const locator = buildLocator().first();

      try {
        if ((await locator.count()) === 0) {
          continue;
        }

        if (await locator.isVisible().catch(() => false)) {
          return;
        }
      } catch {
        // Ignore transient locator failures while polling for the next surface.
      }
    }

    await sleep(250);
  }

  const title = await page.title().catch(() => "");
  const suffix = title ? ` (${title})` : "";
  throw new Error(`Timed out waiting for ${options.label} at ${page.url()}${suffix}`);
}

async function clickThenConfirmSurface(
  page: Page,
  label: string,
  candidates: Array<() => Locator>,
  confirmation: SurfaceWaitOptions & { fallbackUrl?: string },
) {
  await clickWithFallback(page, label, candidates);

  try {
    await waitForSurface(page, confirmation);
  } catch (error) {
    if (!confirmation.fallbackUrl) {
      throw error;
    }

    await gotoWithRetry(page, confirmation.fallbackUrl, {
      waitUntil: "domcontentloaded",
      timeout: confirmation.timeout ?? 15_000,
    });
    await waitForSurface(page, confirmation);
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
  await gotoWithRetry(page, input.config.targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
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

async function runAutomationExerciseFlow(
  page: Page,
  input: AgentRunInput,
  startedAt: string,
  agentId: string,
  steps: AgentStepRecord[],
  state: { frustration: number; confidence: number },
  callbacks: LiveSwarmCallbacks,
) {
  await gotoWithRetry(page, input.config.targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
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
      rationale: "the agent waits for the catalog surface to settle before searching",
    },
    {
      kind: "wait",
      ok: true,
      details: "loaded the Automation Exercise products catalog",
    },
    "catalog and search entry are visible",
    callbacks,
  );

  await assertUsableSurface(page);
  await maybeScan(page, input, startedAt, agentId, steps, state, callbacks, "paused to scan the product grid and search affordances");

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await page.locator("#search_product").fill("Blue Top");
  await sleep(paceMs(input.persona, "type"));
  await clickWithFallback(page, "search submit", [
    () => page.locator("#submit_search"),
    () => page.getByRole("button", { name: /search/i }),
  ]);
  await waitForSurface(page, {
    label: "filtered Automation Exercise search results",
    timeout: 15_000,
    urlPattern: /products\?search=/,
    locatorBuilders: [
      () => page.locator("a[href='/product_details/1']"),
      () => page.getByRole("link", { name: /View Product/i }),
    ],
  });
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
      rationale: "the catalog search box is the fastest route to a precise product detail page",
      target: "search",
      value: "Blue Top",
    },
    {
      kind: "type",
      ok: true,
      details: "searched the public catalog for the Blue Top product",
    },
    "filtered results are now visible",
    callbacks,
  );

  await assertUsableSurface(page);

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  const productLinkCandidates = [
    () => page.locator("a[href='/product_details/1']"),
    () => page.getByRole("link", { name: /View Product/i }),
  ];
  const productDetailUrl = await resolveFirstHref(page, productLinkCandidates);

  await clickThenConfirmSurface(page, "View Product", productLinkCandidates, {
    label: "Automation Exercise product detail",
    timeout: 15_000,
    urlPattern: /product_details\//,
    locatorBuilders: [
      () => page.getByRole("button", { name: /add to cart/i }),
      () => page.locator("button.cart"),
    ],
    fallbackUrl: productDetailUrl,
  });
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
      rationale: "the agent drills into the first matching product detail page from the filtered catalog",
      target: "View Product",
    },
    {
      kind: "click",
      ok: true,
      details: "opened the Blue Top product detail surface",
    },
    "product detail is visible",
    callbacks,
  );

  await assertUsableSurface(page);

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickWithFallback(page, "Add to cart", [
    () => page.getByRole("button", { name: /add to cart/i }),
    () => page.locator("button.cart"),
  ]);
  await waitForSurface(page, {
    label: "Automation Exercise cart intent",
    timeout: 10_000,
    urlPattern: /view_cart/,
    locatorBuilders: [
      () => page.locator("#cartModal"),
      () => page.locator("a[href='/view_cart']").filter({ hasText: /View Cart/i }),
      () => page.getByRole("link", { name: /view cart/i }),
    ],
  }).catch(() => undefined);
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
      rationale: "the primary product CTA moves the search result into cart intent",
      target: "Add to cart",
    },
    {
      kind: "click",
      ok: true,
      details: "added the product from the detail page into the cart modal",
    },
    "cart intent modal is visible",
    callbacks,
  );

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickThenConfirmSurface(page, "View Cart", [
    () => page.locator("a[href='/view_cart']").filter({ hasText: /View Cart/i }),
    () => page.getByRole("link", { name: /view cart/i }),
  ], {
    label: "Automation Exercise cart review",
    timeout: 15_000,
    urlPattern: /view_cart/,
    locatorBuilders: [
      () => page.getByRole("link", { name: /proceed to checkout/i }),
      () => page.locator(".cart_info"),
    ],
    fallbackUrl: "https://automationexercise.com/view_cart",
  });
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
      rationale: "the agent verifies the cart boundary after the add-to-cart modal appears",
      target: "View Cart",
    },
    {
      kind: "click",
      ok: true,
      details: "opened the cart review surface",
    },
    "cart review is visible",
    callbacks,
  );
}

async function runTheInternetFlow(
  page: Page,
  input: AgentRunInput,
  startedAt: string,
  agentId: string,
  steps: AgentStepRecord[],
  state: { frustration: number; confidence: number },
  callbacks: LiveSwarmCallbacks,
) {
  await gotoWithRetry(page, input.config.targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
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
      rationale: "the agent waits for the module directory to settle before selecting the auth surface",
    },
    {
      kind: "wait",
      ok: true,
      details: "loaded The Internet directory of test modules",
    },
    "module directory is visible",
    callbacks,
  );

  await assertUsableSurface(page);
  await maybeScan(page, input, startedAt, agentId, steps, state, callbacks, "paused to scan the module list before choosing auth");

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickWithFallback(page, "Form Authentication", [
    () => page.getByRole("link", { name: /form authentication/i }),
    () => page.locator("a[href='/login']"),
  ]);
  await page.waitForURL(/the-internet\.herokuapp\.com\/login/, { timeout: 15_000 });
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
      rationale: "the Form Authentication module is the cleanest path to a visible success state",
      target: "Form Authentication",
    },
    {
      kind: "click",
      ok: true,
      details: "opened the Form Authentication module",
    },
    "auth form is visible",
    callbacks,
  );

  await assertUsableSurface(page);

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await page.getByLabel("Username").fill("tomsmith");
  await sleep(paceMs(input.persona, "type"));
  await page.getByLabel("Password").fill("SuperSecretPassword!");
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
      rationale: "the secure area is behind a visible username and password form",
      target: "login form",
      value: "tomsmith / SuperSecretPassword!",
    },
    {
      kind: "type",
      ok: true,
      details: "filled the published demo credentials",
    },
    "credentials are ready for submit",
    callbacks,
  );

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickWithFallback(page, "Login", [
    () => page.getByRole("button", { name: /^login$/i }),
    () => page.locator("button[type='submit']"),
  ]);
  await page.waitForURL(/the-internet\.herokuapp\.com\/secure/, { timeout: 15_000 });
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
      rationale: "the login CTA is the final gate into the secure area",
      target: "Login",
    },
    {
      kind: "click",
      ok: true,
      details: "landed on the secure area and observed the success flash",
    },
    "secure area is visible",
    callbacks,
  );
}

async function runExpandTestingFlow(
  page: Page,
  input: AgentRunInput,
  startedAt: string,
  agentId: string,
  steps: AgentStepRecord[],
  state: { frustration: number; confidence: number },
  callbacks: LiveSwarmCallbacks,
) {
  await gotoWithRetry(page, input.config.targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
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
      rationale: "the agent waits for the validation form to settle before editing multiple fields",
    },
    {
      kind: "wait",
      ok: true,
      details: "loaded the Expand Testing validation form",
    },
    "validation form is visible",
    callbacks,
  );

  await assertUsableSurface(page);
  await maybeScan(page, input, startedAt, agentId, steps, state, callbacks, "paused to scan the labels and field order");

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await page.locator("#validationCustom01").fill("Chaos Swarm");
  await sleep(paceMs(input.persona, "type"));
  await page.locator("input[name='contactnumber']").fill("012-3456789");
  await sleep(paceMs(input.persona, "type"));
  await page.locator("input[name='pickupdate']").fill("2026-04-15");
  await sleep(paceMs(input.persona, "type"));
  await page.locator("select[name='payment']").selectOption({ label: "card" });
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
      rationale: "the form requires valid text, phone, date, and payment inputs before submit is meaningful",
      target: "validation form",
      value: "name, phone, pickup date, payment",
    },
    {
      kind: "type",
      ok: true,
      details: "filled the visible validation form controls with valid values",
    },
    "validation inputs are resolved",
    callbacks,
  );

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickWithFallback(page, "Register", [
    () => page.getByRole("button", { name: /register/i }),
    () => page.locator("button[type='submit']"),
  ]);
  await page.waitForURL(/practice\.expandtesting\.com\/form-confirmation/, { timeout: 15_000 });
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
      rationale: "the final submit validates whether the form accepts the assembled inputs",
      target: "Register",
    },
    {
      kind: "click",
      ok: true,
      details: "submitted the validation form and reached the confirmation page",
    },
    "confirmation page is visible",
    callbacks,
  );
}

async function runParabankFlow(
  page: Page,
  input: AgentRunInput,
  startedAt: string,
  agentId: string,
  steps: AgentStepRecord[],
  state: { frustration: number; confidence: number },
  callbacks: LiveSwarmCallbacks,
) {
  await gotoWithRetry(page, input.config.targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
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
      rationale: "the agent waits for the finance onboarding form to settle before typing dense profile data",
    },
    {
      kind: "wait",
      ok: true,
      details: "loaded the ParaBank registration page",
    },
    "registration form is visible",
    callbacks,
  );

  await assertUsableSurface(page);
  await maybeScan(page, input, startedAt, agentId, steps, state, callbacks, "paused to scan the dense onboarding form");

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  const suffix = (input.config.seed ?? `${Date.now()}`).replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase();
  const username = `chaosswarm${suffix}`;
  const password = "SuperSecret123!";

  await page.locator("[name='customer.firstName']").fill("Chaos");
  await page.locator("[name='customer.lastName']").fill("Swarm");
  await page.locator("[name='customer.address.street']").fill("1 Market St");
  await page.locator("[name='customer.address.city']").fill("San Francisco");
  await page.locator("[name='customer.address.state']").fill("CA");
  await page.locator("[name='customer.address.zipCode']").fill("94105");
  await page.locator("[name='customer.phoneNumber']").fill("4155550101");
  await page.locator("[name='customer.ssn']").fill(suffix.padStart(8, "0").slice(0, 8));
  await page.locator("[name='customer.username']").fill(username);
  await page.locator("[name='customer.password']").fill(password);
  await page.locator("[name='repeatedPassword']").fill(password);
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
      rationale: "the onboarding surface requires a fully populated identity and credential set",
      target: "registration form",
      value: username,
    },
    {
      kind: "type",
      ok: true,
      details: "filled the ParaBank registration inputs with a unique seeded username",
    },
    "registration inputs are populated",
    callbacks,
  );

  if (steps.length >= input.config.maxSteps) {
    return;
  }

  await clickWithFallback(page, "Register", [
    () => page.locator("input[value='Register']"),
    () => page.getByRole("button", { name: /register/i }),
  ]);
  await page.locator("a[href*='openaccount'], a[href*='overview']").first().waitFor({ timeout: 15_000 });
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
      rationale: "the submit action determines whether the finance onboarding completes cleanly",
      target: "Register",
    },
    {
      kind: "click",
      ok: true,
      details: "created a fresh ParaBank account and reached the account-services dashboard",
    },
    "account services are visible",
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
    } else if (scenario.id === "automationexercise") {
      await runAutomationExerciseFlow(page, input, startedAt, agentId, steps, state, callbacks);
    } else if (scenario.id === "theinternet") {
      await runTheInternetFlow(page, input, startedAt, agentId, steps, state, callbacks);
    } else if (scenario.id === "expandtesting") {
      await runExpandTestingFlow(page, input, startedAt, agentId, steps, state, callbacks);
    } else {
      await runParabankFlow(page, input, startedAt, agentId, steps, state, callbacks);
    }

    finalPage = await snapshotPage(page, input.config.targetUrl);
    const completed =
      scenario.id === "saucedemo"
        ? /cart/.test(finalPage.url)
        : scenario.id === "automationexercise"
          ? /automationexercise\.com\/view_cart/.test(finalPage.url)
          : scenario.id === "theinternet"
            ? /the-internet\.herokuapp\.com\/secure/.test(finalPage.url) ||
              finalPage.visibleTargets.some((target) => /logout/i.test(target))
            : scenario.id === "expandtesting"
              ? /practice\.expandtesting\.com\/form-confirmation/.test(finalPage.url)
              : finalPage.visibleTargets.some((target) => /open new account|accounts overview|log out/i.test(target));

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
