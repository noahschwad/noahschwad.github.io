import { getSupabaseBrowserClient } from "../lib/supabase/browser.js";

const PRODUCT_IMAGES_BUCKET = "product-images";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} storagePath
 */
function publicImageUrl(client, storagePath) {
  const { data } = client.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Fetch one published product by slug, including images ordered by sort_order.
 * Unpublished products are never returned (RLS + explicit published filter).
 * Does not expose orders or Stripe secrets.
 *
 * @param {string} slug
 * @returns {Promise<import("./types.js").ProductResult>}
 */
export async function getPublishedProductBySlug(slug) {
  const normalized = typeof slug === "string" ? slug.trim() : "";
  if (!normalized) {
    return { ok: false, reason: "not_found" };
  }

  const client = getSupabaseBrowserClient();
  if (!client) {
    return {
      ok: false,
      reason: "unavailable_config",
      message: "Shop is not configured.",
    };
  }

  const { data: product, error } = await client
    .from("products")
    .select(
      `
      id,
      slug,
      title,
      description,
      price_cents,
      currency,
      inventory,
      shipping_required,
      product_images (
        id,
        storage_path,
        alt_text,
        sort_order
      )
    `,
    )
    .eq("slug", normalized)
    .eq("published", true)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: "error",
      message: "Unable to load product.",
    };
  }

  if (!product) {
    return { ok: false, reason: "not_found" };
  }

  const rawImages = Array.isArray(product.product_images)
    ? [...product.product_images]
    : [];
  rawImages.sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  /** @type {import("./types.js").Product} */
  const mapped = {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description ?? null,
    priceCents: product.price_cents,
    currency: product.currency || "usd",
    inventory: product.inventory,
    available: product.inventory > 0,
    shippingRequired: Boolean(product.shipping_required),
    images: rawImages.map((img) => ({
      id: img.id,
      storagePath: img.storage_path,
      altText: img.alt_text ?? null,
      sortOrder: img.sort_order ?? 0,
      publicUrl: publicImageUrl(client, img.storage_path),
    })),
  };

  return { ok: true, product: mapped };
}

/**
 * Pure helper for tests: map a DB-shaped published row to the Product type.
 * Rejects unpublished rows.
 *
 * @param {object | null | undefined} row
 * @param {(path: string) => string} [resolveUrl]
 * @returns {import("./types.js").ProductResult}
 */
export function mapPublishedProductRow(row, resolveUrl = (p) => p) {
  if (!row || row.published !== true) {
    return { ok: false, reason: "not_found" };
  }

  const rawImages = Array.isArray(row.product_images)
    ? [...row.product_images]
    : [];
  rawImages.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return {
    ok: true,
    product: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description ?? null,
      priceCents: row.price_cents,
      currency: row.currency || "usd",
      inventory: row.inventory,
      available: row.inventory > 0,
      shippingRequired: Boolean(row.shipping_required),
      images: rawImages.map((img) => ({
        id: img.id,
        storagePath: img.storage_path,
        altText: img.alt_text ?? null,
        sortOrder: img.sort_order ?? 0,
        publicUrl: resolveUrl(img.storage_path),
      })),
    },
  };
}
