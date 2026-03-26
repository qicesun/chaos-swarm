export type DemoScenarioId = string;

export interface DemoScenarioFrame {
  id: string;
  label: string;
  url: string;
  targets: string[];
  errorBias: number;
  description?: string;
}

export interface DemoScenarioDefinition {
  id: DemoScenarioId;
  name: string;
  siteLabel: string;
  targetUrl: string;
  domainAllowlist: string[];
  goal: string;
  description: string;
  successDefinition: string;
  recommendedMaxSteps: number;
  minimumMaxSteps: number;
  inputSeeds: Record<string, string>;
  frames: DemoScenarioFrame[];
  aiHints?: {
    completionCues?: string[];
    decoyCues?: string[];
    preferredStrategies?: string[];
  };
}

export const scenarioCatalog: Record<string, DemoScenarioDefinition> = {
  saucedemo: {
    id: "saucedemo",
    name: "SauceDemo checkout probe",
    siteLabel: "SauceDemo",
    targetUrl: "https://www.saucedemo.com/",
    domainAllowlist: ["www.saucedemo.com", "saucedemo.com"],
    goal: "Log in and add a popular inventory item to cart.",
    description: "Stable public commerce demo used as the fastest baseline for login comprehension and cart CTA clarity.",
    successDefinition: "The goal is complete only when the cart page is open and the chosen item is visibly inside the cart review surface.",
    recommendedMaxSteps: 6,
    minimumMaxSteps: 6,
    inputSeeds: {
      username: "standard_user",
      password: "secret_sauce",
    },
    frames: [
      {
        id: "login",
        label: "Credential gate",
        url: "https://www.saucedemo.com/",
        targets: ["standard_user", "password", "Login", "Accepted usernames are visible"],
        errorBias: 0.12,
        description: "The entry page with visible demo credentials and the primary Login button.",
      },
      {
        id: "inventory",
        label: "Inventory scan",
        url: "https://www.saucedemo.com/inventory.html",
        targets: ["Sauce Labs Backpack", "Add to cart", "Filter", "Shopping Cart"],
        errorBias: 0.18,
        description: "The inventory list where the agent should choose a plausible product and move toward cart intent.",
      },
      {
        id: "cart",
        label: "Cart review",
        url: "https://www.saucedemo.com/cart.html",
        targets: ["Checkout", "Continue Shopping", "Remove"],
        errorBias: 0.08,
        description: "The cart review page showing the selected item and cart controls.",
      },
    ],
    aiHints: {
      completionCues: ["Cart page is open", "selected item appears in cart list", "Checkout is visible"],
      decoyCues: ["sorting filter", "burger menu", "footer links"],
      preferredStrategies: ["use the visible accepted credentials", "move from inventory to cart instead of wandering"],
    },
  },
  automationexercise: {
    id: "automationexercise",
    name: "Automation Exercise search-to-cart probe",
    siteLabel: "Automation Exercise",
    targetUrl: "https://automationexercise.com/products",
    domainAllowlist: ["automationexercise.com", "www.automationexercise.com"],
    goal: "Search for Blue Top, inspect the product detail, and add it to cart.",
    description: "Public automation-practice storefront with real search, product detail, and cart surfaces but without aggressive bot controls.",
    successDefinition: "The goal is complete only when the cart view is open and Blue Top is visibly present in the cart context.",
    recommendedMaxSteps: 6,
    minimumMaxSteps: 6,
    inputSeeds: {
      search_query: "Blue Top",
    },
    frames: [
      {
        id: "catalog",
        label: "Catalog landing",
        url: "https://automationexercise.com/products",
        targets: ["Search Product", "View Product", "Add to cart", "Cart"],
        errorBias: 0.14,
        description: "The product catalog and search surface.",
      },
      {
        id: "search-results",
        label: "Search results",
        url: "https://automationexercise.com/products?search=",
        targets: ["Searched Products", "Blue Top", "View Product"],
        errorBias: 0.2,
        description: "Search results narrowed to the requested product.",
      },
      {
        id: "product-detail",
        label: "Product detail",
        url: "https://automationexercise.com/product_details/",
        targets: ["Blue Top", "Add to cart", "Quantity"],
        errorBias: 0.22,
        description: "The product detail page for the searched product.",
      },
      {
        id: "cart-review",
        label: "Cart review",
        url: "https://automationexercise.com/view_cart",
        targets: ["Proceed To Checkout", "Blue Top", "Continue On Cart"],
        errorBias: 0.12,
        description: "The cart surface confirming the chosen item.",
      },
    ],
    aiHints: {
      completionCues: ["View Cart or cart page is open", "Blue Top appears in cart"],
      decoyCues: ["recommended items", "subscription form", "footer links"],
      preferredStrategies: ["search first", "confirm the product detail before cart", "move toward cart after add-to-cart succeeds"],
    },
  },
  theinternet: {
    id: "theinternet",
    name: "The Internet secure-login probe",
    siteLabel: "The Internet",
    targetUrl: "https://the-internet.herokuapp.com/",
    domainAllowlist: ["the-internet.herokuapp.com"],
    goal: "Open the Form Authentication module and sign into the secure area.",
    description: "Minimal public auth practice site that isolates information scent, form clarity, and secure-area confirmation.",
    successDefinition: "The goal is complete only when the secure area is open and the page visibly confirms a successful login with a Logout control.",
    recommendedMaxSteps: 5,
    minimumMaxSteps: 5,
    inputSeeds: {
      username: "tomsmith",
      password: "SuperSecretPassword!",
    },
    frames: [
      {
        id: "directory",
        label: "Module directory",
        url: "https://the-internet.herokuapp.com/",
        targets: ["Form Authentication", "Dynamic Controls", "Dropdown"],
        errorBias: 0.08,
        description: "The directory of practice modules.",
      },
      {
        id: "auth-form",
        label: "Auth form",
        url: "https://the-internet.herokuapp.com/login",
        targets: ["Username", "Password", "Login"],
        errorBias: 0.18,
        description: "The sign-in form for Form Authentication.",
      },
      {
        id: "secure-area",
        label: "Secure area",
        url: "https://the-internet.herokuapp.com/secure",
        targets: ["You logged into a secure area!", "Logout"],
        errorBias: 0.06,
        description: "The logged-in secure area confirming success.",
      },
    ],
    aiHints: {
      completionCues: ["You logged into a secure area!", "Logout is visible"],
      decoyCues: ["other modules on the directory page"],
      preferredStrategies: ["open Form Authentication first", "then use the supplied credentials", "treat secure area confirmation as completion"],
    },
  },
  expandtesting: {
    id: "expandtesting",
    name: "Expand Testing form-validation probe",
    siteLabel: "Expand Testing",
    targetUrl: "https://practice.expandtesting.com/form-validation",
    domainAllowlist: ["practice.expandtesting.com"],
    goal: "Complete the validation form with valid inputs and reach the confirmation page.",
    description: "Generic public form scenario with text, telephone, date, and select controls that demonstrates non-commerce interaction coverage.",
    successDefinition: "The goal is complete only when the confirmation page is open and the page clearly thanks or confirms the submitted form.",
    recommendedMaxSteps: 4,
    minimumMaxSteps: 4,
    inputSeeds: {
      contact_name: "Chaos Swarm",
      contact_number: "012-3456789",
      pickup_date: "2026-04-15",
      payment_method: "card",
    },
    frames: [
      {
        id: "validation-form",
        label: "Validation form",
        url: "https://practice.expandtesting.com/form-validation",
        targets: ["Contact Name", "Contact number", "PickUp Date", "Payment Method", "Register"],
        errorBias: 0.16,
        description: "The main validation form requiring several fields and a submit action.",
      },
      {
        id: "confirmation",
        label: "Confirmation",
        url: "https://practice.expandtesting.com/form-confirmation",
        targets: ["Thank you for validating your ticket"],
        errorBias: 0.05,
        description: "The confirmation page shown after a valid submission.",
      },
    ],
    aiHints: {
      completionCues: ["Thank you for validating your ticket", "confirmation page is open"],
      decoyCues: ["page chrome outside the main form"],
      preferredStrategies: ["fill the visible form fields first", "submit only after the required fields are populated"],
    },
  },
  parabank: {
    id: "parabank",
    name: "ParaBank registration probe",
    siteLabel: "ParaBank",
    targetUrl: "https://parabank.parasoft.com/parabank/register.htm",
    domainAllowlist: ["parabank.parasoft.com"],
    goal: "Create a new demo banking account and reach the signed-in dashboard.",
    description: "Finance-style onboarding flow with a denser registration form and a post-submit account-services surface.",
    successDefinition: "The goal is complete only when the signed-in account-services area is visible with actions like Open New Account, Accounts Overview, or Log Out.",
    recommendedMaxSteps: 6,
    minimumMaxSteps: 5,
    inputSeeds: {
      first_name: "Chaos",
      last_name: "Swarm",
      street: "1 Market St",
      city: "San Francisco",
      state: "CA",
      zip_code: "94105",
      phone_number: "4155550101",
      ssn: "{suffix8}",
      username: "chaosswarm{suffix}",
      password: "SuperSecret123!",
      repeated_password: "SuperSecret123!",
    },
    frames: [
      {
        id: "registration-form",
        label: "Registration form",
        url: "https://parabank.parasoft.com/parabank/register.htm",
        targets: ["First Name", "Last Name", "Username", "Password", "Register"],
        errorBias: 0.24,
        description: "The new customer registration form.",
      },
      {
        id: "account-services",
        label: "Account services",
        url: "https://parabank.parasoft.com/parabank/register.htm",
        targets: ["Open New Account", "Accounts Overview", "Log Out"],
        errorBias: 0.07,
        description: "The signed-in banking dashboard after registration succeeds.",
      },
    ],
    aiHints: {
      completionCues: ["Open New Account", "Accounts Overview", "Log Out"],
      decoyCues: ["left sidebar login form", "marketing links"],
      preferredStrategies: ["use the registration form, not the existing customer login widget", "treat account services as the success surface"],
    },
  },
};

export function listScenarios() {
  return Object.values(scenarioCatalog);
}

export function hasScenario(id: string) {
  return Boolean(scenarioCatalog[id]);
}

export function getScenario(id: string) {
  return scenarioCatalog[id];
}
