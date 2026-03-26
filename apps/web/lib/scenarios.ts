export type DemoScenarioId = "saucedemo" | "magento";

export interface DemoScenarioFrame {
  id: string;
  label: string;
  url: string;
  targets: string[];
  errorBias: number;
}

export interface DemoScenarioDefinition {
  id: DemoScenarioId;
  name: string;
  siteLabel: string;
  targetUrl: string;
  goal: string;
  description: string;
  frames: DemoScenarioFrame[];
}

export const scenarioCatalog: Record<DemoScenarioId, DemoScenarioDefinition> = {
  saucedemo: {
    id: "saucedemo",
    name: "SauceDemo checkout probe",
    siteLabel: "SauceDemo",
    targetUrl: "https://www.saucedemo.com/",
    goal: "Log in and add a popular inventory item to cart.",
    description: "Stable public commerce demo used to validate login comprehension and inventory CTA clarity.",
    frames: [
      {
        id: "login",
        label: "Credential gate",
        url: "https://www.saucedemo.com/",
        targets: ["standard_user", "password", "Login", "Accepted usernames are visible"],
        errorBias: 0.12,
      },
      {
        id: "inventory",
        label: "Inventory scan",
        url: "https://www.saucedemo.com/inventory.html",
        targets: ["Sauce Labs Backpack", "Add to cart", "Filter", "Shopping Cart"],
        errorBias: 0.18,
      },
      {
        id: "cart",
        label: "Cart review",
        url: "https://www.saucedemo.com/cart.html",
        targets: ["Checkout", "Continue Shopping", "Remove"],
        errorBias: 0.08,
      },
    ],
  },
  magento: {
    id: "magento",
    name: "Magento search-to-cart probe",
    siteLabel: "Magento Software Testing Board",
    targetUrl: "https://magento.softwaretestingboard.com/",
    goal: "Search for a product, choose an option, and add it to cart.",
    description: "Richer commerce surface with denser hierarchy and more option-selection friction.",
    frames: [
      {
        id: "search",
        label: "Search entry",
        url: "https://magento.softwaretestingboard.com/",
        targets: ["Search entire store here...", "Sign In", "Create an Account"],
        errorBias: 0.14,
      },
      {
        id: "results",
        label: "Results grid",
        url: "https://magento.softwaretestingboard.com/catalogsearch/result/",
        targets: ["Radiant Tee", "Sort By", "Filter", "Add to Wish List"],
        errorBias: 0.26,
      },
      {
        id: "options",
        label: "Product options",
        url: "https://magento.softwaretestingboard.com/radiant-tee.html",
        targets: ["Size", "Color", "Add to Cart", "Quantity"],
        errorBias: 0.33,
      },
      {
        id: "confirmation",
        label: "Cart confirmation",
        url: "https://magento.softwaretestingboard.com/checkout/cart/",
        targets: ["Proceed to Checkout", "Update Shopping Cart"],
        errorBias: 0.12,
      },
    ],
  },
};

export function listScenarios() {
  return Object.values(scenarioCatalog);
}

export function getScenario(id: DemoScenarioId) {
  return scenarioCatalog[id];
}

