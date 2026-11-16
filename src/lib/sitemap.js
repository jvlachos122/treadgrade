import { catalog } from "./catalog.js";
import { exampleComparisonPaths } from "./compare-pages.js";
import { hubPaths } from "./plant-hubs.js";
import { whoMakesPages } from "./who-makes-pages.js";

/**
 * Static routes that are not built from the catalog. Retired addresses and
 * the 404 are omitted. Dynamic routes are added in indexablePathSet.
 *
 * PINNED_STATIC_INDEXABLE_PATHS is main after the treadwear-and-traction
 * guide (PR #36) and before later static pages. Deploy checks main out with
 * fetch-depth 1, so a test cannot use `git show main:` as the pre-change
 * list. A new static path stays out of the pin until that change is on main.
 */
export const PINNED_STATIC_INDEXABLE_PATHS = [
  "/",
  "/about/",
  "/affiliate-disclosure/",
  "/brands/",
  "/compare/",
  "/contact/",
  "/decoder/",
  "/guides/",
  "/guides/dot-code/",
  "/guides/no-utqg-rating/",
  "/guides/tire-age/",
  "/guides/tire-date-code/",
  "/guides/tire-pressure-and-roadside-kit/",
  "/guides/traction-grades/",
  "/guides/treadwear-numbers/",
  "/guides/treadwear-varies-by-size/",
  "/guides/treadwear-vs-traction/",
  "/guides/utqg-grades/",
  "/lists/highest-treadwear/",
  "/lists/long-treadwear-high-traction/",
  "/methodology/",
  "/methodology/known-errors/",
  "/plants/",
  "/privacy/",
  "/ratings/",
  "/recalls/",
  "/who-makes-it/",
];

export const STATIC_INDEXABLE_PATHS = [
  "/",
  "/about/",
  "/affiliate-disclosure/",
  "/brands/",
  "/compare/",
  "/contact/",
  "/decoder/",
  "/guides/",
  "/guides/dot-code/",
  "/guides/no-utqg-rating/",
  "/guides/rebadged-tires/",
  "/guides/tire-age/",
  "/guides/tire-date-code/",
  "/guides/tire-pressure-and-roadside-kit/",
  "/guides/traction-grades/",
  "/guides/treadwear-numbers/",
  "/guides/treadwear-varies-by-size/",
  "/guides/treadwear-vs-traction/",
  "/guides/utqg-grades/",
  "/lists/highest-treadwear/",
  "/lists/long-treadwear-high-traction/",
  "/methodology/",
  "/methodology/known-errors/",
  "/plants/",
  "/privacy/",
  "/ratings/",
  "/recalls/",
  "/who-makes-it/",
];

/** Every URL the sitemap should list for the committed data. */
export function indexablePathSet() {
  const paths = new Set(STATIC_INDEXABLE_PATHS);
  for (const brand of catalog.brands) paths.add(brand.url);
  for (const line of catalog.lines) paths.add(line.url);
  for (const plant of catalog.plants) paths.add(plant.url);
  for (const path of hubPaths) paths.add(path);
  for (const page of whoMakesPages) paths.add(page.url);
  for (const path of exampleComparisonPaths) paths.add(path);
  return paths;
}

export function sitemapPathname(page) {
  try {
    return new URL(page).pathname;
  } catch {
    return page;
  }
}

/**
 * The sitemap includes every built page except the 404 and retired addresses.
 * Astro passes absolute URLs; tests also pass pathnames.
 */
export function includeInSitemap(page, retired) {
  if (String(page).includes("/404")) return false;
  if (retired.has(sitemapPathname(page))) return false;
  return true;
}
