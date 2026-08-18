# ASCOFIZZ — Environment Configuration Guide

This guide documents the environment variables required to deploy the ASCOFIZZ white-label platform. These must be set in your hosting environment (e.g., Render, GitHub Actions).

## Supabase (Core)
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your new Supabase project URL. |
| `SUPABASE_SERVICE_KEY` | Service role key for backend database access (bypasses RLS). |
| `SUPABASE_STORAGE_BUCKET` | Bucket name for product images and media. |
| `SUPABASE_ANON_KEY` | Public anon key for storefront review reads. |

## Backend & Auth
| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret for signing session tokens. |
| `ADMIN_PASSWORD` | Master password for staff login. |
| `OWNER_PASSWORD` | Master password for owner-only actions (2FA toggle, finance). |
| `FRONTEND_URL` | The public URL of your storefront (e.g., `https://ascofizz.github.io`). |
| `INTERNAL_API_KEY` | Shared secret for internal service-to-service calls. |

## Payments (Configure as needed)
| Variable | Description |
|----------|-------------|
| `CASHFREE_APP_ID` | Cashfree Application ID. |
| `CASHFREE_SECRET_KEY` | Cashfree Secret Key. |
| `CASHFREE_ENV` | `TEST` or `PRODUCTION`. |
| `GOKWIK_APP_ID` | GoKwik Application ID. |
| `GOKWIK_APP_SECRET` | GoKwik App Secret. |
| `GOKWIK_ENV` | `sandbox` or `production`. |

## Shipping (Delhivery / Shiprocket)
| Variable | Description |
|----------|-------------|
| `DELHIVERY_API_TOKEN` | Delhivery API Token. |
| `DELHIVERY_PICKUP_LOCATION` | Registered pickup location name. |
| `DELHIVERY_ENV` | `test` or `production`. |
| `SHIPROCKET_EMAIL` | Shiprocket account email. |
| `SHIPROCKET_PASSWORD` | Shiprocket account password. |

## Email & Notifications
| Variable | Description |
|----------|-------------|
| `MAIL_USER` | SMTP username (e.g., Gmail address). |
| `MAIL_PASSWORD` | SMTP password or App Password. |
| `MAIL_FROM` | Display name and email for outgoing mail. |
| `TWILIO_ACCOUNT_SID` | Twilio SID for WhatsApp notifications. |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token. |
| `TWILIO_WHATSAPP_FROM` | Your Twilio WhatsApp sender number. |

## AI & Analytics (Optional)
| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key for the AI Advisor. |
| `GA4_PROPERTY_ID` | Google Analytics 4 Property ID (for backend event reporting). |
| `INSTAGRAM_TOKEN` | Long-lived access token for the Instagram feed. |
