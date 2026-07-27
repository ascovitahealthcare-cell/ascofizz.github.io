# DESIGN.md — Ascofizz · "Effervescent Bloom"

Recorded from the built storefront, not from intention. Source of truth is
`assets/css/01-core.css`; everything below describes what that file and its
siblings actually do.

---

## 1 · The world

The site is the inside of a glass of water with an effervescent tablet
dropped into it. Not a wellness page *about* effervescence — the
effervescence itself, running as the interface.

The world it replaced was soft sage neumorphism on a pale ground: the
arrangement this category always ships. That look is now anti-reference.

Three materials, and nothing else:

| Material | What it is | Where it appears |
|---|---|---|
| **Water** | A mineral column lit from the surface, falling to near-black at depth | The page ground, fixed, everywhere |
| **Aluminium** | Brushed tube wall with a real bevel lit from above | Every card, panel, drawer, bar |
| **Specimen plate** | A lit near-white well | Anything the customer judges with their eyes: product photography, cart thumbnails, invoices |

The plate exists because supplement photography arrives on white. Dropping
white-ground product shots onto dark glass makes glowing rectangles; giving
them a deliberate lightbox instead turns the constraint into the strongest
contrast move on the page.

## 2 · Colour

Strategy: **full palette**. Four named flavour roles, taken from the actual
product range, each owning whole regions rather than being sprinkled as
accents.

```
--f-citrus   #FF8A3D   Vitamin C · Glutathione · L-Carnitine
--f-apple    #8EE05A   ACV + Moringa
--f-guava    #FF5C82   B12 + Biotin
--f-cobalt   #4A9BFF   B12 · D3 · Magnesium
--f-mineral  #17E0C0   the water itself — connective tissue, primary action
--seal       #E8B33C   foil: certification, kickers, tier gold
```

Water column, surface → depth:
`#0E5A5E → #0A4247 → #072E36 → #041D24 → #02141A`

Text on water: `--t-hi #F4FEFB`, `--t-mid #A8C8C7`, `--t-low #93B7B8`,
`--t-dim #7EA3A5`. The low/dim steps are set where they are because
anything darker fell under 4.5:1 against mid-depth water — measured, not
guessed. Text on a specimen plate is `--t-onlight #06272B`.

**The bloom is a live channel.** `--bloom` on `:root` and a matching WebGL
uniform carry whichever flavour is currently dissolving. Pointing at a
product card, category tile or promo label pushes that product's flavour
into the water; the hero re-tints over ~45 frames. `flavourOf()` in
`assets/js/bloom-engine.js` derives the flavour from the product's own name,
so new products inherit it without configuration.

Never: gradient-filled text; a colour used because it is "accent-coloured"
rather than because a flavour lives there.

## 3 · Type

- **Display — Bricolage Grotesque**, 700–800, tracking −0.03 to −0.06em.
  Compressed and industrial: the print on a supplement tube.
- **Everything else — Schibsted Grotesk**, 400–800.
- `font-variant-numeric: tabular-nums` globally. Prices, points, counters
  and order totals must not shimmy between states.

Scale: hero `clamp(3.5rem, 10.5vw, 9.2rem)`; section titles
`clamp(2.1rem, 4.6vw, 3.7rem)`; page headers cap at 3.6rem because a
utility header is wayfinding, not a thesis. Body measure ≤ 72ch,
`text-wrap: balance` on headings, `pretty` on paragraphs.

Emphasis comes from weight and size. The three hero lines are one family
graded 500 / 800 / 300 — no colour trick, no gradient fill.

## 4 · Depth

Shadows carry offset *and* soft blur, tinted with the water rather than
black: `--sink-1` … `--sink-4`. `--bevel` is the aluminium edge — bright
top inset, dark bottom inset — and appears on every metal surface.

`--lit-mineral` / `--lit-seal` are reserved for controls that emit light
(primary actions, the certification seal). They are the only halos in the
system; a colored glow anywhere else is decoration and is not used.

