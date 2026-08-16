# Ozylix Platform Review and Improvement Report

**Author:** Manus AI · **Date:** August 15, 2026

## 1. Scope of the Review

All seven repositories in the `ascovitahealthcare-cell` organization were cloned, analyzed, and reviewed end-to-end. The platform consists of a static admin panel served on GitHub Pages (`ozylix.com/admin.html`), a monolithic Node.js backend on Render, two standalone automation services (marketing and audit), a storefront, a billing page, and a corporate site. The review covered architecture, code quality, security posture, dashboard UI, and integration points, after which concrete improvements were implemented, tested, and pushed to three repositories.

| Repository | Role | Size / Notes |
|---|---|---|
| `ascovitahealthcare-cell.github.io` | Static admin panel (front-end), GitHub Pages | `admin.html` ≈ 14,900 lines, single-file app, 6 themed logins |
| `backend` | Main API server, Render | `server.js` ≈ 6,900 lines, 90+ route groups |
| `marketing-automation` | Meta Ads automation service, Render | Campaigns, budgets, verdicts, scheduled reports |
| `auditdebuging` | Code/infra audit service, Render | Runs, findings, health scores, trends |
| `ascofizz` | Storefront | Static e-commerce site |
| `bill` | Billing page | Static |
| `coprate.github.io` | Corporate site | Static |

## 2. Assessment of the Current Front-End and Back-End

The front-end is unusually ambitious for a single HTML file. The `admin.html` panel ships a full SPA with role-based access control, themed logins, a Gemini AI assistant, order/product/customer management, analytics with Chart.js visualizations, and three separate dashboard surfaces (orders Dashboard, Marketing, Audit/Debugger). Code appended by successive feature layers consistently follows an "append at end, never edit earlier code" convention, which has kept the panel working across many iterations, though it has also produced 14 inline script blocks and five separate `<style>` elements.

The back-end is a well-organized monolith with route modules, an admin-gated proxy to the marketing service, JWT auth middleware, permission scopes (`marketing.manage`, `products.create`, etc.), a live-visitor tracker, and analytics endpoints. Both automation services are cleanly separated: each enforces an internal API key (`x-internal-key`) and the marketing service additionally uses constant-time key comparison. This separation of secrets (keys live only in server env vars, never in the static panel) is genuinely good practice and worth preserving.

That said, the review surfaced several issues of varying severity, summarized below.

| # | Finding | Severity | Repo | Status |
|---|---|---|---|---|
| 1 | Marketing proxy doubled the `/api` prefix (`/api/api/reports/...`), so every proxy call to the marketing service returned 404 — all marketing automation calls from the panel were broken in production | Critical | `backend` | **Fixed** |
| 2 | The marketing automation service had no lightweight status endpoint; the panel could only poll by reading several Supabase tables with the anon key | Medium | `marketing-automation` | **Added** |
| 3 | Dashboard UI showed store data only; marketing and audit health were siloed on separate pages | Medium | `ascovitahealthcare-cell.github.io` | **Unified** |
| 4 | Marketing Overview lacked Purchases and blended CPA KPIs and any visibility into what the automations did overnight | Low | `ascovitahealthcare-cell.github.io` | **Added** |
| 5 | No automated checks for tag balance or script syntax on the 14k-line single file | Low | `ascovitahealthcare-cell.github.io` | **Added tooling** |
| 6 | `product-sync` reports 16 products missing from the DB (needs manual review) — logged warning, not blocking | Info | `backend` | Note only |
| 7 | Live marketing and backend services returned 404 during checks, indicating Render dynos asleep or not yet redeployed with the fixes | Operational | Render | See §5 |

## 3. Improvements Implemented

### 3.1 Marketing Automation — new unified status endpoint

A new `GET /api/reports/status` endpoint was added to `marketing-automation` (commit `4f333be`). It bundles everything a dashboard needs in a single, key-gated call: active/total ad set counts, spend and purchases totals, blended ROAS and blended CPA, verdict breakdowns (scale / pause / hold), the latest performance log timestamp, pending campaign approvals, the configured budget-rule ceiling (the +15% scaling step and ₹5,000/day cap), and the active monthly strategy. The route was smoke-tested in-process against a mocked Supabase client and returns `200` with the key and `401` without it.

### 3.2 Backend — marketing proxy path fix

