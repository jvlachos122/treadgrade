import { site } from "./site.js";

const RETAILER_ORDER = ["tireRack", "simpleTire", "amazon"];

export function affiliateLinks(query) {
  const encodedQuery = encodeURIComponent(String(query ?? "").trim());
  const links = [];
  for (const key of RETAILER_ORDER) {
    const item = site.affiliates[key];
    if (!item?.enabled) continue;
    const id = String(item.id || "").trim();
    const template = String(item.urlTemplate || "").trim();
    if (!id || !template) continue;
    const href = template.replaceAll("{query}", encodedQuery).replaceAll("{id}", encodeURIComponent(id));
    let url;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    links.push({ name: item.name, href: url.href });
  }
  return links;
}

export function retailersConfigured() {
  return RETAILER_ORDER.some((key) => {
    const item = site.affiliates[key];
    return Boolean(item?.enabled && String(item.id || "").trim() && String(item.urlTemplate || "").trim());
  });
}

/**
 * AstroAI product links. Only enabled programs, and only https hrefs that
 * are non-empty, are returned. Pass a program in tests; the default reads
 * site.affiliates.astroai.
 */
export function gearLinks(program = site.affiliates.astroai) {
  if (!program?.enabled) return [];
  const products = Array.isArray(program.products) ? program.products : [];
  const links = [];
  for (const product of products) {
    const label = String(product?.label || "").trim();
    const raw = String(product?.href || "").trim();
    if (!label || !raw) continue;
    let url;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    links.push({
      key: String(product?.key || "").trim(),
      label,
      href: url.href,
    });
  }
  return links;
}

export function gearConfigured() {
  return gearLinks().length > 0;
}

export function affiliatesConfigured() {
  return retailersConfigured() || gearConfigured();
}
