import type { Handler } from "@netlify/functions";
import type Stripe from "stripe";
import {
  callFulfillCheckout,
  extractCheckoutFulfillmentInput,
  refundInventoryConflict,
  sessionIsPaid,
} from "./_shared/fulfillment";
import { getHeader, jsonResponse } from "./_shared/http";
import { getStripe } from "./_shared/stripe";
import { getSupabaseAdmin } from "./_shared/supabase";

/**
 * Stripe webhook: payment confirmation and inventory fulfillment.
 * Signature verification requires the exact raw request body.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return jsonResponse(500, { error: "Webhook not configured." });
  }

  const signature = getHeader(event.headers, "stripe-signature");
  if (!signature) {
    return jsonResponse(400, { error: "Missing Stripe-Signature." });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";

  let stripeEvent: Stripe.Event;
  try {
    const stripe = getStripe();
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch {
    return jsonResponse(400, { error: "Invalid signature." });
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return jsonResponse(200, { received: true, ignored: true });
  }

  const session = stripeEvent.data.object as Stripe.Checkout.Session;

  if (!sessionIsPaid(session)) {
    return jsonResponse(200, { received: true, unpaid: true });
  }

  const productId = session.metadata?.product_id;
  if (!productId) {
    // Missing trusted metadata — record conflict path via fulfillment with null product
    // still requires a product uuid in RPC; handle as explicit error requiring refund attempt.
    try {
      const supabase = getSupabaseAdmin();
      const stripe = getStripe();
      const extracted = extractCheckoutFulfillmentInput(session);
      const result = await callFulfillCheckout(supabase, {
        stripeEventId: stripeEvent.id,
        eventType: stripeEvent.type,
        checkoutSessionId: extracted.checkoutSessionId,
        paymentIntentId: extracted.paymentIntentId,
        productId: null,
        quantity: extracted.quantity,
        amountTotal: extracted.amountTotal,
        currency: extracted.currency,
        customerEmail: extracted.customerEmail,
      });

      if (
        result.status === "inventory_unavailable" ||
        result.status === "product_not_found"
      ) {
        if (result.order_id) {
          await refundInventoryConflict({
            supabase,
            stripe,
            orderId: result.order_id,
          });
        }
      }

      return jsonResponse(200, { received: true, status: result.status });
    } catch {
      return jsonResponse(500, { error: "Fulfillment error." });
    }
  }

  try {
    const supabase = getSupabaseAdmin();
    const stripe = getStripe();

    // Expand line items only if needed; quantity is always 1 for this shop.
    let workingSession = session;
    if (!session.line_items) {
      workingSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items"],
      });
    }

    const extracted = extractCheckoutFulfillmentInput(workingSession);

    const result = await callFulfillCheckout(supabase, {
      stripeEventId: stripeEvent.id,
      eventType: stripeEvent.type,
      checkoutSessionId: extracted.checkoutSessionId,
      paymentIntentId: extracted.paymentIntentId,
      productId: extracted.productId,
      quantity: 1,
      amountTotal: extracted.amountTotal,
      currency: extracted.currency,
      customerEmail: extracted.customerEmail,
    });

    if (result.status === "already_processed") {
      return jsonResponse(200, { received: true, status: "already_processed" });
    }

    if (result.status === "fulfilled") {
      return jsonResponse(200, { received: true, status: "fulfilled" });
    }

    if (
      result.status === "inventory_unavailable" ||
      result.status === "product_not_found"
    ) {
      if (result.order_id) {
        const refund = await refundInventoryConflict({
          supabase,
          stripe,
          orderId: result.order_id,
        });
        return jsonResponse(200, {
          received: true,
          status: result.status,
          refund: refund.status,
        });
      }
      return jsonResponse(200, { received: true, status: result.status });
    }

    return jsonResponse(200, { received: true, status: result.status });
  } catch {
    // Stripe will retry on non-2xx
    return jsonResponse(500, { error: "Fulfillment error." });
  }
};
