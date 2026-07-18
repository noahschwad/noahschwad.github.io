/**
 * @typedef {Object} ProductImage
 * @property {string} id
 * @property {string} storagePath
 * @property {string | null} altText
 * @property {number} sortOrder
 * @property {string} publicUrl
 */

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} slug
 * @property {string} title
 * @property {string | null} description
 * @property {number} priceCents
 * @property {string} currency
 * @property {number} inventory
 * @property {boolean} available
 * @property {boolean} shippingRequired
 * @property {ProductImage[]} images
 */

/**
 * @typedef {{ ok: true, product: Product }} ProductFound
 * @typedef {{ ok: false, reason: "not_found" | "unavailable_config" | "error", message?: string }} ProductNotFound
 * @typedef {ProductFound | ProductNotFound} ProductResult
 */

export {};
