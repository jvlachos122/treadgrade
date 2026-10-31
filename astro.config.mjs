import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import meta from "./data/meta.json";
import { catalog } from "./src/lib/catalog.js";

const verifiedDay = String(meta.verifiedAt || "").slice(0, 10);
const retired = new Set(catalog.redirects.map((item) => item.from));

export default defineConfig({
  site: "https://treadgrade.com",
  trailingSlash: "always",
  prefetch: {
    defaultStrategy: "hover",
  },
  integrations: [
    sitemap({
      filter: (page) => {
        if (page.includes("/404")) return false;
        let pathname = page;
        try {
          pathname = new URL(page).pathname;
        } catch {
          pathname = page;
        }
        if (retired.has(pathname)) return false;
        return true;
      },
      serialize(item) {
        if (verifiedDay) item.lastmod = verifiedDay;
        return item;
      },
    }),
  ],
});