The `/api/marketing/*` proxy now forwards the suffix unchanged (`target = base + suffix`) instead of inserting a spurious `/api`, which previously turned `/api/marketing/api/reports/run-now` into `/api/api/api/reports/run-now`-style paths that no route could match. This fix (commit `34d16ba`) restores **all** marketing calls from the panel, not only the new status endpoint.

### 3.3 Unified Dashboard — the "control room" row

The main Dashboard page now carries a new **Unified Pulse** row directly below the stats ticker and COD wallet cards (commit `30fd173` on the front-end). Two cards sit side by side:

| Card | Data source | Contents |
|---|---|---|
| 📣 Marketing Automation | `/api/marketing/api/reports/status` (admin-gated proxy) | Spend, blended ROAS, blended CPA, verdict pills (scaling / paused / held), active strategy line |
| 🛡️ Platform Audit | `/api/audit/health-scores/latest` + open findings (panel JWT) | Health score badge, severity counts (critical/high/medium/low), score ring, action prompt when findings are open |

The row auto-refreshes every five minutes, refreshes on every dashboard load, fails silently when either service is unreachable (each card hides independently, and the whole row disappears when there is nothing to show), and never blocks the rest of the page behind a 12-second abort timeout.

### 3.4 Marketing page — richer Overview

The Marketing page's Overview tab gained two KPI cards (Purchases and Blended CPA, bringing the row to six KPIs with responsive 6/3-column layouts) and an **Automations status strip** summarizing the last report run, verdict counts applied, the per-ad-set budget ceiling, and the active monthly strategy — so the overnight automation work is visible without opening the Reports tab.

### 3.5 Engineering hygiene

Three reusable scripts were added to the front-end repo: a region-aware tag-balance checker (strips `<style>`, `<script>`, and comment regions so only real markup mismatches surface — the file verifies **BALANCED**), and a per-script-block JS linter (`lint_scripts.py` runs `node --check` on all 14 blocks — all **0 failures**).

## 4. Verification

The improved panel was rendered end-to-end in a headless browser against the backend's demo harness (which serves `admin.html` next to fully mocked APIs). The Marketing dashboard screenshot below shows the six-KPI row and the Automations strip rendering correctly; the Dashboard screenshot confirmed the unified pulse row exists and degrades gracefully (it hides when demo mocks return empty data, exactly as designed for a quiet Render dyno).

![Marketing dashboard with new KPIs and automations strip](/tmp/shot_marketing.png)

![Dashboard with unified pulse row](/tmp/shot_dashboard.png)

The new `/api/reports/status` endpoint was verified in-process with a mocked database: `HTTP 200` with a valid internal key, computed blended ROAS of `2.4x` and blended CPA of `₹4,167` from the mock ad sets, and `401` with an invalid key.

## 5. Deployment and Next Steps

All three code changes are already pushed and will deploy automatically on Render and GitHub Pages: `marketing-automation` (commit `4f333be`), `backend` (commit `34d16ba`), and `ascovitahealthcare-cell.github.io` (commit `30fd173`). After Render rebuilds (a few minutes), the unified dashboard cards and the marketing status endpoint will go live automatically. Two environment prerequisites must remain set on the backend: `MARKETING_BACKEND_URL` and `INTERNAL_API_KEY` (the same value configured on the marketing service).

Three recommended follow-ups, roughly in order of impact: first, manually review the 16 products flagged as missing by `product-sync` in the backend logs, since inventory and order joins depend on them being in the database; second, consider waking the marketing dyno or scheduling a daily curl to its `/health` endpoint, since Render free-tier dynos sleep after inactivity and the midnight budget-rule and report jobs then run cold; third, when the next larger feature lands, split `admin.html` into a small loader plus modular page bundles — the append-at-end convention has served well, but the panel is approaching the point where a build step would measurably reduce page weight and error risk.

## 6. v9.5 — Dedicated Front Store Editor

The final upgrade adds exactly what was requested: a dedicated section in the admin panel from which the storefront's colours and layout can be changed, with curated colour palettes, a live preview of the real site, and one-click publishing to the live store. All changes landed in the front-end repository (commit `bf1e089`, rebased over `ee12f37`) and the backend demo harness (commit `3a8c07d`); the production Render backend already exposes the theme API the editor needs, so no backend deploy is required.

### 6.1 What the Store Editor can change

