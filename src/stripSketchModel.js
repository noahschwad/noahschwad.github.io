/**
 * Strip layout as a lightweight “sketch” model: one JS object per tile with fields the
 * flex engine and debug tooling can read without walking the DOM tree.
 *
 * Numbers are updated from the pure flex pass each layout; aspect comes from decode hooks.
 */

/**
 * @typedef {Object} StripSketchTile
 * @property {string} key
 * @property {{ type: string, blankId?: string, project?: unknown, asset?: unknown, exiting?: boolean }} tile
 * @property {number | null} aspect naturalWidth / naturalHeight for media tiles
 * @property {number} targetX
 * @property {number} targetY
 * @property {number} targetW
 * @property {number} targetH
 */

/**
 * @param {Map<string, StripSketchTile>} sketchByKey
 * @param {Array<{ type: string, blankId?: string, project?: unknown, asset?: unknown, exiting?: boolean }>} layoutTiles
 * @param {(t: typeof layoutTiles[0]) => string} tileKeyFn
 */
export function reconcileStripSketchTiles(sketchByKey, layoutTiles, tileKeyFn) {
  const nextKeys = new Set();
  for (const t of layoutTiles) {
    const key = tileKeyFn(t);
    if (!key) continue;
    nextKeys.add(key);
    let s = sketchByKey.get(key);
    if (!s) {
      s = {
        key,
        tile: t,
        aspect: null,
        targetX: 0,
        targetY: 0,
        targetW: 0,
        targetH: 0,
      };
      sketchByKey.set(key, s);
    } else {
      s.tile = t;
    }
  }
  for (const k of sketchByKey.keys()) {
    if (!nextKeys.has(k)) sketchByKey.delete(k);
  }
}

/**
 * @param {Map<string, StripSketchTile>} sketchByKey
 * @param {Map<string, number>} aspectByKey natural width ÷ height
 */
export function applyAspectsToStripSketch(sketchByKey, aspectByKey) {
  for (const [key, s] of sketchByKey) {
    const a = aspectByKey.get(key);
    s.aspect = typeof a === "number" && a > 0 && Number.isFinite(a) ? a : null;
  }
}

/**
 * @param {Map<string, StripSketchTile>} sketchByKey
 * @param {Record<string, { x: number, y: number, width: number, height: number }>} rects
 */
export function applyTargetsToStripSketch(sketchByKey, rects) {
  for (const [key, s] of sketchByKey) {
    const r = rects[key];
    if (!r) continue;
    s.targetX = r.x;
    s.targetY = r.y;
    s.targetW = r.width;
    s.targetH = r.height;
  }
}
