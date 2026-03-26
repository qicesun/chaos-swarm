import Browserbase from "@browserbasehq/sdk";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import type {
  ActionResult,
  ActionExecutionAssist,
  AgentPersona,
  AgentRunInput,
  AgentRunResult,
  AgentStepRecord,
  Decision,
  LoadState,
  PageState,
} from "@chaos-swarm/agent-core";
import { buildScenarioPlaybook } from "./agent-playbook";
import {
  decideNextAction,
  type ObservedCandidate,
  type ParsedAgentDecision,
} from "./openai-agent";
import { canUseBrowserbase, env } from "./env";
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
  strictVisualMode: boolean;
  personas: AgentPersona[];
  runId: string;
}

interface InteractiveCandidate {
  id: string;
  text: string;
  tagName: string;
  role: string;
  selector?: string;
  placeholder?: string;
  ariaLabel?: string;
  href?: string;
  inputType?: string;
  surfaceLabel?: string;
  viewportState: "visible" | "below_fold" | "above_fold";
  disabled: boolean;
  selectOptions: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AgentRuntimeHandle {
  browser?: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function seededOffset(seed: string, salt: string, amplitude: number) {
  const ratio = (hashString(`${seed}:${salt}`) % 10_000) / 10_000;
  return (ratio * 2 - 1) * amplitude;
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function extractInteractiveCandidates(page: Page): Promise<InteractiveCandidate[]> {
  try {
    return await page.evaluate(() => {
      function cssString(value: string) {
        return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      }

      function buildSelector(element: HTMLElement) {
        const tag = element.tagName.toLowerCase();
        const name = element.getAttribute("name");
        const visibleText = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();

        if (name) {
          return `${tag}[name="${cssString(name)}"]`;
        }

        const id = element.getAttribute("id");

        if (id) {
          return `#${CSS.escape(id)}`;
        }

        const href = element.getAttribute("href");

        if (href && tag === "a") {
          if (visibleText) {
            return `a[href="${cssString(href)}"]:has-text("${cssString(visibleText)}")`;
          }

          return `a[href="${cssString(href)}"]`;
        }

        const ariaLabel = element.getAttribute("aria-label");

        if (ariaLabel) {
          return `${tag}[aria-label="${cssString(ariaLabel)}"]`;
        }

        const placeholder = element.getAttribute("placeholder");

        if (placeholder) {
          return `${tag}[placeholder="${cssString(placeholder)}"]`;
        }

        const value = element.getAttribute("value");

        if (value) {
          return `${tag}[value="${cssString(value)}"]`;
        }

        const type = element.getAttribute("type");

        if (type) {
          return `${tag}[type="${cssString(type)}"]`;
        }

        return undefined;
      }

      function cleanText(value: string | null | undefined) {
        return (value ?? "").replace(/\s+/g, " ").trim();
      }

      function humanizeIdentifier(value: string | null | undefined) {
        const normalized = cleanText(value);

        if (!normalized) {
          return "";
        }

        return normalized
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/[_-]+/g, " ")
          .replace(/(contact)(number)/gi, "$1 $2")
          .replace(/(pickup)(date)/gi, "$1 $2")
          .replace(/(payment)(method)/gi, "$1 $2")
          .replace(/\b\w/g, (character) => character.toUpperCase());
      }

      function labelText(element: HTMLElement) {
        const native = element as HTMLInputElement & {
          labels?: NodeListOf<HTMLLabelElement>;
        };
        const directLabels = Array.from(native.labels ?? [])
          .map((label) => cleanText(label.textContent))
          .filter(Boolean);
        const inputType = cleanText(element.getAttribute("type")).toLowerCase();

        function labelMatchesInputType(label: string) {
          return inputType === "date"
            ? /date|pickup/i.test(label)
            : inputType === "tel"
              ? /contact|phone|number/i.test(label)
              : inputType === "password"
                ? /password/i.test(label)
                : true;
        }

        if (directLabels.length > 1) {
          const preferred =
            (inputType === "tel"
              ? directLabels.find((label) => /contact|phone|number/i.test(label))
              : undefined) ||
            (inputType === "date"
              ? directLabels.find((label) => /date|pickup/i.test(label))
              : undefined) ||
            (inputType === "password"
              ? directLabels.find((label) => /password/i.test(label))
              : undefined);

          if (preferred) {
            return preferred;
          }
        }

        const direct = directLabels[0];

        if (direct && labelMatchesInputType(direct)) {
          return direct;
        }

        const id = element.getAttribute("id");

        if (id) {
          const explicit = cleanText(document.querySelector(`label[for="${id}"]`)?.textContent);

          if (explicit && labelMatchesInputType(explicit)) {
            return explicit;
          }
        }

        const parentLabel = cleanText(element.closest("label")?.textContent);

        if (parentLabel) {
          return parentLabel;
        }

        const previousLabel =
          element.previousElementSibling instanceof HTMLLabelElement
            ? cleanText(element.previousElementSibling.textContent)
            : "";

        const previousLabelLooksValid =
          !previousLabel
            ? false
            : inputType === "date"
              ? /date|pickup/i.test(previousLabel)
              : inputType === "tel"
                ? /contact|phone|number/i.test(previousLabel)
                : true;

        if (previousLabelLooksValid) {
          return previousLabel;
        }

        return (
          humanizeIdentifier(element.getAttribute("name")) ||
          humanizeIdentifier(element.getAttribute("id"))
        );
      }

      function describeElement(element: HTMLElement) {
        const productCard = element.closest(".product-image-wrapper, .single-products, .features_items .col-sm-4");
        const productName =
          Array.from(productCard?.querySelectorAll<HTMLElement>("p, h2, h3, h4") ?? [])
            .map((node) => cleanText(node.textContent))
            .find(
              (text) =>
                text &&
                !/^rs\./i.test(text) &&
                !/^(add to cart|view product)$/i.test(text),
            ) ?? "";
        const href = cleanText(element.getAttribute("href")).toLowerCase();
        const className = cleanText(element.getAttribute("class")).toLowerCase();
        const name = cleanText(element.getAttribute("name")).toLowerCase();
        const id = cleanText(element.getAttribute("id")).toLowerCase();
        const inCartModal = Boolean(element.closest("#cartModal"));

        if (/view_cart/.test(href) && inCartModal) {
          return "View Cart";
        }

        if (/shopping_cart|view_cart|\/cart/.test(`${href} ${className} ${name} ${id}`)) {
          return "Shopping Cart";
        }

        if (/product_details/.test(href)) {
          return productName ? `View Product ${productName}` : "View Product";
        }

        if (/submit_search/.test(`${className} ${name} ${id}`)) {
          return "Submit Search";
        }

        const inlineText = cleanText(element.innerText) || cleanText(element.textContent);

        if (/^add to cart$/i.test(inlineText) && productName) {
          return `Add to cart ${productName}`;
        }

        return (
          labelText(element) ||
          inlineText ||
          cleanText(element.getAttribute("aria-label")) ||
          cleanText(element.getAttribute("placeholder")) ||
          cleanText((element as HTMLInputElement).value) ||
          humanizeIdentifier(element.getAttribute("name")) ||
          humanizeIdentifier(element.getAttribute("id")) ||
          cleanText(element.getAttribute("title")) ||
          cleanText(element.tagName)
        );
      }

      function findSurfaceLabel(element: HTMLElement) {
        const elementRect = element.getBoundingClientRect();
        const elementCenterX = elementRect.left + elementRect.width / 2;
        const headings = Array.from(
          document.querySelectorAll<HTMLElement>("h1, h2, h3, legend, .title, .captionone, .captiontwo"),
        )
          .map((heading) => ({
            text: cleanText(heading.textContent),
            rect: heading.getBoundingClientRect(),
          }))
          .filter((heading) => heading.text);

        let bestLabel = "";
        let bestScore = Number.POSITIVE_INFINITY;

        for (const heading of headings) {
          if (heading.rect.bottom > elementRect.top + 28) {
            continue;
          }

          const verticalGap = elementRect.top - heading.rect.bottom;

          if (verticalGap > 520) {
            continue;
          }

          const headingCenterX = heading.rect.left + heading.rect.width / 2;
          const horizontalGap = Math.abs(headingCenterX - elementCenterX);
          const score = verticalGap + horizontalGap * 0.45;

          if (score < bestScore) {
            bestScore = score;
            bestLabel = heading.text;
          }
        }

        return bestLabel || undefined;
      }

      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          "button, a, input, textarea, select, [role='button'], [aria-label], [placeholder]",
        ),
      );

      const ranked = nodes
        .map((element, index) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);

          if (
            rect.width < 8 ||
            rect.height < 8 ||
            rect.bottom < -240 ||
            rect.right < 0 ||
            rect.top > window.innerHeight * 1.4 ||
            rect.left > window.innerWidth ||
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0"
          ) {
            return null;
          }

          const viewportState =
            rect.bottom < 0
              ? "above_fold"
              : rect.top > window.innerHeight
                ? "below_fold"
                : "visible";

          const text = describeElement(element);

          if (!text) {
            return null;
          }

          const selectOptions =
            element instanceof HTMLSelectElement
              ? Array.from(element.options)
                  .map((option) => cleanText(option.textContent))
                  .filter(Boolean)
                  .slice(0, 12)
              : [];
          const surfaceLabel = findSurfaceLabel(element);
          const lowerText = text.toLowerCase();
          const ctaPriority = /view product/.test(lowerText)
            ? -4
            : /shopping cart|view cart|checkout|open new account|logout/.test(lowerText)
              ? -3
              : /login|register|search|submit|continue|cart|add to cart/.test(lowerText)
                ? -2
                : 0;
          const withinFormPriority = element.closest("form") ? -1 : 0;
          const surfacePriority = /customer login/i.test(surfaceLabel ?? "") ? 1 : 0;
          const controlPriority =
            element.tagName === "INPUT" ||
            element.tagName === "TEXTAREA" ||
            element.tagName === "SELECT" ||
            element.tagName === "BUTTON"
              ? -1
              : 0;

          return {
            id: `c${index + 1}`,
            text,
            tagName: element.tagName.toLowerCase(),
            role: element.getAttribute("role") || element.tagName.toLowerCase(),
            selector: buildSelector(element),
            placeholder: element.getAttribute("placeholder") || undefined,
            ariaLabel: element.getAttribute("aria-label") || undefined,
            href: element.getAttribute("href") || undefined,
            inputType: element.getAttribute("type") || undefined,
            surfaceLabel,
            viewportState,
            disabled:
              element.hasAttribute("disabled") ||
              element.getAttribute("aria-disabled") === "true",
            selectOptions,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            priority: ctaPriority + withinFormPriority + controlPriority + surfacePriority,
          };
        })
        .filter(Boolean)
        .sort((left, right) => {
          if (!left || !right) {
            return 0;
          }

          if (left.priority !== right.priority) {
            return left.priority - right.priority;
          }

          if (left.viewportState !== right.viewportState) {
            return left.viewportState === "visible"
              ? -1
              : right.viewportState === "visible"
                ? 1
                : left.viewportState === "below_fold"
                  ? -1
                  : 1;
          }

          if (Math.abs(left.y - right.y) > 6) {
            return left.y - right.y;
          }

          return left.x - right.x;
        }) as Array<{
          id: string;
          text: string;
          tagName: string;
          role: string;
          selector?: string;
          placeholder?: string;
          ariaLabel?: string;
          href?: string;
          inputType?: string;
          surfaceLabel?: string;
          viewportState: "visible" | "below_fold" | "above_fold";
          disabled: boolean;
          selectOptions: string[];
          x: number;
          y: number;
          width: number;
          height: number;
          priority: number;
        }>;

      const duplicateCounts = new Map<string, number>();

      return ranked.filter((candidate) => {
        const key = candidate.text.toLowerCase();
        const seen = duplicateCounts.get(key) ?? 0;
        const maxDuplicates = /add to cart|view product/.test(key) ? 1 : 2;

        if (seen >= maxDuplicates) {
          return false;
        }

        duplicateCounts.set(key, seen + 1);
        return true;
      }).slice(0, 24);
    });
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

