import { getSelectedAssets } from "./data/projects";

// —— strip tile config ——————————————————————————————————————————————————————

/**
 * Set to `true` to skip Mux video assets when building the main tile strip
 * (default / chronological / random). Image, video file, and text tiles are unchanged.
 */
export const EXCLUDE_MUX_STRIP_TILES = false;

/**
 * When `true`, each work-strip content tile (after `orderTilesWithStripLeads`) is emitted twice
 * in a row as `~d0` and `~d1` (see `stripTileListKey`). For layout/debug stress. Blanks are unchanged.
 */
export const DUPLICATE_STRIP_TILES = false;

/**
 * @param {Array<{ project: unknown, asset: unknown, stripDupIndex?: number }>} contentTiles
 */
export function duplicateEachStripContentTile(contentTiles) {
  if (!DUPLICATE_STRIP_TILES) return contentTiles;
  return contentTiles.flatMap((t) => [
    { ...t, stripDupIndex: 0 },
    { ...t, stripDupIndex: 1 },
  ]);
}

/**
 * Stable list key for strip items (incl. blank interleaving and optional duplicate pass).
 * @param {{ type?: string, project?: { id: unknown }, asset?: { id: unknown }, blankId?: string, stripDupIndex?: number | null }} t
 */
export function stripTileListKey(t) {
  if (t.type === "blank" && t.blankId != null) {
    return t.blankId;
  }
  if (t.project && t.asset) {
    const base = `${t.project.id}-${t.asset.id}`;
    if (t.stripDupIndex != null) {
      return `${base}~d${t.stripDupIndex}`;
    }
    return base;
  }
  return t.blankId != null ? String(t.blankId) : "";
}

// —— layout modes ———————————————————————————————————————————————————————

export const LAYOUT_FLEX_START = "flex-start";
export const LAYOUT_FLEX_RANDOM = "flex-random";

export const LAYOUT_MODE_OPTIONS = [
  { value: LAYOUT_FLEX_START, label: "Flex start" },
  { value: LAYOUT_FLEX_RANDOM, label: "Flex random" },
];

// —— tile layouts (meta vs media) ——————————————————————————————————————————

/** How title/meta sit relative to media inside each asset tile. */
export const TILE_LAYOUT_STACKED = "stacked";
export const TILE_LAYOUT_TEXT_LEFT = "text-left";

export const TILE_LAYOUT_OPTIONS = [
  { value: TILE_LAYOUT_STACKED, label: "Text below media" },
  { value: TILE_LAYOUT_TEXT_LEFT, label: "Text left of media" },
];

/**
 * Image-size threshold for tile layout switch.
 * The image slider range is 0.05–3.0 (step 0.01). A 30% threshold on that range
 * is 0.05 + 0.30 * (3.0 - 0.05) = 0.935.
 * Above this => stacked; at or below => text-left.
 */
export const TILE_LAYOUT_IMAGE_SIZE_BREAKPOINT = 0.935;

/** @param {number} imageSize rounded panel image size multiplier */
export function tileLayoutFromImageSize(imageSize) {
  return imageSize > TILE_LAYOUT_IMAGE_SIZE_BREAKPOINT
    ? TILE_LAYOUT_STACKED
    : TILE_LAYOUT_TEXT_LEFT;
}

// —— size modes ——————————————————————————————————————————————————————————

export const SIZE_MODE_UNIFORM = "uniform";
export const SIZE_MODE_RANDOM_WIDTH = "random-width";
export const SIZE_MODE_RANDOM_TIERS = "random-tiers";
export const SIZE_MODE_RANDOM_TIERS_ROW_FILL = "random-tiers-row-fill";

export const SIZE_MODE_OPTIONS = [
  { value: SIZE_MODE_UNIFORM, label: "Uniform size" },
  {
    value: SIZE_MODE_RANDOM_WIDTH,
    label: "Random size (20–100%)",
  },
  {
    value: SIZE_MODE_RANDOM_TIERS,
    label: "Random size (33% / 66% / 100%)",
  },
  {
    value: SIZE_MODE_RANDOM_TIERS_ROW_FILL,
    label: "Random tiers (33/66/100) + one item per row grows",
  },
];

