import { site } from "./site.js";

export const PUBLIC_DOMAIN_LICENSE = "https://www.usa.gov/government-works";

export const nhtsaOrg = {
  "@type": "Organization",
  name: "National Highway Traffic Safety Administration",
  alternateName: "NHTSA",
  url: "https://www.nhtsa.gov/",
};

export const publisherOrg = {
  "@type": "Organization",
  name: site.name,
  legalName: site.legalName,
  url: `${site.url}/`,
};

export function pageUrl(path) {
  return new URL(path, site.url).href;
}

export function breadcrumbList(crumbs) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: pageUrl(item.href),
    })),
  };
}

export function schemaGraph(nodes) {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replace(/</g, "\\u003c");
}

export function laterIso(...values) {
  return values.filter(Boolean).sort().at(-1) || "";
}

export function dataset({ name, description, path, dateModified, isBasedOn, keywords }) {
  const entry = {
    "@type": "Dataset",
    name,
    description,
    url: pageUrl(path),
    creator: nhtsaOrg,
    publisher: publisherOrg,
    license: PUBLIC_DOMAIN_LICENSE,
    dateModified,
    isBasedOn,
  };
  if (keywords?.length) entry.keywords = keywords;
  return entry;
}

export function article({ headline, description, path, dateModified }) {
  return {
    "@type": "Article",
    headline,
    description,
    dateModified,
    author: publisherOrg,
    publisher: publisherOrg,
    mainEntityOfPage: pageUrl(path),
  };
}
