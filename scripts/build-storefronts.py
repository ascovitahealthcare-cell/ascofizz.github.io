#!/usr/bin/env python3
"""
Build the white-label demo storefronts.

Each storefront is a COMPLETE copy of the Ascofizz storefront engine
(index.html) with a template pack bolted on. The engine file is never
edited by hand and never forked: this script copies it verbatim and makes
exactly four mechanical adjustments, all of them consequences of serving
the same file from a subfolder instead of the site root.

    1. relative asset paths          assets/… → ../assets/…
    2. the <title>                   so tabs and bookmarks name the brand
    3. service-worker registration   disabled, so six storefronts on one
                                     origin cannot serve each other's
                                     cached shell
    4. the template layer            one CSS and one JS include, appended

Everything a customer transacts through — cart, checkout, payments,
orders, accounts, auth, search, filtering, inventory, admin — is the
untouched engine underneath.

Two outputs, from the same source:

    python3 scripts/build-storefronts.py            the six storefronts at
                                                    /demo-1 … /demo-6, sharing
                                                    the site's own assets

    python3 scripts/build-storefronts.py --bundle   plus dist/<brand>.zip — each
                                                    a standalone copy of that
                                                    storefront with its own
                                                    assets, ready to hand over
"""

import argparse
import pathlib
import re
import shutil
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENGINE = ROOT / "index.html"
DEMO = ROOT / "demo"          # the switcher page and the shared kit
DIST = ROOT / "dist"          # standalone bundles

# The six storefronts, in the order they are presented.
#
#   folder   is also the public URL — ascofizz.com/demo-1 … /demo-6. The
#            existing Ascofizz storefront keeps the site root; nothing here
#            touches it.
#   slug     names the brand in the template layer (html[data-tpl]).
#
# folder, slug, brand name, portfolio, browser title
STORES = [
    ("demo-1", "ascofizz", "Ascofizz", "Effervescent Supplements",
     "Ascofizz — Effervescent Vitamins, Minerals & Electrolytes"),
    ("demo-2", "arcadia", "Arcadia", "Premium Everyday Wellness",
     "Arcadia — Wellness, thoughtfully formulated"),
    ("demo-3", "forge", "Forge", "Sports & Gym Nutrition",
     "FORGE — Protein, Performance & Recovery Supplements"),
    ("demo-4", "algaeva", "Algaeva", "Spirulina & Superfoods",
     "Algaeva — Spirulina, Chlorella & Green Superfoods"),
    ("demo-5", "chewly", "Chewly", "Gummies, Chewables & Suckers",
     "Chewly — Gummies, Chewables & Vitamin Suckers"),
    ("demo-6", "ascofizz-original", "Ascofizz Original", "Existing Ascofizz Storefront",
     "ASCOFIZZ — Effervescent Vitamins & Supplements"),
]

# Paths the engine resolves relative to the document. At the site root they
# resolve against /, inside /demo-N/ they must climb back out one level.
RELATIVE_PREFIXES = ("assets/", "scripts/", "invoice-template.js", "manifest.json", "sw.js")

TEMPLATE_TAG = "<!-- ══ WHITE-LABEL TEMPLATE LAYER ══ -->"

HEAD_INCLUDE = """  {tag}
{noindex}  <link rel="stylesheet" href="{kit}wl-kit.css">
  <link rel="stylesheet" href="template/brand.css">
"""

# The demo storefronts are published on the customer's live domain, beside the
# real shop. The engine self-canonicalises to https://www.ascofizz.com plus the
# current path, and a demo product page would canonicalise to a real product URL
# that sells something else entirely — so six near-duplicate storefronts would
# compete with the shop they are meant to sell. They are kept out of the index.
# Bundles do not carry this: where a client publishes one is their decision.
NOINDEX = '  <meta name="robots" content="noindex, nofollow">\n'

BODY_INCLUDE = """{tag}
{standalone}<script src="{kit}wl-kit.js"></script>
<script src="template/brand.js"></script>
</body>"""

