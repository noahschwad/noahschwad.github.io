import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LAYOUT_FLEX_CENTER,
  LAYOUT_FLEX_END,
  LAYOUT_FLEX_RANDOM,
  LAYOUT_FLEX_START,
  MIN_STRIP_TILE_PX,
  SIZE_MODE_RANDOM_TIERS_ROW_FILL,
  stripTileBumpBasisRem,
  TILE_LAYOUT_NO_TEXT,
  TILE_LAYOUT_TEXT_LEFT,
} from "./functionality";
import {
  applyAspectsToStripSketch,
  applyTargetsToStripSketch,
  reconcileStripSketchTiles,
} from "./stripSketchModel";
import {
  ALIGN_CENTER,
  ALIGN_CONTENT_STRETCH,
  ALIGN_END,
  ALIGN_START,
  ALIGN_STRETCH,
  FLEX_ROW,
  FLEX_ROW_REVERSE,
  FLEX_WRAP,
  JUSTIFY_FLEX_START,
  computeFlexLayout,
  flexLineKeyGroupsFromItems,
} from "./jsFlexLayout";

/** Matches legacy `.selected-strip` CSS flex container (`alignItems` from `layoutMode`). */
const STRIP_CONTAINER_FLEX = {
  flexDirection: FLEX_ROW,
  flexWrap: FLEX_WRAP,
  justifyContent: JUSTIFY_FLEX_START,
  alignContent: ALIGN_CONTENT_STRETCH,
};

/** @param {string} layoutMode from `LAYOUT_*` in `functionality.js` */
function stripAlignItemsFromLayoutMode(layoutMode) {
  switch (layoutMode) {
    case LAYOUT_FLEX_CENTER:
      return ALIGN_CENTER;
    case LAYOUT_FLEX_END:
      return ALIGN_END;
    case LAYOUT_FLEX_RANDOM:
    case LAYOUT_FLEX_START:
    default:
      return ALIGN_START;
  }
}

const LERP = 0.15;
const SNAP = 0.45;
/**
 * When true, strip lerp is capped at `STRIP_ANIMATION_MAX_FPS`. When false, every `requestAnimationFrame`
 * tick runs the lerp (matches display refresh, e.g. 120 Hz on ProMotion).
 */
const STRIP_ANIMATION_FPS_LIMIT_ENABLED = true;
/** Used only when `STRIP_ANIMATION_FPS_LIMIT_ENABLED` is true. */
const STRIP_ANIMATION_MAX_FPS = 60;
const STRIP_ANIMATION_MIN_FRAME_MS = STRIP_ANIMATION_FPS_LIMIT_ENABLED
  ? 1000 / STRIP_ANIMATION_MAX_FPS
  : 0;

/**
 * @param {string} key
 * @param {Map<string, string>|null|undefined} alignSelfByKey
 * @param {string} containerAlignItems
 */
function shouldStretchCrossAxis(key, alignSelfByKey, containerAlignItems) {
  const raw = alignSelfByKey?.get(key);
  const effective =
    raw != null && raw !== "" && raw !== "auto" ? raw : containerAlignItems;
  return effective === ALIGN_STRETCH;
}
const MAX_GAP_REM_MAIN = 0.3;
const MAX_GAP_REM_CROSS = 1;
const MAX_GAP_REM_MAIN_TEXT_LEFT = 1;

