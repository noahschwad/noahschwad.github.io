# Portfolio + shop

React + Vite portfolio with a minimal Stripe Checkout shop backed by Supabase and Netlify Functions.

## 1. Install dependencies

```bash
npm install
```

## 2. Run locally with Netlify Dev

Netlify Dev serves the Vite app and Functions together (required for Buy Now).

```bash
cp .env.example .env
# fill in values, then:
npx netlify dev
```

The site is typically at `http://localhost:8888`.

Plain Vite (`npm run dev`) can render product pages, but checkout calls need Functions.

## 3. Create the Supabase project

Create a project at [supabase.com](https://supabase.com). Copy the Project URL, anon/publishable key, and service role secret.

## 4. Run migrations

From the Supabase SQL editor, or with the CLI:

```bash
npx supabase db push
# or paste supabase/migrations/20260718160000_shop_schema.sql into the SQL editor
```

## 5. Create the `product-images` bucket

The migration inserts a public `product-images` bucket. If it already exists, confirm it is **public**.

## 6. Supabase policies

The migration enables RLS:

- `anon` / `authenticated` may **select** published products and their images
- No public insert/update/delete on products, images, orders, or Stripe events
- Storage: public **read** on `product-images`; no public upload/replace/delete

Uploads and inventory edits are done in the Supabase dashboard (or with the service role). Do not put the service role key in any `VITE_*` variable.

## 7. Create a Stripe test Product and Price

In Stripe Dashboard (test mode): Products → Add product → add a Price. Copy the Price ID (`price_...`).

Create a domestic flat shipping rate and copy its ID (`shr_...`) into `STRIPE_SHIPPING_RATE_ID`.

## 8. Add Stripe IDs to Supabase

In the `products` table, set `stripe_price_id` (and optionally `stripe_product_id`) on the row. The browser never supplies these.

## 9. Local environment variables

Copy `.env.example` to `.env` and fill:

| Variable | Where used |
|----------|------------|
| `VITE_SUPABASE_URL` | Browser |
| `VITE_SUPABASE_ANON_KEY` | Browser |
| `SUPABASE_URL` | Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions |
| `STRIPE_SECRET_KEY` | Functions |
| `STRIPE_WEBHOOK_SECRET` | Webhook function |
| `STRIPE_SHIPPING_RATE_ID` | Checkout function |
| `SITE_URL` | Redirects / origin checks |

## 10. Test Stripe webhooks with Stripe CLI

```bash
stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook
```

Use the CLI-printed `whsec_...` as `STRIPE_WEBHOOK_SECRET` locally.

## 11. Netlify environment variables

In Site settings → Environment variables, add the same keys for Production (and Preview if desired). Never expose `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, or `STRIPE_WEBHOOK_SECRET` with a `VITE_` prefix.

## 12. Register the production Stripe webhook

Stripe Dashboard → Developers → Webhooks → Add endpoint:

`https://YOUR_DOMAIN/.netlify/functions/stripe-webhook`

Subscribe to `checkout.session.completed`. Copy the signing secret into Netlify as `STRIPE_WEBHOOK_SECRET`.

## 13. Add and publish a product

In Supabase Table Editor → `products`, insert a row with `slug`, `title`, `price_cents`, `inventory`, `stripe_price_id`, and set `published = true` when ready. There is no custom admin UI.

## 14. Upload and order product images

Upload files to Storage bucket `product-images`. Insert `product_images` rows with `storage_path`, `alt_text`, and `sort_order` (ascending).

## 15. Adjust inventory

Edit `products.inventory` in Supabase. Changes appear on the next product page load (no redeploy). Inventory is also decremented by the webhook on successful claim.

## 16. Reading order and refund statuses

Inspect `orders`:

- `fulfillment_status`: `fulfilled`, `inventory_conflict`, `refunded`, `refund_failed`, …
- `refund_status`: `refund_pending`, `refunded`, `refund_failed`
- `stripe_refund_id` when a conflict refund succeeded

## 17. Handling a failed automatic refund

If `refund_status = refund_failed`, refund manually in Stripe using the `stripe_payment_intent_id`, then update the order row in Supabase so records stay accurate.

## 18. Switching from Stripe test mode to live mode

Replace `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_SHIPPING_RATE_ID` with **live** values. Register a live webhook endpoint.

## 19. Test vs live Product and Price IDs

Stripe test and live Product/Price IDs are separate. After going live, create live Prices and update `stripe_price_id` (and shipping rate IDs) in Supabase / env.

## 20. Manual steps (no admin app)

You must manually:

- Create Supabase project, run migrations, configure storage
- Create Stripe products, prices, shipping rates, webhooks
- Set Netlify env vars
- Insert/publish products and images in Supabase
- Handle rare failed refunds in Stripe + Supabase

## Scripts

```bash
npm run dev          # Vite only
npx netlify dev      # Vite + Functions
npm test             # Vitest
npm run typecheck    # TypeScript
npm run build        # Production build (same as Netlify)
```

## Routes

- `/` — portfolio
- `/shop/:productSlug` — product page (Buy Now → Stripe Checkout)
- `/shop/success` — thank-you page (not authoritative for fulfillment)