export const RANDOM_WIDTH_FACTOR_MIN = 0.2;
const TIER_VALUES = [0.33, 0.66, 1];

/**
 * Enforced minimum for the **`.asset-tile__media`** box (width/height) after layout when
 * bumping in `useJsFlexStrip` (whole-tile fallback if media is not laid out yet). The
 * effective factor is `max(natural, min-for-px)` from `baseEffectiveFactorFromMinPx` using
 * `stripTileBumpBasisRem` (16 vs 10) to match App.css; extra flex-squeeze steps reset when
 * the image size slider, layout, or root `rem` changes.
 */
export const MIN_STRIP_TILE_PX = 40;

/** Strip flex / stacked cap: `16rem * imageSize * factor` in App.css. */
export const STRIP_SIZE_BASIS_REM = 16;
/** Text-left `.asset-tile__media` height: `10rem * imageSize * factor` (tighter than 16). */
export const STRIP_TEXT_LEFT_MEDIA_BASIS_REM = 10;

/**
 * How `rem * imageSize * factor` maps from CSS: stacked/blank = `16rem*…*factor`,
 * text-left non-text = `10rem*…*factor` on the media height.
 * @param {{ type: string, project?: { id: any }, asset?: { kind: string, id: any }, blankId?: any }} tile
 * @param {string} tileLayout
 */
export function stripTileBumpBasisRem(tile, tileLayout) {
  if (tileLayout !== TILE_LAYOUT_TEXT_LEFT) return STRIP_SIZE_BASIS_REM;
  /** Blanks use the same 10rem×… media height as non-text text-left assets. */
  if (tile.type === "blank") {
    return STRIP_TEXT_LEFT_MEDIA_BASIS_REM;
  }
  if (tile.type === "asset" && tile.asset?.kind && tile.asset.kind !== "text") {
    return STRIP_TEXT_LEFT_MEDIA_BASIS_REM;
  }
  return STRIP_SIZE_BASIS_REM;
}

/**
 * Smallest **tier** `t` with `t >= need` (TIER_VALUES sorted ascending).
 * @param {number} need
 */
function nextTierOrSame(need) {
  const t = TIER_VALUES.find((x) => x >= need - 1e-6);
  return t ?? 1;
}

/**
 * @param {number} f
 * @param {string} sizeMode
 */
function oneStepUpFromEffective(f, sizeMode) {
  if (sizeMode === SIZE_MODE_UNIFORM) {
    return f;
  }
  if (sizeMode === SIZE_MODE_RANDOM_WIDTH) {
    if (f >= 1 - 1e-4) return f;
    return Math.min(1, f + 0.08);
  }
  if (
    sizeMode === SIZE_MODE_RANDOM_TIERS ||
    sizeMode === SIZE_MODE_RANDOM_TIERS_ROW_FILL
  ) {
    const i = TIER_VALUES.findIndex((t) => Math.abs(t - f) < 1e-3);
    if (i < 0) {
      for (let k = 0; k < TIER_VALUES.length; k += 1) {
        if (TIER_VALUES[k] > f + 1e-4) {
          return TIER_VALUES[k];
        }
      }
      return f;
    }
    if (i >= TIER_VALUES.length - 1) return f;
    return TIER_VALUES[i + 1];
  }
  return f;
}

/**
 * Base factor: respect **natural** per-tile random/tier, then raise to the next allowed
 * value so `basisRem*rem*imageSize*factor >= MIN_STRIP_TILE_PX` (recomputed when
 * the image size slider or root `rem` changes, so it does not stay “stuck” on large tiers).
 * @param {string} sizeMode
 * @param {number} natural
 * @param {number} rem
 * @param {number} imageSize
 * @param {number} basisRem
 */