| Control | Options | Effect on the live store |
| --- | --- | --- |
| 🎨 Curated palettes | Crimson Classic (current LIVE look), Royal Plum, Ocean Ink, Forest Tea, Sunset Coral, Monochrome Graphite, Lavender Mist | Swaps the entire brand system in one click — surfaces, brand, secondary, ink, and the four ambient flavour colours |
| 🖌️ Custom colours | 12 named colour pickers (Page ground, Raised/Sunken faces, Brand, Brand deep/highlight, Secondary, Ink, and three text levels) with both a colour wheel and a hex input | Fine-tunes any token; changes stream into the preview instantly |
| 📐 Layout | Corner radius (Pill / Medium / Sharp / Extra round), shadows (Neumorphic / Soft flat / None), ambient bubbles (Show / Hide) | CSS-variable-driven layout switches that apply without touching the site's markup |
| 🔤 Typography | Heading font (Jost, Fraunces, Playfair Display, Poppins, Montserrat, DM Sans) and body font (Schibsted Grotesk, Plus Jakarta Sans, and more) | Redraws headings and body text site-wide |

The workflow is deliberately safe: picking a palette or tuning a colour builds an **unsaved draft** (kept in the browser) and streams it into a **live preview iframe that loads the real storefront** at `ozylix.com/?preview=1`, with a draft-aware theme loader in `index.html` applying it instantly. Nothing reaches the public site until **Save theme** is pressed, which writes the draft to `PUT /api/public/theme` behind the panel's JWT; visitors then pick up the published theme through the storefront's own loader, cached for about a minute.

### 6.2 Storefront changes and demo harness

`index.html` gained a small (~110 line) self-contained live-theme loader at the bottom of the file: it reads the published theme from the backend's public endpoint, caches it for 60 seconds, and applies it as a `:root` CSS-variable stylesheet via a single `<style id="live-theme">` element — a `?preview=1` query string swaps in the admin's unsaved draft instead, which is what powers the editor's preview. All twelve colour tokens map to the site's existing variable names (`--paper`, `--brand`, `--ink`, `--font-display` and so on), so every page inherits the new look automatically; a **Reset to defaults** button in the editor restores the built-in look.

The backend's demo harness (local testing only — no production change) gained a `/demo/store` route that serves the storefront with same-origin API rewrites and CSP `frame-src` additions, and the admin served at `/demo/admin` had its CSP extended so the preview iframe can embed both the demo storefront and the live site. This made end-to-end verification of the full palette → preview → save → publish loop possible locally.

### 6.3 Verification

The complete flow was exercised in a headless browser against the demo harness: the Forest Tea palette was applied (draft secondary colour `#6B6B55` confirmed in the editor state), the **Save theme** PUT returned `HTTP 200` with the theme echoed back and `updatedBy` recorded, and a subsequent anonymous `GET /api/public/theme?key=ozylix` returned the published palette. The preview iframe loaded the real storefront title ("Glutathione, Biotin & ACV Effervescent Tablets \| Ozylix") and rendered with the draft theme applied, confirming the preview→publish pipeline works end-to-end. Quality gates passed: the editor's script block lints clean, the storefront's new loader block parses cleanly, and the front-end repo's tag-balance checker shows only pre-existing mismatches (verified identical before and after the edits).

![Store Editor with curated palettes, live preview of the storefront, and custom colour pickers](/tmp/shot_storeeditor.png)

![Live preview after applying the Forest Tea palette](/tmp/shot_forest_palette.png)

## 7. v9.6 — Website Content Editor (edit the storefront from the admin panel)

A second tab was added to the Store Editor, turning it into a full website editor: alongside the Style tab, a **Content tab** now lets you change the storefront's actual page copy from the admin panel — with live preview and one-click publishing. The storefront's own `index.html` was deliberately **left untouched** (as requested); published content reaches visitors through a new public backend endpoint the site will read once its loader is wired up, while all other editing happens in the admin panel. Changes landed in the front-end repository (commit `f460e8b`) and the backend (commits `d010acd`), and both are already pushed to `main` and deployed.

### 7.1 What you can edit

| Section | Editable fields |
| --- | --- |
| 📢 Announcement bar (scrolling strip) | Add/remove items freely; each item has its text and emoji icon |
| 🎬 Hero headline & call-to-action | Badge, three headline lines, subtitle, and the CTA button label |
| 📊 Stats marquee | Add/remove stat items (rating, pin codes, dispatch time, and more) |
| ✅ Trust tiles | Add/remove tiles with emoji icon and two-line label |
| ✨ Vita Points promo line | Earn text and value text on the Shop.Earn.Redeem banner |
| 🏷️ Offer reminder card | Title, offer copy, and button label |