Cards live in a shared perspective scene (`--depth: 1300px`). On
pointer-capable devices the engine tilts them up to 9°/11° with a 26px
z-lift, tracking the pointer.

## 5 · Motion

Easing: `--rise` (exponential ease-out) for almost everything, `--fizz`
(buoyant, ~6% overshoot) for controls, `--settle` for ambient loops.
Nothing is `linear` or `ease-in-out`.

**One authored moment**, in the first viewport: a WebGL fragment shader
running the dissolve — a depth-graded water column, caustics on the near
wall, and 54 procedurally rising bubbles with a refractive rim, a lit
crescent, and a hollow core that carries the current flavour. Everything
else is quiet by comparison: reveals rise and unblur like a bubble
surfacing, tilt responds to the pointer, marquees drift.

Performance envelope (`LOW` in `bloom-engine.js`): coarse pointer, viewport
under 900px, or ≤4 logical cores drops the shader to 0.55× resolution and
22 bubbles, and turns tilt and magnetic pull off entirely.
`prefers-reduced-motion` renders one static frame and removes the ambient
bubble field. WebGL failure falls back to a 2D-canvas rendition of the same
composition.

Animate only `transform`, `opacity`, `filter` and `grid-template-rows`.
Progress fills and carousel dots use `scaleX`, never `width`.

`backdrop-filter` is a fixed-layer effect only — navigation bar, drawers,
overlays, the mobile app chrome. Scrolling content never blurs.

## 6 · Geometry & rhythm

Radii `6 / 10 / 16 / 24 / 32 / pill`, concentric: a card at 24px holds a
well at `calc(24px − 7px)`. Sections breathe at
`clamp(72px, 9.5vw, 148px)` top and slightly less bottom — optical, not
symmetrical. Shell 1300px, gutter `clamp(18px, 4.2vw, 44px)`.

## 7 · File map

```
assets/css/01-core.css        tokens · reset · type · water · aluminium · motion
assets/css/02-shell.css       ann rail · nav · mobile app chrome · drawers · cart · auth · footer
assets/css/03-home.css        hero · promo · counters · categories · certs · reviews · rewards · bundle
assets/css/04-commerce.css    product plate · shop · detail · reviews · cart · checkout · orders
assets/css/05-pages.css       about · B2B · contact · FAQ · blog · account · advisor · print
assets/css/06-responsive.css  1180 / 1024 / 900 / 768 / 480 · coarse pointer · landscape
assets/js/bloom-engine.js     WebGL water · flavour bus · tilt · magnetics · channels · bubbles
```

## 8 · The legacy token bridge

The markup carries ~1,100 inline `style` attributes written against the old
palette. Rather than rewrite every call site, `01-core.css` re-points the
old token names (`--green`, `--dark`, `--off-white`, `--shadow-lg`, …) at
the water world. **Do not delete that block** — removing it strands every
inline style in the document.

Legacy hex literals that appeared inline (`#2E7D32`, `#8CC48F`, `#0d2005`
and 20 others) were remapped once, in place. New markup should use the
tokens directly.

## 9 · Known gaps

- `assets/ascofizz-icon-{16,32,180,192,512}.png` and `assets/favicon.ico`
  are still referenced and still missing. `assets/favicon.svg` and
  `assets/ascofizz-mark.svg` now cover modern browsers and the app chrome;
  raster icons remain for the owner to supply.
- `assets/plant-placeholder.svg` is a **labelled synthetic placeholder** on
  the About page. Replace it with the real manufacturing photograph via
  Admin → Site Images.
- The wordmark inside `assets/ascofizz-logo.svg` renders in a fallback face,
  because an SVG loaded through `<img>` cannot use webfonts. Supplying a
  real logo file through Admin → Site Images replaces it.
- `admin.html` was deliberately left on the old styling; it is an internal
  tool, not the storefront.
