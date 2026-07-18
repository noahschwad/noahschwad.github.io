/**
 * Format integer cents for display. Prices stay as integer cents in data.
 * @param {number} priceCents
 * @param {string} [currency="usd"]
 * @returns {string}
 */
export function formatPrice(priceCents, currency = "usd") {
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return "";
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(priceCents / 100);
  } catch {
    return `$${(priceCents / 100).toFixed(2)}`;
  }
}
