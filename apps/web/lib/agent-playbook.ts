import type { AgentPersona } from "@chaos-swarm/agent-core";
import type { DemoScenarioDefinition } from "./scenarios";

export interface ScenarioPlaybook {
  mission: string;
  allowedValues: Record<string, string>;
  completionHints: string[];
  safetyRules: string[];
}

function buildSeedSuffix(seed: string) {
  return seed.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase() || "agent001";
}

function personaDirective(persona: AgentPersona) {
  if (persona.archetype === "Speedrunner") {
    return "Move directly toward the goal, prefer the shortest visible path, and avoid unnecessary scanning.";
  }

  if (persona.archetype === "Novice") {
    return "Read the page more carefully, tolerate a little ambiguity, and be willing to scan before committing.";
  }

  return "You are impatient, react strongly to friction, and prefer forceful progress over careful reading.";
}

export function buildScenarioPlaybook(
  scenario: DemoScenarioDefinition,
  persona: AgentPersona,
  seed: string,
): ScenarioPlaybook {
  const suffix = buildSeedSuffix(seed);
  const commonRules = [
    "Only choose actions that can be grounded in the provided candidate list.",
    "Do not invent hidden controls, extra pages, or credentials outside the provided allowed values.",
    "If the goal is already satisfied, choose stop instead of exploring unrelated UI.",
    "If the page is clearly blocked or no safe progress is possible, choose escalate.",
  ];

  if (scenario.id === "saucedemo") {
    return {
      mission: `${personaDirective(persona)} Log in, add a visible inventory item to cart, and end on the cart review page.`,
      allowedValues: {
        username: "standard_user",
        password: "secret_sauce",
      },
      completionHints: [
        "The task is complete once the cart page is visible.",
        "The shopping cart link and cart review page are the success boundary.",
      ],
      safetyRules: [
        ...commonRules,
        "After one item is added, stop clicking Add to cart and move to the shopping cart surface.",
      ],
    };
  }

  if (scenario.id === "automationexercise") {
    return {
      mission: `${personaDirective(persona)} Search for the Blue Top product, open its detail page, add it to cart, and end on the cart review page.`,
      allowedValues: {
        search_query: "Blue Top",
      },
      completionHints: [
        "The task is complete when the view_cart page is visible.",
        "Using the site search is the intended path to the Blue Top detail page.",
      ],
      safetyRules: [
        ...commonRules,
        "Use the Search Product box and submit the Blue Top query before taking any product action.",
        "Inspect the product detail before finishing the add-to-cart task whenever a View Product path is visible.",
        "If Blue Top is visible in the catalog but View Product is not yet visible, scroll to reveal View Product instead of using Add to cart from the grid.",
        "Do not use Add to cart from the broad catalog grid before the Blue Top search has been submitted.",
        "After the product is added, move to View Cart or Cart instead of repeating Add to cart.",
      ],
    };
  }

  if (scenario.id === "theinternet") {
    return {
      mission: `${personaDirective(persona)} Enter the Form Authentication module, sign in, and end on the secure area page.`,
      allowedValues: {
        username: "tomsmith",
        password: "SuperSecretPassword!",
      },
      completionHints: [
        "The task is complete once the secure area or Logout control is visible.",
        "The correct module name is Form Authentication.",
      ],
      safetyRules: [...commonRules, "Do not substitute Basic Auth, Digest Authentication, or any other auth-related module for Form Authentication."],
    };
  }

  if (scenario.id === "expandtesting") {
    return {
      mission: `${personaDirective(persona)} Fill the validation form with valid data and submit it successfully.`,
      allowedValues: {
        contact_name: "Chaos Swarm",
        contact_number: "012-3456789",
        pickup_date: "2026-04-15",
        payment_method: "card",
      },
      completionHints: [
        "The task is complete when the form confirmation page is visible.",
        "All required fields should be valid before submitting.",
      ],
      safetyRules: [
        ...commonRules,
        "A filled form alone is not completion; submit Register and observe the confirmation page.",
      ],
    };
  }

  return {
    mission: `${personaDirective(persona)} Complete the ParaBank registration flow and end on the signed-in account services dashboard.`,
    allowedValues: {
      first_name: "Chaos",
      last_name: "Swarm",
      street: "1 Market St",
      city: "San Francisco",
      state: "CA",
      zip_code: "94105",
      phone_number: "4155550101",
      ssn: suffix.padStart(8, "0").slice(0, 8),
      username: `chaosswarm${suffix}`,
      password: "SuperSecret123!",
      repeated_password: "SuperSecret123!",
    },
    completionHints: [
      "The task is complete once account-services links such as Open New Account, Accounts Overview, or Log Out are visible.",
      "A unique username is required for registration.",
    ],
    safetyRules: [
      ...commonRules,
      "Ignore the Customer Login sidebar until registration succeeds.",
      "Prefer the main registration surface labeled Signing up is easy! over any smaller login widget.",
    ],
  };
}