# A bundle ships one storefront, so the demo switcher — which links to the
# other five — has nothing to point at and stays out of it.
STANDALONE_FLAG = "<script>window.WL_STANDALONE = true;</script>\n"

# Files a standalone bundle needs its own copy of, since it no longer has a
# site root above it to borrow from.
BUNDLE_ASSETS = ("assets", "scripts", "invoice-template.js")


def rebase(html: str, prefix: str) -> str:
    """
    Repoint the engine's document-relative URLs at wherever its assets now
    live. In the site build that is the shared root two levels up; in a
    standalone bundle the assets sit beside the document, so the prefix is
    empty and the site-absolute "/assets/…" references are pulled back to
    relative ones too — a bundle has no site root to resolve them against.
    """
    def sub(m):
        attr, quote, url = m.group(1), m.group(2), m.group(3)
        if url.startswith(RELATIVE_PREFIXES):
            return f'{attr}={quote}{prefix}{url}{quote}'
        if not prefix and url.startswith("/") and url.lstrip("/").startswith(RELATIVE_PREFIXES):
            return f'{attr}={quote}{url.lstrip("/")}{quote}'
        return m.group(0)

    html = re.sub(r'\b(src|href)=(["\'])([^"\']+)\2', sub, html)
    if not prefix:
        # srcset and inline style url() carry the same site-absolute paths.
        html = html.replace('srcset="/assets/', 'srcset="assets/')
        html = html.replace("url('/assets/", "url('assets/").replace('url("/assets/', 'url("assets/')
    return html


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


def inject_template(html: str, slug: str, kit: str, standalone: bool) -> str:
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

    html = html[:head_at] + HEAD_INCLUDE.format(
        tag=TEMPLATE_TAG, kit=kit, noindex="" if standalone else NOINDEX) + html[head_at:]
    body_at = html.rindex("</body>")
    body = BODY_INCLUDE.format(tag=TEMPLATE_TAG, kit=kit,
                               standalone=STANDALONE_FLAG if standalone else "")
    return html[:body_at] + body + html[body_at + len("</body>"):]


def render(engine: str, slug: str, title: str, asset_prefix: str, kit_prefix: str,
           standalone: bool = False) -> str:
    """The engine, adjusted for where this copy will be served from."""
    html = rebase(engine, asset_prefix)
    html = disable_service_worker(html)
    html = set_title(html, title)
    return inject_template(html, slug, kit_prefix, standalone)


def banner(name: str, portfolio: str, slug: str, standalone: bool) -> str:
    where = (
        [
            "This bundle is self-contained: the engine, its assets",
            "and this brand's template pack. Serve the folder over http",
            "(`python3 -m http.server` inside it) rather than opening the",
            "file directly — the page's content-security-policy expects",
            "an origin.",
        ]
        if standalone else
        [
            "This is index.html from the repository root — the shared",
            "e-commerce engine (cart, checkout, payments, orders,",
            "accounts, admin, search, filtering, inventory) — with this",
            "brand's template pack attached.",
        ]
    )
    lines = [
        f"{name} — {portfolio}",
        f"Storefront {slug} of the Ascofizz white-label demo.",
        "",
        "GENERATED FILE — do not edit.",
        *where,
        "",
        "Edit template/brand.css and template/brand.js, then re-run",
        "scripts/build-storefronts.py.",
    ]
    body = "\n".join(f"  {line}".rstrip() for line in lines)
    return f"<!--\n{body}\n-->\n"


def has_pack(folder: str) -> bool:
    if (ROOT / folder / "template" / "brand.js").exists():
        return True
    print(f"  ! {folder} skipped — template/brand.js not written yet")
    return False


