import { cleanSpace, softenCaps } from "./format.js";
import { slugify } from "./slug.js";

/**
 * Country strings as stored in vPIC, folded onto one label.
 * The alias table is spelling, case, and the parenthetical forms in this
 * file (and the USA forms the backlog names). It does not infer a country
 * from a city.
 */
const ALIAS = {
  "united states (usa)": "united states",
  usa: "united states",
  "u.s.a.": "united states",
  "u.s.a": "united states",
  "u.s.": "united states",
  us: "united states",
  "p.r. china": "china",
  "pr china": "china",
  "people's republic of china": "china",
  korea: "south korea",
  "republic of korea": "south korea",
  vn: "vietnam",
  "south vietnam": "vietnam",
  "myanmar (burma)": "myanmar",
  burma: "myanmar",
  austrailia: "australia",
  england: "united kingdom",
  scotland: "united kingdom",
  "n. ireland": "united kingdom",
  "n ireland": "united kingdom",
  "northern ireland": "united kingdom",
  uk: "united kingdom",
  "u.k.": "united kingdom",
  "great britain": "united kingdom",
  "grand duchy of luxembourg": "luxembourg",
  czechia: "czech republic",
};

const SMALL_WORDS = new Set(["and", "of", "the"]);

const NEEDS_THE = new Set(["United States", "United Kingdom", "Czech Republic", "Netherlands", "Philippines"]);

function titleCaseCountry(key) {
  return key
    .split(" ")
    .map((word, index) => {
      if (index > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function normalizeCountry(value) {
  const stored = cleanSpace(value);
  if (!stored) return { stored: "", rawLabel: "", label: "", key: "" };
  const lookup = stored.toLowerCase();
  const canonical = ALIAS[lookup] || lookup;
  const label = titleCaseCountry(canonical);
  const key = slugify(label);
  if (!key) throw new Error(`Country slug empty for ${stored}`);
  return { stored, rawLabel: softenCaps(stored), label, key };
}

export function countryInPhrase(label) {
  if (NEEDS_THE.has(label)) return `the ${label}`;
  return label;
}
