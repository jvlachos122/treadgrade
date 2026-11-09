/**
 * Site-wide settings. Retailer affiliate IDs and analytics ship empty on purpose.
 * AstroAI gear links are the Awin addresses below. See README.md before changing them.
 */
export const site = {
  name: "TreadGrade",
  legalName: "Three Pines Company LLC",
  operatorPlace: "Frankfort, Illinois",
  url: "https://treadgrade.com",
  locale: "en_US",
  description:
    "Look up UTQG treadwear, traction, and temperature grades in NHTSA's list, and decode a DOT tire code to the NHTSA plant record and a manufacture week.",
  contactEmail: "hello@treadgrade.com",
  // Paste a privacy-friendly analytics snippet here (for example Plausible).
  // It is inserted raw into <head>. Leave it empty to load nothing.
  analyticsSnippet: "",
  // HTML meta verification token only, not the full meta tag.
  // treadgrade.com is already verified in Google Search Console as a Domain
  // property via DNS, so this stays empty and no verification meta tag is emitted.
  searchConsoleVerification: "",
  affiliates: {
    // Buttons render only when enabled is true, id is non-empty, and urlTemplate
    // is an https URL. Tokens: {query} is already URL-encoded, {id} is URL-encoded.
    // Use the URL pattern from each affiliate program. Do not enable a program
    // until the application is approved.
    tireRack: {
      name: "Tire Rack",
      enabled: false,
      id: "",
      urlTemplate: "",
    },
    simpleTire: {
      name: "SimpleTire",
      enabled: false,
      id: "",
      urlTemplate: "",
    },
    amazon: {
      name: "Amazon",
      enabled: false,
      id: "",
      urlTemplate: "",
    },
    // Fixed https addresses from Awin Link Builder (publisher 3131988).
    // Keep each href character for character: no clickref and no re-encoding.
    // No Awin script, pixel, or image is loaded.
    astroai: {
      name: "AstroAI",
      network: "Awin",
      enabled: true,
      products: [
        {
          key: "inflator",
          label: "AstroAI L7 portable tire inflator",
          href: "https://www.awin1.com/cread.php?awinmid=43671&awinaffid=3131988&ued=https%3A%2F%2Fwww.astroai.com%2Fl7-tire-inflator%2Fap%2F1000347761",
        },
        {
          key: "jump_starter",
          label: "AstroAI S8 Air jump starter with tire inflator",
          href: "https://www.awin1.com/cread.php?awinmid=43671&awinaffid=3131988&ued=https%3A%2F%2Fwww.astroai.com%2Fs8-air-jump-starter-1500a%2Fap%2F1000426592",
        },
      ],
    },
  },
};

export function contactEmail() {
  const email = String(site.contactEmail || "").trim();
  if (!email || email.toUpperCase().includes("TODO") || email.endsWith("@example.com")) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

export function searchConsoleToken() {
  const token = String(site.searchConsoleVerification || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return "";
  return token;
}

export function analyticsSnippet() {
  const snippet = String(site.analyticsSnippet || "").trim();
  return snippet;
}