async function dismissInterruptingSurface(page: Page) {
  if (!page.url().includes("#google_vignette")) {
    return;
  }

  await page.goBack({ waitUntil: "domcontentloaded", timeout: 8_000 }).catch(() => undefined);
  await page.keyboard.press("Escape").catch(() => undefined);
  await sleep(250);
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

async function snapshotPage(page: Page, fallbackUrl: string, explicitFlags: string[] = []): Promise<PageState> {
  const url = page.url() || fallbackUrl;
  const title = await page.title().catch(() => undefined);
  const visibleTargets = (await extractInteractiveCandidates(page)).map((candidate) => candidate.text).slice(0, 40);
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

function candidateLocators(page: Page, candidate: InteractiveCandidate) {
  const candidates: Array<() => Locator> = [];

  if (candidate.selector) {
    candidates.push(() => page.locator(candidate.selector!));
  }

  if (candidate.href) {
    candidates.push(() => page.locator(`a[href="${candidate.href}"]`));
  }

  if (candidate.placeholder) {
    const placeholder = new RegExp(escapeRegExp(candidate.placeholder), "i");
    candidates.push(() => page.getByPlaceholder(placeholder));
  }

  if (candidate.ariaLabel) {
    const ariaLabel = new RegExp(escapeRegExp(candidate.ariaLabel), "i");
    candidates.push(() => page.getByLabel(ariaLabel));
  }

  if (candidate.text) {
    const label = new RegExp(escapeRegExp(candidate.text), "i");

    if (candidate.tagName === "a" || candidate.role === "link") {
      candidates.push(() => page.getByRole("link", { name: label }));
    }

    if (
      candidate.tagName === "button" ||
      candidate.role === "button" ||
      candidate.inputType === "submit" ||
      candidate.inputType === "button"
    ) {
      candidates.push(() => page.getByRole("button", { name: label }));
    }

    if (
      candidate.tagName === "input" ||
      candidate.tagName === "textarea" ||
      candidate.tagName === "select"
    ) {
      candidates.push(() => page.getByLabel(label));
    }

    candidates.push(() => page.getByLabel(label));
    candidates.push(() => page.getByText(label).first());
  }

  return candidates;
}

function resolveCandidate(
  decision: ParsedAgentDecision,
  candidates: InteractiveCandidate[],
) {
  if (decision.nextAction.targetId) {
    const byId = findCandidateByReference(decision.nextAction.targetId, candidates);

    if (byId) {
      return byId;
    }
  }

  if (decision.nextAction.targetText) {
    const lowered = decision.nextAction.targetText.toLowerCase();

    return candidates.find((candidate) => candidate.text.toLowerCase().includes(lowered));
  }

  return undefined;
}

function findCandidateByReference(reference: string, candidates: InteractiveCandidate[]) {
  const lowered = reference.toLowerCase();

  return candidates.find(
    (candidate) =>
      candidate.id === reference ||
      candidate.selector === reference ||
      candidate.text.toLowerCase() === lowered ||
      candidate.text.toLowerCase().includes(lowered) ||
      candidate.placeholder?.toLowerCase() === lowered ||
      candidate.ariaLabel?.toLowerCase() === lowered,
  );
}

function interactionPoint(candidate: InteractiveCandidate) {
  const insetX = Math.min(10, Math.max(candidate.width * 0.15, 3));
  const insetY = Math.min(8, Math.max(candidate.height * 0.2, 3));

  return {
    x: candidate.x + clamp(candidate.width / 2, insetX, candidate.width - insetX),
    y: candidate.y + clamp(candidate.height / 2, insetY, candidate.height - insetY),
  };
}

async function focusCandidateByPoint(page: Page, candidate: InteractiveCandidate) {
  const point = interactionPoint(candidate);
  await page.mouse.move(point.x, point.y, { steps: 6 }).catch(() => undefined);
  await page.mouse.click(point.x, point.y, { delay: 40 });
}

async function pageFingerprint(page: Page) {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const bodyPreview = await page
    .evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 240))
    .catch(() => "");

  return `${url}::${title}::${bodyPreview}`;
}

