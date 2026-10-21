import { site } from "./site.js";

const ORDER = ["tireRack", "simpleTire", "amazon"];

export function affiliateLinks(query) {
  const encodedQuery = encodeURIComponent(String(query ?? "").trim());
  const links = [];
  for (const key of ORDER) {
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

export function affiliatesConfigured() {
  return ORDER.some((key) => {
    const item = site.affiliates[key];
    return Boolean(item?.enabled && String(item.id || "").trim() && String(item.urlTemplate || "").trim());
  });
}
