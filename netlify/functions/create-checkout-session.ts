import type { Handler } from "@netlify/functions";
import {
  assertProductReadyForCheckout,
  buildCheckoutSessionParams,
  validateCheckoutInput,
  type TrustedProduct,
} from "./_shared/checkout";
import { isAllowedCheckoutOrigin, jsonResponse } from "./_shared/http";
import { getStripe } from "./_shared/stripe";
import { getSupabaseAdmin } from "./_shared/supabase";

function siteBaseUrl(): string {
  const fromEnv = (
    process.env.URL ||
    process.env.SITE_URL ||
    process.env.DEPLOY_PRIME_URL ||
    ""
  ).replace(/\/$/, "");
  return fromEnv || "http://localhost:8888";
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": siteBaseUrl(),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  if (!isAllowedCheckoutOrigin(event)) {
    return jsonResponse(403, { error: "Forbidden." });
  }

  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }

  const validated = validateCheckoutInput(
    body as Record<string, unknown> | null,
  );
  if (!validated.ok) {
    return jsonResponse(validated.status, { error: validated.error });
  }

  try {
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("products")
      .select(
        "id, slug, title, description, price_cents, currency, published, inventory, shipping_required",
      );

    if (validated.productId) {
      query = query.eq("id", validated.productId);
    } else {
      query = query.eq("slug", validated.productSlug as string);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      return jsonResponse(500, { error: "Unable to load product." });
    }

    let product = data as TrustedProduct | null;
    if (product) {
      const { data: image, error: imageError } = await supabase
        .from("product_images")
        .select("storage_path")
        .eq("product_id", product.id)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (imageError) {
        return jsonResponse(500, { error: "Unable to load product." });
      }

      if (image?.storage_path) {
        const { data: publicImage } = supabase.storage
          .from("product-images")
          .getPublicUrl(image.storage_path);
        product = {
          ...product,
          product_image_url: publicImage.publicUrl,
        };
      }
    }

    const ready = assertProductReadyForCheckout(product);
    if (!ready.ok) {
      return jsonResponse(ready.status, { error: ready.error });
    }

    const stripe = getStripe();
    const sessionParams = buildCheckoutSessionParams({
      product: ready.product,
      siteUrl: siteBaseUrl(),
    });

    const session = await stripe.checkout.sessions.create({
      ...sessionParams,
      // Keep payment intent metadata aligned for later refunds / ops.
      payment_intent_data: {
        metadata: {
          product_id: ready.product.id,
        },
      },
    });

    if (!session.url) {
      return jsonResponse(500, { error: "Checkout session missing URL." });
    }

    return jsonResponse(200, { url: session.url });
  } catch (err) {
    // Log only the error type/message (no payment data or PII) to aid debugging.
    const message =
      err instanceof Error ? err.message : "Unknown checkout error.";
    const type = (err as { type?: string } | null)?.type;
    console.error("create-checkout-session failed:", type || "", message);
    return jsonResponse(500, { error: "Unable to start checkout." });
  }
};
