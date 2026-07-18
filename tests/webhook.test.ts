import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import type { HandlerResponse } from "@netlify/functions";
import { handler as webhookHandler } from "../netlify/functions/stripe-webhook";
import { handler as checkoutHandler } from "../netlify/functions/create-checkout-session";
import { extractCheckoutFulfillmentInput } from "../netlify/functions/_shared/fulfillment";

function signPayload(payload: string, secret: string) {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
}

function asResponse(value: void | HandlerResponse): HandlerResponse {
  if (!value || typeof value !== "object" || !("statusCode" in value)) {
    throw new Error("Expected HandlerResponse");
  }
  return value;
}

describe("stripe-webhook signature handling", () => {
  it("rejects invalid webhook signatures", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    process.env.STRIPE_SECRET_KEY = "sk_test_x";

    const response = asResponse(
      await webhookHandler(
        {
          httpMethod: "POST",
          headers: { "stripe-signature": "invalid" },
          body: JSON.stringify({
            id: "evt_1",
            type: "checkout.session.completed",
          }),
          isBase64Encoded: false,
        } as never,
        {} as never,
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body || "{}").error).toMatch(/signature/i);
  });

  it("accepts a valid webhook signature and ignores unrelated events", async () => {
    const secret = "whsec_test_secret";
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    process.env.STRIPE_SECRET_KEY = "sk_test_x";

    const payload = JSON.stringify({
      id: "evt_test_unrelated",
      object: "event",
      api_version: null,
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "customer.created",
      data: { object: { id: "cus_1", object: "customer" } },
    });
    const signature = signPayload(payload, secret);

    const response = asResponse(
      await webhookHandler(
        {
          httpMethod: "POST",
          headers: { "stripe-signature": signature },
          body: payload,
          isBase64Encoded: false,
        } as never,
        {} as never,
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body || "{}").ignored).toBe(true);
  });
});

describe("missing Stripe product metadata", () => {
  it("extracts null product id when metadata is missing", () => {
    const extracted = extractCheckoutFulfillmentInput({
      id: "cs_test",
      payment_intent: "pi_test",
      amount_total: 4500,
      currency: "usd",
      customer_email: "buyer@example.com",
      metadata: {},
    } as never);
    expect(extracted.productId).toBeNull();
    expect(extracted.checkoutSessionId).toBe("cs_test");
    expect(extracted.paymentIntentId).toBe("pi_test");
  });
});

describe("create-checkout-session handler", () => {
  it("rejects non-POST", async () => {
    const response = asResponse(
      await checkoutHandler(
        {
          httpMethod: "GET",
          headers: {},
          body: null,
        } as never,
        {} as never,
      ),
    );
    expect(response.statusCode).toBe(405);
  });

  it("rejects client-controlled price fields", async () => {
    process.env.URL = "http://localhost:8888";
    process.env.CONTEXT = "dev";
    process.env.NODE_ENV = "test";
    const response = asResponse(
      await checkoutHandler(
        {
          httpMethod: "POST",
          headers: { origin: "http://localhost:8888" },
          body: JSON.stringify({
            productSlug: "print-01",
            priceCents: 1,
          }),
        } as never,
        {} as never,
      ),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body || "{}").error).toMatch(
      /client-controlled/i,
    );
  });
});