function candidateLikelyNavigates(candidate: InteractiveCandidate) {
  const text = candidate.text.toLowerCase();

  return (
    candidate.tagName === "a" ||
    candidate.role === "link" ||
    /shopping cart|view cart|view product|login|register|submit search|continue|checkout|logout|open new account/.test(
      text,
    )
  );
}

function visualOnlyExecution(
  strictVisualMode: boolean,
  reason?: string,
): ActionExecutionAssist {
  return {
    strictVisualMode,
    mode: "visual_only",
    domAssisted: false,
    visualAttempted: true,
    reason,
  };
}

function domAssistExecution(
  strictVisualMode: boolean,
  reason?: string,
  mode: "visual_with_dom_assist" | "dom_only" = "visual_with_dom_assist",
): ActionExecutionAssist {
  return {
    strictVisualMode,
    mode,
    domAssisted: true,
    visualAttempted: mode !== "dom_only",
    reason,
  };
}

function noDirectInteractionExecution(strictVisualMode: boolean): ActionExecutionAssist {
  return {
    strictVisualMode,
    mode: "none",
    domAssisted: false,
    visualAttempted: false,
  };
}

function mergeExecutionAssists(
  strictVisualMode: boolean,
  assists: ActionExecutionAssist[],
): ActionExecutionAssist {
  const relevant = assists.filter((assist) => assist.mode !== "none");

  if (relevant.length === 0) {
    return noDirectInteractionExecution(strictVisualMode);
  }

  const mergedReason =
    relevant
      .map((assist) => assist.reason)
      .filter(Boolean)
      .join("; ") || undefined;

  if (relevant.some((assist) => assist.mode === "dom_only")) {
    return domAssistExecution(strictVisualMode, mergedReason, "dom_only");
  }

  if (relevant.some((assist) => assist.domAssisted)) {
    return domAssistExecution(strictVisualMode, mergedReason);
  }

  return visualOnlyExecution(strictVisualMode, mergedReason);
}