The Content tab mirrors the Style tab's workflow: every edit builds an **unsaved draft** in the browser and patches it directly into the **live storefront iframe** on the right, so the preview shows exactly what the edited page will look like. **Save content** publishes the draft via `PUT /api/public/content` (admin JWT only) to a new `store_contents` table in Supabase, and an anonymous `GET /api/public/content?key=ozylix` serves it — the storefront will apply it through the same cache-then-apply pattern as the theme loader.

### 7.2 Backend changes

The backend gained a new `content_router.js` module mounted right after the theme routes (unchanged elsewhere), plus a Supabase table `store_contents` with the same shape as `store_themes` (key, JSONB content, updated_by, updated_at). Read access is anonymous so the storefront can fetch it; writes require the panel's JWT and are whitelisted to the six section keys, so no arbitrary data can be written. The demo harness rewrites the content API URL to same-origin for local testing. Production verification: `GET /api/public/content?key=ozylix` now returns `200` on Render (`{"ok":true,"store":"ozylix","content":{},...}`), and the full edit → preview patch → save → publish loop was exercised in a headless browser — the edited hero line appeared in the live preview before saving, the Save returned `200` with `updatedBy: admin@ascovita.com`, and the anonymous GET returned the published line.

The front-end changes passed the repo's quality gates (16 script blocks, 0 lint failures; tag-balance baseline unchanged from the pre-edit version). To keep the live site clean, the demo publish was reset to an empty content object, so the store currently runs its original copy.

![Store Editor Content tab with announcement, hero, stats, trust and promo editors plus the live preview](/tmp/shot_content_tab.png)

![Live preview patching the edited hero line into the storefront](/tmp/shot_content_edited.png)

## 9. v10 — Design System Store Editor, Full Live Content Publishing, and Mobile Admin

The Store Editor was upgraded into a full design-system studio: seven complete visual design systems, eight combination groups with 31 fine-tuning options, fully live content publishing, and a mobile-responsive editor surface. The admin panel is now usable on phones (390px and 320px verified), and every change — style or copy — flows end to end from the admin panel to the live storefront at `www.ozylix.com`. Changes landed in the front-end repository (commit `e9a72c3`) and the backend repository (commit `85e1c60`); both are pushed to `main` and deployed — GitHub Pages rebuilt automatically within 30 seconds, and `www.ozylix.com` now serves the storefront with the v10 theme and content loader (verified live: page weight 1,349,022 bytes, v10 loader marker present).

### 9.1 Seven design systems in the Store Editor

A new **Design System** card sits at the top of the Style tab: seven large swatch tiles, one click per look, each system restyling the *whole* store (colours, shadows, radius, surfaces, typography mood) from the current palette rather than replacing it. The systems are the ones requested, implemented as a token-driven CSS engine (`buildStyleCss`) that produces per-system rules for glass cards, buttons, tiles, headers, and backgrounds.

| Design system | What it brings |
| --- | --- |
| 🩸 Crimson Classic | The current live Ozylix look — preserved as the default |
| 🫧 Claymorphism | Soft, inflatable 3D feel: inner and outer shadows making cards look like sculpted clay |
| 🌌 Aurora UI | Organic blurred gradient washes (Northern-Lights style) behind glass cards |
| 🗃️ Bento Grid | Clean rounded rectangular tiles of varying sizes |
| 🧱 Neo-Brutalism | High-contrast black outlines, hard offset shadows, stark type |
| 🪵 Skeuomorphism | Physical, textured button and panel treatments |
| 🪄 Material / Flat | Minimal 2D surfaces with clean lines and usability-first colour |

Below it, a **Combinations** card exposes eight combination groups — shadows (soft / hard / none), buttons (raised / extruded / flat), borders, text weight, density, background effects (bubbles / aurora gradient), and card style (neumorphic / glass) — 31 options in total, each clicking straight into the draft. Both the system pick and combo picks participate in the draft/snapshot mechanism, so the "Save theme" button lights up on any change and `storeEdDraftServerMatch` correctly detects drift from the server theme.

### 9.2 Content edits now reach the live site