def build_site(folder: str, slug: str, name: str, portfolio: str, title: str, engine: str) -> None:
    """
    The storefront as it is served from the live site: one directory below the
    root, so the engine's assets are one level up and the shared kit sits in
    /demo/kit/. Published at ascofizz.com/<folder>.
    """
    if not has_pack(folder):
        return
    html = render(engine, slug, title, "../", "../demo/kit/")
    out = ROOT / folder / "index.html"
    out.write_text(banner(name, portfolio, folder, standalone=False) + html, encoding="utf-8")
    print(f"  ✓ /{folder}/   {name} · {portfolio}  ({out.stat().st_size // 1024} KB)")


def build_bundle(folder: str, slug: str, name: str, portfolio: str, title: str, engine: str) -> None:
    """
    The same storefront as a standalone deliverable: engine, assets, template
    pack and kit in one folder that runs on its own, zipped for handover.
    """
    if not has_pack(folder):
        return

    out = DIST / slug
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    (out / "index.html").write_text(
        banner(name, portfolio, slug, standalone=True)
        + render(engine, slug, title, "", "_kit/", standalone=True),
        encoding="utf-8",
    )
    for item in BUNDLE_ASSETS:
        src = ROOT / item
        if not src.exists():
            continue
        shutil.copytree(src, out / item) if src.is_dir() else shutil.copy2(src, out / item)
    shutil.copytree(DEMO / "kit", out / "_kit")
    shutil.copytree(ROOT / folder / "template", out / "template")
    (out / "README.txt").write_text(
        f"{name} — {portfolio}\n"
        f"Storefront {slug} of the Ascofizz white-label demo.\n"
        f"Published on the demo site at ascofizz.com/{folder}\n\n"
        f"To view it here:\n"
        f"    cd {slug}\n"
        f"    python3 -m http.server 8000\n"
        f"    open http://localhost:8000\n\n"
        f"Serve it rather than double-clicking index.html: the page sets a\n"
        f"content-security-policy of 'self', which a file:// URL has no origin\n"
        f"to satisfy, so the scripts will not run.\n\n"
        f"What is in here\n"
        f"    index.html      the storefront — the shared e-commerce engine\n"
        f"                    (cart, checkout, payments, orders, accounts,\n"
        f"                    search, filtering, inventory) with this brand's\n"
        f"                    template attached. Generated; do not edit.\n"
        f"    template/       this brand's layer — palette, typography,\n"
        f"                    navigation, homepage, product card, product\n"
        f"                    page, footer, catalogue. Edit these.\n"
        f"    _kit/           the seam between the two layers\n"
        f"    assets/         images, fonts and stylesheets\n"
        f"    scripts/        engine helper scripts\n\n"
        f"The backend (Supabase, payments, shipping) is configured through\n"
        f"window.ASCOFIZZ_CONFIG — see ASCOFIZZ_ENV_GUIDE.md in the main\n"
        f"repository. Without it the storefront runs on its demo catalogue.\n",
        encoding="utf-8",
    )

    archive = DIST / f"{slug}.zip"
    if archive.exists():
        archive.unlink()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in sorted(out.rglob("*")):
            if path.is_file():
                z.write(path, path.relative_to(DIST))
    print(f"  ✓ dist/{slug}.zip   {name} · {portfolio}  ({archive.stat().st_size // 1024} KB)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Build the white-label demo storefronts.")
    ap.add_argument("--bundle", action="store_true",
                    help="also write dist/<brand>.zip — standalone, handover-ready copies")
    args = ap.parse_args()

    if not ENGINE.exists():
        raise SystemExit("index.html not found — run this from the repository root")
    engine = ENGINE.read_text(encoding="utf-8")

    print(f"engine: index.html ({len(engine) // 1024} KB) → {len(STORES)} storefronts")
    for store in STORES:
        build_site(*store, engine)

    if args.bundle:
        print("\nstandalone bundles:")
        DIST.mkdir(exist_ok=True)
        for store in STORES:
            build_bundle(*store, engine)

    print("\ndone. /demo is the switcher; /demo-1 … /demo-6 are the storefronts.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