class ExecutionAttemptError extends Error {
  execution: ActionExecutionAssist;

  constructor(message: string, execution: ActionExecutionAssist) {
    super(message);
    this.name = "ExecutionAttemptError";
    this.execution = execution;
  }
}

async function clickCandidate(
  page: Page,
  candidate: InteractiveCandidate,
  strictVisualMode: boolean,
) {
  if (candidate.disabled) {
    throw new Error(`Target "${candidate.text}" is disabled.`);
  }

  const shouldVerify = candidateLikelyNavigates(candidate);
  const beforeUrl = page.url();
  const beforeFingerprint = shouldVerify ? await pageFingerprint(page) : "";
  let visualFailureReason = `visual click on "${candidate.text}" was not confirmed`;

  try {
    await focusCandidateByPoint(page, candidate);
    await sleep(250);

    if (
      !shouldVerify ||
      page.url() !== beforeUrl ||
      (await pageFingerprint(page)) !== beforeFingerprint
    ) {
      return visualOnlyExecution(strictVisualMode);
    }
    visualFailureReason = `visual click on "${candidate.text}" did not materially change the page`;
  } catch (error) {
    visualFailureReason = error instanceof Error ? error.message : String(error);
  }

  if (strictVisualMode) {
    throw new ExecutionAttemptError(
      `Strict visual mode blocked DOM fallback after ${visualFailureReason}.`,
      visualOnlyExecution(strictVisualMode, visualFailureReason),
    );
  }

  await clickWithFallback(page, candidate.text, candidateLocators(page, candidate));
  return domAssistExecution(strictVisualMode, visualFailureReason);
}