/** @param {string} rowSig */
function stablePickFromPool(pool, rowSig) {
  if (pool.length === 0) return "";
  let h = 2166136261;
  for (let i = 0; i < rowSig.length; i += 1) {
    h ^= rowSig.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % pool.length;
  return pool[idx];
}

/**
 * @param {string[][]} lines keys per line (main-axis order)
 * @param {Set<string>} textLeftKeys asset keys that use text-left inner layout (all assets when tileLayout is text-left)
 * @param {Map<string, string>} fillKeyByRowSig
 */
function rowFillKeysForLines(lines, textLeftKeys, fillKeyByRowSig) {
  const next = new Set();
  const currentSigs = new Set();

  for (let ri = 0; ri < lines.length; ri += 1) {
    const line = lines[ri];
    const rowSig = line.join("\0");
    if (rowSig.length === 0) continue;
    currentSigs.add(rowSig);

    const isLastRow = ri === lines.length - 1;
    if (isLastRow) {
      fillKeyByRowSig.delete(rowSig);
      continue;
    }

    const noTextLeft = line.filter((k) => !textLeftKeys.has(k));
    const pool = noTextLeft.length > 0 ? noTextLeft : line;
    if (pool.length === 0) continue;

    let chosen = "";
    const prev = fillKeyByRowSig.get(rowSig);
    if (prev && pool.includes(prev)) {
      chosen = prev;
    } else {
      chosen = stablePickFromPool(pool, rowSig);
      if (chosen) fillKeyByRowSig.set(rowSig, chosen);
    }
    if (chosen) next.add(chosen);
  }

  for (const s of fillKeyByRowSig.keys()) {
    if (!currentSigs.has(s)) fillKeyByRowSig.delete(s);
  }

  return next;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Smaller displayed edge of media in a **stacked** tile (`width:100%`, `height:auto` on the media):
 * width ≈ `wUsed`, height ≈ `wUsed / aspect` where `aspect` = naturalWidth / naturalHeight.
 */
function stackedMediaMinShortSideFromWidth(wUsed, aspectNaturalWidthOverHeight) {
  const ar = aspectNaturalWidthOverHeight;
  if (!(wUsed > 0) || !(ar > 0) || !Number.isFinite(ar)) return 0;
  return wUsed * Math.min(1, 1 / ar);
}

/**
 * Text-left media column height — matches
 * `height: calc(10rem * var(--panel-image-size) * var(--tile-size-factor))`.
 */
function textLeftMediaColumnHeightPx(rem, imageSize, factor) {
  return 10 * rem * imageSize * factor;
}

/**
 * Text-left media column main-axis width at a fixed height (auto width + contain).
 * @param {number} aspect width ÷ height from intrinsic media (or 0 if unknown)
 */
function textLeftMediaMainWidthPx(tile, rem, imageSize, textSize, factor, aspect) {
  const h = textLeftMediaColumnHeightPx(rem, imageSize, factor);
  if (tile.type === "blank") {
    return h * (4 / 3);
  }
  if (tile.type !== "asset" || !tile.asset) {
    return h * (4 / 3);
  }
  const kind = tile.asset.kind;
  if (kind === "text") {
    const cap = 22 * rem;
    const raw = String(tile.asset.text ?? "");
    const plainLen = tile.asset.textHtml
      ? raw.replace(/<[^>]+>/g, " ").trim().length
      : raw.trim().length;
    const large = tile.asset.textLarge !== false;
    const fontPx = 0.75 * rem * textSize * (large ? 1.5 : 1);
    const avgCharPx = 0.55 * fontPx;
    const est = Math.max(40, plainLen * avgCharPx);
    return Math.min(cap, est);
  }
  const ar = typeof aspect === "number" && aspect > 0 ? aspect : 0;
  if (ar > 0) {
    return h * ar;
  }
  return h * (4 / 3);
}

/** Single-line estimate for `.asset-tile__meta` width in text-left. */
function estimateTextLeftMetaWidthPx(tile, rem, textSize) {
  if (tile.type !== "asset") return 0;
  const p = tile.project;
  const a = tile.asset;
  if (!p && !a) return 0;
  const fs = 0.75 * rem * textSize;
  const avgChar = 0.55 * fs;
  let w = 0;
  const title = p?.title;
  if (title != null && String(title).trim() !== "") {
    w = Math.max(w, String(title).trim().length * avgChar);
  }
  const category = a?.category ?? p?.category;
  const year = a?.year ?? p?.year;
  const subBits = [];
  if (category != null && String(category).trim() !== "") {
    subBits.push(String(category).trim());
  }
  if (year != null && String(year).trim() !== "") {
    subBits.push(String(year).trim());
  }
  if (subBits.length > 0) {
    const subLen = subBits.join(" · ").length;
    w = Math.max(w, subLen * avgChar);
  }
  return w;
}

/**
 * @param {Map<string, StripTileMetaMetrics>|null|undefined} metaMetricsByKey
 */
function resolveTextLeftMetaWidthPx(key, tile, rem, textSize, metaMetricsByKey) {
  const m = metaMetricsByKey?.get(key);
  if (m && typeof m.metaW === "number" && m.metaW > 0) {
    return m.metaW;
  }
  return estimateTextLeftMetaWidthPx(tile, rem, textSize);
}

/**
 * Text-left main-axis flex basis: meta + gap + media (no DOM read).
 * @param {number} cap row width cap
 */
function computeTextLeftMainPx(
  tile,
  key,
  rem,
  imageSize,
  textSize,
  factor,
  aspect,
  metaMetricsByKey,
  cap,
) {
  const gap = assetTileColumnGapPx(rem);
  const metaW = resolveTextLeftMetaWidthPx(
    key,
    tile,
    rem,
    textSize,
    metaMetricsByKey,
  );
  const mediaW = textLeftMediaMainWidthPx(
    tile,
    rem,
    imageSize,
    textSize,
    factor,
    aspect,
  );
  const pairGap = metaW > 0 && mediaW > 0 ? gap : 0;
  return Math.min(Math.max(0, metaW + mediaW + pairGap), cap);
}

/**
 * Fingerprint of tile content + typographic strip inputs. Used to reuse DOM text
 * measures until copy, layout mode, or scale inputs change.
 * @param {{ type: string, blankId?: string, project?: { title?: unknown, category?: unknown, year?: unknown }, asset?: { kind?: string, text?: string, textHtml?: boolean, textLarge?: boolean, category?: unknown, year?: unknown, playbackId?: string, tokens?: { playback?: string }, src?: string }, exiting?: boolean }} tile
 */
function stripTileLayoutContentSig(tile, tileLayout, textSize, imageSize, rem) {
  const parts = [
    tileLayout,
    String(textSize),
    String(imageSize),
    String(Math.round(rem * 1000) / 1000),
  ];
  if (tile.type === "blank") {
    parts.push(
      "blank",
      String(tile.blankId ?? ""),
      tile.exiting ? "1" : "0",
    );
    return parts.join("\0");
  }
  const p = tile.project;
  const a = tile.asset;
  if (!a) return parts.join("\0");
  const kind = a.kind ?? "";
  parts.push(kind);
  if (kind === "text") {
    parts.push(
      String(a.text ?? ""),
      a.textHtml ? "1" : "0",
      a.textLarge === false ? "0" : "1",
    );
  } else if (kind === "mux") {
    parts.push(
      String(a.playbackId ?? "").trim(),
      String(a.tokens?.playback ?? ""),
    );
  } else if (kind === "video") {
    parts.push(String(a.src ?? ""));
  } else {
    parts.push(String(a.src ?? ""));
  }
  const category = a.category ?? p?.category ?? "";
  parts.push(
    String(p?.title ?? ""),
    String(category),
    String(a.year ?? p?.year ?? ""),
  );
  return parts.join("\0");
}

/**
 * `--tile-size-factor` on the strip item is set from React from
 * `getEffectiveFactor(…)`. Resolver mutations do not re-render, so the inline
 * style can lag. Keep the var in sync when we read a factor or position tiles.
 * @param {HTMLElement} stripItemEl
 * @param {number} factor
 */
function syncStripItemTileSizeFactor(stripItemEl, factor) {
  stripItemEl.style.setProperty("--tile-size-factor", String(factor));
}

/**
 * Stacked blank: `16*rem*imageSize*factor` flex basis. Text-left blanks + image/video/mux: media
 * height is `10*rem*imageSize*factor` — also bumps. Text-left without `el` still uses 16* for the
 * fallback row basis. Stacked / text-left **text** copy: cross-size is math + cache (no tile `offsetHeight`).
 */
function tileUsesSizeModeForStripBumps(tile, el, tileLayout) {
  if (tile.type === "blank") return true;
  if (tile.type === "asset" && tile.asset?.kind === "text") return false;
  return true;
}

/** `.asset-tile` column `gap: 0.3rem` (main axis gap between meta and media when stacked). */
function assetTileColumnGapPx(rem) {
  return 0.3 * rem;
}

/**
 * DOM-measured `.asset-tile__meta` box + computed tile `gap` / `columnGap`, anchored to the tile
 * article width when measured (`anchorW` ≈ flex `W`).
 *
 * @typedef {object} StripTileMetaMetrics
 * @property {number} metaW
 * @property {number} metaH
 * @property {number} gapPx
 * @property {number} anchorW
 */

/**
 * Use cached meta + gap when the tile was measured at a width close to laid-out `W`.
 * @param {string} key
 * @param {number} W
 * @param {Map<string, StripTileMetaMetrics>|null|undefined} metaMetricsByKey
 * @param {number} rem
 * @returns {{ metaH: number, metaW: number, gapPx: number } | null}
 */
function resolveCachedStripTileMetaGap(key, W, metaMetricsByKey, rem) {
  const m = metaMetricsByKey?.get(key);
  if (!m || !(W > 0)) return null;
  const anchorW = m.anchorW;
  if (!(anchorW > 0)) return null;
  const tol = Math.max(2, W * 0.025);
  if (Math.abs(anchorW - W) > tol) return null;
  const gapPx =
    typeof m.gapPx === "number" && Number.isFinite(m.gapPx) && m.gapPx >= 0
      ? m.gapPx
      : assetTileColumnGapPx(rem);
  return {
    metaH: Math.max(0, m.metaH ?? 0),
    metaW: Math.max(0, m.metaW ?? 0),
    gapPx,
  };
}

/**
 * Approximate stacked meta block height from title/sub fields (matches `.asset-tile` font scale).
 * Returns 0 in `TILE_LAYOUT_NO_TEXT` since the meta block isn't rendered.
 */
function estimateStackedMetaHeightPx(tile, rem, textSize, tileLayout) {
  if (tileLayout === TILE_LAYOUT_NO_TEXT) return 0;
  if (tile.type !== "asset") return 0;
  const p = tile.project;
  const a = tile.asset;
  if (!p && !a) return 0;
  const title = p?.title;
  const category = a?.category ?? p?.category;
  const year = a?.year ?? p?.year;
  const hasTitle = title != null && String(title).trim() !== "";
  const hasSub =
    (category != null && String(category).trim() !== "") ||
    (year != null && String(year).trim() !== "");
  if (!hasTitle && !hasSub) return 0;
  const fs = 0.75 * rem * textSize;
  const line = 1.2 * fs;
  return (hasTitle ? 1.45 * line : 0) + (hasSub ? line : 0);
}

/** Stacked blank placeholder media: `min-height: 8rem` and `aspect-ratio: 4 / 3` on `.asset-tile__media`. */
function stackedBlankMediaHeightPx(W, rem) {
  return Math.max(8 * rem, (3 * Math.max(W, 1)) / 4);
}

/** Round for debug overlay / math strings. */
function rx(x) {
  if (!Number.isFinite(x)) return "?";
  const a = Math.abs(x);
  if (a >= 1000) return String(Math.round(x));
  if (a >= 100) return String(Math.round(x * 10) / 10);
  return String(Math.round(x * 100) / 100);
}

/**
 * Approximate stacked / text-left **copy** block height from string length and width
 * (`.asset-tile__text-block`: line-height 1.35, font 1em or 1.5em large).
 */
function estimateStackedTextCopyBlockHeightPx(tile, contentWidthPx, rem, textSize) {
  if (tile.type !== "asset" || tile.asset?.kind !== "text") return 0;
  const raw = String(tile.asset.text ?? "");
  const plainLen = tile.asset.textHtml
    ? raw.replace(/<[^>]+>/g, " ").length
    : raw.length;
  const chars = Math.max(plainLen, 8);
  const large = tile.asset.textLarge !== false;
  const fontPx = 0.75 * rem * textSize * (large ? 1.5 : 1);
  const linePx = 1.35 * fontPx;
  const avgCharPx = 0.55 * fontPx;
  const w = Math.max(40, contentWidthPx);
  const cpl = Math.max(8, Math.floor(w / avgCharPx));
  const lines = Math.max(1, Math.ceil(chars / cpl));
  const paddingBottom = 0.5 * fontPx;
  return lines * linePx + paddingBottom;
}

/**
 * Strip cross size + one-line derivation (keeps `estimateStripTileCrossPx` in sync for debug).
 * @param {object} p same shape as `estimateStripTileCrossPx`
 * @returns {{ cross: number, math: string }}
 */
function computeStripTileCrossWithMath(p) {
  const {
    tile,
    key,
    W,
    tileLayout,
    textSize,
    imageSize,
    rem,
    factor,
    aspect,
    crossFallback,
    stackedTextCrossCache,
    metaMetricsByKey,
  } = p;
  if (!(W > 0) || !Number.isFinite(W)) {
    return { cross: crossFallback, math: `W invalid → ${rx(crossFallback)}` };
  }

  const noText = tileLayout === TILE_LAYOUT_NO_TEXT;
  const fallbackGap = assetTileColumnGapPx(rem);
  const cachedMeta = resolveCachedStripTileMetaGap(key, W, metaMetricsByKey, rem);
  /* No-text mode renders no meta block, so neither the meta-to-media gap nor
     a stale cached metaH from a previous layout should contribute to the row
     height calc. */
  const gap = noText ? 0 : (cachedMeta?.gapPx ?? fallbackGap);
  const estimatedMeta = estimateStackedMetaHeightPx(tile, rem, textSize, tileLayout);
  const metaH = noText
    ? 0
    : cachedMeta != null
      ? Math.max(estimatedMeta, cachedMeta.metaH)
      : estimatedMeta;
  const metaNote = noText
    ? "m=0"
    : cachedMeta != null
      ? "m=max(est,dom)"
      : "m=est";
  const ar = typeof aspect === "number" && aspect > 0 ? aspect : 0;

  if (tileLayout === TILE_LAYOUT_TEXT_LEFT) {
    const mediaColH = 10 * rem * imageSize * factor;
    if (tile.type === "blank") {
      return {
        cross: mediaColH,
        math: `tl blank 10·rem·img·f=${rx(10)}·${rx(rem)}·${imageSize}·${rx(factor)}=${rx(mediaColH)}`,
      };
    }
    if (tile.type === "asset") {
      if (tile.asset?.kind === "text") {
        const wR = Math.round(W * 100) / 100;
        const stSig = `${stripTileLayoutContentSig(
          tile,
          tileLayout,
          textSize,
          imageSize,
          rem,
        )}\0stx\0${wR}`;
        const cc = stackedTextCrossCache.get(key);
        const textBodyW = Math.min(W, 22 * rem);
        const textFromCache = cc && cc.sig === stSig;
        const textH = textFromCache
          ? cc.crossPx
          : estimateStackedTextCopyBlockHeightPx(
              tile,
              textBodyW,
              rem,
              textSize,
            );
        const v = Math.max(metaH, textH, mediaColH);
        const tSrc = textFromCache ? "T(cache)" : "T(est)";
        return {
          cross: v,
          math: `tl max(m,${tSrc},10rem·img·f)=max(${rx(metaH)},${rx(textH)},${rx(mediaColH)})=${rx(v)} (${metaNote})`,
        };
      }
      const v = Math.max(metaH, mediaColH);
      return {
        cross: v,
        math: `tl max(m,10rem·img·f)=max(${rx(metaH)},${rx(mediaColH)})=${rx(v)} (${metaNote})`,
      };
    }
    return { cross: crossFallback, math: `tl fb ${rx(crossFallback)}` };
  }

  if (tile.type === "blank") {
    const v = stackedBlankMediaHeightPx(W, rem);
    const eight = 8 * rem;
    const threeFour = (3 * Math.max(W, 1)) / 4;
    return {
      cross: v,
      math: `stack blank max(8rem,3W/4)=max(${rx(eight)},${rx(threeFour)})=${rx(v)}`,
    };
  }
  if (tile.type !== "asset") {
    return { cross: crossFallback, math: `fb ${rx(crossFallback)}` };
  }

  if (tile.asset?.kind === "text") {
    const wR = Math.round(W * 100) / 100;
    const stSig = `${stripTileLayoutContentSig(
      tile,
      tileLayout,
      textSize,
      imageSize,
      rem,
    )}\0stx\0${wR}`;
    const cc = stackedTextCrossCache.get(key);
    const bodyFromCache = cc && cc.sig === stSig;
    const bodyH = bodyFromCache
      ? cc.crossPx
      : estimateStackedTextCopyBlockHeightPx(tile, W, rem, textSize);
    const v = metaH + gap + bodyH;
    const bSrc = bodyFromCache ? "body(cache)" : "body(est)";
    return {
      cross: v,
      math: `stack m+g+${bSrc}=${rx(metaH)}+${rx(gap)}+${rx(bodyH)}=${rx(v)} (${metaNote})`,
    };
  }
  if (ar > 0) {
    const v = metaH + gap + W / ar;
    return {
      cross: v,
      math: `stack m+g+W÷ar=${rx(metaH)}+${rx(gap)}+${rx(W)}÷${rx(ar)}=${rx(v)} (${metaNote})`,
    };
  }
  const ph = stackedBlankMediaHeightPx(W, rem);
  const v = metaH + gap + ph;
  return {
    cross: v,
    math: `stack no-ar m+g+ph=${rx(metaH)}+${rx(gap)}+${rx(ph)}=${rx(v)} (${metaNote})`,
  };
}

/**
 * Strip cross size (row height contribution) at laid-out width `W` — pure math + bump-pass caches.
 * @param {object} p
 */
function estimateStripTileCrossPx(p) {
  return computeStripTileCrossWithMath(p).cross;
}

/**
 * Recompute row `y` / cross sizes: for each flex line (row), row height = max tile cross-size at that
 * tile’s laid-out `rects[key].width` (same membership + widths as `computeFlexLayout`).
 *
 * @param {string[][]} lineKeyGroups
 * @param {Record<string, { x: number, y: number, width: number, height: number }>} rects
 * @param {Map<string, string>|null|undefined} alignSelfByKey
 * @param {string} containerAlignItems
 * @param {number} rowGapPx
 * @param {Map<string, unknown>} tileByKey
 * @param {string} tileLayout
 * @param {number} textSize
 * @param {number} imageSize
 * @param {number} rem
 * @param {Map<string, number>} factorByKey
 * @param {Map<string, number>} crossIntrinsicByKey bump-pass intrinsic per key
 * @param {Map<string, number>} mediaAspectByKey
 * @param {Map<string, { sig: string, crossPx: number }>} stackedTextCrossCache stacked: text **body** height only
 * @param {Map<string, StripTileMetaMetrics>} metaMetricsByKey
 */
function reflowStripRowsMathHeights(
  lineKeyGroups,
  rects,
  alignSelfByKey,
  containerAlignItems,
  rowGapPx,
  tileByKey,
  tileLayout,
  textSize,
  imageSize,
  rem,
  factorByKey,
  crossIntrinsicByKey,
  mediaAspectByKey,
  stackedTextCrossCache,
  metaMetricsByKey,
) {
  /** @type {Map<string, number>} */
  const heightByKey = new Map();

  for (const line of lineKeyGroups) {
    for (const key of line) {
      const r = rects[key];
      const tile = tileByKey.get(key);
      if (!r || !tile) continue;
      const W = r.width;
      const factor = factorByKey.get(key) ?? 1;
      const aspect = mediaAspectByKey.get(key) ?? 0;
      const crossFb = crossIntrinsicByKey.get(key) ?? 120;
      const h = estimateStripTileCrossPx({
        tile,
        key,
        W,
        tileLayout,
        textSize,
        imageSize,
        rem,
        factor,
        aspect,
        crossFallback: crossFb,
        stackedTextCrossCache,
        metaMetricsByKey,
      });
      heightByKey.set(key, Math.max(0, h));
    }
  }

  let yCursor = 0;
  for (const line of lineKeyGroups) {
    /** @type {{ key: string, h: number, stretch: boolean }[]} */
    const row = [];
    let lineMax = 0;

    for (const key of line) {
      const r = rects[key];
      if (!r) continue;
      const stretch = shouldStretchCrossAxis(
        key,
        alignSelfByKey,
        containerAlignItems,
      );
      const h = heightByKey.get(key) ?? 0;
      lineMax = Math.max(lineMax, h);
      row.push({ key, h, stretch });
    }

    for (const { key, h, stretch } of row) {
      const r = rects[key];
      const raw = alignSelfByKey?.get(key);
      const self =
        raw != null && raw !== "" && raw !== "auto" ? raw : containerAlignItems;

      let yOff = 0;
      if (self === ALIGN_END) {
        yOff = lineMax - h;
      } else if (self === ALIGN_CENTER) {
        yOff = (lineMax - h) / 2;
      }

      r.y = yCursor + yOff;
      if (stretch) {
        r.height = lineMax;
      } else {
        r.height = h;
      }
    }

    if (line.length > 0) {
      yCursor += lineMax + rowGapPx;
    }
  }
}

/**
 * @param {Map<string, unknown>} tileByKey
 * @param {string} key
 */
function stripRowDebugTallestLabel(tileByKey, key) {
  const tile = tileByKey.get(key);
  if (!tile) return "";
  if (tile.type === "blank") return "Blank";
  if (tile.type === "asset") {
    const p = tile.project;
    const raw = p?.title;
    if (raw != null && String(raw).trim() !== "") return String(raw).trim();
    return "Untitled";
  }
  return "";
}

/**
 * @typedef {{
 *   tileLayout: string,
 *   textSize: number,
 *   imageSize: number,
 *   rem: number,
 *   factorByKey: Map<string, number>,
 *   crossIntrinsicByKey: Map<string, number>,
 *   mediaAspectByKey: Map<string, number>,
 *   stackedTextCrossCache: Map<string, { sig: string, crossPx: number }>,
 *   metaMetricsByKey: Map<string, StripTileMetaMetrics>,
 * }} StripRowCrossMathCtx
 */

/**
 * Bounding box of tiles in one flex line + tallest tile label + same cross math string as layout.
 * @param {string[]} line
 * @param {Record<string, { x: number, y: number, width: number, height: number }>} rects
 * @param {Map<string, unknown>} tileByKey
 * @param {StripRowCrossMathCtx} crossCtx
 * @returns {{ x: number, y: number, width: number, height: number, tallestLabel: string, tallestMath: string } | null}
 */
function stripRowDebugBandFromLine(line, rects, tileByKey, crossCtx) {
  let minY = Infinity;
  let maxB = -Infinity;
  let minX = Infinity;
  let maxR = -Infinity;
  let tallestKey = "";
  let tallestH = -1;
  for (const key of line) {
    const r = rects[key];
    if (!r) continue;
    minY = Math.min(minY, r.y);
    maxB = Math.max(maxB, r.y + r.height);
    minX = Math.min(minX, r.x);
    maxR = Math.max(maxR, r.x + r.width);
    if (r.height > tallestH) {
      tallestH = r.height;
      tallestKey = key;
    }
  }
  if (!(minY < Infinity) || !tallestKey) return null;

  const tr = rects[tallestKey];
  const tTile = tileByKey.get(tallestKey);
  let tallestMath = "";
  if (tr && tTile) {
    const W = tr.width;
    const factor = crossCtx.factorByKey.get(tallestKey) ?? 1;
    const aspect = crossCtx.mediaAspectByKey.get(tallestKey) ?? 0;
    const crossFb = crossCtx.crossIntrinsicByKey.get(tallestKey) ?? 120;
    tallestMath = computeStripTileCrossWithMath({
      tile: tTile,
      key: tallestKey,
      W,
      tileLayout: crossCtx.tileLayout,
      textSize: crossCtx.textSize,
      imageSize: crossCtx.imageSize,
      rem: crossCtx.rem,
      factor,
      aspect,
      crossFallback: crossFb,
      stackedTextCrossCache: crossCtx.stackedTextCrossCache,
      metaMetricsByKey: crossCtx.metaMetricsByKey,
    }).math;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxR - minX),
    height: Math.max(0, maxB - minY),
    tallestLabel: stripRowDebugTallestLabel(tileByKey, tallestKey),
    tallestMath,
  };
}

/**
 * @param {Object} params
 * @param {import("react").RefObject<HTMLElement|null>} params.stripRef
 * @param {Array<{ type: string, blankId?: string, project?: unknown, asset?: unknown, exiting?: boolean }>} params.tiles
 * @param {(t: typeof params.tiles[0]) => string} params.tileKeyFn
 * @param {number} params.imageSize
 * @param {number} params.textSize
 * @param {string} params.tileLayout
 * @param {string} params.sizeMode
 * @param {import("./functionality").TileSizeResolver} params.tileSizeApi
 * @param {string} params.layoutMode strip cross-axis (`align-items`) except flex random uses per-tile map
 * @param {Map<string, string>|null} params.alignSelfByKey layout-random align-self
 * @param {(blankId: string) => void} [params.onExitingBlankDone]
 * @param {import("react").MutableRefObject<{ imageSize: number, textSize: number }>|null} [params.stripPanelLiveRef] Live panel multipliers (image/text size); authoritative for strip math when dragging.
 * @param {import("react").MutableRefObject<boolean>|null} [params.suppressChildStripResizeObserversRef] When true, skip per-tile ResizeObservers (e.g. main image slider grab).
 * @param {boolean} [params.stripRowHeightDebug] When true, report row bounding boxes after each layout pass.
 * @param {(bands: Array<{ x: number, y: number, width: number, height: number, tallestLabel: string, tallestMath: string }> | null) => void} [params.onStripRowDebugBands] Target-layout row bands (`null` when overlay off).
 * @param {(aspectByKey: Record<string, number | null> | null) => void} [params.onStripDebugAspects] Natural width÷height per tile key from strip aspect map (`null` when overlay off).
 */
export function useJsFlexStrip({
  stripRef,
  tiles: stripTiles,
  tileKeyFn,
  imageSize,
  textSize,
  tileLayout,
  sizeMode,
  tileSizeApi,
  layoutMode,
  alignSelfByKey,
  onExitingBlankDone,
  stripPanelLiveRef = null,
  suppressChildStripResizeObserversRef = null,
  stripRowHeightDebug = false,
  onStripRowDebugBands = null,
  onStripDebugAspects = null,
}) {
  const elMapRef = useRef(new Map());
  const currentRef = useRef(new Map());
  const rafRef = useRef(0);
  const fillKeyByRowSigRef = useRef(new Map());
  const tileKeySetSigRef = useRef("");
  const lastLayoutRectRef = useRef(new Map());
  const exitNotifiedRef = useRef(new Set());
  const onExitingBlankDoneRef = useRef(onExitingBlankDone);
  /**
   * While a layout rAF lerp is running, each tile’s `li` and media are resized every frame. That
   * triggers per-tile ResizeObserver → setMeasureTick → this effect re-runs, cancels the pending
   * lerp, and redoes the full O(n) pass—felt as jank and “infinite” animation, worse with more
   * blank tiles (both w+h lerp for layoutBlank). We ignore bumps while lerping, then one tick.
   */
  const inRafLerpRef = useRef(false);
  const deferredMeasureTickFromResizeRef = useRef(false);
  const lastLerpFrameTimeRef = useRef(0);
  /** @type {import("react").MutableRefObject<Map<string, number>>} intrinsic width/height ratio per strip tile key */
  const mediaAspectByKeyRef = useRef(new Map());
  const aspectMeasureRafRef = useRef(0);
  /**
   * Stacked text tiles: `crossPx` is copy-block height only; `estimateStripTileCrossPx` adds meta + gap.
   * @type {import("react").MutableRefObject<Map<string, { sig: string, crossPx: number }>>}
   */
  const stackedTextCrossCacheRef = useRef(new Map());
  /** @type {import("react").MutableRefObject<Map<string, StripTileMetaMetrics>>} */
  const stripTileMetaMetricsRef = useRef(new Map());
  const factorResetRef = useRef({
    image: NaN,
    textSize: NaN,
    tileLayout: "",
    sizeMode: "",
    rem: NaN,
    layoutMode: "",
  });

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [measureTick, setMeasureTick] = useState(0);
  /** Avoid rewriting `minHeight` when unchanged (reduces style churn). */
  const lastStripMinHeightPxRef = useRef(-1);

  /** @type {import("react").MutableRefObject<Map<string, import("./stripSketchModel.js").StripSketchTile>>} */
  const stripSketchByKeyRef = useRef(new Map());
  const stripLayoutPassRef = useRef(() => {});
  const panelLayoutRafRef = useRef(0);

  const scheduleStripLayout = useCallback(() => {
    if (panelLayoutRafRef.current !== 0) return;
    panelLayoutRafRef.current = requestAnimationFrame(() => {
      panelLayoutRafRef.current = 0;
      stripLayoutPassRef.current();
    });
  }, []);

  const scheduleMeasureTickAfterDomReport = useCallback(() => {
    if (inRafLerpRef.current) {
      deferredMeasureTickFromResizeRef.current = true;
      return;
    }
    cancelAnimationFrame(aspectMeasureRafRef.current);
    aspectMeasureRafRef.current = requestAnimationFrame(() => {
      aspectMeasureRafRef.current = 0;
      setMeasureTick((x) => x + 1);
    });
  }, []);

  /** Order of strip positions changes when blanks are re-interleaved; observer + keyset sync need only the set of keys, not the order. */
  const tileKeySetSig = useMemo(
    () =>
      JSON.stringify(
        [...new Set(stripTiles.map((t) => tileKeyFn(t)))].sort(),
      ),
    [stripTiles, tileKeyFn],
  );

  const layoutTiles = useMemo(
    () => stripTiles.filter((t) => !(t.type === "blank" && t.exiting)),
    [stripTiles],
  );

  useEffect(() => {
    onExitingBlankDoneRef.current = onExitingBlankDone;
  }, [onExitingBlankDone]);

  const onStripRowDebugBandsRef = useRef(onStripRowDebugBands);
  useEffect(() => {
    onStripRowDebugBandsRef.current = onStripRowDebugBands;
  }, [onStripRowDebugBands]);

  const onStripDebugAspectsRef = useRef(onStripDebugAspects);
  useEffect(() => {
    onStripDebugAspectsRef.current = onStripDebugAspects;
  }, [onStripDebugAspects]);

  useEffect(
    () => () => {
      cancelAnimationFrame(aspectMeasureRafRef.current);
      cancelAnimationFrame(panelLayoutRafRef.current);
    },
    [],
  );

  const registerEl = useCallback((key, el) => {
    const m = elMapRef.current;
    if (el) m.set(key, el);
    else {
      m.delete(key);
      /* Keep `mediaAspectByKeyRef` on ref-callback `null` (new inline fn each parent render, Strict
       * Mode remounts). Otherwise intrinsic ratio is wiped after first decode and never re-reported. */
      stripTileMetaMetricsRef.current.delete(key);
      stackedTextCrossCacheRef.current.delete(key);
      stripSketchByKeyRef.current.delete(key);
    }
  }, []);

  /**
   * Report natural media aspect (width ÷ height) once decoded, or `null` to clear.
   * Triggers a single coalesced layout pass (no per-frame DOM reads for bump `minDim` when stacked).
   */
  const registerStripMediaAspect = useCallback((key, aspectWOverH) => {
    const map = mediaAspectByKeyRef.current;
    const next =
      typeof aspectWOverH === "number" &&
      aspectWOverH > 0 &&
      Number.isFinite(aspectWOverH)
        ? aspectWOverH
        : null;

    let changed = false;
    if (next == null) {
      if (!map.has(key)) return;
      map.delete(key);
      changed = true;
    } else if (map.get(key) === next) {
      return;
    } else {
      map.set(key, next);
      changed = true;
    }
    if (!changed) return;

    scheduleMeasureTickAfterDomReport();
  }, [scheduleMeasureTickAfterDomReport]);

  /**
   * Report measured `.asset-tile__meta` size + computed tile `gap` (see `AssetTile`), or `null` to clear.
   */
  const registerStripTileMetaLayout = useCallback(
    (key, payload) => {
      const map = stripTileMetaMetricsRef.current;
      if (payload == null) {
        if (!map.has(key)) return;
        map.delete(key);
        scheduleMeasureTickAfterDomReport();
        return;
      }
      const prev = map.get(key);
      if (
        prev &&
        Math.abs(prev.metaW - payload.metaW) < 0.5 &&
        Math.abs(prev.metaH - payload.metaH) < 0.5 &&
        Math.abs(prev.gapPx - payload.gapPx) < 0.25 &&
        Math.abs(prev.anchorW - payload.anchorW) < 0.5
      ) {
        return;
      }
      map.set(key, payload);
      scheduleMeasureTickAfterDomReport();
    },
    [scheduleMeasureTickAfterDomReport],
  );

  const rowFillMode = sizeMode === SIZE_MODE_RANDOM_TIERS_ROW_FILL;

  useLayoutEffect(() => {
    const root = stripRef.current;
    if (!root) return undefined;
    /**
     * Row strip layout only depends on **width**. We set `minHeight` on this same node after each
     * pass; height-only ResizeObserver notifications would re-trigger `setContainerSize` → full
     * layout again and show as forced reflow chains in DevTools.
     */
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = cr.width;
      setContainerSize((prev) => {
        if (Math.abs(prev.w - w) < 0.5) return prev;
        return { w, h: prev.h };
      });
    });
    ro.observe(root);
    setContainerSize({
      w: root.clientWidth,
      h: root.clientHeight,
    });
    return () => ro.disconnect();
  }, [stripRef]);

  useLayoutEffect(() => {
    if (suppressChildStripResizeObserversRef?.current) {
      return undefined;
    }
    let scheduled = false;
    const bump = () => {
      if (inRafLerpRef.current) {
        deferredMeasureTickFromResizeRef.current = true;
        return;
      }
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        setMeasureTick((x) => x + 1);
      });
    };
    const observers = [];
    for (const t of stripTiles) {
      const key = tileKeyFn(t);
      const el = elMapRef.current.get(key);
      if (!el) continue;
      const ro = new ResizeObserver(bump);
      ro.observe(el);
      if (t.type !== "blank") {
        const mediaEl = el.querySelector(".asset-tile__media");
        if (mediaEl) ro.observe(mediaEl);
      }
      observers.push(ro);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [tileKeySetSig, tileKeyFn]);

  useLayoutEffect(() => {
    stripLayoutPassRef.current = () => {
    const root = stripRef.current;
    if (!root || containerSize.w < 1) {
      if (stripRowHeightDebug) {
        onStripRowDebugBandsRef.current?.(null);
        onStripDebugAspectsRef.current?.(null);
      }
      return;
    }

    const panelLive = stripPanelLiveRef?.current;
    const effImageSize =
      typeof panelLive?.imageSize === "number" ? panelLive.imageSize : imageSize;
    const effTextSize =
      typeof panelLive?.textSize === "number" ? panelLive.textSize : textSize;
    /** Must track React `tileLayout` (from committed `imageSize`), not live ref `effImageSize`, or strip math can run text-left measures while DOM is still stacked (`width:auto` on tiles → ~100vw intrinsic). */
    const effTileLayout = tileLayout;
    const appRootEl = root.closest(".app-root");
    if (appRootEl instanceof HTMLElement) {
      appRootEl.style.setProperty("--panel-image-size", String(effImageSize));
      appRootEl.style.setProperty("--panel-text-size", String(effTextSize));
    }

    const rem =
      parseFloat(
        getComputedStyle(document.documentElement).fontSize || "16",
      ) || 16;

    const r = factorResetRef.current;
    const layoutInputsChanged =
      r.tileLayout !== effTileLayout
      || r.sizeMode !== sizeMode
      || r.rem !== rem
      || r.layoutMode !== layoutMode
      || r.textSize !== effTextSize;
    if (r.image !== effImageSize || layoutInputsChanged) {
      tileSizeApi.resetLayoutExtraSteps();
      r.image = effImageSize;
    }
    if (layoutInputsChanged) {
      stackedTextCrossCacheRef.current.clear();
      stripTileMetaMetricsRef.current.clear();
      r.tileLayout = effTileLayout;
      r.sizeMode = sizeMode;
      r.rem = rem;
      r.layoutMode = layoutMode;
      r.textSize = effTextSize;
    }

    const containerAlignItems = stripAlignItemsFromLayoutMode(layoutMode);
    const colGapRem =
      effTileLayout === TILE_LAYOUT_TEXT_LEFT
        ? MAX_GAP_REM_MAIN_TEXT_LEFT
        : MAX_GAP_REM_MAIN;
    const columnGap = rem * colGapRem;
    const rowGap = rem * MAX_GAP_REM_CROSS;

    const textTileMin = 30 * 0.75 * rem * effTextSize;

    const isRow =
      STRIP_CONTAINER_FLEX.flexDirection === FLEX_ROW ||
      STRIP_CONTAINER_FLEX.flexDirection === FLEX_ROW_REVERSE;

    if (tileKeySetSigRef.current !== tileKeySetSig) {
      const nextKeys = new Set(stripTiles.map(tileKeyFn));
      for (const k of currentRef.current.keys()) {
        if (!nextKeys.has(k)) currentRef.current.delete(k);
      }
      for (const k of exitNotifiedRef.current) {
        if (!nextKeys.has(k)) exitNotifiedRef.current.delete(k);
      }
      for (const k of mediaAspectByKeyRef.current.keys()) {
        if (!nextKeys.has(k)) mediaAspectByKeyRef.current.delete(k);
      }
      for (const k of stackedTextCrossCacheRef.current.keys()) {
        if (!nextKeys.has(k)) stackedTextCrossCacheRef.current.delete(k);
      }
      for (const k of stripSketchByKeyRef.current.keys()) {
        if (!nextKeys.has(k)) stripSketchByKeyRef.current.delete(k);
      }
      tileKeySetSigRef.current = tileKeySetSig;
    }

    const blankLayoutKeySet = new Set(
      layoutTiles.filter((t) => t.type === "blank").map(tileKeyFn),
    );
    const exitingBlankKeySet = new Set(
      stripTiles
        .filter((t) => t.type === "blank" && t.exiting)
        .map(tileKeyFn),
    );

    /** @type {Set<string>} */
    const textLeftKeySet = new Set();
    if (effTileLayout === TILE_LAYOUT_TEXT_LEFT) {
      for (const t of layoutTiles) {
        if (t.type === "asset" || t.type === "blank") {
          textLeftKeySet.add(tileKeyFn(t));
        }
      }
    }

    const tileByKey = new Map();
    for (const t0 of stripTiles) {
      tileByKey.set(tileKeyFn(t0), t0);
    }

    reconcileStripSketchTiles(
      stripSketchByKeyRef.current,
      layoutTiles,
      tileKeyFn,
    );
    applyAspectsToStripSketch(
      stripSketchByKeyRef.current,
      mediaAspectByKeyRef.current,
    );

    /** @type {import("./jsFlexLayout.js").FlexItemInput[]} */
    const baseItems = [];

    for (let docIdx = 0; docIdx < layoutTiles.length; docIdx += 1) {
      const tile = layoutTiles[docIdx];
      const key = tileKeyFn(tile);
      const el = elMapRef.current.get(key);
      const canBump = tileUsesSizeModeForStripBumps(tile, el, effTileLayout);
      const bumpBasisRem = stripTileBumpBasisRem(tile, effTileLayout);

      let flexBasisMain = 0;
      let minMain = 0;
      let maxMain = 1e9;
      let flexShrink = 1;
      let crossIntrinsic = 120;

      for (let bumpPass = 0; bumpPass < 8; bumpPass += 1) {
        const factor = tileSizeApi.getEffectiveFactor(
          sizeMode,
          key,
          rem,
          effImageSize,
          bumpBasisRem,
        );
        if (el) {
          syncStripItemTileSizeFactor(el, factor);
        }

        if (tile.type === "blank" && effTileLayout !== TILE_LAYOUT_TEXT_LEFT) {
          flexBasisMain = 16 * rem * effImageSize * factor;
          maxMain = 26 * rem * effImageSize * factor;
        } else if (effTileLayout === TILE_LAYOUT_TEXT_LEFT) {
          // Text-left: fit-content row width = meta + gap + media (media height from CSS formula).
          const cap = containerSize.w;
          maxMain = cap;
          const aspectNow = mediaAspectByKeyRef.current.get(key) ?? 0;
          flexBasisMain = computeTextLeftMainPx(
            tile,
            key,
            rem,
            effImageSize,
            effTextSize,
            factor,
            aspectNow,
            stripTileMetaMetricsRef.current,
            cap,
          );
          // Match prior CSS behavior for text-left tiles (`flex: 0 0 auto`):
          // keep intrinsic measured width and do not shrink below it.
          minMain = flexBasisMain;
          flexShrink = 0;
        } else if (tile.asset?.kind === "text") {
          const w = Math.min(textTileMin, containerSize.w);
          flexBasisMain = w;
          minMain = Math.min(w, containerSize.w);
          maxMain = w;
        } else {
          flexBasisMain = 16 * rem * effImageSize * factor;
          maxMain = 26 * rem * effImageSize * factor;
        }

        const wProbe = Math.min(maxMain, Math.max(minMain, flexBasisMain));
        const aspectNow = mediaAspectByKeyRef.current.get(key) ?? 0;
        crossIntrinsic = estimateStripTileCrossPx({
          tile,
          key,
          W: wProbe,
          tileLayout: effTileLayout,
          textSize: effTextSize,
          imageSize: effImageSize,
          rem,
          factor,
          aspect: aspectNow,
          crossFallback: 120,
          stackedTextCrossCache: stackedTextCrossCacheRef.current,
          metaMetricsByKey: stripTileMetaMetricsRef.current,
        });
        if (
          effTileLayout !== TILE_LAYOUT_TEXT_LEFT &&
          tile.type === "asset" &&
          tile.asset?.kind === "text"
        ) {
          const wR = Math.round(wProbe * 100) / 100;
          const stSig = `${stripTileLayoutContentSig(
            tile,
            effTileLayout,
            effTextSize,
            effImageSize,
            rem,
          )}\0stx\0${wR}`;
          stackedTextCrossCacheRef.current.set(key, {
            sig: stSig,
            crossPx: estimateStackedTextCopyBlockHeightPx(
              tile,
              wProbe,
              rem,
              effTextSize,
            ),
          });
        }

        if (!canBump) break;
        if (!el) break;
        const mediaEl = el.querySelector(".asset-tile__media");
        const wUsed = Math.min(maxMain, Math.max(minMain, flexBasisMain));
        let minDim = 0;
        const cachedAspect = mediaAspectByKeyRef.current.get(key);
        if (effTileLayout !== TILE_LAYOUT_TEXT_LEFT && cachedAspect > 0) {
          minDim = stackedMediaMinShortSideFromWidth(wUsed, cachedAspect);
        }
        if (!(minDim > 0) && mediaEl) {
          const mw = mediaEl.offsetWidth;
          const mh = mediaEl.offsetHeight;
          if (mw > 0 && mh > 0) {
            minDim = Math.min(mw, mh);
          }
        }
        if (minDim === 0) {
          minDim = Math.min(wUsed, crossIntrinsic);
        }
        if (minDim >= MIN_STRIP_TILE_PX) break;
        if (
          !tileSizeApi.bumpFactorUpOneStep(
            sizeMode,
            key,
            rem,
            effImageSize,
            bumpBasisRem,
          )
        ) {
          break;
        }
      }

      const alignSelfRaw = alignSelfByKey?.get(key);
      const alignSelf =
        alignSelfRaw && alignSelfRaw !== "auto" ? alignSelfRaw : undefined;

      baseItems.push({
        key,
        order: 0,
        flexGrow: 0,
        flexShrink,
        flexBasisMain,
        minMain,
        maxMain,
        minCross: 0,
        maxCross: 1e9,
        crossSizeIntrinsic: crossIntrinsic,
        alignSelf,
      });
    }

    const factorByKey = new Map();
    const crossIntrinsicByKey = new Map();
    for (const it of baseItems) {
      crossIntrinsicByKey.set(it.key, it.crossSizeIntrinsic);
    }
    for (const t of layoutTiles) {
      const k = tileKeyFn(t);
      const f = tileSizeApi.getEffectiveFactor(
        sizeMode,
        k,
        rem,
        effImageSize,
        stripTileBumpBasisRem(t, effTileLayout),
      );
      factorByKey.set(k, f);
      const li = elMapRef.current.get(k);
      if (li) {
        syncStripItemTileSizeFactor(li, f);
      }
    }

    const innerMain = isRow
      ? Math.max(containerSize.w, 1)
      : Math.max(containerSize.h, 320);
    const innerHeightForLayout = isRow ? 1e9 : innerMain;

    const stripFlexContainer = {
      width: Math.max(containerSize.w, 1),
      height: innerHeightForLayout,
      flexDirection: STRIP_CONTAINER_FLEX.flexDirection,
      flexWrap: STRIP_CONTAINER_FLEX.flexWrap,
      justifyContent: STRIP_CONTAINER_FLEX.justifyContent,
      alignItems: containerAlignItems,
      alignContent: STRIP_CONTAINER_FLEX.alignContent,
      rowGap,
      columnGap,
    };

    const lineKeyGroups = flexLineKeyGroupsFromItems(
      baseItems,
      stripFlexContainer,
    );

    let rowFillSet = new Set();
    if (rowFillMode) {
      rowFillSet = rowFillKeysForLines(
        lineKeyGroups,
        textLeftKeySet,
        fillKeyByRowSigRef.current,
      );
    }

    for (const it of baseItems) {
      it.flexGrow = rowFillSet.has(it.key) ? 1 : 0;
    }

    const { rects, lineKeyGroups: lineKeyGroupsFromLayout } =
      computeFlexLayout(baseItems, stripFlexContainer);

    if (isRow) {
      reflowStripRowsMathHeights(
        lineKeyGroupsFromLayout,
        rects,
        alignSelfByKey,
        containerAlignItems,
        rowGap,
        tileByKey,
        effTileLayout,
        effTextSize,
        effImageSize,
        rem,
        factorByKey,
        crossIntrinsicByKey,
        mediaAspectByKeyRef.current,
        stackedTextCrossCacheRef.current,
        stripTileMetaMetricsRef.current,
      );

      if (!stripRowHeightDebug) {
        onStripRowDebugBandsRef.current?.(null);
        onStripDebugAspectsRef.current?.(null);
      } else {
        const reportRows = onStripRowDebugBandsRef.current;
        if (typeof reportRows === "function") {
          /** @type {{ x: number, y: number, width: number, height: number, tallestLabel: string, tallestMath: string }[]} */
          const bands = [];
          /** @type {StripRowCrossMathCtx} */
          const crossMathCtx = {
            tileLayout: effTileLayout,
            textSize: effTextSize,
            imageSize: effImageSize,
            rem,
            factorByKey,
            crossIntrinsicByKey,
            mediaAspectByKey: mediaAspectByKeyRef.current,
            stackedTextCrossCache: stackedTextCrossCacheRef.current,
            metaMetricsByKey: stripTileMetaMetricsRef.current,
          };
          for (const line of lineKeyGroupsFromLayout) {
            if (line.length === 0) continue;
            const b = stripRowDebugBandFromLine(line, rects, tileByKey, crossMathCtx);
            if (b) bands.push(b);
          }
          reportRows(bands);
        }

        const reportAsp = onStripDebugAspectsRef.current;
        if (typeof reportAsp === "function") {
          /** @type {Record<string, number | null>} */
          const aspectByKey = {};
          for (const t of layoutTiles) {
            const k = tileKeyFn(t);
            const v = mediaAspectByKeyRef.current.get(k);
            aspectByKey[k] =
              typeof v === "number" && v > 0 && Number.isFinite(v) ? v : null;
          }
          reportAsp(aspectByKey);
        }
      }
    } else {
      onStripRowDebugBandsRef.current?.(null);
      onStripDebugAspectsRef.current?.(null);
    }

    applyTargetsToStripSketch(stripSketchByKeyRef.current, rects);

    for (const k of Object.keys(rects)) {
      const r = rects[k];
      lastLayoutRectRef.current.set(k, { x: r.x, y: r.y, width: r.width, height: r.height });
    }

    for (const t of stripTiles) {
      if (t.type !== "blank" || !t.exiting) continue;
      const k = tileKeyFn(t);
      if (rects[k] != null) continue;
      const lr = lastLayoutRectRef.current.get(k);
      if (lr) {
        rects[k] = { x: lr.x, y: lr.y, width: 0, height: 0 };
      }
    }

    const bottoms = Object.values(rects).map((r) => r.y + r.height);
    const bottomExtent = bottoms.length > 0 ? Math.max(0, ...bottoms) : 0;
    const minHPx = Math.max(0, Math.round(bottomExtent));
    if (lastStripMinHeightPxRef.current !== minHPx) {
      lastStripMinHeightPxRef.current = minHPx;
      root.style.minHeight = `${minHPx}px`;
    }

    cancelAnimationFrame(rafRef.current);
    lastLerpFrameTimeRef.current = 0;
    inRafLerpRef.current = true;
    const tick = (time) => {
      const now = time ?? performance.now();
      if (lastLerpFrameTimeRef.current > 0) {
        if (now - lastLerpFrameTimeRef.current < STRIP_ANIMATION_MIN_FRAME_MS) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }
      lastLerpFrameTimeRef.current = now;
      const lp = stripPanelLiveRef?.current;
      const tickImg =
        typeof lp?.imageSize === "number" ? lp.imageSize : imageSize;
      const tickLay = tileLayout;
      let busy = false;
      const containerAlign = containerAlignItems;
      for (const key of Object.keys(rects)) {
        const t = rects[key];
        let c = currentRef.current.get(key);
        const stretch = shouldStretchCrossAxis(key, alignSelfByKey, containerAlign);
        const lockWidth = textLeftKeySet.has(key);
        const exitingBlank = exitingBlankKeySet.has(key);
        const layoutBlank = blankLayoutKeySet.has(key) && !exitingBlank;

        if (!c) {
          if (layoutBlank) {
            c = { x: t.x, y: t.y, width: 0, height: 0 };
          } else {
            c = { ...t };
          }
          currentRef.current.set(key, c);
        }

        let nx;
        let ny;
        let nw;
        let nh;

        if (layoutBlank) {
          // Empty placeholder: no visible benefit from easing; skip lerp to avoid extra frames + RO.
          nx = t.x;
          ny = t.y;
          nw = t.width;
          nh = t.height;
        } else {
          nx = lerp(c.x, t.x, LERP);
          ny = lerp(c.y, t.y, LERP);
          if (exitingBlank) {
            nw = lerp(c.width, t.width, LERP);
            nh = lerp(c.height, t.height, LERP);
          } else {
            nw = lockWidth ? t.width : lerp(c.width, t.width, LERP);
            nh = stretch ? lerp(c.height, t.height, LERP) : t.height;
          }
        }

        const nearX = Math.abs(nx - t.x) < SNAP;
        const nearY = Math.abs(ny - t.y) < SNAP;
        const nearW =
          layoutBlank
            ? true
            : exitingBlank
              ? Math.abs(nw - t.width) < SNAP
              : lockWidth || Math.abs(nw - t.width) < SNAP;
        const nearH = layoutBlank
          ? true
          : exitingBlank
            ? Math.abs(nh - t.height) < SNAP
            : !stretch || Math.abs(nh - t.height) < SNAP;
        if (nearX && nearY && nearW && nearH) {
          nx = t.x;
          ny = t.y;
          nw = t.width;
          nh = t.height;
          if (
            exitingBlank &&
            !exitNotifiedRef.current.has(key)
          ) {
            exitNotifiedRef.current.add(key);
            onExitingBlankDoneRef.current?.(key);
          }
        } else {
          busy = true;
        }
        c.x = nx;
        c.y = ny;
        c.width = nw;
        c.height = nh;

        const el = elMapRef.current.get(key);
        if (el) {
          const tTile = tileByKey.get(key);
          syncStripItemTileSizeFactor(
            el,
            tTile
              ? tileSizeApi.getEffectiveFactor(
                sizeMode,
                key,
                rem,
                tickImg,
                stripTileBumpBasisRem(tTile, tickLay),
              )
              : 1,
          );
          el.style.left = `${nx}px`;
          el.style.top = `${ny}px`;
          el.style.width = `${nw}px`;
          if (stretch && !exitingBlank) {
            el.style.height = `${nh}px`;
          } else if (layoutBlank || exitingBlank) {
            el.style.height = `${nh}px`;
          } else {
            el.style.height = "";
          }
        }
      }
      if (busy) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        inRafLerpRef.current = false;
        lastLerpFrameTimeRef.current = 0;
        if (deferredMeasureTickFromResizeRef.current) {
          deferredMeasureTickFromResizeRef.current = false;
          setMeasureTick((x) => x + 1);
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    };

    stripLayoutPassRef.current();

    return () => {
      cancelAnimationFrame(rafRef.current);
      inRafLerpRef.current = false;
      if (deferredMeasureTickFromResizeRef.current) {
        deferredMeasureTickFromResizeRef.current = false;
        queueMicrotask(() => {
          setMeasureTick((x) => x + 1);
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `effImageSize` / `effTextSize` read from `stripPanelLiveRef` during slider drag; `tileLayout` must stay in deps so it cannot drift from DOM via `tileLayoutFromImageSize(effImageSize)`.
  }, [
    stripRef,
    stripTiles,
    tileKeyFn,
    imageSize,
    textSize,
    tileLayout,
    sizeMode,
    tileSizeApi,
    layoutMode,
    alignSelfByKey,
    containerSize,
    measureTick,
    rowFillMode,
    stripRowHeightDebug,
  ]);

  return {
    registerTileEl: registerEl,
    registerStripMediaAspect,
    registerStripTileMetaLayout,
    scheduleStripLayout,
  };
}
