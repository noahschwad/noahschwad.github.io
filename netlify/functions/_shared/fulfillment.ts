/**
 * Webhook fulfillment orchestration (calls Supabase RPCs + Stripe refunds).
 * Inventory mutation happens only inside fulfill_checkout_session.
 */
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FulfillmentRpcResult = {
  status:
    | "fulfilled"
    | "inventory_unavailable"
    | "already_processed"
    | "product_not_found";
  order_id?: string;
  fulfillment_status?: string;
};

export type RefundOutcome =
  | { status: "skipped" }
  | { status: "already_refunded"; stripe_refund_id?: string }
  | { status: "refunded"; stripe_refund_id: string }
  | { status: "refund_failed"; message: string }
  | { status: "not_needed" };

export function extractCheckoutFulfillmentInput(session: Stripe.Checkout.Session) {
  const productId = session.metadata?.product_id || null;
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  const quantity =
    session.line_items?.data?.[0]?.quantity ??
    // Fallback when line items not expanded: always 1 for this shop
    1;

  return {
    productId,
    checkoutSessionId: session.id,
    paymentIntentId: paymentIntent,
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
    customerEmail:
      session.customer_details?.email ||
      session.customer_email ||
      null,
    quantity: typeof quantity === "number" && quantity > 0 ? quantity : 1,
  };
}

export function sessionIsPaid(session: Stripe.Checkout.Session): boolean {
  return (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"
  );
}

export async function callFulfillCheckout(
  supabase: SupabaseClient,
  args: {
    stripeEventId: string;
    eventType: string;
    checkoutSessionId: string;
    paymentIntentId: string | null;
    productId: string | null;
    quantity: number;
    amountTotal: number | null;
    currency: string | null;
    customerEmail: string | null;
  },
): Promise<FulfillmentRpcResult> {
  const { data, error } = await supabase.rpc("fulfill_checkout_session", {
    p_stripe_event_id: args.stripeEventId,
    p_event_type: args.eventType,
    p_checkout_session_id: args.checkoutSessionId,
    p_payment_intent_id: args.paymentIntentId,
    p_product_id: args.productId,
    p_quantity: args.quantity,
    p_amount_total: args.amountTotal,
    p_currency: args.currency,
    p_customer_email: args.customerEmail,
  });

  if (error) {
    throw new Error(`Fulfillment failed: ${error.message}`);
  }

  return data as FulfillmentRpcResult;
}

/**
 * Issue a full refund for an inventory-conflict order, with duplicate-refund guards.
 */
export async function refundInventoryConflict(options: {
  supabase: SupabaseClient;
  stripe: Stripe;
  orderId: string;
}): Promise<RefundOutcome> {
  const { supabase, stripe, orderId } = options;

  const { data: claim, error: claimError } = await supabase.rpc(
    "claim_order_refund",
    { p_order_id: orderId },
  );

  if (claimError) {
    return { status: "refund_failed", message: claimError.message };
  }

  const claimStatus = (claim as { status?: string })?.status;
  if (claimStatus === "already_refunded") {
    return {
      status: "already_refunded",
      stripe_refund_id: (claim as { stripe_refund_id?: string })
        .stripe_refund_id,
    };
  }
  if (claimStatus === "not_found" || claimStatus === "not_refundable") {
    return { status: "not_needed" };
  }
  if (claimStatus !== "claimed") {
    return { status: "refund_failed", message: "Unable to claim refund." };
  }

  const paymentIntentId = (claim as { payment_intent_id?: string })
    .payment_intent_id;
  if (!paymentIntentId) {
    await supabase.rpc("complete_order_refund", {
      p_order_id: orderId,
      p_stripe_refund_id: null,
      p_success: false,
    });
    return {
      status: "refund_failed",
      message: "Missing payment intent for refund.",
    };
  }

  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
      },
      {
        // Idempotency: retries with the same order id will not create a second refund
        idempotencyKey: `order-refund-${orderId}`,
      },
    );

    await supabase.rpc("complete_order_refund", {
      p_order_id: orderId,
      p_stripe_refund_id: refund.id,
      p_success: true,
    });

    return { status: "refunded", stripe_refund_id: refund.id };
  } catch (err) {
    await supabase.rpc("complete_order_refund", {
      p_order_id: orderId,
      p_stripe_refund_id: null,
      p_success: false,
    });
    return {
      status: "refund_failed",
      message: err instanceof Error ? err.message : "Refund failed.",
    };
  }
}

/**
 * In-memory inventory simulator for unit tests of atomic claim semantics.
 * Mirrors the SQL FOR UPDATE + decrement behavior.
 */
export function simulateAtomicInventoryClaim(state: {
  inventory: number;
  processedEvents: Set<string>;
  ordersBySession: Map<string, { fulfillment: string }>;
}, input: {
  eventId: string;
  sessionId: string;
  quantity: number;
}): {
  status: "fulfilled" | "inventory_unavailable" | "already_processed";
  inventory: number;
} {
  if (state.processedEvents.has(input.eventId)) {
    return { status: "already_processed", inventory: state.inventory };
  }
  if (state.ordersBySession.has(input.sessionId)) {
    state.processedEvents.add(input.eventId);
    return { status: "already_processed", inventory: state.inventory };
  }

  state.processedEvents.add(input.eventId);

  if (state.inventory >= input.quantity) {
    state.inventory -= input.quantity;
    if (state.inventory < 0) {
      throw new Error("inventory went below zero");
    }
    state.ordersBySession.set(input.sessionId, { fulfillment: "fulfilled" });
    return { status: "fulfilled", inventory: state.inventory };
  }

  state.ordersBySession.set(input.sessionId, {
    fulfillment: "inventory_conflict",
  });
  return { status: "inventory_unavailable", inventory: state.inventory };
}
