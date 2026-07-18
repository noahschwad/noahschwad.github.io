import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatPrice } from "../shop/formatPrice";
import { getPublishedProductBySlug } from "../shop/products";
import "../shop/Shop.css";

/**
 * @typedef {import("../shop/types.js").Product} Product
 */

export function ProductPage() {
  const { productSlug } = useParams();
  /** @type {[Product | null, Function]} */
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState(
    /** @type {"loading" | "ready" | "not_found" | "error"} */ ("loading"),
  );
  const [errorMessage, setErrorMessage] = useState(
    /** @type {string | null} */ (null),
  );
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState(
    /** @type {string | null} */ (null),
  );
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setCheckoutError(null);
    setActiveImage(0);

    (async () => {
      const result = await getPublishedProductBySlug(productSlug || "");
      if (cancelled) return;
      if (result.ok) {
        setProduct(result.product);
        setStatus("ready");
        document.title = `${result.product.title} — Shop`;
        return;
      }
      setProduct(null);
      if (result.reason === "not_found") {
        setStatus("not_found");
        document.title = "Product not found — Shop";
      } else {
        setStatus("error");
        setErrorMessage(result.message || "Unable to load product.");
        document.title = "Shop";
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  const onBuyNow = useCallback(async () => {
    if (!product || !product.available || checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError(null);

    try {
      const res = await fetch("/.netlify/functions/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        setCheckoutError(
          typeof data?.error === "string"
            ? data.error
            : "Unable to start checkout. Please try again.",
        );
        setCheckoutBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setCheckoutError("Unable to start checkout. Please try again.");
      setCheckoutBusy(false);
    }
  }, [product, checkoutBusy]);

  if (status === "loading") {
    return (
      <main className="shop-page" aria-busy="true">
        <p className="shop-page__status">Loading…</p>
      </main>
    );
  }

  if (status === "not_found") {
    return (
      <main className="shop-page">
        <h1 className="shop-page__title">Product not found</h1>
        <p className="shop-page__lede">
          This product is unavailable or does not exist.
        </p>
        <p>
          <Link className="shop-page__link" to="/">
            Back to portfolio
          </Link>
        </p>
      </main>
    );
  }

  if (status === "error" || !product) {
    return (
      <main className="shop-page">
        <h1 className="shop-page__title">Something went wrong</h1>
        <p className="shop-page__lede" role="alert">
          {errorMessage || "Unable to load product."}
        </p>
        <p>
          <Link className="shop-page__link" to="/">
            Back to portfolio
          </Link>
        </p>
      </main>
    );
  }

  const images = product.images;
  const current = images[activeImage] || images[0];
  const soldOut = !product.available;

  return (
    <main className="shop-page">
      <nav className="shop-page__nav" aria-label="Shop">
        <Link className="shop-page__link" to="/">
          Portfolio
        </Link>
      </nav>

      <div className="shop-product">
        <div className="shop-product__media">
          {current ? (
            <img
              className="shop-product__image"
              src={current.publicUrl}
              alt={current.altText || product.title}
            />
          ) : (
            <div
              className="shop-product__image shop-product__image--empty"
              aria-hidden="true"
            />
          )}
          {images.length > 1 ? (
            <ul className="shop-product__thumbs" aria-label="Product images">
              {images.map((img, index) => (
                <li key={img.id}>
                  <button
                    type="button"
                    className={
                      index === activeImage
                        ? "shop-product__thumb is-active"
                        : "shop-product__thumb"
                    }
                    onClick={() => setActiveImage(index)}
                    aria-label={img.altText || `Image ${index + 1}`}
                    aria-current={index === activeImage ? "true" : undefined}
                  >
                    <img src={img.publicUrl} alt="" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="shop-product__info">
          <h1 className="shop-page__title">{product.title}</h1>
          <p className="shop-product__price">
            {formatPrice(product.priceCents, product.currency)}
          </p>
          {product.description ? (
            <p className="shop-page__lede">{product.description}</p>
          ) : null}

          {soldOut ? (
            <p className="shop-product__sold-out" aria-live="polite">
              Sold Out
            </p>
          ) : (
            <button
              type="button"
              className="shop-product__buy"
              onClick={onBuyNow}
              disabled={checkoutBusy}
              aria-busy={checkoutBusy}
            >
              {checkoutBusy ? "Redirecting…" : "Buy Now"}
            </button>
          )}

          {checkoutError ? (
            <p className="shop-product__error" role="alert">
              {checkoutError}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
