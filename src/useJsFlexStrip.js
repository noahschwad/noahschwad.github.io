import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SIZE_MODE_RANDOM_TIERS_ROW_FILL,
  TILE_LAYOUT_TEXT_LEFT,
} from "./functionality";
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
} from "./jsFlexLayout";

/** Matches legacy `.selected-strip` CSS flex container. */
const STRIP_CONTAINER_FLEX = {
  flexDirection: FLEX_ROW,
  flexWrap: FLEX_WRAP,
  justifyContent: JUSTIFY_FLEX_START,
  alignItems: ALIGN_START,
  alignContent: ALIGN_CONTENT_STRETCH,
};

const LERP = 0.12;
const SNAP = 0.45;

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

/**
 * @param {import("./jsFlexLayout.js").FlexItemInput[]} items in visual order
 * @param {number} innerMain
 * @param {number} mainGap
 * @param {boolean} isWrap
 */
function breakLinesByMain(items, innerMain, mainGap, isWrap) {
  if (!isWrap) return [items.map((it) => it.key)];
  /** @type {string[][]} */
  const lines = [];
  let cur = [];
  let sumMain = 0;
  for (const it of items) {
    const base = Math.min(
      it.maxMain ?? 1e9,
      Math.max(it.minMain ?? 0, it.flexBasisMain),
    );
    const g = cur.length > 0 ? mainGap : 0;
    const nextSum = sumMain + g + base;
    if (cur.length > 0 && nextSum > innerMain + 0.5) {
      lines.push(cur);
      cur = [];
      sumMain = 0;
    }
    cur.push(it.key);
    sumMain += (cur.length > 1 ? mainGap : 0) + base;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Measure text-left tile width as: meta + media + gap.
 * @param {HTMLElement} stripItemEl
 * @param {number} cap
 */
function measureTextLeftMainSize(stripItemEl, cap) {
  const tile = stripItemEl.querySelector(".asset-tile--text-left");
  if (!tile) return Math.min(stripItemEl.offsetWidth || 0, cap);

  const meta = tile.querySelector(".asset-tile__meta");
  const media = tile.querySelector(".asset-tile__media");
  const cs = getComputedStyle(tile);
  const gapPx =
    parseFloat(cs.columnGap || "") || parseFloat(cs.gap || "") || 0;

  const metaW = meta ? meta.getBoundingClientRect().width : 0;
  const mediaW = media ? media.getBoundingClientRect().width : 0;
  const pairGap = meta && media ? gapPx : 0;
  const total = metaW + mediaW + pairGap;
  return Math.min(Math.max(total, 0), cap);
}

/**
 * Recompute row `y` / target heights from real `offsetHeight` at resolved widths.
 * Fixes under-estimated line cross sizes when `height: auto` content is taller than
 * the pre-layout intrinsic measure (e.g. random tier widths changing text wrap).
 *
 * @param {string[][]} lineKeyGroups
 * @param {Record<string, { x: number, y: number, width: number, height: number }>} rects
 * @param {Map<string, string>|null|undefined} alignSelfByKey
 * @param {string} containerAlignItems
 * @param {number} rowGapPx
 */
function reflowStripRowsByActualHeights(
  lineKeyGroups,
  rects,
  alignSelfByKey,
  containerAlignItems,
  rowGapPx,
  elMapRef,
) {
  let yCursor = 0;

  for (const line of lineKeyGroups) {
    /** @type {{ key: string, h: number, stretch: boolean }[]} */
    const row = [];
    let lineMax = 0;

    for (const key of line) {
      const r = rects[key];
      const el = elMapRef.current.get(key);
      if (!r || !el) continue;

      const stretch = shouldStretchCrossAxis(key, alignSelfByKey, containerAlignItems);
      const prevW = el.style.width;
      const prevH = el.style.height;
      const prevBox = el.style.boxSizing;

      el.style.boxSizing = "border-box";
      el.style.width = `${r.width}px`;
      if (stretch) {
        el.style.height = `${r.height}px`;
      } else {
        el.style.height = "";
      }

      const h = el.offsetHeight;
      lineMax = Math.max(lineMax, h);
      row.push({ key, h, stretch });

      el.style.width = prevW;
      el.style.height = prevH;
      el.style.boxSizing = prevBox;
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
 * @param {Object} params
 * @param {import("react").RefObject<HTMLElement|null>} params.stripRef
 * @param {Array<{ type: string, blankId?: string, project?: unknown, asset?: unknown, exiting?: boolean }>} params.tiles
 * @param {(t: typeof params.tiles[0]) => string} params.tileKeyFn
 * @param {number} params.imageSize
 * @param {number} params.textSize
 * @param {string} params.tileLayout
 * @param {string} params.sizeMode
 * @param {(key: string) => number} params.tileSizeFactor
 * @param {Map<string, string>|null} params.alignSelfByKey layout-random align-self
 * @param {(blankId: string) => void} [params.onExitingBlankDone]
 */
export function useJsFlexStrip({
  stripRef,
  tiles: stripTiles,
  tileKeyFn,
  imageSize,
  textSize,
  tileLayout,
  sizeMode,
  tileSizeFactor,
  alignSelfByKey,
  onExitingBlankDone,
}) {
  const elMapRef = useRef(new Map());
  const currentRef = useRef(new Map());
  const rafRef = useRef(0);
  const fillKeyByRowSigRef = useRef(new Map());
  const tileKeysSigRef = useRef("");
  const lastLayoutRectRef = useRef(new Map());
  const exitNotifiedRef = useRef(new Set());
  const onExitingBlankDoneRef = useRef(onExitingBlankDone);

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [measureTick, setMeasureTick] = useState(0);

  const tileKeysSig = stripTiles.map(tileKeyFn).join("|");

  const layoutTiles = useMemo(
    () => stripTiles.filter((t) => !(t.type === "blank" && t.exiting)),
    [stripTiles],
  );

  useEffect(() => {
    onExitingBlankDoneRef.current = onExitingBlankDone;
  }, [onExitingBlankDone]);

  const registerEl = useCallback((key, el) => {
    const m = elMapRef.current;
    if (el) m.set(key, el);
    else m.delete(key);
  }, []);

  const rowFillMode = sizeMode === SIZE_MODE_RANDOM_TIERS_ROW_FILL;

  useLayoutEffect(() => {
    const root = stripRef.current;
    if (!root) return undefined;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setContainerSize({ w: cr.width, h: cr.height });
    });
    ro.observe(root);
    setContainerSize({
      w: root.clientWidth,
      h: root.clientHeight,
    });
    return () => ro.disconnect();
  }, [stripRef]);

  useLayoutEffect(() => {
    let scheduled = false;
    const bump = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        setMeasureTick((x) => x + 1);
      });
    };
    const observers = [];
    const keys = tileKeysSig.length > 0 ? tileKeysSig.split("|") : [];
    for (const key of keys) {
      const el = elMapRef.current.get(key);
      if (!el) continue;
      const ro = new ResizeObserver(bump);
      ro.observe(el);
      const mediaEl = el.querySelector(".asset-tile__media");
      if (mediaEl) ro.observe(mediaEl);
      const metaEl = el.querySelector(".asset-tile__meta");
      if (metaEl) ro.observe(metaEl);
      observers.push(ro);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [tileKeysSig]);

  useLayoutEffect(() => {
    const root = stripRef.current;
    if (!root || containerSize.w < 1) return;

    const rem =
      parseFloat(
        getComputedStyle(document.documentElement).fontSize || "16",
      ) || 16;
    const colGapRem =
      tileLayout === TILE_LAYOUT_TEXT_LEFT
        ? MAX_GAP_REM_MAIN_TEXT_LEFT
        : MAX_GAP_REM_MAIN;
    const columnGap = rem * colGapRem;
    const rowGap = rem * MAX_GAP_REM_CROSS;

    const textTileMin = 30 * 0.75 * rem * textSize;

    const isRow =
      STRIP_CONTAINER_FLEX.flexDirection === FLEX_ROW ||
      STRIP_CONTAINER_FLEX.flexDirection === FLEX_ROW_REVERSE;

    if (tileKeysSigRef.current !== tileKeysSig) {
      const nextKeys = new Set(stripTiles.map(tileKeyFn));
      for (const k of currentRef.current.keys()) {
        if (!nextKeys.has(k)) currentRef.current.delete(k);
      }
      for (const k of exitNotifiedRef.current) {
        if (!nextKeys.has(k)) exitNotifiedRef.current.delete(k);
      }
      tileKeysSigRef.current = tileKeysSig;
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
    if (tileLayout === TILE_LAYOUT_TEXT_LEFT) {
      for (const t of layoutTiles) {
        if (t.type === "asset") textLeftKeySet.add(tileKeyFn(t));
      }
    }

    /** @type {import("./jsFlexLayout.js").FlexItemInput[]} */
    const baseItems = [];

    for (let docIdx = 0; docIdx < layoutTiles.length; docIdx += 1) {
      const tile = layoutTiles[docIdx];
      const key = tileKeyFn(tile);
      const el = elMapRef.current.get(key);
      const factor = tile.type === "blank" ? 1 : tileSizeFactor(key);

      let flexBasisMain;
      let minMain = 0;
      let maxMain = 1e9;
      let flexShrink = 1;

      if (tile.type === "blank") {
        flexBasisMain = 16 * rem * imageSize * factor;
        maxMain = 26 * rem * imageSize * factor;
      } else if (tileLayout === TILE_LAYOUT_TEXT_LEFT) {
        // Text-left historically behaved as fit-content up to full row width.
        // Do not apply the 26rem media cap used by stacked tiles.
        const cap = containerSize.w;
        maxMain = cap;
        if (el) {
          const pw = el.style.width;
          const pm = el.style.maxWidth;
          const pb = el.style.boxSizing;
          el.style.boxSizing = "border-box";
          el.style.maxWidth = "none";
          el.style.width = "auto";
          flexBasisMain = measureTextLeftMainSize(el, cap);
          el.style.width = pw;
          el.style.maxWidth = pm;
          el.style.boxSizing = pb;
        } else {
          flexBasisMain = 16 * rem * imageSize * factor;
        }
        flexBasisMain = Math.min(flexBasisMain, cap);
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
        flexBasisMain = 16 * rem * imageSize * factor;
        maxMain = 26 * rem * imageSize * factor;
      }

      let crossIntrinsic = el?.offsetHeight ?? 120;
      if (el) {
        const prevW = el.style.width;
        const prevMaxW = el.style.maxWidth;
        const prevBox = el.style.boxSizing;
        el.style.height = "";
        el.style.boxSizing = "border-box";
        el.style.maxWidth = `${maxMain}px`;
        el.style.width = `${Math.min(maxMain, Math.max(minMain, flexBasisMain))}px`;
        crossIntrinsic = el.offsetHeight;
        el.style.width = prevW;
        el.style.maxWidth = prevMaxW;
        el.style.boxSizing = prevBox;
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

    const innerMain = isRow
      ? Math.max(containerSize.w, 1)
      : Math.max(containerSize.h, 320);
    const mainGap = isRow ? columnGap : rowGap;
    const isWrap = STRIP_CONTAINER_FLEX.flexWrap !== "nowrap";

    const lineKeyGroups = breakLinesByMain(
      baseItems,
      innerMain,
      mainGap,
      isWrap,
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

    const innerHeightForLayout = isRow ? 1e9 : innerMain;

    const { rects } = computeFlexLayout(baseItems, {
      width: containerSize.w,
      height: innerHeightForLayout,
      flexDirection: STRIP_CONTAINER_FLEX.flexDirection,
      flexWrap: STRIP_CONTAINER_FLEX.flexWrap,
      justifyContent: STRIP_CONTAINER_FLEX.justifyContent,
      alignItems: STRIP_CONTAINER_FLEX.alignItems,
      alignContent: STRIP_CONTAINER_FLEX.alignContent,
      rowGap,
      columnGap,
    });

    if (isRow) {
      reflowStripRowsByActualHeights(
        lineKeyGroups,
        rects,
        alignSelfByKey,
        STRIP_CONTAINER_FLEX.alignItems,
        rowGap,
        elMapRef,
      );
    }

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
    root.style.minHeight = `${Math.max(bottomExtent, 0)}px`;

    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      let busy = false;
      const containerAlign = STRIP_CONTAINER_FLEX.alignItems;
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

        let nx = lerp(c.x, t.x, LERP);
        let ny = lerp(c.y, t.y, LERP);
        let nw;
        let nh;

        if (exitingBlank) {
          nw = lerp(c.width, t.width, LERP);
          nh = lerp(c.height, t.height, LERP);
        } else if (layoutBlank) {
          nw = lerp(c.width, t.width, LERP);
          nh = stretch ? lerp(c.height, t.height, LERP) : lerp(c.height, t.height, LERP);
        } else {
          nw = lockWidth ? t.width : lerp(c.width, t.width, LERP);
          nh = stretch ? lerp(c.height, t.height, LERP) : t.height;
        }

        const nearX = Math.abs(nx - t.x) < SNAP;
        const nearY = Math.abs(ny - t.y) < SNAP;
        const nearW =
          exitingBlank || layoutBlank
            ? Math.abs(nw - t.width) < SNAP
            : lockWidth || Math.abs(nw - t.width) < SNAP;
        const nearH = exitingBlank || layoutBlank
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
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [
    stripRef,
    stripTiles,
    tileKeyFn,
    imageSize,
    textSize,
    tileLayout,
    sizeMode,
    tileSizeFactor,
    alignSelfByKey,
    containerSize,
    measureTick,
    rowFillMode,
  ]);

  return { registerTileEl: registerEl };
}