function baseEffectiveFactorFromMinPx(
  sizeMode,
  natural,
  rem,
  imageSize,
  basisRem,
) {
  if (sizeMode === SIZE_MODE_UNIFORM) return 1;
  const scale = basisRem * rem * imageSize;
  if (scale <= 0) return natural;
  const minF = MIN_STRIP_TILE_PX / scale;
  if (sizeMode === SIZE_MODE_RANDOM_WIDTH) {
    return Math.min(
      1,
      Math.max(
        RANDOM_WIDTH_FACTOR_MIN,
        Math.max(natural, minF),
      ),
    );
  }
  if (
    sizeMode === SIZE_MODE_RANDOM_TIERS ||
    sizeMode === SIZE_MODE_RANDOM_TIERS_ROW_FILL
  ) {
    return nextTierOrSame(Math.max(natural, minF));
  }
  return 1;
}

/**
 * @typedef {{
 *   getNaturalFactor: (sizeMode: string, tileKey: string) => number;
 *   getEffectiveFactor: (sizeMode: string, tileKey: string, rem: number, imageSize: number, basisRem: number) => number;
 *   bumpFactorUpOneStep: (sizeMode: string, tileKey: string, rem: number, imageSize: number, basisRem: number) => boolean;
 *   resetLayoutExtraSteps: () => void;
 * }} TileSizeResolver
 * @returns {TileSizeResolver}
 */
export function createTileSizeFactorResolver() {
  const widthByKey = new Map();
  const tierByKey = new Map();
  /** When flex row squeezes the tile below 40px despite the base, extra “+1” steps. Cleared on image size / layout mode changes. */
  const layoutExtraSteps = new Map();

  function getNaturalFactor(sizeMode, tileKey) {
    if (sizeMode === SIZE_MODE_UNIFORM) return 1;
    if (sizeMode === SIZE_MODE_RANDOM_WIDTH) {
      if (!widthByKey.has(tileKey)) {
        widthByKey.set(
          tileKey,
          RANDOM_WIDTH_FACTOR_MIN + Math.random() * (1 - RANDOM_WIDTH_FACTOR_MIN),
        );
      }
      return widthByKey.get(tileKey);
    }
    if (
      sizeMode === SIZE_MODE_RANDOM_TIERS ||
      sizeMode === SIZE_MODE_RANDOM_TIERS_ROW_FILL
    ) {
      if (!tierByKey.has(tileKey)) {
        tierByKey.set(
          tileKey,
          TIER_VALUES[Math.floor(Math.random() * TIER_VALUES.length)],
        );
      }
      return tierByKey.get(tileKey);
    }
    return 1;
  }

  function getEffectiveFactor(sizeMode, tileKey, rem, imageSize, basisRem) {
    if (sizeMode === SIZE_MODE_UNIFORM) return 1;
    const natural = getNaturalFactor(sizeMode, tileKey);
    const g = baseEffectiveFactorFromMinPx(
      sizeMode,
      natural,
      rem,
      imageSize,
      basisRem,
    );
    const n = layoutExtraSteps.get(tileKey) || 0;
    let f = g;
    for (let i = 0; i < n; i += 1) {
      const nextF = oneStepUpFromEffective(f, sizeMode);
      if (nextF <= f + 1e-5) {
        break;
      }
      f = nextF;
    }
    return f;
  }

  /**
   * Next step when measured media is still < MIN (flex squeeze). Extra steps are reset when
   * the slider crosses into “all sizes are large enough” so random tiers can reappear.
   * @returns {boolean} true if the effective factor changed
   */
  function bumpFactorUpOneStep(sizeMode, tileKey, rem, imageSize, basisRem) {
    if (sizeMode === SIZE_MODE_UNIFORM) {
      return false;
    }
    const before = getEffectiveFactor(sizeMode, tileKey, rem, imageSize, basisRem);
    const cur = layoutExtraSteps.get(tileKey) || 0;
    layoutExtraSteps.set(tileKey, cur + 1);
    const after = getEffectiveFactor(sizeMode, tileKey, rem, imageSize, basisRem);
    if (Math.abs(after - before) < 1e-5) {
      layoutExtraSteps.set(tileKey, cur);
      return false;
    }
    return true;
  }

  function resetLayoutExtraSteps() {
    layoutExtraSteps.clear();
  }

  return {
    getNaturalFactor,
    getEffectiveFactor,
    bumpFactorUpOneStep,
    resetLayoutExtraSteps,
  };
}

