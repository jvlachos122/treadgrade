import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import meta from "./data/meta.json";
import { catalog } from "./src/lib/catalog.js";
import { packPlantCodes } from "./src/lib/decoder-plants.js";
import { includeInSitemap } from "./src/lib/sitemap.js";

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

const verifiedDay = String(meta.verifiedAt || "").slice(0, 10);
const retired = new Set(catalog.redirects.map((item) => item.from));

export default defineConfig({
  site: "https://treadgrade.com",
  trailingSlash: "always",
  vite: {
    plugins: [decoderPlantCodesPlugin()],
  },
  prefetch: {
    defaultStrategy: "hover",
  },
  integrations: [
    sitemap({
      filter: (page) => includeInSitemap(page, retired),
      serialize(item) {
        if (verifiedDay) item.lastmod = verifiedDay;
        return item;
      },
    }),
  ],
});
