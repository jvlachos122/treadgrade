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