// —— tile ordering (strip) —————————————————————————————————————————————————

/** `staticSiteIntro` / `staticSiteFooter` in projects.js: copy is rendered outside the work strip. */
function isWorkStripProject(project) {
  return !project?.staticSiteIntro && !project?.staticSiteFooter;
}

function stripSelectedAssetsForTiles(project) {
  const all = getSelectedAssets(project);
  if (!EXCLUDE_MUX_STRIP_TILES) return all;
  return all.filter((a) => a.kind !== "mux");
}

function projectToStripTilePairs(project) {
  return stripSelectedAssetsForTiles(project).map((asset) => ({ project, asset }));
}

export const DISPLAY_MODE_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "chronological", label: "Chronological (newest first)" },
  { value: "random", label: "Random" },
];

/**
 * Share of total grid (content + blanks) that should be blank; blanks are added, not converted.
 * Single source for the debug range control in `ControlPanel` and for blank-tile tenth shuffles.
 */
export const blankTilesPercentRange = { min: 0, max: 60, step: 1, defaultValue: 0 };

/**
 * Must match `imageSizeRange` in `ControlPanel.jsx` (min / max only).
 * Used to map image size → max blank %.
 */
const PANEL_IMAGE_SIZE_EXTENT = { min: 0.25, max: 3 };

/**
 * `true` when the top `.control-bar` image size is in the **upper half** of
 * `PANEL_IMAGE_SIZE_EXTENT` (same range as `imageSizeRange` in `ControlPanel.jsx`).
 * Used to avoid back-to-back blank strip tiles at large image sizes.
 */
export function isMainImageSizeControlAboveHalf(imageSize) {
  const { min: sMin, max: sMax } = PANEL_IMAGE_SIZE_EXTENT;
  return imageSize > (sMin + sMax) / 2;
}

/**
 * Contiguous slot indices: max count with no two adjacent (path graph).
 * @param {number} len
 */
function maxNonAdjacentBlanksInRun(len) {
  if (len <= 0) return 0;
  return Math.ceil(len / 2);
}

/**
 * Greedily pick `target` slots from `eligibleSlots` (a contiguous range of indices)
 * with no two consecutive. Retries with fresh shuffles so we often hit the target
 * when it is feasible (`target <= maxNonAdjacentBlanksInRun(eligibleSlots.length)`).
 * @param {number[]} eligibleSlots
 * @param {number} target
 * @returns {Set<number>}
 */
function pickNonAdjacentBlankSlots(eligibleSlots, target) {
  if (target === 0 || eligibleSlots.length === 0) {
    return new Set();
  }
  const cap = maxNonAdjacentBlanksInRun(eligibleSlots.length);
  const n = Math.min(target, cap);
  if (n === 0) {
    return new Set();
  }
  const pool = eligibleSlots;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const order = fisherYatesInPlace([...pool]);
    const chosen = new Set();
    for (const s of order) {
      if (chosen.size >= n) break;
      if (chosen.has(s - 1) || chosen.has(s + 1)) continue;
      chosen.add(s);
    }
    if (chosen.size === n) {
      return chosen;
    }
  }
  const order = fisherYatesInPlace([...pool]);
  const chosen = new Set();
  for (const s of order) {
    if (chosen.size >= n) break;
    if (chosen.has(s - 1) || chosen.has(s + 1)) continue;
    chosen.add(s);
  }
  return chosen;
}

/**
 * At minimum panel image size, allow the full `blankTilesPercentRange.max` (40%).
 * At maximum image size, cap at 35%. Linear in between.
 */
const BLANK_PERCENT_MAX_AT_MIN_IMAGE = blankTilesPercentRange.max;
const BLANK_PERCENT_MAX_AT_MAX_IMAGE = 20;

/**
 * Max allowed blank-tile share (% of content+blanks) for a given panel image size.
 */
export function maxBlankTilesPercentForImageSize(imageSize) {
  const { min: sMin, max: sMax } = PANEL_IMAGE_SIZE_EXTENT;
  const t = (imageSize - sMin) / (sMax - sMin);
  const u = Math.max(0, Math.min(1, t));
  const linear =
    BLANK_PERCENT_MAX_AT_MIN_IMAGE +
    (BLANK_PERCENT_MAX_AT_MAX_IMAGE - BLANK_PERCENT_MAX_AT_MIN_IMAGE) * u;
  return Math.round(linear);
}

