export type DemoScenarioId =
  | "saucedemo"
  | "automationexercise"
  | "theinternet"
  | "expandtesting"
  | "parabank";

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
    description: "Stable public commerce demo used as the fastest baseline for login comprehension and cart CTA clarity.",
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
  automationexercise: {
    id: "automationexercise",
    name: "Automation Exercise search-to-cart probe",
    siteLabel: "Automation Exercise",
    targetUrl: "https://automationexercise.com/products",
    goal: "Search for Blue Top, inspect the product detail, and add it to cart.",
    description: "Public automation-practice storefront with real search, product detail, and cart surfaces but without aggressive bot controls.",
    frames: [
      {
        id: "catalog",
        label: "Catalog landing",
        url: "https://automationexercise.com/products",
        targets: ["Search Product", "View Product", "Add to cart", "Cart"],
        errorBias: 0.14,
      },
      {
        id: "search-results",
        label: "Search results",
        url: "https://automationexercise.com/products?search=",
        targets: ["Searched Products", "Blue Top", "View Product"],
        errorBias: 0.2,
      },
      {
        id: "product-detail",
        label: "Product detail",
        url: "https://automationexercise.com/product_details/",
        targets: ["Blue Top", "Add to cart", "Quantity"],
        errorBias: 0.22,
      },
      {
        id: "cart-review",
        label: "Cart review",
        url: "https://automationexercise.com/view_cart",
        targets: ["Proceed To Checkout", "Blue Top", "Continue On Cart"],
        errorBias: 0.12,
      },
    ],
  },
  theinternet: {
    id: "theinternet",
    name: "The Internet secure-login probe",
    siteLabel: "The Internet",
    targetUrl: "https://the-internet.herokuapp.com/",
    goal: "Open the Form Authentication module and sign into the secure area.",
    description: "Minimal public auth practice site that isolates information scent, form clarity, and secure-area confirmation.",
    frames: [
      {
        id: "directory",
        label: "Module directory",
        url: "https://the-internet.herokuapp.com/",
        targets: ["Form Authentication", "Dynamic Controls", "Dropdown"],
        errorBias: 0.08,
      },
      {
        id: "auth-form",
        label: "Auth form",
        url: "https://the-internet.herokuapp.com/login",
        targets: ["Username", "Password", "Login"],
        errorBias: 0.18,
      },
      {
        id: "secure-area",
        label: "Secure area",
        url: "https://the-internet.herokuapp.com/secure",
        targets: ["You logged into a secure area!", "Logout"],
        errorBias: 0.06,
      },
    ],
  },
  expandtesting: {
    id: "expandtesting",
    name: "Expand Testing form-validation probe",
    siteLabel: "Expand Testing",
    targetUrl: "https://practice.expandtesting.com/form-validation",
    goal: "Complete the validation form with valid inputs and reach the confirmation page.",
    description: "Generic public form scenario with text, telephone, date, and select controls that demonstrates non-commerce interaction coverage.",
    frames: [
      {
        id: "validation-form",
        label: "Validation form",
        url: "https://practice.expandtesting.com/form-validation",
        targets: ["Contact Name", "Contact number", "PickUp Date", "Payment Method", "Register"],
        errorBias: 0.16,
      },
      {
        id: "confirmation",
        label: "Confirmation",
        url: "https://practice.expandtesting.com/form-confirmation",
        targets: ["Thank you for validating your ticket"],
        errorBias: 0.05,
      },
    ],
  },
  parabank: {
    id: "parabank",
    name: "ParaBank registration probe",
    siteLabel: "ParaBank",
    targetUrl: "https://parabank.parasoft.com/parabank/register.htm",
    goal: "Create a new demo banking account and reach the signed-in dashboard.",
    description: "Finance-style onboarding flow with a denser registration form and a post-submit account-services surface.",
    frames: [
      {
        id: "registration-form",
        label: "Registration form",
        url: "https://parabank.parasoft.com/parabank/register.htm",
        targets: ["First Name", "Last Name", "Username", "Password", "Register"],
        errorBias: 0.24,
      },
      {
        id: "account-services",
        label: "Account services",
        url: "https://parabank.parasoft.com/parabank/register.htm",
        targets: ["Open New Account", "Accounts Overview", "Log Out"],
        errorBias: 0.07,
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
