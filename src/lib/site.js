/**
 * Site-wide settings. Affiliate IDs and analytics ship empty on purpose.
 * See README.md before filling them in.
 */
export const site = {
  name: "TreadGrade",
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
