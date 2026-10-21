import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import meta from "./data/meta.json";

const verifiedDay = String(meta.verifiedAt || "").slice(0, 10);

export default defineConfig({
  site: "https://treadgrade.com",
  trailingSlash: "always",
  prefetch: {
    defaultStrategy: "hover",
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/404"),
      serialize(item) {
        if (verifiedDay) item.lastmod = verifiedDay;
        return item;
      },
    }),
  ],
});
