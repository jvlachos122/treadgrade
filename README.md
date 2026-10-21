# TreadGrade

Static reference for U.S. tire buyers. It republishes [NHTSA UTQG grades](https://api.nhtsa.gov/tires?dataSet=ratings) (treadwear, traction, temperature) and decodes a DOT tire identification number with the [NHTSA equipment plant-code list](https://vpic.nhtsa.dot.gov/api/vehicles/GetEquipmentPlantCodes?year=2026&equipmentType=1&reportType=All&format=json).

The site does not sell tires, invent grades, or decide whether a tire is still on the market. The ratings file does not say that, and the pages say so.

## Page counts

From the data verified on 21 October 2026:

| Page type | Count |
| --- | ---: |
| Tire line | 3,058 |
| Plant code | 1,244 |
| Brand | 215 |
| Ratings table, brand index, plant directory, DOT decoder | 4 |
| Guides (index, UTQG, DOT code) | 3 |
| About, privacy, contact, affiliate disclosure, data sources | 5 |
| Home and 404 | 2 |
| **HTML pages** | **4,531** |

The ratings API returned 7,628 rows. Six exact duplicate grade rows are collapsed, so the tables show 7,622. Capitalization-only brand spellings are merged (228 raw strings, 215 brands). A line with a plus sign or other distinct slug stays on its own page.

## Architecture

[Astro](https://astro.build) builds a static site. There is no client framework. Three small scripts run in the browser:

- Home search loads `/data/search.json` and filters it locally.
- The ratings table loads `/data/ratings.json`, then filters, sorts, and pages 40 rows at a time.
- The DOT decoder loads `/data/plants.json` and parses the code in the browser.

Those JSON files are generated at build time by `scripts/prepare-public-data.mjs` and are not committed. The source of truth is `data/ratings.json`, `data/plants.json`, and `data/meta.json`. `meta.json` holds the data-last-verified timestamp shown in the footer and on data pages.

Shared code lives in `src/lib/`:

- `normalize.js` groups brands and tire lines and builds plant records.
- `tin.js` parses a TIN, including a pre-2000 three-digit date.
- `site.js` and `affiliates.js` hold the empty affiliate, analytics, and contact settings.

Canonical URLs use `https://treadgrade.com`. The build writes `sitemap-index.xml`, `robots.txt`, and `public/CNAME`.

## Local development

Node.js 22 or newer.

```bash
npm ci
npm run fetch          # optional: refresh from NHTSA first
npm test
npm run dev            # http://localhost:4321
npm run check          # validate data, test, build, links, HTML
```

`npm run dev` and `npm run build` regenerate `public/data/` before Astro starts. A build uses the committed data files. It does not call NHTSA. The weekly workflow is what fetches.

## Data refresh

`scripts/fetch-data.mjs` calls:

- `https://api.nhtsa.gov/tires?dataSet=ratings&data=none&max=100&offset=…`  
  The API caps a page at 100 rows. The script follows offsets until the unique `id` count equals `meta.pagination.total`.
- `https://vpic.nhtsa.dot.gov/api/vehicles/GetEquipmentPlantCodes?year=<current UTC year>&equipmentType=1&reportType=All&format=json`  
  If that year fails, it tries the previous year, then 2016. On 21 October 2026 those years returned the same 1,244 records.

It replaces the files only when:

- the new counts are within 25% of the previous files (`FETCH_COUNT_TOLERANCE`, default `0.25`)
- ratings are at least 1,000 and plants at least 200
- every rating has an id, brand, line, size, traction, and temperature
- plant codes are unique

A short or broken response exits non-zero and leaves the saved files alone, so a bad API reply cannot wipe the site. `FETCH_ALLOW_ANY_COUNT=1` skips the relative check and still enforces the hard minimums.

`.github/workflows/refresh-data.yml` runs that fetch every Monday at 14:00 UTC, then tests, builds, checks links, and validates HTML. Only if those pass does it commit `data/` to `main` and deploy. A push made by `github-actions[bot]` does not start the regular deploy workflow, so the refresh workflow deploys the site itself.

`.github/workflows/deploy.yml` runs on other pushes to `main`. It builds the committed data and deploys. It does not call NHTSA, so a copy change can ship while the API is down.

## GitHub settings the owner has to turn on

The workflows cannot click these themselves.

1. **Pages source.** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. **Custom domain.** On that same Pages screen, set the custom domain to `treadgrade.com` and save. With a GitHub Actions source, GitHub keeps the domain in Pages settings. The `CNAME` file in this repo documents it and is included in the site, but the Pages setting is what binds the domain. After the certificate is issued, turn on **Enforce HTTPS**.
3. **Workflow permissions.** Settings → Actions → General → Workflow permissions → **Read and write**. The Monday job commits the refreshed JSON. The workflow asks for `contents: write`, and that only works if the repository allows it.
4. **Push to `main`.** If `main` is protected, let GitHub Actions push to it (or the Monday commit will fail and the previous deployment will stay up).
5. **Actions enabled** on the repository, which they are by default for a normal public repo.

GitHub Pages is free for a public repository. This project does not use a paid host, database, or API key.

## DNS at Hostinger

Remove any parking or placeholder records on the apex before adding these. Extra `A`, `AAAA`, or `ALIAS` records on `@`, or a second `CNAME` on `www`, can block the HTTPS certificate.

For the apex `treadgrade.com`:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |

For `www.treadgrade.com`:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `www` | `jvlachos122.github.io` |

Do not put a `CNAME` on the apex. GitHub documents these addresses at [Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site). When both names point at GitHub, `www` redirects to the apex. Add the domain in Pages **before** changing DNS, so the name is not unclaimed while the records propagate.

Check with:

```bash
dig treadgrade.com +noall +answer -t A
dig treadgrade.com +noall +answer -t AAAA
dig www.treadgrade.com +noall +answer -t CNAME
```

## Affiliates, analytics, and Search Console

Affiliate ids and the analytics snippet live in `src/lib/site.js` and are empty on purpose. The contact address is set.

**Affiliates.** `tireRack`, `simpleTire`, and `amazon` each have `enabled`, `id`, and `urlTemplate`. A "Check price" button is rendered only when `enabled` is true, `id` is non-empty, and `urlTemplate` is an `https` URL. `{query}` is inserted already URL-encoded (the brand and line). `{id}` is URL-encoded. Use the link pattern from the affiliate program, and do not enable one until the application is approved. The button includes `rel="sponsored nofollow noopener"` and a short disclosure that links to `/affiliate-disclosure/`. Grades are never sorted by whether a button exists.

**Analytics.** Paste a privacy-friendly snippet into `analyticsSnippet`. It is inserted raw into `<head>`. Leave it `""` and nothing is loaded. Update `/privacy/` if the snippet collects data the page does not already describe.

**Search Console.** `treadgrade.com` is verified as a Domain property with a DNS record, so no HTML verification tag is used. Leave `searchConsoleVerification` empty. The layout prints `<meta name="google-site-verification">` only when that value is a token of letters, digits, `_`, and `-`. Do not paste the whole meta tag.

**Contact.** `contactEmail` is `hello@treadgrade.com`. The contact, privacy, and affiliate disclosure pages publish it. A value that contains `TODO` or ends in `@example.com` is treated as unset and is not printed.

## Add a content page

1. Add `src/pages/guides/your-topic.astro` (or another path under `src/pages/`).
2. Use `Base` and pass a unique `title`, `description`, and `breadcrumbs`. The layout adds the canonical URL, Open Graph tags, and breadcrumb JSON-LD.
3. Link the page from `src/pages/guides/index.astro` and, if it belongs in the global nav, from `src/components/Footer.astro`.
4. Keep claims tied to a cited source or to the NHTSA files. Do not add prices, reviews, or "still sold" labels.
5. `npm run build` picks the page up in the sitemap. `npm run check` confirms the new internal links and the HTML.

Dynamic routes are `src/pages/brands/[brand].astro`, `src/pages/tires/[brand]/[line].astro`, and `src/pages/plants/[code].astro`. They read `src/lib/catalog.js`. A new tire or plant appears when the data refresh brings it in. You do not add those by hand.

## Quality checks

`npm run check` runs, in order:

- `validate:data` — schema and absolute floors (ratings 4,000–30,000, plants 500–5,000) so a gutted file cannot build
- `node --test` — TIN parsing, brand merging, and a uniqueness check of the committed catalog
- `astro build`
- internal link checker, including sitemap URLs and in-page anchors
- HTML structural checks (doctype, language, one `h1`, description, canonical) plus `html-validate`

The same steps run in both GitHub workflows. A failing check does not deploy.

## Limitations

- UTQG here is whatever NHTSA has published. It is not a catalog of tires currently for sale. In this pull the API's `active` flag is false on every row, so the site does not treat that flag as a discontinued marker.
- Recall and complaint counts are shown only when the API value is above zero. This pull is all zeros. That is not a safety record. Use [NHTSA recalls](https://www.nhtsa.gov/recalls).
- The manufacturer's code in the middle of a TIN is not decoded. NHTSA does not publish the legend.
- A three-digit date does not encode the decade. The decoder lists each year from 1971 through 1999 that ends in that digit.
- The four-digit week uses the Sunday–Saturday rule in 49 CFR 574.5, with week 01 as the first full week of the year. Age is counted from the Sunday that starts the week.
- Plant countries and names are shown as published, aside from sentence-casing all-caps strings. Source typos are left in place.
- Same tire-line names under different brands are linked as name matches only. That is not a rebadge. The ratings file also mispairs line names and brands. In the 21 October 2026 pull, ADVAN A048 is stored under Vercelli, Viking, Vikrant, Visa, and Vitour, and not under Yokohama. Pages say so and do not correct the brand string.
- The ratings file has no category. 49 CFR 575.104 covers passenger-car tires and excludes deep-tread winter-type snow tires and temporary spares. Light-truck tires are outside that section. Copy says a missing line is not a grade, and sorts are an ordering of NHTSA's list rather than a "best tire" ranking.
- vPIC `Status` is shown as stored. Active is not presented as "operating today." In this pull Phillips Petroleum Company (1J1, 1K1) and The Gates Rubber Company (1BW, 1BX, 1BY) are Active. The plant record names the company on the code. It has no brand field, and pages do not claim a plant makes a brand.
- Plant codes come only from NHTSA vPIC. Do not import a third-party plant-code list. The table at wfirm.com is not a source: on 21 October 2026 it included a planted row (codes XXXX / XXXXXX, Wetherington Law Firm, www.wfirm.com) that is not in the NHTSA file.
- There is no price comparison until affiliate templates are filled in.
- Search Console is verified by DNS. The HTML verification slot stays empty.
