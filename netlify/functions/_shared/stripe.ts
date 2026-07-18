import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe server configuration is missing.");
  }
  if (!cached) {
    // Use the SDK's pinned API version.
    cached = new Stripe(key);
  }
  return cached;
}

export function __resetStripeForTests() {
  cached = null;
}