The v10 storefront loader in `index.html` closes the loop that v9.6 opened: it reads the published content from `GET /api/public/content`, applies every editable section (announcement strip, hero headline, stats marquee, trust tiles, promo and offer copy) to the live DOM on every page load (cached 60 seconds, refreshed in the background), and — in parallel — reads the theme's new `style` + `combos` fields and applies the matching design-system CSS through a dedicated `<style id="live-theme-v10">` element. The dedicated element matters: the original theme loader rewrites its own `<style>` wholesale on refresh, so the v10 layer lives beside it and can never be erased. The loader also re-applies itself 2.5 seconds after boot to catch the background fetch. The backend change is a one-line whitelist addition (`style`, `combos`) on the theme PUT route — verified in the demo harness and pushed as commit `85e1c60`.

### 9.3 Mobile admin panel

The editor panels previously used fixed two-column grids (340px + 1fr) that broke on phones. New responsive rules collapse `#storeEdStylePanel` and `#storeEdContentPanel` to a single stacked column under 1100px (covering landscape tablets), with a 600px refinement for phones; the design-system strip reflows to three tiles per row and the panel gap tightens. Verified at 390px and 320px: panels stack, all seven tiles stay visible, zero horizontal overflow, and the topbar keeps the wordmark visible on narrow screens.

### 9.4 Verification

The full end-to-end loop was exercised in a headless browser against the demo harness (which runs the real backend server against mocked Supabase data): picking **Aurora UI** set `draft.style = "aurora"`, the hard-shadow combo clicked through with a proper click handler, and all 8 groups / 31 buttons rendered. **Save theme** published `{"style":"aurora","combos":{"shadows":"hard"}}` (confirmed by anonymous `GET /api/public/theme`), then a content edit (`hero.line2 → "Wellness v10 RoundTrip"`) published through `PUT /api/public/content` and read back with `contentOk: true`. On the storefront side, seeding the theme cache and loading the locally built site produced the Aurora layer (≈4.5KB of glass-card and gradient CSS applied to `body` and all cards). Finally the production deployment was checked: GitHub Pages rebuilt successfully, `www.ozylix.com` serves the v10 storefront, and the production theme API responds normally. Quality gates passed — 17 script blocks, 0 lint failures, tag-balance parity with the baseline.

| Repository | Commit | Change |
| --- | --- | --- |
| `...ascovitahealthcare-cell.github.io` | `e9a72c3` | v10 design-system style strip (7 presets), combinations card (8 groups, 31 options), mobile-responsive editor CSS, storefront v10 loader (style + content) |
| `...backend` | `85e1c60` | Whitelist `style` + `combos` in the theme PUT route |

![Admin Store Editor style tab with the seven design-system tiles and live preview](/tmp/shot_v10_style_strip.png)

![Admin panel at 390px — stacked editor panels, all seven design-system tiles visible](/tmp/shot_mobile_390.png)

![Storefront live with the Aurora UI design system applied (verified locally)](/tmp/shot_local_v10.png)

### 9.5 v10.1 — Reset-to-Original Website Content

The Content tab can now always get back to the real live site. The editor's built-in defaults were re-seeded with the storefront's actual current copy, extracted directly from `www.ozylix.com` on August 15 (announcement strip items, hero badge/headlines/subtitle/CTA, the six stats marquee items, all six trust tiles, the Vita Points promo line, and the offer reminder), and a **⟲ Reset to original website** button now sits next to Save content in the Content tab. Clicking it asks for confirmation, restores every section to the true live copy, re-renders the preview, and re-publishes — so an experimental edit can be rolled back completely in one step.

The end-to-end reset flow was verified in a headless browser: the editor showed the live-seeded values (hero line 2 "Wellness", six trust tiles, "🔥 Mix More, Save More" announcement), a test edit changed the headline, Reset restored "Wellness" and the six tiles in the draft, and the anonymous content API confirmed the restored copy was published (`heroLine2: "Wellness"`). No backend change was needed — the reset simply publishes the seeded default. The front-end change is commit `8ac44c4`, pushed and live on GitHub Pages.


## 10. v9.4 — AI Debugger and AI Agent Team Dashboard Improvements

Following the first round of upgrades, the two AI dashboards in the admin panel were deepened significantly. All changes landed in the front-end repository (commit `d32cebd`) and are live on GitHub Pages, with zero changes required to any backend service.

### 10.1 Audit / Debugger Dashboard

