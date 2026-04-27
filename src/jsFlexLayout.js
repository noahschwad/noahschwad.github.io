/**
 * Flexbox-style layout: main/cross logical space → x/y/width/height.
 * Supports flex-direction, flex-wrap, justify-content, align-items, align-content,
 * gap, flex-grow/shrink/basis, align-self, order.
 * `baseline` aligns like flex-start (cross position 0); cross size stays intrinsic.
 */

export const FLEX_ROW = "row";
export const FLEX_ROW_REVERSE = "row-reverse";
export const FLEX_COLUMN = "column";
export const FLEX_COLUMN_REVERSE = "column-reverse";

export const FLEX_NOWRAP = "nowrap";
export const FLEX_WRAP = "wrap";
export const FLEX_WRAP_REVERSE = "wrap-reverse";

export const JUSTIFY_FLEX_START = "flex-start";
export const JUSTIFY_FLEX_END = "flex-end";
export const JUSTIFY_CENTER = "center";
export const JUSTIFY_SPACE_BETWEEN = "space-between";
export const JUSTIFY_SPACE_AROUND = "space-around";
export const JUSTIFY_SPACE_EVENLY = "space-evenly";

export const ALIGN_START = "flex-start";
export const ALIGN_END = "flex-end";
export const ALIGN_CENTER = "center";
export const ALIGN_BASELINE = "baseline";
export const ALIGN_STRETCH = "stretch";

export const ALIGN_CONTENT_STRETCH = "stretch";

const EPS = 0.5;

/**
 * @typedef {Object} FlexItemInput
 * @property {string} key
 * @property {number} [order=0]
 * @property {number} [flexGrow=0]
 * @property {number} [flexShrink=1]
 * @property {number} flexBasisMain
 * @property {number} [minMain=0]
 * @property {number} [maxMain=1e9]
 * @property {number} [minCross=0]
 * @property {number} [maxCross=1e9]
 * @property {number} crossSizeIntrinsic
 * @property {string|null|undefined} [alignSelf]
 */

/**
 * @typedef {Object} FlexContainerInput
 * @property {number} width
 * @property {number} height  use very large value if cross size is indefinite (e.g. row strip)
 * @property {string} [flexDirection="row"]
 * @property {string} [flexWrap="wrap"]
 * @property {string} [justifyContent="flex-start"]
 * @property {string} [alignItems="stretch"]
 * @property {string} [alignContent="stretch"]
 * @property {number} [rowGap=0]
 * @property {number} [columnGap=0]
 */

/**
 * @param {FlexItemInput[]} items
 * @param {FlexContainerInput} container
 * @returns {{ rects: Record<string, { x: number, y: number, width: number, height: number }>, contentWidth: number, contentHeight: number }}
 */