async function selectCandidateOption(page: Page, candidate: InteractiveCandidate, value: string) {
  const desired = value.trim().toLowerCase();

  for (const buildLocator of candidateLocators(page, candidate)) {
    const locator = buildLocator().first();

    try {
      if ((await locator.count()) === 0) {
        continue;
      }

      const tagName = await locator.evaluate((node) => node.tagName.toLowerCase()).catch(() => "");

      if (tagName !== "select") {
        continue;
      }

      const options = await locator.locator("option").evaluateAll((nodes) =>
        nodes.map((node) => ({
          label: (node.textContent ?? "").replace(/\s+/g, " ").trim(),
          value: (node as HTMLOptionElement).value,
        })),
      );
      const exact =
        options.find((option) => option.label.toLowerCase() === desired) ??
        options.find((option) => option.value.toLowerCase() === desired) ??
        options.find((option) => option.label.toLowerCase().includes(desired));

      if (!exact) {
        continue;
      }

      await locator.selectOption({ value: exact.value });
      return;
    } catch {
      // Try the next locator candidate.
    }
  }

  throw new Error(`Unable to select "${value}" for ${candidate.text}.`);
}

async function fillCandidate(
  page: Page,
  candidate: InteractiveCandidate,
  value: string,
  strictVisualMode: boolean,
) {
  if (candidate.disabled) {
    throw new Error(`Target "${candidate.text}" is disabled.`);
  }

  if (candidate.tagName === "select" || candidate.role === "combobox") {
    let visualFailureReason = `visual select for "${candidate.text}" was not confirmed`;

    try {
      await focusCandidateByPoint(page, candidate);
      await page.keyboard.type(value, { delay: 35 });
      await page.keyboard.press("Enter").catch(() => undefined);
      await sleep(150);

      if (candidate.selector) {
        const selectedText = await page
          .locator(candidate.selector)
          .evaluate((node) => {
            if (!(node instanceof HTMLSelectElement)) {
              return "";
            }

            return node.selectedOptions[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "";
          })
          .catch(() => "");

        if (selectedText && selectedText.toLowerCase().includes(value.trim().toLowerCase())) {
          return visualOnlyExecution(strictVisualMode);
        }
      }
      visualFailureReason = `visual select for "${candidate.text}" did not set "${value}"`;
    } catch (error) {
      visualFailureReason = error instanceof Error ? error.message : String(error);
    }

    if (strictVisualMode) {
      throw new ExecutionAttemptError(
        `Strict visual mode blocked DOM fallback after ${visualFailureReason}.`,
        visualOnlyExecution(strictVisualMode, visualFailureReason),
      );
    }

    await selectCandidateOption(page, candidate, value);
    return domAssistExecution(strictVisualMode, visualFailureReason);
  }

  let visualFailureReason = `visual typing into "${candidate.text}" was not confirmed`;

  try {
    await focusCandidateByPoint(page, candidate);
    await page.keyboard.press("Control+A").catch(() => undefined);
    await page.keyboard.press("Backspace").catch(() => undefined);
    await page.keyboard.type(value, { delay: 28 });

    if (candidate.selector) {
      const typedValue = await page.locator(candidate.selector).inputValue().catch(() => "");

      if (typedValue === value) {
        return visualOnlyExecution(strictVisualMode);
      }
    } else {
      return visualOnlyExecution(strictVisualMode);
    }
    visualFailureReason = `visual typing into "${candidate.text}" did not match the requested value`;
  } catch (error) {
    visualFailureReason = error instanceof Error ? error.message : String(error);
  }

  if (strictVisualMode) {
    throw new ExecutionAttemptError(
      `Strict visual mode blocked DOM fallback after ${visualFailureReason}.`,
      visualOnlyExecution(strictVisualMode, visualFailureReason),
    );
  }

  for (const buildLocator of candidateLocators(page, candidate)) {
    const locator = buildLocator().first();

    try {
      if ((await locator.count()) === 0) {
        continue;
      }

      if (await locator.isEditable().catch(() => false)) {
        await locator.fill(value, { timeout: 8_000 });
        return domAssistExecution(strictVisualMode, visualFailureReason);
      }

      if (await locator.isVisible().catch(() => false)) {
        await locator.click({ timeout: 8_000 });
        await page.keyboard.press("Control+A").catch(() => undefined);
        await page.keyboard.type(value, { delay: 28 });
        return domAssistExecution(strictVisualMode, visualFailureReason);
      }
    } catch {
      // Fall through to the next locator or coordinate fallback.
    }
  }

  throw new ExecutionAttemptError(
    `Unable to fill "${candidate.text}" after DOM assist. ${visualFailureReason}`,
    domAssistExecution(strictVisualMode, visualFailureReason),
  );
}

async function fillFieldSet(
  page: Page,
  decision: ParsedAgentDecision,
  candidates: InteractiveCandidate[],
  strictVisualMode: boolean,
) {
  const fields = decision.nextAction.fields ?? [];

  if (fields.length === 0) {
    const targetCandidate = resolveCandidate(decision, candidates);

    if (!targetCandidate) {
      throw new Error("Model selected fill_form without a valid target.");
    }

    const fallbackValue = decision.nextAction.inputText?.trim();

    if (!fallbackValue) {
      throw new Error("Model selected fill_form without values.");
    }

    const execution = await fillCandidate(page, targetCandidate, fallbackValue, strictVisualMode);
    return {
      filledTargets: [targetCandidate.text],
      execution,
    };
  }

  const filledTargets: string[] = [];
  const executions: ActionExecutionAssist[] = [];

  for (const field of fields) {
    const targetCandidate = findCandidateByReference(field.targetId, candidates);

    if (!targetCandidate) {
      throw new Error(`Model selected unknown field ${field.targetId}.`);
    }

    executions.push(await fillCandidate(page, targetCandidate, field.value, strictVisualMode));
    filledTargets.push(targetCandidate.text);
  }

  return {
    filledTargets,
    execution: mergeExecutionAssists(strictVisualMode, executions),
  };
}

function stepIntent(decisionKind: Decision["kind"]): "load" | "scan" | "type" | "click" {
  if (decisionKind === "type") {
    return "type";
  }

  if (decisionKind === "scroll" || decisionKind === "wait") {
    return "scan";
  }

  return "click";
}

function scenarioCompleted(scenario: DemoScenarioDefinition, finalPage: PageState) {
  return scenario.id === "saucedemo"
    ? /cart/.test(finalPage.url)
    : scenario.id === "automationexercise"
      ? /automationexercise\.com\/view_cart/.test(finalPage.url)
      : scenario.id === "theinternet"
        ? /the-internet\.herokuapp\.com\/secure/.test(finalPage.url) ||
          finalPage.visibleTargets.some((target) => /logout/i.test(target))
        : scenario.id === "expandtesting"
          ? /practice\.expandtesting\.com\/form-confirmation/.test(finalPage.url)
          : finalPage.visibleTargets.some((target) => /open new account|accounts overview|log out/i.test(target));
}

async function captureViewportDataUrl(page: Page) {
  const buffer = await page.screenshot({
    fullPage: false,
    type: "jpeg",
    quality: 45,
    scale: "css",
  });

  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

function normalizeModelDecision(
  modelDecision: ParsedAgentDecision,
  targetCandidate: InteractiveCandidate | undefined,
): Decision {
  const target = targetCandidate?.text ?? modelDecision.nextAction.targetText ?? undefined;
  const value =
    modelDecision.nextAction.kind === "fill_form"
      ? modelDecision.nextAction.fields?.map((field) => field.value).join(", ") ?? undefined
      : modelDecision.nextAction.inputText ?? undefined;

  return {
    kind: modelDecision.nextAction.kind === "fill_form" ? "type" : modelDecision.nextAction.kind,
    rationale: `${modelDecision.pageAssessment} ${modelDecision.nextAction.rationale}`.trim(),
    target,
    value,
  };
}

function buildDecisionGuardrailNotes(
  scenario: DemoScenarioDefinition,
  pageState: PageState,
  steps: AgentStepRecord[],
  decision: ParsedAgentDecision,
  targetCandidate: InteractiveCandidate | undefined,
) {
  const notes: string[] = [];
  const proposedTarget = (
    targetCandidate?.text ??
    decision.nextAction.targetText ??
    decision.nextAction.targetId ??
    decision.nextAction.kind
  ).toLowerCase();
  const lastStep = steps.at(-1);

  if (decision.nextAction.kind === "stop" && !scenarioCompleted(scenario, pageState)) {
    notes.push("Do not stop yet. The completion boundary is not visible on the current page.");
  }

  if (
    lastStep &&
    lastStep.observation.page.url === pageState.url &&
    lastStep.decision.target?.toLowerCase() === proposedTarget &&
    lastStep.decision.kind === decision.nextAction.kind
  ) {
    notes.push(`The previous ${decision.nextAction.kind} on "${proposedTarget}" did not materially change the page. Choose a different action.`);
  }

  const repeatedAddToCartClicks = steps.filter(
    (step) =>
      step.observation.page.url === pageState.url &&
      step.decision.kind === "click" &&
      /add to cart/i.test(step.decision.target ?? ""),
  ).length;

  if (decision.nextAction.kind === "click" && /add to cart/i.test(proposedTarget) && repeatedAddToCartClicks >= 1) {
    notes.push("Do not repeat Add to cart on the same unchanged page. Either reveal View Product, move toward Cart, or choose another safe action.");
  }

  return notes;
}

async function executeModelDecision(
  page: Page,
  decision: ParsedAgentDecision,
  candidates: InteractiveCandidate[],
  strictVisualMode: boolean,
) {
  const targetCandidate = resolveCandidate(decision, candidates);

  if (decision.nextAction.kind === "click") {
    if (!targetCandidate) {
      throw new Error("Model selected click without a valid target candidate.");
    }

    const execution = await clickCandidate(page, targetCandidate, strictVisualMode);
    return {
      kind: "click" as const,
      ok: true,
      details: decision.nextAction.rationale,
      execution,
    };
  }

  if (decision.nextAction.kind === "fill_form") {
    const { filledTargets, execution } = await fillFieldSet(page, decision, candidates, strictVisualMode);

    return {
      kind: "type" as const,
      ok: true,
      details: `filled ${filledTargets.join(", ")}`,
      execution,
    };
  }

  if (decision.nextAction.kind === "scroll") {
    await page.mouse.wheel(0, decision.nextAction.scrollDirection === "up" ? -320 : 320).catch(() => undefined);
    return {
      kind: "scroll" as const,
      ok: true,
      details: decision.nextAction.rationale,
      execution: visualOnlyExecution(strictVisualMode),
    };
  }

  if (decision.nextAction.kind === "wait") {
    return {
      kind: "wait" as const,
      ok: true,
      details: decision.nextAction.rationale,
      execution: noDirectInteractionExecution(strictVisualMode),
    };
  }

  if (decision.nextAction.kind === "retry") {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
    return {
      kind: "retry" as const,
      ok: true,
      details: decision.nextAction.rationale,
      execution: noDirectInteractionExecution(strictVisualMode),
    };
  }

  if (decision.nextAction.kind === "stop") {
    return {
      kind: "stop" as const,
      ok: true,
      details: decision.nextAction.rationale,
      execution: noDirectInteractionExecution(strictVisualMode),
    };
  }

  return {
    kind: "escalate" as const,
    ok: false,
    details: decision.nextAction.rationale,
    execution: noDirectInteractionExecution(strictVisualMode),
  };
}

function actionKindForDecision(
  kind: ParsedAgentDecision["nextAction"]["kind"],
): ActionResult["kind"] {
  if (kind === "fill_form") {
    return "type";
  }

  return kind;
}

function buildEmotion(
  persona: AgentPersona,
  current: { frustration: number; confidence: number },
  decision: Decision,
  action: ActionResult,
  page: PageState,
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

  const targetDensity = clamp((page.visibleTargets.length - 4) / 14, 0, 1);
  const complexityPenalty =
    targetDensity * (0.012 + persona.attentionBias * 0.025 + (1 - persona.skillLevel) * 0.015);
  const loadPenalty =
    page.loadState === "loading"
      ? 0.035
      : page.loadState === "interactive"
        ? 0.018
        : page.loadState === "error"
          ? 0.08
          : 0;
  const targetAmbiguityPenalty = page.visibleTargets.length === 0 ? 0.03 : 0;
  frustration += complexityPenalty + loadPenalty + targetAmbiguityPenalty;
  confidence -= complexityPenalty * 0.35 + loadPenalty * 0.5;

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
  const emotion = buildEmotion(input.persona, state, decision, action, pageState, pageState.errorFlags);
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

async function runModelDrivenFlow(
  page: Page,
  scenario: DemoScenarioDefinition,
  input: AgentRunInput,
  startedAt: string,
  agentId: string,
  steps: AgentStepRecord[],
  state: { frustration: number; confidence: number },
  callbacks: LiveSwarmCallbacks,
) {
  await gotoWithRetry(page, input.config.targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await sleep(paceMs(input.persona, "load"));
  const playbook = buildScenarioPlaybook(scenario, input.persona, input.config.seed ?? agentId);

  while (steps.length < input.config.maxSteps) {
    await dismissInterruptingSurface(page);
    await assertUsableSurface(page);
    const pageState = await snapshotPage(page, input.config.targetUrl);
    const candidates = await extractInteractiveCandidates(page);
    const screenshotDataUrl = await captureViewportDataUrl(page);
    const decisionContext = {
      scenarioName: scenario.name,
      goal: input.config.goal,
      strictVisualMode: input.config.strictVisualMode ?? false,
      persona: input.persona,
      playbook,
      step: steps.length,
      maxSteps: input.config.maxSteps,
      recentHistory: steps.slice(-4).map((step) => ({
        action: `${step.decision.kind} -> ${step.action.kind}`,
        detail: step.action.details,
        frustration: step.frustration,
          confidence: step.confidence,
        })),
      validatorNotes: [],
      observation: {
        screenshotDataUrl,
        url: pageState.url,
        title: pageState.title,
        loadState: pageState.loadState,
        visibleTargets: pageState.visibleTargets,
        errorFlags: pageState.errorFlags,
        candidates: candidates.map<ObservedCandidate>((candidate) => ({
          id: candidate.id,
          text: candidate.text,
          tagName: candidate.tagName,
          inputType: candidate.inputType,
          role: candidate.role,
          placeholder: candidate.placeholder,
          ariaLabel: candidate.ariaLabel,
          href: candidate.href,
          surfaceLabel: candidate.surfaceLabel,
          viewportState: candidate.viewportState,
          disabled: candidate.disabled,
          selectOptions: candidate.selectOptions,
          x: Math.round(candidate.x * 10) / 10,
          y: Math.round(candidate.y * 10) / 10,
          width: Math.round(candidate.width * 10) / 10,
          height: Math.round(candidate.height * 10) / 10,
        })),
      },
    } satisfies Parameters<typeof decideNextAction>[0];

    let { decision: modelDecision } = await decideNextAction(decisionContext);
    let targetCandidate = resolveCandidate(modelDecision, candidates);
    const guardrailNotes = buildDecisionGuardrailNotes(
      scenario,
      pageState,
      steps,
      modelDecision,
      targetCandidate,
    );

    if (guardrailNotes.length > 0) {
      ({ decision: modelDecision } = await decideNextAction({
        ...decisionContext,
        validatorNotes: guardrailNotes,
      }));
      targetCandidate = resolveCandidate(modelDecision, candidates);
    }

    const decision = normalizeModelDecision(modelDecision, targetCandidate);
    let action: ActionResult;

    try {
      action = await executeModelDecision(
        page,
        modelDecision,
        candidates,
        input.config.strictVisualMode ?? false,
      );
    } catch (error) {
      action = {
        kind: actionKindForDecision(modelDecision.nextAction.kind),
        ok: false,
        details: error instanceof Error ? error.message : "Execution failed unexpectedly.",
        execution:
          error instanceof ExecutionAttemptError
            ? error.execution
            : noDirectInteractionExecution(input.config.strictVisualMode ?? false),
      };
    }

    await sleep(paceMs(input.persona, stepIntent(decision.kind)));
    const nextPageState = await appendStep(
      page,
      input,
      startedAt,
      agentId,
      steps,
      state,
      decision,
      action,
      `${modelDecision.pageAssessment} | ${modelDecision.nextAction.rationale}`,
      callbacks,
    );

    if (
      !action.ok ||
      decision.kind === "stop" ||
      decision.kind === "escalate" ||
      scenarioCompleted(scenario, nextPageState)
    ) {
      return;
    }
  }
}

function shouldUseBrowserbaseExecution() {
  return env.executionMode === "hybrid" && canUseBrowserbase();
}

async function createLocalAgentRuntime(
  browser: Browser,
  persona: AgentPersona,
): Promise<AgentRuntimeHandle> {
  const context = await browser.newContext({
    viewport: viewportForPersona(persona),
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close().catch(() => undefined);
    },
  };
}

async function createBrowserbaseAgentRuntime(
  scenario: DemoScenarioDefinition,
  input: AgentRunInput,
): Promise<AgentRuntimeHandle> {
  if (!env.browserbaseApiKey || !env.browserbaseProjectId) {
    throw new Error("Browserbase credentials are missing.");
  }

  const client = new Browserbase({
    apiKey: env.browserbaseApiKey,
    timeout: 30_000,
    maxRetries: 2,
  });
  const viewport = viewportForPersona(input.persona);
  const session = await client.sessions.create({
    projectId: env.browserbaseProjectId,
    keepAlive: false,
    timeout: 15 * 60,
    region: "us-west-2",
    browserSettings: {
      recordSession: true,
      logSession: true,
      solveCaptchas: true,
      blockAds: false,
      os: "linux",
      viewport,
    },
    userMetadata: {
      runId: input.config.seed ?? input.agentId ?? "unknown-run",
      agentId: input.agentId ?? "anonymous-agent",
      scenario: scenario.id,
      persona: input.persona.archetype,
    },
  });
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context =
    browser.contexts()[0] ??
    (await browser.newContext({
      viewport,
      locale: "en-US",
      timezoneId: "America/Los_Angeles",
    }));
  const page = context.pages()[0] ?? (await context.newPage());

  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      await client.sessions
        .update(session.id, {
          projectId: env.browserbaseProjectId,
          status: "REQUEST_RELEASE",
        })
        .catch(() => undefined);
    },
  };
}

async function runLiveAgent(
  scenario: DemoScenarioDefinition,
  input: AgentRunInput,
  callbacks: LiveSwarmCallbacks,
  sharedBrowser?: Browser,
) {
  const agentId = input.agentId ?? buildAgentId(input.persona, 0);
  const startedAt = new Date().toISOString();
  const steps: AgentStepRecord[] = [];
  const seed = input.config.seed ?? `${scenario.id}:${agentId}`;
  const state = {
    frustration: clamp(
      initialFrustration(input.persona) + seededOffset(seed, "frustration", 0.025),
      0,
      1,
    ),
    confidence: clamp(
      initialConfidence(input.persona) + seededOffset(seed, "confidence", 0.03),
      0,
      1,
    ),
  };
  const runtime = shouldUseBrowserbaseExecution()
    ? await createBrowserbaseAgentRuntime(scenario, input)
    : sharedBrowser
      ? await createLocalAgentRuntime(sharedBrowser, input.persona)
      : await createLocalAgentRuntime(await chromium.launch({ headless: true }), input.persona);
  const { page } = runtime;
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
    await runModelDrivenFlow(page, scenario, input, startedAt, agentId, steps, state, callbacks);

    finalPage = await snapshotPage(page, input.config.targetUrl);
    const completed = scenarioCompleted(scenario, finalPage);

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
      execution: noDirectInteractionExecution(input.config.strictVisualMode ?? false),
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
    await runtime.close().catch(() => undefined);
  }
}

export async function runLiveSwarm(options: LiveSwarmOptions) {
  const localBrowser = shouldUseBrowserbaseExecution()
    ? undefined
    : await chromium.launch({
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
          strictVisualMode: options.strictVisualMode,
        },
      };
      const result = await runLiveAgent(options.scenario, input, options, localBrowser);
      await options.onAgentComplete?.(result);
      return result;
    });
  } finally {
    await localBrowser?.close().catch(() => undefined);
  }
}
