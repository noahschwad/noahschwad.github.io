/**
 * Thumbnail path for `/project-assets/…` rasters, produced by
 * `scripts/generate-image-thumbs.mjs` as `basename.thumb.webp` next to the
 * full-size file.
 * @param {string} fullSrc
 * @returns {string | null} thumb URL, or `null` if this URL does not get generated thumbs
 */
export function projectAssetThumbUrl(fullSrc) {
  if (typeof fullSrc !== "string" || fullSrc.trim() === "") return null;
  if (fullSrc.includes(".thumb.")) return null;
  if (!fullSrc.startsWith("/project-assets/")) return null;
  const q = fullSrc.indexOf("?");
  const path = q >= 0 ? fullSrc.slice(0, q) : fullSrc;
  const slash = path.lastIndexOf("/");
  if (slash < 0) return null;
  const dir = path.slice(0, slash + 1);
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return null;
  const base = file.slice(0, dot);
  return `${dir}${base}.thumb.webp`;
}