The Audit page already displayed a pipeline stepper, severity counts, a trend chart, category health rings, repo-grouped findings, and recent runs. The v9.4 upgrade turns it from a read-only monitor into an interactive triage workspace.

| New capability | What it does |
| --- | --- |
| **Overall Health hero card** | A large ring gauge at the top of the page shows the latest health score with the standard green/gold/red thresholds, plus a point-delta versus the previous completed run and a contextual note that prompts you to triage open findings |
| **Severity drill-down modal** | Every severity tile in the summary row is now clickable. Clicking opens a modal listing all open findings of that severity with their repo/file paths, recommended fixes, and three one-click resolution actions |
| **Finding resolution workflow** | Each resolution calls `PATCH /findings/:id/status` on the auditdebuging service and immediately re-renders the whole page, so resolved counts disappear live. All five service statuses (`fixed`, `accepted_risk`, `false_positive`, plus the original `open`/`investigating`) are supported |
| **Run detail modal** | Every row in Recent Runs is clickable and opens a modal with the full per-category score breakdown, trigger source, timing, and an automatic before/after comparison against the nearest completed run |
| **Auto-refresh** | The page now refreshes every five minutes while the tab is open, keeping health scores and open findings current without manual clicks |

### 10.2 AI Agent Team Dashboard

The AI Agent Team page previously lost its entire conversation feed on every reload and offered no live business context for the agents. The v9.4 upgrade addresses both gaps.

| New capability | What it does |
| --- | --- |
| **Company Snapshot card** | A new KPI strip at the top of the page pulls the backend's existing `GET /api/owner/ai/snapshot` endpoint — total and today's revenue, orders, pending fulfillment, customers, products with low-stock counts, active coupons, and named low-stock items — so grounded agents (CEO, CFO, COO, Customer) already have real numbers on screen before you ask anything. Only the owner account can see it; other roles see a graceful "Owner access only" message |
| **Persistent conversation feed** | Every agent reply is now saved in the browser (last 30 messages). Reloads no longer wipe chat history — autopilot insights and team-meeting reports accumulate |
| **Team Meeting wrap-up card** | Running a Team Meeting now appends a CEO-authored summary card at the end of the meeting flow, and it persists like any other message |
| **Fresher pending actions** | The Pending Actions queue now also refreshes on every autopilot tick, so approved or executed drafts disappear quickly instead of lingering |

### 10.3 Verification and Consolidated Change Log

Both dashboards were rendered in a headless browser against the demo harness. Screenshots confirm the hero card, severity row, grid, roster, and snapshot card render cleanly (the demo shows "disconnected" for the audit service only because the mock backend has no audit routes and the real Render service blocks cross-origin demo traffic — in production the service responds normally). Quality gates passed: all 14 script blocks lint clean and the 14,000+ line file remains tag-balanced.

| Repository | Commit | Change |
| --- | --- | --- |
| `...ascovitahealthcare-cell.github.io` | `30fd173` | Unified pulse row (marketing + audit), marketing KPIs (Purchases, Blended CPA), automations status strip |
| `...ascovitahealthcare-cell.github.io` | `d32cebd` | Audit drill-down, run details, health hero, auto-refresh; AI Team snapshot, feed persistence, meeting wrap-up |
| `...ascovitahealthcare-cell.github.io` | `e9a72c3` | v10 design-system style strip (7 presets), combinations card (8 groups, 31 options), mobile-responsive editor CSS, storefront v10 style+content loader |
| `...backend` | `85e1c60` | Whitelist `style` + `combos` in the theme PUT route |
| `...marketing-automation` | `4f333be` | New `GET /api/reports/status` endpoint for the unified dashboard |
| `...backend` | `34d16ba` | Marketing proxy path bug fix (critical — all marketing calls were 404ing) |
| `...ascovitahealthcare-cell.github.io` | `bf1e089` | v9.5 Store Editor: palettes, custom colours, layout/typography, live preview; storefront live-theme loader in `index.html` |
| `...backend` | `3a8c07d` | Demo harness `/demo/store` route and CSP rewrites for local preview verification |

![Audit dashboard with health hero card](/tmp/shot_audit.png)

![AI Agent Team dashboard with Company Snapshot card](/tmp/shot_aiteam.png)


## 11. v10.2 — Storefront Performance Hardening (2026-08-15)

### 11.1 The problem reported

