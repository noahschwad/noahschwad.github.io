import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "../shop/Shop.css";

/**
 * Post-checkout thank-you page.
 * Does not fulfill inventory or trust arrival here as payment confirmation.
 * The Stripe webhook is authoritative.
 */
export function ShopSuccessPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  useEffect(() => {
    document.title = "Thank you — Shop";
  }, []);

  return (
    <main className="shop-page shop-page--narrow">
      <h1 className="shop-page__title">Thank you</h1>
      <p className="shop-page__lede">
        Your order was submitted. Payment confirmation will arrive separately by
        email when Stripe finishes processing.
      </p>
      {sessionId ? (
        <p className="shop-page__note">
          You can close this page. Fulfillment is confirmed by our payment
          webhook, not by visiting this screen.
        </p>
      ) : (
        <p className="shop-page__note">
          If you arrived here directly, check your email for payment
          confirmation.
        </p>
      )}
      <p>
        <Link className="shop-page__link" to="/">
          Back to portfolio
        </Link>
      </p>
    </main>
  );
}