export function computeFlexLayout(items, container) {
  const {
    width: cw,
    height: ch,
    flexDirection = FLEX_ROW,
    flexWrap = FLEX_WRAP,
    justifyContent = JUSTIFY_FLEX_START,
    alignItems = ALIGN_STRETCH,
    alignContent = ALIGN_CONTENT_STRETCH,
    rowGap = 0,
    columnGap = 0,
  } = container;

  const isRow =
    flexDirection === FLEX_ROW || flexDirection === FLEX_ROW_REVERSE;
  const mainIsReversed =
    flexDirection === FLEX_ROW_REVERSE || flexDirection === FLEX_COLUMN_REVERSE;
  const wrapIsReverse = flexWrap === FLEX_WRAP_REVERSE;
  const isWrap = flexWrap !== FLEX_NOWRAP;

  const innerMain = isRow ? cw : ch;
  const innerCrossDefinite = isRow ? ch : cw;
  const mainGap = isRow ? columnGap : rowGap;
  const crossGap = isRow ? rowGap : columnGap;

  const sorted = items
    .map((it, docIndex) => ({ it, docIndex }))
    .sort((a, b) => {
      const oa = a.it.order ?? 0;
      const ob = b.it.order ?? 0;
      if (oa !== ob) return oa - ob;
      return a.docIndex - b.docIndex;
    })
    .map(({ it }) => it);

  if (sorted.length === 0) {
    return { rects: {}, contentWidth: cw, contentHeight: ch };
  }

  /** @type {FlexItemInput[][]} */
  let lines = [];
  if (!isWrap) {
    lines = [sorted];
  } else {
    let cur = [];
    let sumMain = 0;
    for (const it of sorted) {
      const base = clamp(it.flexBasisMain, it.minMain ?? 0, it.maxMain ?? 1e9);
      const g = cur.length > 0 ? mainGap : 0;
      const nextSum = sumMain + g + base;
      if (cur.length > 0 && nextSum > innerMain + EPS) {
        lines.push(cur);
        cur = [];
        sumMain = 0;
      }
      cur.push(it);
      sumMain += (cur.length > 1 ? mainGap : 0) + base;
    }
    if (cur.length) lines.push(cur);
  }

  const L = lines.length;
  /** @type {number[]} */
  const lineCross = new Array(L).fill(0);

  /** @type {{ item: FlexItemInput, lineIndex: number, mainSize: number, mainStart: number, crossSize: number, crossOffsetInLine: number }[]} */
  const out = [];

  for (let li = 0; li < L; li += 1) {
    const line = lines[li];
    const n = line.length;
    const bases = line.map((it) =>
      clamp(it.flexBasisMain, it.minMain ?? 0, it.maxMain ?? 1e9),
    );
    const gapsTotal = n > 0 ? (n - 1) * mainGap : 0;
    const sumBase = bases.reduce((a, b) => a + b, 0);
    let free = innerMain - sumBase - gapsTotal;

    /** @type {number[]} */
    let mains = [...bases];
    if (free > EPS) {
      const growSum = line.reduce((s, it) => s + (it.flexGrow ?? 0), 0);
      if (growSum > EPS) {
        mains = line.map((it, i) => {
          const g = it.flexGrow ?? 0;
          return bases[i] + (free * g) / growSum;
        });
      }
    } else if (free < -EPS) {
      const shrinkWeighted = line.reduce(
        (s, it, i) => s + (it.flexShrink ?? 1) * bases[i],
        0,
      );
      if (shrinkWeighted > EPS) {
        mains = line.map((it, i) => {
          const fs = it.flexShrink ?? 1;
          return bases[i] + (free * (fs * bases[i])) / shrinkWeighted;
        });
      }
    }

    for (let i = 0; i < n; i += 1) {
      mains[i] = clamp(
        mains[i],
        line[i].minMain ?? 0,
        line[i].maxMain ?? 1e9,
      );
    }

    const usedMain = mains.reduce((a, b) => a + b, 0) + gapsTotal;
    const mainFree = innerMain - usedMain;

    /** @type {number[]} */
    const mainStarts = new Array(n).fill(0);
    if (n > 0) {
      if (justifyContent === JUSTIFY_FLEX_START) {
        let pos = 0;
        for (let i = 0; i < n; i += 1) {
          mainStarts[i] = pos;
          pos += mains[i] + (i < n - 1 ? mainGap : 0);
        }
      } else if (justifyContent === JUSTIFY_FLEX_END) {
        let pos = mainFree;
        for (let i = 0; i < n; i += 1) {
          mainStarts[i] = pos;
          pos += mains[i] + (i < n - 1 ? mainGap : 0);
        }
      } else if (justifyContent === JUSTIFY_CENTER) {
        let pos = mainFree / 2;
        for (let i = 0; i < n; i += 1) {
          mainStarts[i] = pos;
          pos += mains[i] + (i < n - 1 ? mainGap : 0);
        }
      } else if (justifyContent === JUSTIFY_SPACE_BETWEEN && n > 1) {
        const between = mainFree / (n - 1);
        let pos = 0;
        for (let i = 0; i < n; i += 1) {
          mainStarts[i] = pos;
          pos += mains[i] + (i < n - 1 ? mainGap + between : 0);
        }
      } else if (justifyContent === JUSTIFY_SPACE_AROUND) {
        const between = mainFree / n;
        let pos = between / 2;
        for (let i = 0; i < n; i += 1) {
          mainStarts[i] = pos;
          pos += mains[i] + (i < n - 1 ? mainGap + between : 0);
        }
      } else if (justifyContent === JUSTIFY_SPACE_EVENLY) {
        const step = mainFree / (n + 1);
        let pos = step;
        for (let i = 0; i < n; i += 1) {
          mainStarts[i] = pos;
          pos += mains[i] + (i < n - 1 ? mainGap + step : 0);
        }
      } else {
        let pos = 0;
        for (let i = 0; i < n; i += 1) {
          mainStarts[i] = pos;
          pos += mains[i] + (i < n - 1 ? mainGap : 0);
        }
      }
    }

    if (mainIsReversed && n > 0) {
      for (let i = 0; i < n; i += 1) {
        mainStarts[i] = innerMain - mainStarts[i] - mains[i];
      }
    }

    let lc = 0;
    for (let i = 0; i < n; i += 1) {
      const it = line[i];
      const ic = clamp(
        it.crossSizeIntrinsic,
        it.minCross ?? 0,
        it.maxCross ?? 1e9,
      );
      lc = Math.max(lc, ic);
    }
    if (lc < EPS) lc = EPS;

    for (let i = 0; i < n; i += 1) {
      const it = line[i];
      const self =
        it.alignSelf && it.alignSelf !== "auto" ? it.alignSelf : alignItems;
      let cSize;
      if (self === ALIGN_STRETCH) {
        cSize = clamp(lc, it.minCross ?? 0, it.maxCross ?? 1e9);
      } else {
        cSize = clamp(
          it.crossSizeIntrinsic,
          it.minCross ?? 0,
          it.maxCross ?? 1e9,
        );
      }

      let cOff = 0;
      if (self === ALIGN_END) {
        cOff = lc - cSize;
      } else if (self === ALIGN_CENTER) {
        cOff = (lc - cSize) / 2;
      }

      out.push({
        item: it,
        lineIndex: li,
        mainSize: mains[i],
        mainStart: mainStarts[i],
        crossSize: cSize,
        crossOffsetInLine: cOff,
      });
    }
    lineCross[li] = lc;
  }

  const sumLinesCross =
    lineCross.reduce((a, b) => a + b, 0) + (L > 1 ? (L - 1) * crossGap : 0);
  const crossContainer = Number.isFinite(innerCrossDefinite) ? innerCrossDefinite : sumLinesCross;
  let crossFree = crossContainer - sumLinesCross;

  if (
    alignContent === ALIGN_CONTENT_STRETCH &&
    L > 1 &&
    crossFree > EPS &&
    Number.isFinite(innerCrossDefinite) &&
    innerCrossDefinite < 1e7
  ) {
    const growEach = crossFree / L;
    for (let i = 0; i < L; i += 1) {
      lineCross[i] += growEach;
    }
    crossFree = 0;
    for (const p of out) {
      const self =
        p.item.alignSelf && p.item.alignSelf !== "auto"
          ? p.item.alignSelf
          : alignItems;
      if (self === ALIGN_STRETCH) {
        const lc = lineCross[p.lineIndex];
        p.crossSize = clamp(
          lc,
          p.item.minCross ?? 0,
          p.item.maxCross ?? 1e9,
        );
        p.crossOffsetInLine = 0;
      }
    }
  }

  /** @type {number[]} */
  const lineCrossStart = new Array(L).fill(0);
  if (L === 1) {
    if (alignContent === JUSTIFY_FLEX_END) {
      lineCrossStart[0] = Math.max(0, crossFree);
    } else if (alignContent === JUSTIFY_CENTER) {
      lineCrossStart[0] = Math.max(0, crossFree) / 2;
    } else {
      lineCrossStart[0] = 0;
    }
  } else if (alignContent === JUSTIFY_FLEX_START || alignContent === ALIGN_CONTENT_STRETCH) {
    let pos = 0;
    for (let i = 0; i < L; i += 1) {
      lineCrossStart[i] = pos;
      pos += lineCross[i] + (i < L - 1 ? crossGap : 0);
    }
  } else if (alignContent === JUSTIFY_FLEX_END) {
    let pos = Math.max(0, crossFree);
    for (let i = 0; i < L; i += 1) {
      lineCrossStart[i] = pos;
      pos += lineCross[i] + (i < L - 1 ? crossGap : 0);
    }
  } else if (alignContent === JUSTIFY_CENTER) {
    let pos = Math.max(0, crossFree) / 2;
    for (let i = 0; i < L; i += 1) {
      lineCrossStart[i] = pos;
      pos += lineCross[i] + (i < L - 1 ? crossGap : 0);
    }
  } else if (alignContent === JUSTIFY_SPACE_BETWEEN && L > 1) {
    const between = Math.max(0, crossFree) / (L - 1);
    let pos = 0;
    for (let i = 0; i < L; i += 1) {
      lineCrossStart[i] = pos;
      pos += lineCross[i] + (i < L - 1 ? crossGap + between : 0);
    }
  } else if (alignContent === JUSTIFY_SPACE_AROUND) {
    const between = L > 0 ? Math.max(0, crossFree) / L : 0;
    let pos = between / 2;
    for (let i = 0; i < L; i += 1) {
      lineCrossStart[i] = pos;
      pos += lineCross[i] + (i < L - 1 ? crossGap + between : 0);
    }
  } else if (alignContent === JUSTIFY_SPACE_EVENLY) {
    const step = L > 0 ? Math.max(0, crossFree) / (L + 1) : 0;
    let pos = step;
    for (let i = 0; i < L; i += 1) {
      lineCrossStart[i] = pos;
      pos += lineCross[i] + (i < L - 1 ? crossGap + step : 0);
    }
  } else {
    let pos = 0;
    for (let i = 0; i < L; i += 1) {
      lineCrossStart[i] = pos;
      pos += lineCross[i] + (i < L - 1 ? crossGap : 0);
    }
  }

  if (wrapIsReverse && L > 0) {
    const totalCross =
      lineCross.reduce((a, b) => a + b, 0) + (L > 1 ? (L - 1) * crossGap : 0);
    for (let i = 0; i < L; i += 1) {
      lineCrossStart[i] = totalCross - lineCrossStart[i] - lineCross[i];
    }
  }

  /** @type {Record<string, { x: number, y: number, width: number, height: number }>} */
  const rects = {};

  for (const p of out) {
    const lc = lineCrossStart[p.lineIndex];
    const crossPos = lc + p.crossOffsetInLine;
    if (isRow) {
      rects[p.item.key] = {
        x: p.mainStart,
        y: crossPos,
        width: p.mainSize,
        height: p.crossSize,
      };
    } else {
      rects[p.item.key] = {
        x: crossPos,
        y: p.mainStart,
        width: p.crossSize,
        height: p.mainSize,
      };
    }
  }

  let contentW = cw;
  let contentH = ch;
  if (isRow) {
    const bottom = Math.max(
      0,
      ...Object.values(rects).map((r) => r.y + r.height),
    );
    contentH = innerCrossDefinite > 1e7 ? bottom : ch;
  } else {
    const right = Math.max(
      0,
      ...Object.values(rects).map((r) => r.x + r.width),
    );
    contentW = innerCrossDefinite > 1e7 ? right : cw;
  }

  return { rects, contentWidth: contentW, contentHeight: contentH };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