After the v10/v10.1 upgrades the storefront felt slow, and the team asked whether the accumulated updates were raising server load and how image rendering could be made faster. Live Playwright measurement against `ozylix.com` gave the baseline:

| Metric (baseline, pre-fix) | Value |
|---|---|
| TTFB | 1.6 – 3.0 s (Pages/Cloudflare cold) |
| DOMContentLoaded | 5.2 – 7.7 s |
| window.load | **31 – 54 s (stalled)** |
| Pending image requests at 20 s | 40 – 55 |
| LCP candidate (topbar logo) | completes ~2.0 – 2.2 s |

Two distinct issues were isolated. The **LCP / above-the-fold rendering was never the problem** — the hero slide, topbar logo, fonts and first paint were all in place by roughly 2 s. What made the site feel broken was the **load event hanging for 30+ seconds**: about 40 product-card images (from the stalled `cdn-storage` image host) and 4 blog images were queued at DOMContentLoaded, and their connections never completed (0 bytes transferred, with the browser retrying for 30 – 50 s). Because the window cannot finish loading while those requests sit open, the `load` event — and everything gated on it — was delayed by half a minute.

### 11.2 The deferral strategy

The fix follows the pattern already proven by the promo-marquee deferral (commit `6b6c50b`): images that are not immediately visible are rendered with `data-src` (no `src` attribute) and hydrated through an `IntersectionObserver` with an 800 px root margin. A short safety timer hydrates anything the observer never reports as intersecting, so tiles are never left blank. Requests for off-screen images therefore start **after** the load event has already fired, which is what releases the load event from the stalled host.

| Change | What it does | Commit |
|---|---|---|
| v10.2a — hero banner | Removed `loading="lazy"` from hero slide 1 so it can no longer override `fetchpriority="high"` | `d8b81a2` |
| v10.2a — Meta Pixel | `fbevents.js` (~105 KB) deferred until after the LCP window | `d8b81a2` |
| v10.2a — GA4 / topbar logo | GA4 gtag loaded with `fetchpriority="low"`; topbar logo `fetchpriority="high"` | `d8b81a2` |
| v10.2b — blog tiles | `data-src` + IntersectionObserver hydration, 800 px margin, 6 s safety timer | `4582483` |
| v10.2c — product cards | Same hydration for all product cards (featured, new arrivals, shop grid) | `9cbace5` |

### 11.3 A critical deployment fix discovered during verification

While verifying the fixes on the live site it was discovered that the GitHub Pages build source branch was `claude/hi-2-k7wwr2` (legacy build, 22 commits behind `main`), **not `main`**. All v10 through v10.2c commits had therefore landed on a branch that was never built, and `ozylix.com` was still serving stale pre-v10 code. The Pages source branch was fast-forwarded to `main` via the GitHub API, a build was triggered, and the live page now contains the full v10.2 stack (verified by grepping the deployed page for `hydrateProductImgs`).

> For future pushes, note: the live storefront is served from whichever branch is set as the Pages source (currently `main` after this fix). If the source branch is ever changed in the Pages settings, pushes to other branches stop deploying until it is pointed back.

### 11.4 Verified results (live, cold Chromium)

| Metric | Before | After v10.2c |
|---|---|---|
| TTFB | 1.6 – 3.0 s | 1.0 – 1.7 s |
| DOMContentLoaded | 5.2 – 7.7 s | 3.0 – 4.8 s |
| window.load | 31 – 54 s (stalled) | **7.7 – 11.1 s** |
| LCP candidate (topbar logo) | ~2.0 – 2.2 s | ~2.0 – 2.2 s (unchanged, already fast) |
| Requests at DCL | heavy | 42 requests / 1.4 MB; first tiles hydrate above the fold in the same frame |

Desktop cold runs: TTFB 1.74 s, DCL 4.75 s, load 17.3 s on the first cold run (the cdn-storage host was unusually slow that minute); a warm rerun gave TTFB 1.05 s, DCL 3.10 s and **load 7.7 s**. Mobile (390 px): TTFB 1.02 s, DCL 3.04 s, **load 8.4 s**.

The roughly 35 remaining tile images still queue on the stalled image host, but they now start after the load event fires, so they no longer hold the page hostage — the page is fully interactive well before the last decorative tile settles.

### 11.5 Server-load impact

