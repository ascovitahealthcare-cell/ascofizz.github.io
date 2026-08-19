# White-label demo storefronts

Six complete supplement storefronts — six brands, six product portfolios, six designs —
running on one shared e-commerce engine.

Open **[`storefronts/index.html`](index.html)** for the switcher, or go straight to a brand:

| # | Brand | Portfolio | Audience | Folder |
|---|-------|-----------|----------|--------|
| 01 | Ascofizz | Effervescent supplements | Everyday wellness | [`ascofizz/`](ascofizz/) |
| 02 | Arcadia | Premium everyday wellness | Premium daily health | [`arcadia/`](arcadia/) |
| 03 | Forge | Sports & gym nutrition | Gym, athletes, active | [`forge/`](forge/) |
| 04 | Algaeva | Spirulina & superfoods | Natural, plant-based | [`algaeva/`](algaeva/) |
| 05 | Chewly | Gummies, chewables & suckers | Families, young adults | [`chewly/`](chewly/) |
| 06 | Ascofizz Original | The existing catalogue | Existing customers | [`ascofizz-original/`](ascofizz-original/) |

---

## The split

**CORE — written once, shared by all six, never forked:**

authentication · product model · cart · checkout · payments · orders · customer accounts ·
admin panel · inventory logic · search · filtering and sort · APIs

**STOREFRONT — one pack per brand, the only thing a new tenant writes:**

brand identity · colour palette · typography · navigation · homepage · product cards ·
product page · category presentation · merchandising · footer · mobile navigation · motion

A brand swap changes the second list. It does not touch the first. Add something to the
basket in any of the six and you are in the same checkout, priced by the same code.

## How a storefront is assembled

`index.html` at the repository root **is** the engine — a single-file storefront application.
`scripts/build-storefronts.py` copies it verbatim into each brand folder and makes exactly four
mechanical adjustments, all of them consequences of serving one file from a subfolder:

1. document-relative asset paths (`assets/…` → `../../assets/…`)
2. the `<title>`
3. service-worker registration, disabled — six storefronts share one origin, and a worker
   registered at scope `/` from any one of them would answer navigations for all six out of a
   single cached shell
4. two include lines for the template layer

The engine file itself is never hand-edited, and no storefront carries a modified copy of it.

## What a brand pack contains

```
storefronts/<brand>/
  index.html          ← GENERATED. engine + this brand's pack. do not edit
  template/
    brand.css         ← palette, type, and every component this brand draws
    brand.js          ← catalogue, product card, product page, header, home, footer
```

`template/brand.js` ends in a single `WL.define({…})` call:

```js
WL.define({
  slug, name, title,
  catalog,        // the brand's portfolio, in the engine's own product shape
  packshot,       // draws this brand's packaging as an inline SVG
  card,           // product card markup
  productPage,    // writes the engine's #productDetail node
  header, home, footer, shopIntro,
  categories,     // the merchandising taxonomy for the shop page
  bottomNav,      // mobile bar destinations
  onMount         // anything the template needs after the engine boots
});
```

`storefronts/_kit/wl-kit.js` is the seam between the two layers. It installs the catalogue
before the engine's first render, swaps the chrome after the engine has booted, and provides
the shared helpers — packshot drawing, merchandising selectors, the reveal observer, the demo
switcher, and the routing shim that keeps clean URLs working from a subfolder.

Template 06 calls `WL.baseline()` instead, which adds the switcher and nothing else: no
`data-tpl` attribute is set, so not one rule of the template layer applies to it. That is the
point of shipping it — the storefront a customer already runs keeps working, untouched, on the
same platform as the other five.

## Rebuilding

```bash
python3 scripts/build-storefronts.py
```

Run it after editing the engine or any brand pack. It rewrites every `storefronts/*/index.html`
and refuses to double-inject a template layer.

## Adding a seventh brand

1. `mkdir -p storefronts/<slug>/template`
2. write `template/brand.css` and `template/brand.js` (copy the closest existing pack as a start)
3. add the slug to `STORES` in `scripts/build-storefronts.py`
4. add it to `STORES` in `storefronts/_kit/wl-kit.js` so the switcher lists it
5. add a card to `storefronts/index.html`
6. `python3 scripts/build-storefronts.py`

No change to the cart, checkout, orders, accounts or admin is involved at any step.

## About the demo data

Brands, products, prices, ratings and reviews in templates 01–05 are fictional and exist to
demonstrate merchandising. Product artwork is drawn as inline SVG packaging by each brand's
`packshot()` — set a real photo URL on a product's `image` field and the engine's own image
pipeline takes over. Template 06 carries the real Ascofizz catalogue.
