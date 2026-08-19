# ASCOFIZZ — White-Label E-Commerce Platform

## Overview
ASCOFIZZ is a fully independent, white-labeled e-commerce platform cloned from the Ozylix architecture. This repository contains the static frontend for the storefront and admin panel, designed to be deployed on GitHub Pages.

## Key Changes from Ozylix
- **Tracker Removal:** Meta Pixel, Google Analytics, and SEO metadata generation have been completely stripped.
- **Security Isolation:** All Supabase and Render URLs are now environment-driven (`window.ASCOFIZZ_CONFIG` and `window.ASCOFIZZ_ADMIN_CONFIG`). No hardcoded links remain.
- **Clean Branding:** The ASCOFIZZ brand (Moss/Fizz palette, custom SVG logo) replaces the Ozylix identity.
- **Zero Data Migration:** The new deployment starts with a completely empty database. No Ozylix data is carried over.

## Database Setup
To deploy the backend, create a new Supabase project and run the following SQL files in order:
1. `000_base_schema.sql` (Core Tables)
2. `000_base_schema_functions.sql` (PL/pgSQL RPCs)
3. `000_base_security.sql` (Row Level Security & Policies)

## Environment Configuration
Refer to `ASCOFIZZ_ENV_GUIDE.md` for a complete list of required environment variables, including Supabase credentials, Payment Gateways (Cashfree/GoKwik), and Shipping APIs (Delhivery).

## Frontend Configuration
In `index.html` and `admin.html`, ensure the following placeholders are replaced with your actual deployment URLs:
- `https://YOUR_SUPABASE_PROJECT.supabase.co`
- `YOUR_SUPABASE_ANON_KEY`
- `https://YOUR_BACKEND.onrender.com`

## White-Label Demo Storefronts

`storefronts/` holds six complete demonstration storefronts — six brands, six product
portfolios, six designs — running on this repository's single e-commerce engine. Open
`storefronts/index.html` for the switcher.

| # | Brand | Portfolio |
|---|-------|-----------|
| 01 | Ascofizz | Effervescent supplements |
| 02 | Arcadia | Premium everyday wellness |
| 03 | Forge | Sports & gym nutrition |
| 04 | Algaeva | Spirulina & superfoods |
| 05 | Chewly | Gummies, chewables & suckers |
| 06 | Ascofizz Original | The existing storefront, unchanged |

Each storefront owns its brand, navigation, homepage, product cards, product page,
merchandising, typography, colour and motion. All six share one cart, checkout, payment,
order, account, search, filtering, inventory and admin implementation — `index.html` is
copied verbatim into each folder and a template pack is attached to it.

Rebuild after editing the engine or a brand pack:

```bash
python3 scripts/build-storefronts.py            # the six storefronts
python3 scripts/build-storefronts.py --bundle   # plus dist/<brand>.zip, standalone copies
```

See `storefronts/README.md` for the architecture and for how to add a brand.
