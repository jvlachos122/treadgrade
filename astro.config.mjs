import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { mapBrandPlants } from "./src/lib/brand-pages.js";
import { catalog } from "./src/lib/catalog.js";
import { packPlantCodes } from "./src/lib/decoder-plants.js";
import { brandLinkEntries, packBrandLinks } from "./src/lib/plant-query.js";
import { includeInSitemap, sitemapPathname } from "./src/lib/sitemap.js";
import { lastmodForPath, rewriteBuiltSitemaps } from "./src/lib/sitemap-lastmod.js";

function decoderPlantCodesPlugin() {
  const virtual = "virtual:decoder-plant-codes";
  const resolved = `\0${virtual}`;
  return {
    name: "decoder-plant-codes",
    resolveId(id) {
      if (id === virtual) return resolved;
    },
    load(id) {
      if (id !== resolved) return null;
      return `export const packedPlantCodes = ${JSON.stringify(packPlantCodes(catalog.plants))};\n`;
    },
  };
}

const retired = new Set(catalog.redirects.map((item) => item.from));

function brandPlantLinksPlugin() {
  const virtual = "virtual:brand-plant-links";
  const resolved = `\0${virtual}`;
  return {
    name: "brand-plant-links",
    resolveId(id) {
      if (id === virtual) return resolved;
    },
    load(id) {
      if (id !== resolved) return null;
      const mapped = mapBrandPlants(catalog.brands, catalog.plants);
      return `export const packedBrandLinks = ${JSON.stringify(packBrandLinks(brandLinkEntries(catalog.brands, mapped)))};\n`;
    },
  };
}

function sitemapLastmod() {
  return {
    name: "sitemap-lastmod",
    hooks: {
      "astro:build:done": ({ dir }) => {
        rewriteBuiltSitemaps(fileURLToPath(dir));
      },
    },
  };
}

export default defineConfig({
  site: "https://treadgrade.com",
  trailingSlash: "always",
  vite: {
    plugins: [decoderPlantCodesPlugin(), brandPlantLinksPlugin()],
  },
  prefetch: {
    defaultStrategy: "hover",
  },
  integrations: [
    sitemap({
      filter: (page) => includeInSitemap(page, retired),
      serialize(item) {
        const day = lastmodForPath(sitemapPathname(item.url));
        if (day) item.lastmod = day;
        else delete item.lastmod;
        return item;
      },
    }),
    sitemapLastmod(),
  ],
});
