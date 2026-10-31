/**
 * Manufacturer hubs are a name match on the NHTSA registrant.
 * They are not the parent company's own factory list.
 *
 * Counts on the committed plant file:
 * - Bridgestone or Firestone: 75
 * - Michelin: 57
 * - Goodyear: 38
 * - Continental, or General Tire except General Tires Technology: 28
 *   (a substring "general tire" also hits General Tires Technology
 *   (Cambodia), code 076, which is a different registrant and is left out;
 *   that naive substring total is 29)
 * - Pirelli: 19
 *
 * Spot-check before treating a hub as the company's plants: Bridgestone's
 * location pages (as of the end of December 2025) count 46 new tire plants
 * and 70 tire plants in all, Michelin's 2024 Universal Registration Document
 * counts 83 tire production plants, and Continental's manufacturing page
 * (as of January 2026) counts 19 production locations. Those lists are
 * smaller and current. This file does not copy them.
 */

function text(name) {
  return String(name || "").toLowerCase();
}

export const MANUFACTURER_GROUP_DEFS = [
  {
    id: "bridgestone",
    name: "Bridgestone",
    nameNote: "Bridgestone or Firestone",
    linkLabel: "Bridgestone and Firestone",
    rule: "the registrant name contains Bridgestone or Firestone",
    matches(name) {
      const value = text(name);
      return value.includes("bridgestone") || value.includes("firestone");
    },
  },
  {
    id: "michelin",
    name: "Michelin",
    nameNote: "Michelin",
    linkLabel: "Michelin",
    rule: "the registrant name contains Michelin",
    matches(name) {
      return text(name).includes("michelin");
    },
  },
  {
    id: "goodyear",
    name: "Goodyear",
    nameNote: "Goodyear",
    linkLabel: "Goodyear",
    rule: "the registrant name contains Goodyear",
    matches(name) {
      return text(name).includes("goodyear");
    },
  },
  {
    id: "continental",
    name: "Continental",
    nameNote: "Continental or General Tire",
    linkLabel: "Continental and General Tire",
    rule: "the registrant name contains Continental, or contains General Tire and is not General Tires Technology",
    matches(name) {
      const value = text(name);
      if (value.includes("continental")) return true;
      if (value.includes("general tires technology")) return false;
      return value.includes("general tire");
    },
    omitted(name) {
      return text(name).includes("general tires technology");
    },
  },
  {
    id: "pirelli",
    name: "Pirelli",
    nameNote: "Pirelli",
    linkLabel: "Pirelli",
    rule: "the registrant name contains Pirelli",
    matches(name) {
      return text(name).includes("pirelli");
    },
  },
];

/** UTQG brand slugs that can point at a name group without an extra guess. */
export const BRAND_SLUG_TO_GROUP = {
  bridgestone: "bridgestone",
  firestone: "bridgestone",
  michelin: "michelin",
  goodyear: "goodyear",
  continental: "continental",
  "general-tire": "continental",
  pirelli: "pirelli",
};

export function groupsMatchingName(name) {
  return MANUFACTURER_GROUP_DEFS.filter((group) => group.matches(name)).map((group) => group.id);
}
