import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { getSelectedAssets } from "./data/projects";

// —— strip tile config ——————————————————————————————————————————————————————

/**
 * Set to `true` to skip Mux video assets when building the main tile strip
 * (default / chronological / random). Image, video file, and text tiles are unchanged.
 */
export const EXCLUDE_MUX_STRIP_TILES = false;

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

/** Image size (`--panel-image-size`) above this → stacked; at or below → text-left of media. */
export const TILE_LAYOUT_IMAGE_SIZE_BREAKPOINT = 0.3;

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

/** @returns {(sizeMode: string, tileKey: string) => number} */
export function createTileSizeFactorResolver() {
  const widthByKey = new Map();
  const tierByKey = new Map();
  const tiers = [0.33, 0.66, 1];

  return (sizeMode, tileKey) => {
    if (sizeMode === SIZE_MODE_UNIFORM) return 1;
    if (sizeMode === SIZE_MODE_RANDOM_WIDTH) {
      if (!widthByKey.has(tileKey)) {
        widthByKey.set(tileKey, 0.2 + Math.random() * 0.8);
      }
      return widthByKey.get(tileKey);
    }
    if (
      sizeMode === SIZE_MODE_RANDOM_TIERS ||
      sizeMode === SIZE_MODE_RANDOM_TIERS_ROW_FILL
    ) {
      if (!tierByKey.has(tileKey)) {
        tierByKey.set(tileKey, tiers[Math.floor(Math.random() * tiers.length)]);
      }
      return tierByKey.get(tileKey);
    }
    return 1;
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
      if (Math.random() < 0.5) {
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
 * @param {{ reservedLeadingSlots?: number }} [options] First N positions never get blanks (strip lead block).
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
  const tagged = contentTiles.map(({ project, asset }) => ({
    type: "asset",
    project,
    asset,
  }));
  if (blankCount === 0) {
    return tagged;
  }
  const blanks = Array.from({ length: blankCount }, (_, i) => ({
    type: "blank",
    blankId: `blank:${i}`,
  }));
  const total = n + blankCount;
  const eligibleSlots = [];
  for (let i = 0; i < total; i += 1) {
    if (i >= reserved) eligibleSlots.push(i);
  }
  fisherYatesInPlace(eligibleSlots);
  const blankAtSlot = new Set(eligibleSlots.slice(0, blankCount));
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

// —— row flex-fill hook (size mode) ———————————————————————————————————————

const Y_TOLERANCE = 2;
const RO_DEBOUNCE_MS = 120;

/**
 * @param {HTMLElement} root
 * @param {HTMLElement} li
 */
function rowYRelativeToStrip(root, li) {
  const r0 = root.getBoundingClientRect();
  const r1 = li.getBoundingClientRect();
  return Math.round(r1.top - r0.top);
}

/** In DOM order; group by roughly equal vertical position. */
function groupRowsByY(list, root) {
  const rowGroups = [];
  let current = [];
  let rowY = null;
  for (const li of list) {
    const y = rowYRelativeToStrip(root, li);
    if (rowY == null) {
      current = [li];
      rowY = y;
    } else if (Math.abs(y - rowY) <= Y_TOLERANCE) {
      current.push(li);
    } else {
      rowGroups.push(current);
      current = [li];
      rowY = y;
    }
  }
  if (current.length) rowGroups.push(current);
  return rowGroups;
}

/**
 * @param {HTMLElement} el
 * @returns {string}
 */
function liKey(el) {
  return el?.dataset?.tileKey ?? "";
}

/**
 * @param {HTMLElement[]} row
 */
function pickPoolForRow(row) {
  const noTextLeft = row.filter(
    (el) => !el.querySelector?.(".asset-tile--text-left"),
  );
  return noTextLeft.length > 0 ? noTextLeft : row;
}

/** Deterministic, no Math.random (avoids layout ↔ observer feedback). */
function pickStableKeyFromPool(pool, rowSignature) {
  if (pool.length === 0) return "";
  let h = 2166136261;
  for (let i = 0; i < rowSignature.length; i += 1) {
    h ^= rowSignature.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % pool.length;
  return liKey(pool[idx]);
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

/**
 * Picks one strip item per row to grow (flex), except the last row (no grower there).
 * Stable across ResizeObserver flapping: per-row ref map, deterministic first pick, debounced observer.
 * @param {string} layoutSignature
 * @param {boolean} enabled
 */
export function useRowFillTileKeys(layoutSignature, enabled) {
  const stripRef = useRef(null);
  const fillKeyByRowSigRef = useRef(new Map());
  const [fillKeySet, setFillKeySet] = useState(() => new Set());

  const recompute = useCallback(() => {
    if (!enabled) {
      setFillKeySet((s) => (s.size > 0 ? new Set() : s));
      return;
    }
    const ul = stripRef.current;
    if (!ul) return;

    const items = Array.from(ul.querySelectorAll(":scope > li"));
    if (items.length === 0) {
      setFillKeySet((s) => (s.size > 0 ? new Set() : s));
      return;
    }

    const rows = groupRowsByY(items, ul);
    const currentSignatures = new Set();
    const map = fillKeyByRowSigRef.current;
    const next = new Set();

    for (let ri = 0; ri < rows.length; ri += 1) {
      const row = rows[ri];
      const rowSig = row.map(liKey).join("\0");
      currentSignatures.add(rowSig);
      if (rowSig.length === 0) continue;

      const isLastRow = ri === rows.length - 1;
      if (isLastRow) {
        map.delete(rowSig);
        continue;
      }

      const pool = pickPoolForRow(row);
      if (pool.length === 0) continue;

      const prev = map.get(rowSig);
      let chosen = "";
      if (prev && pool.some((el) => liKey(el) === prev)) {
        chosen = prev;
      } else {
        chosen = pickStableKeyFromPool(pool, rowSig);
        if (chosen) map.set(rowSig, chosen);
      }
      if (chosen) next.add(chosen);
    }

    for (const s of map.keys()) {
      if (!currentSignatures.has(s)) {
        map.delete(s);
      }
    }

    setFillKeySet((prev) => (setsEqual(prev, next) ? prev : next));
  }, [enabled, layoutSignature]);

  useLayoutEffect(() => {
    const t = requestAnimationFrame(recompute);
    return () => cancelAnimationFrame(t);
  }, [recompute]);

  useLayoutEffect(() => {
    if (!enabled) {
      fillKeyByRowSigRef.current.clear();
    }
  }, [enabled]);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const el = stripRef.current;
    if (!el) return undefined;
    let timeoutId;
    const run = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        recompute();
      }, RO_DEBOUNCE_MS);
    };
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(timeoutId);
    };
  }, [enabled, recompute]);

  return { stripRef, rowFillKeySet: fillKeySet, rowFillMode: enabled };
}