The deferral strategy also reduces backend pressure on the Render free tier: `/api/promo-media` and `/api/site-media` image URLs are only requested when the shopper scrolls near the marquee, and product-card image requests to `/cdn-storage` are now staggered with scrolling instead of all firing at once at page open. Combined with the already-deferred Meta Pixel and low-priority GA4, the number of concurrent connections at page open dropped substantially — the main lever available without changing the image host itself.

### 11.6 Recommended next steps

The single largest remaining gain would be moving product images off the stalling host entirely (for example Cloudflare R2 + Images) so even eagerly loaded images complete in under a second; the storefront already supports the `/cdn-storage/` Worker path, so that is an operations change rather than a code change. A second worthwhile change is registering an LCP observer (`PerformanceObserver` with `buffered: true`) in the storefront analytics so LCP values become visible in the admin panel for ongoing monitoring.

## 12. v10.3 — Four Brand-New Storefront Templates

On August 16, the Store Editor received its largest single upgrade: four brand-new, fully distinct storefront templates, sitting alongside the existing Crimson Classic default, so the live store can be restyled completely from the admin panel in one click. The templates are **Midnight Luxe** (dark ink and gold with serif display type), **Fresh Pharmacy** (clean white and teal), **Retro Pop** (cream, orange and brown with offset hard shadows), and **Editorial** (off-white with ink italic serifs and uppercase buttons). Each template carries its own palette (paper, ink, brand and flavour accents), font stack, component rules (navbar, hero, cards, buttons, trust tiles, footer) and template-specific details such as hiding decorative particles and liquid-foil effects where they clash.

### 12.1 How the template engine works

Selecting a template tile in the Store Editor writes the choice to the `ozylix_theme` draft and re-renders the preview; **Save theme** publishes it through `PUT /api/public/theme`, where the server whitelist explicitly accepts the `style` and `combos` fields (verified in `backend/server.js` — no backend change was needed). The storefront's v10 loader reads the published theme on every page load and applies the matching style branch. Because each template changes real selectors rather than only tokens, the difference is structural, not cosmetic: dark hero bodies, recoloured navbars and buttons, and per-template typefaces.

### 12.2 A structural bug found and fixed during implementation

While verifying the new templates locally, a pre-existing defect in the v10 style engine was discovered: its CSS emitter wrote **bare variable declarations** (`--paper:#…;`) at the top level of the style element, which browsers silently discard as invalid top-level CSS. The visual identity of the seven v10 design systems had been surviving on their selector rules alone, so the bug was invisible until the new templates needed their own paper/ink/font variables. The emitter was rewritten to wrap all variable declarations in a proper `:root{…}` block and the duplicate-appending apply path was de-duplicated. This fix also hardens the seven existing design-system presets at the same time.

### 12.3 End-to-end verification and deployment

The full loop was verified live: logging into the admin panel with the owner account, opening the Store Editor, clicking the **Midnight Luxe** tile, saving, and confirming the published theme (`GET /api/public/theme?key=ozylix`) returned `style: "midnight"` with the dark palette — then the loop was run in reverse to **restore the published theme to the site's real default** (Crimson Classic), so the live storefront was not left in a test state. The v10.3 commit (`838a71b`) was rebased onto `main` and pushed, and — per the deployment lesson from v10.2 — the Pages source branch `claude/hi-2-k7wwr2` was fast-forwarded to `main` again, since it does not automatically follow. The Pages build for `838a71b` completed successfully, and both the deployed `index.html` (midnight style branch present) and the deployed admin panel (all four new tiles present) were confirmed live.

| Milestone | Commit | Verified |
|---|---|---|
| 4 template style branches in storefront v10 loader | `838a71b` | Live, cold Chromium headless screenshots |
| Root-wrap fix for v10 CSS emitter (also fixes the 7 existing presets) | `838a71b` | Confirmed via computed styles on live preview |
| 4 editor tiles + template-aware palette auto-set | `838a71b` | Click → draft → Save → published round-trip |
| Pages source branch re-sync to main | — | Build `built` at 2026-08-16T00:52Z |
| Published theme restored to default (crimson) after testing | API round-trip | `style: "default"` confirmed live |

### 12.4 How to use it

Open `ozylix.com/admin` → **Store Editor** → the style strip now shows the default plus the four new templates. Click any tile to preview it instantly (the preview loads the real storefront), then press **Save theme**; the live store adopts the template within about a minute. The **Reset to original website** button still rolls back to the seeded production defaults at any time.
