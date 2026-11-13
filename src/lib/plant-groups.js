/**
 * Manufacturer hubs are a name match on the NHTSA registrant.
 * They are not the parent company's own factory list. The count is however
 * many committed plant records match the rule, so a refresh can change it.
 *
 * General Tires Technology (Cambodia), code 076, contains the substring
 * "general tire" but is a different registrant. The Continental rule leaves
 * that name out. A naive "general tire" substring would include it.
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
    hub: true,
    brandSlugs: ["bridgestone", "firestone"],
    headlineCountries: ["united-states", "japan", "spain"],
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
    hub: true,
    brandSlugs: ["michelin"],
    headlineCountries: ["france", "united-states"],
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
    hub: true,
    brandSlugs: ["goodyear"],
    headlineCountries: ["united-states", "germany"],
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
    omissionReason: "The name contains the words General Tires, which is not the General Tire registrant.",
    hub: true,
    brandSlugs: ["continental", "general-tire"],
    headlineCountries: ["united-states", "germany"],
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
    hub: true,
    brandSlugs: ["pirelli"],
    matches(name) {
      return text(name).includes("pirelli");
    },
  },
];

/**
 * Extra maker-name matches for the country cross-tab. They use the same
 * kind of registrant-name rule as the manufacturer hubs and do not get a
 * code-list page of their own.
 *
 * Toyo is Toyo Tire or Toyo Tyre. Toyomoto contains "toyo" and is a
 * different registrant. Kenda is Kenda Rubber. "Kab. Kendal" contains the
 * letters kenda and is a place on another registrant.
 *
 * A group is published only when the match has at least MAKER_COUNTRY_MIN
 * registered plant codes. Nine is the smallest count among the name groups
 * this view was asked to check after those exclusions (Hankook, and Toyo
 * Tire or Toyo Tyre). CEAT and Cheng Shin meet that count. Dunlop and Kenda
 * Rubber stay off the page while they are under it.
 *
 * America, Private, and National are not groups. Those words occur inside
 * many registrants and are not a maker, the same exclusion brand pages use
 * when a token never begins a registrant.
 */
export const MAKER_COUNTRY_EXTRA_DEFS = [
  {
    id: "yokohama",
    name: "Yokohama",
    nameNote: "Yokohama",
    linkLabel: "Yokohama",
    rule: "the registrant name contains Yokohama",
    brandSlugs: ["yokohama"],
    matches(name) {
      return text(name).includes("yokohama");
    },
  },
  {
    id: "sumitomo",
    name: "Sumitomo",
    nameNote: "Sumitomo",
    linkLabel: "Sumitomo",
    rule: "the registrant name contains Sumitomo",
    brandSlugs: ["sumitomo"],
    matches(name) {
      return text(name).includes("sumitomo");
    },
  },
  {
    id: "kumho",
    name: "Kumho",
    nameNote: "Kumho",
    linkLabel: "Kumho",
    rule: "the registrant name contains Kumho",
    brandSlugs: ["kumho"],
    headlineCountries: ["china"],
    matches(name) {
      return text(name).includes("kumho");
    },
  },
  {
    id: "ceat",
    name: "CEAT",
    nameNote: "CEAT",
    linkLabel: "CEAT",
    rule: "the registrant name contains CEAT",
    brandSlugs: ["ceat-ltd"],
    matches(name) {
      return text(name).includes("ceat");
    },
  },
  {
    id: "toyo",
    name: "Toyo",
    nameNote: "Toyo Tire or Toyo Tyre",
    linkLabel: "Toyo",
    rule: "the registrant name contains Toyo Tire or Toyo Tyre",
    omissionReason: "The name contains Toyo and does not contain Toyo Tire or Toyo Tyre.",
    brandSlugs: ["toyo"],
    matches(name) {
      const value = text(name);
      return value.includes("toyo tire") || value.includes("toyo tyre");
    },
    omitted(name) {
      const value = text(name);
      return value.includes("toyo") && !value.includes("toyo tire") && !value.includes("toyo tyre");
    },
  },
  {
    id: "hankook",
    name: "Hankook",
    nameNote: "Hankook",
    linkLabel: "Hankook",
    rule: "the registrant name contains Hankook",
    brandSlugs: ["hankook"],
    matches(name) {
      return text(name).includes("hankook");
    },
  },
  {
    id: "cheng-shin",
    name: "Cheng Shin",
    nameNote: "Cheng Shin",
    linkLabel: "Cheng Shin",
    rule: "the registrant name contains Cheng Shin",
    brandSlugs: ["cheng-shin"],
    matches(name) {
      return text(name).includes("cheng shin");
    },
  },
  {
    id: "dunlop",
    name: "Dunlop",
    nameNote: "Dunlop",
    linkLabel: "Dunlop",
    rule: "the registrant name contains Dunlop",
    brandSlugs: ["dunlop"],
    matches(name) {
      return text(name).includes("dunlop");
    },
  },
  {
    id: "kenda",
    name: "Kenda",
    nameNote: "Kenda Rubber",
    linkLabel: "Kenda",
    rule: "the registrant name contains Kenda Rubber",
    omissionReason: "The letters kenda here are the place Kab. Kendal, not Kenda Rubber.",
    brandSlugs: ["kenda"],
    matches(name) {
      return text(name).includes("kenda rubber");
    },
    omitted(name) {
      const value = text(name);
      return value.includes("kenda") && !value.includes("kenda rubber");
    },
  },
];

/** Name matches considered for the maker-by-country table, hubs first. */
export const MAKER_COUNTRY_DEFS = [...MANUFACTURER_GROUP_DEFS, ...MAKER_COUNTRY_EXTRA_DEFS];

/** A name match is published on the country cross-tab at this count or above. */
export const MAKER_COUNTRY_MIN = 9;

/** UTQG brand slugs that can point at a manufacturer hub without an extra guess. */
export const BRAND_SLUG_TO_GROUP = Object.fromEntries(
  MANUFACTURER_GROUP_DEFS.flatMap((group) => group.brandSlugs.map((slug) => [slug, group.id])),
);

export function groupsMatchingName(name) {
  return MANUFACTURER_GROUP_DEFS.filter((group) => group.matches(name)).map((group) => group.id);
}