/**
 * When panel image size (0.01 steps) moves into a new 0.1 "band" (tenth index
 * from `imageSizeTenthIndex`), `applyImageTenthCrossShuffle` runs each listed spec.
 *
 * Each spec is either:
 * - `{ key, getOptions }` — pick uniformly at random from `getOptions()`, then `setters[key](value)`.
 * - `{ apply }` — custom `(setters) => void` when the shuffle is not a simple option pick
 *   (e.g. blank tiles: 50% random step in `blankTilesPercentRange`, else `0`).
 *
 * Comment out any entry to disable that shuffle. Add new controls by extending this array and
 * passing the matching setter(s) from `App.jsx` into `applyImageTenthCrossShuffle`.
 * Tile layout is not shuffled here: it follows `tileLayoutFromImageSize` vs `TILE_LAYOUT_IMAGE_SIZE_BREAKPOINT`.
 * An empty array disables all tenth-cross shuffles.
 *
 * @typedef {{ key: string, getOptions: () => unknown[] }} TenthShuffleOptionPick
 * @typedef {{ apply: (setters: Record<string, (value: string | number) => void>) => void }} TenthShuffleApply
 * @type {(TenthShuffleOptionPick | TenthShuffleApply)[]}
 */
export const IMAGE_TENTH_CROSS_SHUFFLE = [
  {
    key: "sizeMode",
    getOptions: () => SIZE_MODE_OPTIONS.map((o) => o.value),
  },
  {
    key: "layoutMode",
    getOptions: () => LAYOUT_MODE_OPTIONS.map((o) => o.value),
  },
  {
    apply: (setters) => {
      const setBlank = setters.blankTilesPercent;
      if (typeof setBlank !== "function") return;
      if (Math.random() < 0.3) {
        const { min, max, step } = blankTilesPercentRange;
        const stepCount = Math.floor((max - min) / step) + 1;
        setBlank(min + step * Math.floor(Math.random() * stepCount));
      } else {
        setBlank(0);
      }
    },
  },
  // e.g. { key: "displayMode", getOptions: () => DISPLAY_MODE_OPTIONS.map((o) => o.value) },
];

/**
 * @param {Record<string, (value: string | number) => void>} setters
 *   Must include every `key` used in `IMAGE_TENTH_CROSS_SHUFFLE`, plus `blankTilesPercent` if the
 *   blank-tile `apply` entry is enabled.
 */
export function applyImageTenthCrossShuffle(setters) {
  for (const spec of IMAGE_TENTH_CROSS_SHUFFLE) {
    if (typeof spec.apply === "function") {
      spec.apply(setters);
      continue;
    }
    if (spec.getOptions) {
      const opts = spec.getOptions();
      if (!opts || opts.length < 1) continue;
      const v = opts[Math.floor(Math.random() * opts.length)];
      setters[spec.key]?.(v);
    }
  }
}

export function buildDefaultTiles(projects) {
  return projects
    .filter(isWorkStripProject)
    .flatMap((project) => projectToStripTilePairs(project));
}

export function buildChronologicalTiles(projects) {
  const withIndex = projects.map((project, listIndex) => ({ project, listIndex }));
  withIndex.sort((a, b) => {
    const yearA = a.project.year ?? 0;
    const yearB = b.project.year ?? 0;
    if (yearB !== yearA) return yearB - yearA;
    return a.listIndex - b.listIndex;
  });
  return withIndex
    .filter(({ project }) => isWorkStripProject(project))
    .flatMap(({ project }) => projectToStripTilePairs(project));
}

