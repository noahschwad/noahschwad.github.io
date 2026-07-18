/**
 * Checkout request validation and trusted product → Stripe session params.
 * Browser may only supply product id or slug — never price or Stripe IDs.
 */

export type CheckoutRequestBody = {
  productId?: unknown;
  productSlug?: unknown;
  // Intentionally ignored / rejected if used as trusted input:
  price?: unknown;
  priceCents?: unknown;
  stripePriceId?: unknown;
  currency?: unknown;
  inventory?: unknown;
  quantity?: unknown;
  shippingCost?: unknown;
  name?: unknown;
  title?: unknown;
};

export type TrustedProduct = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  inventory: number;
  stripe_price_id: string | null;
  shipping_required: boolean;
};

export type CheckoutValidationError = {
  ok: false;
  status: number;
  error: string;
};

export type CheckoutValidationOk = {
  ok: true;
  productId?: string;
  productSlug?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Keys the browser must not use to control payment amounts. */
export const FORBIDDEN_CHECKOUT_KEYS = [
  "price",
  "priceCents",
  "price_cents",
  "stripePriceId",
  "stripe_price_id",
  "currency",
  "inventory",
  "quantity",
  "shippingCost",
  "shipping_cost",
  "amount",
  "unit_amount",
] as const;

export function validateCheckoutInput(
  body: CheckoutRequestBody | null | undefined,
): CheckoutValidationOk | CheckoutValidationError {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "Invalid request body." };
  }

  for (const key of FORBIDDEN_CHECKOUT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return {
        ok: false,
        status: 400,
        error: "Checkout does not accept client-controlled payment values.",
      };
    }
  }

  const productId =
    typeof body.productId === "string" ? body.productId.trim() : "";
  const productSlug =
    typeof body.productSlug === "string" ? body.productSlug.trim() : "";

  if (!productId && !productSlug) {
    return {
      ok: false,
      status: 400,
      error: "Provide a productId or productSlug.",
    };
  }

  if (productId && !UUID_RE.test(productId)) {
    return { ok: false, status: 400, error: "Invalid productId." };
  }

  if (productSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(productSlug)) {
    return { ok: false, status: 400, error: "Invalid productSlug." };
  }

  return {
    ok: true,
    productId: productId || undefined,
    productSlug: productSlug || undefined,
  };
}

export function assertProductReadyForCheckout(
  product: TrustedProduct | null,
): CheckoutValidationError | { ok: true; product: TrustedProduct } {
  if (!product) {
    return { ok: false, status: 404, error: "Product not found." };
  }
  if (!product.published) {
    return { ok: false, status: 404, error: "Product not found." };
  }
  if (!(product.inventory > 0)) {
    return { ok: false, status: 409, error: "Sold out." };
  }
  if (!product.stripe_price_id) {
    return {
      ok: false,
      status: 503,
      error: "Product is not available for checkout.",
    };
  }
  return { ok: true, product };
}

/**
 * Server-controlled shipping rates from env.
 * STRIPE_SHIPPING_RATE_ID — primary domestic flat rate.
 * Future rates can be added as STRIPE_SHIPPING_RATE_ID_* without changing the page.
 */
export function getShippingRateIds(): string[] {
  const primary = process.env.STRIPE_SHIPPING_RATE_ID?.trim();
  const rates: string[] = [];
  if (primary) rates.push(primary);

  for (const [key, value] of Object.entries(process.env)) {
    if (
      key.startsWith("STRIPE_SHIPPING_RATE_ID_") &&
      typeof value === "string" &&
      value.trim()
    ) {
      const id = value.trim();
      if (!rates.includes(id)) rates.push(id);
    }
  }
  return rates;
}

export function buildCheckoutSessionParams(input: {
  product: TrustedProduct;
  siteUrl: string;
  successPath?: string;
}): {
  mode: "payment";
  line_items: Array<{ price: string; quantity: number }>;
  success_url: string;
  cancel_url: string;
  metadata: Record<string, string>;
  shipping_address_collection?: { allowed_countries: ["US"] };
  shipping_options?: Array<{ shipping_rate: string }>;
} {
  const { product, siteUrl } = input;
  const base = siteUrl.replace(/\/$/, "");
  const successPath = input.successPath || "/shop/success";

  const params: ReturnType<typeof buildCheckoutSessionParams> = {
    mode: "payment",
    line_items: [
      {
        price: product.stripe_price_id as string,
        quantity: 1,
      },
    ],
    success_url: `${base}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/shop/${encodeURIComponent(product.slug)}`,
    metadata: {
      supabase_product_id: product.id,
      product_slug: product.slug,
    },
  };

  if (product.shipping_required) {
    const rateIds = getShippingRateIds();
    params.shipping_address_collection = {
      allowed_countries: ["US"],
    };
    if (rateIds.length > 0) {
      params.shipping_options = rateIds.map((shipping_rate) => ({
        shipping_rate,
      }));
    }
  }

  return params;
}
