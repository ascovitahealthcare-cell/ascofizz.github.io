#!/usr/bin/env python3
"""
Build the white-label demo storefronts.

Each storefront is a COMPLETE copy of the Ascofizz storefront engine
(index.html) with a template pack bolted on. The engine file is never
edited by hand and never forked: this script copies it verbatim and makes
exactly four mechanical adjustments, all of them consequences of serving
the same file from a subfolder instead of the site root.

    1. relative asset paths          assets/… → ../../assets/…
    2. the <title>                   so tabs and bookmarks name the brand
    3. service-worker registration   disabled, so six storefronts on one
                                     origin cannot serve each other's
                                     cached shell
    4. the template layer            one CSS and one JS include, appended

Everything a customer transacts through — cart, checkout, payments,
orders, accounts, auth, search, filtering, inventory, admin — is the
untouched engine underneath.

    python3 scripts/build-storefronts.py
"""

import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENGINE = ROOT / "index.html"
OUT = ROOT / "storefronts"

# slug, brand name, portfolio, browser title
STORES = [
    ("ascofizz", "Ascofizz", "Effervescent Supplements",
     "Ascofizz — Effervescent Vitamins, Minerals & Electrolytes"),
    ("arcadia", "Arcadia", "Premium Everyday Wellness",
     "Arcadia — Wellness, thoughtfully formulated"),
    ("forge", "Forge", "Sports & Gym Nutrition",
     "FORGE — Protein, Performance & Recovery Supplements"),
    ("algaeva", "Algaeva", "Spirulina & Superfoods",
     "Algaeva — Spirulina, Chlorella & Green Superfoods"),
    ("chewly", "Chewly", "Gummies, Chewables & Suckers",
     "Chewly — Gummies, Chewables & Vitamin Suckers"),
    ("ascofizz-original", "Ascofizz Original", "Existing Ascofizz Storefront",
     "ASCOFIZZ — Effervescent Vitamins & Supplements"),
]

# Paths the engine resolves relative to the document. At the site root they
# resolve against /, inside /storefronts/<brand>/ they must climb back out.
RELATIVE_PREFIXES = ("assets/", "scripts/", "invoice-template.js", "manifest.json", "sw.js")

TEMPLATE_TAG = "<!-- ══ WHITE-LABEL TEMPLATE LAYER ══ -->"

HEAD_INCLUDE = """  {tag}
  <link rel="stylesheet" href="../_kit/wl-kit.css">
  <link rel="stylesheet" href="template/brand.css">
"""

BODY_INCLUDE = """{tag}
<script src="../_kit/wl-kit.js"></script>
<script src="template/brand.js"></script>
</body>"""


def rebase(html: str) -> str:
    """Repoint document-relative URLs at the shared assets in the site root."""
    def sub(m):
        attr, quote, url = m.group(1), m.group(2), m.group(3)
        if url.startswith(RELATIVE_PREFIXES):
            return f'{attr}={quote}../../{url}{quote}'
        return m.group(0)

    return re.sub(r'\b(src|href)=(["\'])([^"\']+)\2', sub, html)


def disable_service_worker(html: str) -> str:
    """
    Six storefronts share one origin. A service worker registered at scope /
    from any one of them would answer navigations for all of them out of a
    single cached shell, so the demo copies do not register one. The root
    storefront still does.
    """
    return html.replace(
        "navigator.serviceWorker.register('/sw.js')",
        "Promise.reject(new Error('service worker disabled for white-label demo storefronts'))",
    )


def set_title(html: str, title: str) -> str:
    return re.sub(r"<title>.*?</title>", f"<title>{title}</title>", html, count=1, flags=re.S)


def inject_template(html: str, slug: str) -> str:
    """
    Anchor both includes at the real document boundaries.

    The engine builds markup inside JavaScript strings, so "</body>" appears
    many times before the end of the file and "<body>" is even mentioned in a
    comment above the head close. Neither tag can be matched positionally by
    its first occurrence, so the head close is taken from the front and the
    body close from the back.
    """
    if TEMPLATE_TAG in html:
        raise SystemExit(f"{slug}: template layer already present — refusing to double-inject")

    head_at = html.index("</head>")
    body_at = html.rindex("</body>")
    if head_at >= body_at:
        raise SystemExit(f"{slug}: document boundaries look wrong — head close after body close")

    html = html[:head_at] + HEAD_INCLUDE.format(tag=TEMPLATE_TAG) + html[head_at:]
    body_at = html.rindex("</body>")
    return html[:body_at] + BODY_INCLUDE.format(tag=TEMPLATE_TAG) + html[body_at + len("</body>"):]


def build(slug: str, name: str, portfolio: str, title: str, engine: str) -> None:
    folder = OUT / slug
    pack = folder / "template"
    if not (pack / "brand.js").exists():
        print(f"  ! storefronts/{slug} skipped — template/brand.js not written yet")
        return

    html = engine
    html = rebase(html)
    html = disable_service_worker(html)
    html = set_title(html, title)
    html = inject_template(html, slug)

    banner = (
        f"<!--\n"
        f"  {name} — {portfolio}\n"
        f"  Storefront {slug} of the Ascofizz white-label demo.\n\n"
        f"  GENERATED FILE — do not edit. This is index.html from the repository\n"
        f"  root (the shared e-commerce engine: cart, checkout, payments, orders,\n"
        f"  accounts, admin, search, filtering, inventory) with this brand's\n"
        f"  template pack attached. Edit template/brand.css and template/brand.js,\n"
        f"  then re-run scripts/build-storefronts.py.\n"
        f"-->\n"
    )
    (folder / "index.html").write_text(banner + html, encoding="utf-8")
    size = (folder / "index.html").stat().st_size
    print(f"  ✓ storefronts/{slug}/index.html   {name} · {portfolio}  ({size // 1024} KB)")


def main() -> int:
    if not ENGINE.exists():
        raise SystemExit("index.html not found — run this from the repository root")
    engine = ENGINE.read_text(encoding="utf-8")
    print(f"engine: index.html ({len(engine) // 1024} KB) → {len(STORES)} storefronts")
    for slug, name, portfolio, title in STORES:
        build(slug, name, portfolio, title, engine)
    print("done. Open storefronts/index.html for the switcher.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