function fisherYatesInPlace(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function buildRandomTiles(projects) {
  return fisherYatesInPlace([...buildDefaultTiles(projects)]);
}

/**
 * Projects with `stripLead: true` (in `projects.js` order) are moved to the front
 * of the strip with assets in `getSelectedAssets` order, before any other projects
 * (default / chronological / random).
 * @param {Array<{ project: unknown, asset: unknown }>} orderedTiles
 * @param {Array<{ id: string, stripLead?: boolean, assets: unknown[] }>} projects
 */
export function orderTilesWithStripLeads(orderedTiles, projects) {
  const leadProjects = projects.filter(
    (p) => p.stripLead && isWorkStripProject(p),
  );
  if (leadProjects.length === 0) return orderedTiles;

  const leadIds = new Set(leadProjects.map((p) => p.id));
  const leadBlock = leadProjects.flatMap((project) => projectToStripTilePairs(project));
  const rest = orderedTiles.filter((t) => !leadIds.has(t.project.id));
  return [...leadBlock, ...rest];
}

/** How many content tiles belong to `stripLead` projects (for blank interleaving). */
export function countStripLeadTiles(projects) {
  return projects
    .filter((p) => p.stripLead && isWorkStripProject(p))
    .reduce((sum, p) => sum + stripSelectedAssetsForTiles(p).length, 0);
}

/**
 * How many blank tiles to add so that roughly `blankPercent`% of the combined
 * grid (content + blanks) are blank. Content tiles are unchanged; blanks are extra.
 * @param {number} contentCount
 * @param {number} blankPercent 0–60 (meaning 0–60% of total tiles blank)
 */
export function countBlankTilesForShare(contentCount, blankPercent) {
  if (contentCount === 0) return 0;
  const p = Math.max(0, Math.min(blankPercent / 100, 0.6));
  if (p <= 0) return 0;
  return Math.round((p * contentCount) / (1 - p));
}

/**
 * @param {Array<{ project: unknown, asset: unknown }>} contentTiles
 * @param {number} blankPercent
 * @param {{ reservedLeadingSlots?: number, imageSize?: number }} [options]
 *   First N positions never get blanks (strip lead block). When `imageSize` is
 *   in the upper half of the main control-bar range, no two blank tiles are adjacent.
 * @returns {Array<
 *   | { type: "asset"; project: unknown; asset: unknown }
 *   | { type: "blank"; blankId: string }
 * >}
 */
export function intersperseBlankTiles(contentTiles, blankPercent, options = {}) {
  const n = contentTiles.length;
  const reserved = Math.min(
    n,
    Math.max(0, Math.floor(options.reservedLeadingSlots ?? 0)),
  );
  const blankCount = countBlankTilesForShare(n, blankPercent);
  const tagged = contentTiles.map((row) => {
    const o = {
      type: "asset",
      project: row.project,
      asset: row.asset,
    };
    if (row.stripDupIndex != null) {
      o.stripDupIndex = row.stripDupIndex;
    }
    return o;
  });
  if (blankCount === 0) {
    return tagged;
  }
  const imageSize = options.imageSize;
  const useNoAdjacent =
    imageSize != null && isMainImageSizeControlAboveHalf(imageSize);

  let k = blankCount;
  if (useNoAdjacent) {
    while (k > 0) {
      const runLen = n + k - reserved;
      if (k <= maxNonAdjacentBlanksInRun(runLen)) {
        break;
      }
      k -= 1;
    }
  }
  if (k === 0) {
    return tagged;
  }

  const total = n + k;
  const eligibleSlots = [];
  for (let i = 0; i < total; i += 1) {
    if (i >= reserved) eligibleSlots.push(i);
  }
  const blanks = Array.from({ length: k }, (_, i) => ({
    type: "blank",
    blankId: `blank:${i}`,
  }));
  let blankAtSlot;
  if (useNoAdjacent) {
    blankAtSlot = pickNonAdjacentBlankSlots(eligibleSlots, k);
  } else {
    fisherYatesInPlace(eligibleSlots);
    blankAtSlot = new Set(eligibleSlots.slice(0, k));
  }
  const out = [];
  let assetIdx = 0;
  let blankIdx = 0;
  for (let slot = 0; slot < total; slot += 1) {
    if (blankAtSlot.has(slot)) {
      out.push(blanks[blankIdx++]);
    } else {
      out.push(tagged[assetIdx++]);
    }
  }
  return out;
}
