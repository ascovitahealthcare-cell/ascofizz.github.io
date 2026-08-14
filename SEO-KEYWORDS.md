# Ozylix keyword directory

Every number here is real search data for **India**, pulled 2026-08-12. Nothing
is invented. Where a competitor ranks, their position is shown — that is the
gap we are trying to close.

## How this list was built

Three competitors were measured: **oziva.in**, **plixlife.com**,
**wellbeingnutrition.com**. A keyword only earns a place here if **we sell a
product that genuinely answers it**. That filter matters more than the volume:

- Wellbeing Nutrition's biggest terms are *protein powder* (368k/mo), *whey
  protein* (368k), *creatine* (165k). **We sell none of those.** Ranking for
  them would send visitors who bounce immediately, which teaches Google our
  page is a bad answer and pushes us down. They are deliberately excluded.
- An automated expansion of "effervescent tablets" returned *diclo*, *brufen*,
  *ativan*, *clobazam* and *buprenorphine* — painkillers, sedatives and a
  controlled opioid-dependence medicine. Also excluded, for obvious reasons.

Competitor **brand** terms (*plix* 368k, *oziva* 135k) are excluded too. They
are unwinnable and worthless to us — nobody searching "plix" wants Ozylix.

## Where the competitors actually get their traffic

| Domain | Keywords | Est. visits/mo | Their single biggest page |
|---|---:|---:|---|
| oziva.in | 2,105 | 554,206 | Hair vitamins w/ biotin — 92,860/mo |
| plixlife.com | 2,551 | 473,004 | ACV Effervescent — 65,729/mo |
| wellbeingnutrition.com | 10,258 | 350,024 | Magnesium collection — 32,170/mo |
| **ozylix.com** | **0** | **0** | — |

The lesson is concentration, not breadth: OZiva earns **more** traffic than
Wellbeing from **a fifth** of the keywords, because it wins a few product terms
outright. Plix's top page is an ACV effervescent — the same product we sell.

## Tier 1 — highest value, direct SKU match

| Keyword | Volume/mo | Competitor | Their rank | Our product |
|---|---:|---|---:|---|
| glutathione tablet / tablets | 246,000 | oziva.in | 3 | Glutathione Effervescent (38) |
| biotin tablet / tablets | 135,000 | oziva.in | 3 / 6 | Biotin Effervescent |
| magnesium | 110,000 | wellbeingnutrition | 17 | MG+++ Magnesium (11) |
| apple cider vinegar (ACV) | 49,500 | plixlife | 1 | ACV Effervescent (34) |
| vitamin b12 foods vegetarian | 40,500 | oziva.in | 13–18 | VitaPlus B12 + D3 (10) |

## Tier 2 — solid match, less contested

`vitamin c tablet` · `amla tablet` · `ashwagandha tablet` · `womens
multivitamin tablets` · `mens multivitamin tablets` · `moringa tablet` ·
`electrolyte tablets` · `rehydration tablet` · `calcium iron tablet` ·
`bone health supplement` · `green tea extract tablet` · `l carnitine tablet`

## Tier 3 — category and brand (ours to own)

`effervescent tablet` · `effervescent vitamin tablets` · `ozylix` ·
`ozylix glutathione` · `ozylix acv`

The effervescent format is our actual differentiator. Low volume today, no
established owner, and it is the honest description of what we make.

## Where these are implemented

- **Homepage `<title>`** — leads on glutathione + biotin + ACV rather than the
  old "effervescent vitamin tablets", which almost nobody searches.
- **Homepage meta description** — same three terms, natural phrasing.
- **`products.seo_title`** — all 15 products, every one ≤65 chars.
- **`products.meta_description`** — all 15, every one ≤165 chars.
- **`products.seo_keywords`** — all 15, brand included in each.

Product SEO fields live in the database, not this repo, so the admin panel can
edit them without a deploy.

## Aug 2026 overhaul (Google SEO Starter Guide pass)

The following were added in the Aug 2026 overhaul, so the "not done" notes
below are superseded. See the August 2026 SEO report for the full before/after.

- `<meta name="keywords">` REMOVED entirely — both the 2,839-character static
  stuffed tag and the runtime writer that copied `products.seo_keywords` into
  every page. Google has ignored the tag since 2009 and it leaked our target
  list to competitors.
- **Product canonical bug FIXED.** `openProduct()` now sets a self-referencing
  canonical + `og:url` for each product URL (`/product/<slug>`). Before, every
  product page kept the homepage default — the single biggest reason for zero
  indexed keywords.
- **Shop page content + schema.** Intro paragraph, FAQ-style buying guide,
  and `setShopPageSchema()` injecting CollectionPage + BreadcrumbList +
  ItemList (the pattern Wellbeing Nutrition uses on collection pages).
- **One H1 per view.** Decorative secondary headings (cart sub-headers,
  advisor title, etc.) demoted to styled divs; product `prod-title` and each
  page header keep the single semantic H1.
- **Blog is live.** 5+ posts with full article bodies and an article reader
  (`openBlog()` overlay) — `/blog` no longer ships empty.
- **Hreflang fixed** to per-route self-references (was homepage-only on every
  URL).
- `abababababababab.html` (95 KB unused billing test page) deleted.
- Schema left intact otherwise.

## Deliberately NOT done (legacy note — superseded above)

- ~~No `<meta name="keywords">`~~ — removed in Aug 2026.
- Existing schema left intact otherwise. The site already carries a 22-question
  FAQPage, 16 Product schemas with Offers, Organization, LocalBusiness,
  MedicalOrganization, BreadcrumbList and SpeakableSpecification, plus
  AI/GEO meta for ChatGPT and Perplexity. That is stronger than most Indian
  D2C sites and nothing was removed.

## The honest caveat

None of this ranks anything on its own. `ozylix.com` has **zero** indexed
keywords because 22 of 23 sitemap URLs were returning 404 and the sitemap
would not parse — Google could not read the site. The Cloudflare Workers
migration fixed that. Keywords decide *what* we rank for once crawling works;
they cannot make an uncrawlable site rank.

Expect weeks, not days, and re-check with
`get_search_performance` once Search Console has data.

## Biggest gap still open

Both leaders get major traffic from **blog content**, not product pages:

- OZiva: "B12 foods for vegetarians" — 259 keywords, 7,736 visits/mo
- Wellbeing: "protein in curd" — 20,484 visits/mo
- Plix: "apple cider vinegar uses and benefits" — 2,420 visits/mo

This gap is now CLOSED (Aug 2026): `/blog` serves 5+ full articles through a
reader modal. Next steps: publish 2–4 posts/month against the Tier 1/2 topic
list above, add real `/blog/<slug>` URLs, and re-check with
`get_search_performance` once Search Console accumulates data.
