import { describe, expect, it } from "vitest";
import { formatPrice } from "../src/shop/formatPrice.js";
import { mapPublishedProductRow } from "../src/shop/products.js";
import {
  FORBIDDEN_CHECKOUT_KEYS,
  assertProductReadyForCheckout,
  buildCheckoutSessionParams,
  getShippingRateIds,
  validateCheckoutInput,
} from "../netlify/functions/_shared/checkout";
import {
  refundInventoryConflict,
  sessionIsPaid,
  simulateAtomicInventoryClaim,
} from "../netlify/functions/_shared/fulfillment";

describe("mapPublishedProductRow", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "print-01",
    title: "Print 01",
    description: "A print",
    price_cents: 4500,
    currency: "usd",
    inventory: 2,
    published: true,
    shipping_required: true,
    product_images: [
      {
        id: "img-2",
        storage_path: "b.jpg",
        alt_text: "Back",
        sort_order: 2,
      },
      {
        id: "img-1",
        storage_path: "a.jpg",
        alt_text: "Front",
        sort_order: 1,
      },
    ],
  };

  it("fetches/maps a published product with ordered images", () => {
    const result = mapPublishedProductRow(base, (p) => `https://cdn.test/${p}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product.slug).toBe("print-01");
    expect(result.product.priceCents).toBe(4500);
    expect(result.product.available).toBe(true);
    expect(result.product.images.map((i) => i.storagePath)).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
    expect(result.product.images[0].publicUrl).toBe("https://cdn.test/a.jpg");
    expect(result.product.images[0].altText).toBe("Front");
  });

  it("rejects an unpublished product", () => {
    const result = mapPublishedProductRow({ ...base, published: false });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("marks zero inventory as unavailable", () => {
    const result = mapPublishedProductRow({ ...base, inventory: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product.available).toBe(false);
  });
});

describe("formatPrice", () => {
  it("formats integer cents", () => {
    expect(formatPrice(4500, "usd")).toMatch(/\$45\.00/);
  });
});

describe("validateCheckoutInput", () => {
  it("rejects invalid checkout input", () => {
    expect(validateCheckoutInput(null).ok).toBe(false);
    expect(validateCheckoutInput({}).ok).toBe(false);
    expect(
      validateCheckoutInput({ productId: "not-a-uuid" }).ok,
    ).toBe(false);
  });

  it("prevents browser-controlled prices and related fields", () => {
    for (const key of FORBIDDEN_CHECKOUT_KEYS) {
      const result = validateCheckoutInput({
        productSlug: "print-01",
        [key]: 1,
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toMatch(/client-controlled/i);
    }
  });

  it("accepts product id or slug only", () => {
    expect(
      validateCheckoutInput({
        productId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toMatchObject({ ok: true });
    expect(validateCheckoutInput({ productSlug: "print-01" })).toMatchObject({
      ok: true,
    });
  });
});

describe("assertProductReadyForCheckout", () => {
  const product = {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "print-01",
    title: "Print 01",
    published: true,
    inventory: 1,
    stripe_price_id: "price_test",
    shipping_required: true,
  };

  it("allows checkout creation for an available product", () => {
    const result = assertProductReadyForCheckout(product);
    expect(result.ok).toBe(true);
  });

  it("rejects an out-of-stock product", () => {
    const result = assertProductReadyForCheckout({ ...product, inventory: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });

  it("hides unpublished products", () => {
    const result = assertProductReadyForCheckout({
      ...product,
      published: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });
});

describe("buildCheckoutSessionParams", () => {
  it("uses server price id and quantity 1", () => {
    process.env.STRIPE_SHIPPING_RATE_ID = "shr_domestic";
    const params = buildCheckoutSessionParams({
      product: {
        id: "11111111-1111-4111-8111-111111111111",
        slug: "print-01",
        title: "Print 01",
        published: true,
        inventory: 1,
        stripe_price_id: "price_server",
        shipping_required: true,
      },
      siteUrl: "https://example.com",
    });
    expect(params.line_items).toEqual([
      { price: "price_server", quantity: 1 },
    ]);
    expect(params.success_url).toContain("/shop/success?session_id=");
    expect(params.cancel_url).toBe("https://example.com/shop/print-01");
    expect(params.metadata.supabase_product_id).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(params.shipping_options?.[0].shipping_rate).toBe("shr_domestic");
    delete process.env.STRIPE_SHIPPING_RATE_ID;
  });

  it("omits shipping when not required", () => {
    const params = buildCheckoutSessionParams({
      product: {
        id: "11111111-1111-4111-8111-111111111111",
        slug: "digital",
        title: "Digital",
        published: true,
        inventory: 1,
        stripe_price_id: "price_server",
        shipping_required: false,
      },
      siteUrl: "https://example.com",
    });
    expect(params.shipping_address_collection).toBeUndefined();
    expect(params.shipping_options).toBeUndefined();
  });

  it("collects additional shipping rate env vars", () => {
    process.env.STRIPE_SHIPPING_RATE_ID = "shr_a";
    process.env.STRIPE_SHIPPING_RATE_ID_EXPRESS = "shr_b";
    expect(getShippingRateIds()).toEqual(["shr_a", "shr_b"]);
    delete process.env.STRIPE_SHIPPING_RATE_ID;
    delete process.env.STRIPE_SHIPPING_RATE_ID_EXPRESS;
  });
});

describe("sessionIsPaid", () => {
  it("accepts paid sessions only", () => {
    expect(sessionIsPaid({ payment_status: "paid" } as never)).toBe(true);
    expect(sessionIsPaid({ payment_status: "unpaid" } as never)).toBe(false);
  });
});

describe("simulateAtomicInventoryClaim", () => {
  it("successfully decrements inventory", () => {
    const state = {
      inventory: 1,
      processedEvents: new Set<string>(),
      ordersBySession: new Map(),
    };
    const result = simulateAtomicInventoryClaim(state, {
      eventId: "evt_1",
      sessionId: "cs_1",
      quantity: 1,
    });
    expect(result.status).toBe("fulfilled");
    expect(result.inventory).toBe(0);
  });

  it("handles duplicate webhook events", () => {
    const state = {
      inventory: 1,
      processedEvents: new Set<string>(["evt_1"]),
      ordersBySession: new Map([["cs_1", { fulfillment: "fulfilled" }]]),
    };
    const result = simulateAtomicInventoryClaim(state, {
      eventId: "evt_1",
      sessionId: "cs_1",
      quantity: 1,
    });
    expect(result.status).toBe("already_processed");
    expect(state.inventory).toBe(1);
  });

  it("never lets inventory go below zero with concurrent final-item purchases", () => {
    const state = {
      inventory: 1,
      processedEvents: new Set<string>(),
      ordersBySession: new Map(),
    };
    const first = simulateAtomicInventoryClaim(state, {
      eventId: "evt_a",
      sessionId: "cs_a",
      quantity: 1,
    });
    const second = simulateAtomicInventoryClaim(state, {
      eventId: "evt_b",
      sessionId: "cs_b",
      quantity: 1,
    });
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("inventory_unavailable");
    expect(state.inventory).toBe(0);
    expect(state.inventory).toBeGreaterThanOrEqual(0);
  });
});

describe("refundInventoryConflict", () => {
  it("refunds the losing payment and stores the refund id", async () => {
    const calls: string[] = [];
    const supabase = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push(name);
        if (name === "claim_order_refund") {
          return {
            data: {
              status: "claimed",
              payment_intent_id: "pi_loser",
            },
            error: null,
          };
        }
        if (name === "complete_order_refund") {
          expect(args.p_success).toBe(true);
          expect(args.p_stripe_refund_id).toBe("re_123");
          return { data: { status: "refunded" }, error: null };
        }
        throw new Error(`unexpected rpc ${name}`);
      },
    };

    const stripe = {
      refunds: {
        create: async (
          _params: unknown,
          opts: { idempotencyKey?: string },
        ) => {
          expect(opts.idempotencyKey).toBe("order-refund-ord_1");
          return { id: "re_123" };
        },
      },
    };

    const outcome = await refundInventoryConflict({
      supabase: supabase as never,
      stripe: stripe as never,
      orderId: "ord_1",
    });
    expect(outcome).toEqual({
      status: "refunded",
      stripe_refund_id: "re_123",
    });
    expect(calls).toEqual(["claim_order_refund", "complete_order_refund"]);
  });

  it("handles failed refunds", async () => {
    const supabase = {
      rpc: async (name: string) => {
        if (name === "claim_order_refund") {
          return {
            data: { status: "claimed", payment_intent_id: "pi_x" },
            error: null,
          };
        }
        if (name === "complete_order_refund") {
          return { data: { status: "refund_failed" }, error: null };
        }
        throw new Error(name);
      },
    };
    const stripe = {
      refunds: {
        create: async () => {
          throw new Error("stripe down");
        },
      },
    };
    const outcome = await refundInventoryConflict({
      supabase: supabase as never,
      stripe: stripe as never,
      orderId: "ord_2",
    });
    expect(outcome.status).toBe("refund_failed");
  });

  it("prevents duplicate refunds", async () => {
    let createCalls = 0;
    const supabase = {
      rpc: async (name: string) => {
        if (name === "claim_order_refund") {
          return {
            data: {
              status: "already_refunded",
              stripe_refund_id: "re_existing",
            },
            error: null,
          };
        }
        throw new Error(name);
      },
    };
    const stripe = {
      refunds: {
        create: async () => {
          createCalls += 1;
          return { id: "re_new" };
        },
      },
    };
    const outcome = await refundInventoryConflict({
      supabase: supabase as never,
      stripe: stripe as never,
      orderId: "ord_3",
    });
    expect(outcome).toEqual({
      status: "already_refunded",
      stripe_refund_id: "re_existing",
    });
    expect(createCalls).toBe(0);
  });
});
