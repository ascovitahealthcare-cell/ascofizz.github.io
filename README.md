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
