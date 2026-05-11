import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useJsFlexStrip } from "./useJsFlexStrip";
import { useStripMobileManagedVideoPlayback } from "./useStripMobileManagedVideoPlayback";
import { AssetTile } from "./components/AssetTile";
import { ProjectLightbox } from "./components/ProjectLightbox";
import { SiteFooter } from "./components/SiteFooter";
import { SiteIntro } from "./components/SiteIntro";
import {
  ControlPanel,
  blankTilesPercentRange,
  imageSizeTenthIndex,
  roundImageSizeStep,
  roundImageSizeMainBarStep,
  textSizeRange,
} from "./components/ControlPanel";
import { projects } from "./data/projects";
import {
  LAYOUT_FLEX_RANDOM,
  LAYOUT_MODE_OPTIONS,
  applyImageTenthCrossShuffle,
  SIZE_MODE_OPTIONS,
  buildChronologicalTiles,
  buildDefaultTiles,
  buildRandomTiles,
  countStripLeadTiles,
  createTileSizeFactorResolver,
  duplicateEachStripContentTile,
  getImageSizeRange,
  IMAGE_TENTH_CROSS_SHUFFLE_THROTTLE_MS,
  imageSizeRangeWide,
  intersperseBlankTiles,
  maxBlankTilesPercentForImageSize,
  orderTilesWithStripLeads,
  partialShuffleTiles,
  STRIP_RANDOM_PARTIAL_FRACTION,
  STRIP_RANDOM_PARTIAL_PROBABILITY,
  stripTileBumpBasisRem,
  stripTileListKey,
  tileLayoutFromImageSize,
  TILE_LAYOUT_TEXT_LEFT,
} from "./functionality";
import "./App.css";

const STRIP_DEBUG_ASPECT_PRESETS = [
  [16, 9],
  [4, 3],
  [3, 2],
  [5, 4],
  [21, 9],
  [1, 1],
  [9, 16],
  [3, 4],
  [2, 3],
];

/** `ar` = naturalWidth / naturalHeight (layout map); display as w∶h or decimal∶1. */
function formatStripDebugAspect(ar) {
  if (ar == null || !(ar > 0) || !Number.isFinite(ar)) return "—";
  for (const [w, h] of STRIP_DEBUG_ASPECT_PRESETS) {
    if (Math.abs(ar - w / h) < 0.028) return `${w}∶${h}`;
  }
  const rounded = Math.round(ar * 1000) / 1000;
  return `${rounded}∶1`;
}

export function App() {
  const [textSize, setTextSize] = useState(textSizeRange.defaultValue);
  const [imageSizeViewportNarrow, setImageSizeViewportNarrow] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 599px)").matches
      : false,
  );
  const imageSizeRange = useMemo(
    () => getImageSizeRange(imageSizeViewportNarrow),
    [imageSizeViewportNarrow],
  );
  const panelImageSizeExtent = useMemo(
    () => ({ min: imageSizeRange.min, max: imageSizeRange.max }),
    [imageSizeRange],
  );
  const [imageSize, setImageSize] = useState(imageSizeRangeWide.defaultValue);
  /** Live panel multipliers for strip layout (`useJsFlexStrip`); updated on every render and on main image bar `input` without waiting for React. */
  const stripPanelLiveRef = useRef({
    imageSize: imageSizeRangeWide.defaultValue,
    textSize: textSizeRange.defaultValue,
  });
  stripPanelLiveRef.current = { imageSize, textSize };
  const imageTenthIndexRef = useRef(
    imageSizeTenthIndex(roundImageSizeStep(imageSizeRangeWide.defaultValue)),
  );
  const [displayMode, setDisplayMode] = useState("random");
  /**
   * Persists the previous random order (and the `projects` signature that
   * produced it) so the next re-roll can use it as a seed for partial shuffles
   * (see `STRIP_RANDOM_PARTIAL_PROBABILITY`). Cleared implicitly when the
   * `projects` signature no longer matches — that path forces a full shuffle.
   */
  const randomStripOrderRef = useRef({
    order: null,
    projSig: "",
  });
  /**
   * Bumped by `maybeApplyImageTenthShuffle` to force `orderedStripContentTiles`
   * to re-roll in `random` mode at each 0.1-band crossing (throttled to
   * `IMAGE_TENTH_CROSS_SHUFFLE_THROTTLE_MS` along with the rest of the shuffle).
   */
  const [randomOrderNonce, setRandomOrderNonce] = useState(0);
  /**
   * Initial `sizeMode` / `layoutMode` are picked uniformly at random from the
   * same option lists that `applyImageTenthCrossShuffle` rolls against, so the
   * page lands on a different combination each load. Lazy `useState`
   * initializers run exactly once per mount.
   */
  const [sizeMode, setSizeMode] = useState(
    () => SIZE_MODE_OPTIONS[Math.floor(Math.random() * SIZE_MODE_OPTIONS.length)].value,
  );
  const [blankTilesPercent, setBlankTilesPercent] = useState(
    blankTilesPercentRange.defaultValue,
  );
  const [layoutMode, setLayoutMode] = useState(
    () => LAYOUT_MODE_OPTIONS[Math.floor(Math.random() * LAYOUT_MODE_OPTIONS.length)].value,
  );
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [stripRowHeightDebug, setStripRowHeightDebug] = useState(false);
  const [stripRowDebugBands, setStripRowDebugBands] = useState(null);
  const [stripDebugAspectByKey, setStripDebugAspectByKey] = useState(null);
  const [exitingBlankIds, setExitingBlankIds] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const lightboxReturnFocusRef = useRef(null);
  const stripRef = useRef(null);
  const prevLayoutBlankIdsRef = useRef(new Set());
  const imageSliderGrabbedRef = useRef(false);
  /** Last `applyImageTenthCrossShuffle` timestamp (perf clock); throttles rapid drag crossings. */
  const lastImageTenthShuffleAtRef = useRef(0);

  const tileSizeApi = useMemo(() => createTileSizeFactorResolver(), []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 599px)");
    const apply = () => setImageSizeViewportNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useLayoutEffect(() => {
    setImageSize((v) =>
      Math.min(imageSizeRange.max, Math.max(imageSizeRange.min, v)),
    );
  }, [imageSizeRange.min, imageSizeRange.max]);

  const maxBlankForImageSize = useMemo(
    () => maxBlankTilesPercentForImageSize(imageSize, panelImageSizeExtent),
    [imageSize, panelImageSizeExtent],
  );

  useLayoutEffect(() => {
    if (blankTilesPercent > maxBlankForImageSize) {
      setBlankTilesPercent(maxBlankForImageSize);
    }
  }, [blankTilesPercent, maxBlankForImageSize]);

  const effectiveBlankTilesPercent = Math.min(
    blankTilesPercent,
    maxBlankForImageSize,
  );

  /**
   * `tileLayout` is owned as state (not a memo of `imageSize`) so the main
   * image bar can flip it live during drag — see `handleImageSizeStripLive`
   * — instead of waiting for slider release. A `useEffect` below keeps it in
   * sync with the committed `imageSize` (release / keyboard / viewport-range
   * clamp). State updates bail out via reference equality on the string
   * constants returned by `tileLayoutFromImageSize`, so non-breakpoint-crossing
   * drag inputs don't re-render.
   */
  const [tileLayout, setTileLayout] = useState(() =>
    tileLayoutFromImageSize(imageSizeRangeWide.defaultValue),
  );

  useEffect(() => {
    setTileLayout((prev) => {
      const next = tileLayoutFromImageSize(imageSize);
      return next === prev ? prev : next;
    });
  }, [imageSize]);

  const stripLeadCount = useMemo(() => countStripLeadTiles(projects), [projects]);

  /**
   * Builds the strip content order (default / chronological / random).
   *
   * Deps are intentionally only `displayMode`, `projects`, and
   * `randomOrderNonce`. None of the three build helpers reads `imageSize` /
   * `blankTilesPercent` / etc., so adding those would only invalidate this
   * memo (and re-roll `random`) on slider release or blank-tile shuffles for
   * no reason. Re-rolls of the random order are driven explicitly through
   * `randomOrderNonce`, bumped by `maybeApplyImageTenthShuffle` (which is
   * already gated by `IMAGE_TENTH_CROSS_SHUFFLE_THROTTLE_MS`).
   */
  const orderedStripContentTiles = useMemo(() => {
    if (displayMode === "chronological") return buildChronologicalTiles(projects);
    if (displayMode === "default") return buildDefaultTiles(projects);
    if (displayMode === "random") {
      const r = randomStripOrderRef.current;
      const projSig = projects.map((p) => p.id).join("\0");
      const projectsChanged = r.projSig !== projSig;
      // Partial-vs-full coin flip: when a previous random order exists for the
      // same project set, prefer a partial permutation (most tiles stay put)
      // with `STRIP_RANDOM_PARTIAL_PROBABILITY`, otherwise full Fisher-Yates.
      const canPartial =
        r.order != null && !projectsChanged && r.order.length >= 2;
      const next =
        canPartial && Math.random() < STRIP_RANDOM_PARTIAL_PROBABILITY
          ? partialShuffleTiles(r.order, STRIP_RANDOM_PARTIAL_FRACTION)
          : buildRandomTiles(projects);
      r.order = next;
      r.projSig = projSig;
      return next;
    }
    return buildDefaultTiles(projects);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `randomOrderNonce` is an opaque trigger; not read inside.
  }, [displayMode, projects, randomOrderNonce]);

  const tiles = useMemo(() => {
    const withLeads = orderTilesWithStripLeads(orderedStripContentTiles, projects);
    return intersperseBlankTiles(
      duplicateEachStripContentTile(withLeads),
      effectiveBlankTilesPercent,
      {
        reservedLeadingSlots: stripLeadCount,
        imageSize,
        panelImageSizeExtent,
      },
    );
  }, [
    orderedStripContentTiles,
    effectiveBlankTilesPercent,
    stripLeadCount,
    imageSize,
    panelImageSizeExtent,
    projects,
  ]);

  useLayoutEffect(() => {
    const cur = new Set(
      tiles.filter((t) => t.type === "blank").map((t) => t.blankId),
    );
    const prev = prevLayoutBlankIdsRef.current;
    setExitingBlankIds((ids) => {
      let next = ids.filter((id) => !cur.has(id));
      for (const id of prev) {
        if (!cur.has(id) && !next.includes(id)) next = [...next, id];
      }
      return next;
    });
    prevLayoutBlankIdsRef.current = cur;
  }, [tiles]);

  const stripTiles = useMemo(() => {
    const inLayout = new Set(
      tiles.filter((t) => t.type === "blank").map((t) => t.blankId),
    );
    const exiting = exitingBlankIds
      .filter((id) => !inLayout.has(id))
      .map((id) => ({ type: "blank", blankId: id, exiting: true }));
    return [...tiles, ...exiting];
  }, [tiles, exitingBlankIds]);

  const handleExitingBlankDone = useCallback((blankKey) => {
    setExitingBlankIds((ids) => ids.filter((id) => id !== blankKey));
  }, []);

  /** Persist flex-random `align-self` per strip key; only new keys get a roll. Cleared when leaving flex random. */
  const flexRandomAlignSelfByKeyRef = useRef(new Map());

  const flexRandomTileKeysSig = useMemo(() => {
    if (layoutMode !== LAYOUT_FLEX_RANDOM) return "";
    return JSON.stringify(tiles.map((t) => stripTileListKey(t)));
  }, [layoutMode, tiles]);

  const tileAlignSelfByKey = useMemo(() => {
    if (layoutMode !== LAYOUT_FLEX_RANDOM) {
      flexRandomAlignSelfByKeyRef.current.clear();
      return null;
    }
    const choices = ["flex-start", "flex-end", "center", "baseline", "stretch"];
    const map = flexRandomAlignSelfByKeyRef.current;
    for (const tile of tiles) {
      const key = stripTileListKey(tile);
      if (key && !map.has(key)) {
        map.set(key, choices[Math.floor(Math.random() * choices.length)]);
      }
    }
    return new Map(map);
    // `tiles` is read from the render where `flexRandomTileKeysSig` changed; omitting `tiles`
    // avoids new random rolls when only the tiles array identity changes (e.g. image size).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by flexRandomTileKeysSig
  }, [layoutMode, flexRandomTileKeysSig]);

  const tileKeyFn = useCallback((t) => stripTileListKey(t), []);

  const rootRem =
    typeof document !== "undefined"
      ? parseFloat(
        getComputedStyle(document.documentElement).fontSize || "16",
      ) || 16
      : 16;

  const getTileSizeFactor = useCallback(
    (tile) => {
      const key = tileKeyFn(tile);
      return tileSizeApi.getEffectiveFactor(
        sizeMode,
        key,
        rootRem,
        imageSize,
        stripTileBumpBasisRem(tile, tileLayout),
      );
    },
    [sizeMode, tileSizeApi, imageSize, tileKeyFn, tileLayout, rootRem],
  );

  const {
    registerTileEl,
    registerStripMediaAspect,
    registerStripTileMetaLayout,
    scheduleStripLayout,
  } =
    useJsFlexStrip({
      stripRef,
      tiles: stripTiles,
      tileKeyFn,
      imageSize,
      textSize,
      tileLayout,
      sizeMode,
      tileSizeApi,
      layoutMode,
      alignSelfByKey: tileAlignSelfByKey,
      onExitingBlankDone: handleExitingBlankDone,
      stripPanelLiveRef,
      suppressChildStripResizeObserversRef: imageSliderGrabbedRef,
      stripRowHeightDebug,
      onStripRowDebugBands: setStripRowDebugBands,
      onStripDebugAspects: setStripDebugAspectByKey,
    });

  /** Stable ref identity per `tileKey` so React does not fire `registerTileEl(key, null)` every App render. */
  const stripListItemElRefByKeyRef = useRef(new Map());
  const bindStripListItemEl = useCallback(
    (tileKey) => {
      let cb = stripListItemElRefByKeyRef.current.get(tileKey);
      if (!cb) {
        cb = (el) => registerTileEl(tileKey, el);
        stripListItemElRefByKeyRef.current.set(tileKey, cb);
      }
      return cb;
    },
    [registerTileEl],
  );

  const stripTileKeysSig = useMemo(
    () => JSON.stringify(stripTiles.map((t) => stripTileListKey(t))),
    [stripTiles],
  );

  useEffect(() => {
    const alive = new Set(stripTiles.map((t) => stripTileListKey(t)));
    for (const k of stripListItemElRefByKeyRef.current.keys()) {
      if (!alive.has(k)) stripListItemElRefByKeyRef.current.delete(k);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prune when key-set sig changes only
  }, [stripTileKeysSig]);

  /**
   * Runs `applyImageTenthCrossShuffle` (size mode / layout mode / blank tiles)
   * iff `bounded` lands in a new 0.1 band AND we haven't shuffled in the last
   * `IMAGE_TENTH_CROSS_SHUFFLE_THROTTLE_MS` ms. The tenth index ref is
   * advanced unconditionally so a band change "consumes" itself even when the
   * shuffle is throttled (otherwise every subsequent input event would
   * re-trigger until we leave the band).
   */
  const maybeApplyImageTenthShuffle = useCallback((bounded) => {
    const t = imageSizeTenthIndex(bounded);
    if (imageTenthIndexRef.current === t) return;
    imageTenthIndexRef.current = t;
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastImageTenthShuffleAtRef.current < IMAGE_TENTH_CROSS_SHUFFLE_THROTTLE_MS) {
      return;
    }
    lastImageTenthShuffleAtRef.current = now;
    applyImageTenthCrossShuffle({
      sizeMode: setSizeMode,
      layoutMode: setLayoutMode,
      blankTilesPercent: setBlankTilesPercent,
      // e.g. displayMode: setDisplayMode,
    });
    // Re-roll strip content order (random mode). The memo reads
    // `randomStripOrderRef.current.order` as the partial-shuffle seed, so we
    // leave the ref intact and just bump the nonce.
    setRandomOrderNonce((n) => n + 1);
  }, []);

  /**
   * Live strip layout during main image bar drag — bypasses React state for
   * `imageSize` (avoids per-frame re-renders) but still fires
   * `applyImageTenthCrossShuffle` on 0.1-band crossings so size mode / layout
   * mode / blank tiles re-roll while dragging, not just on release. Also
   * flips `tileLayout` live across the `TILE_LAYOUT_IMAGE_SIZE_BREAKPOINT`
   * (React bails on the set when the value is unchanged, so non-crossing
   * inputs stay free of re-renders).
   */
  const handleImageSizeStripLive = useCallback(
    (clamped) => {
      stripPanelLiveRef.current = {
        ...stripPanelLiveRef.current,
        imageSize: clamped,
      };
      scheduleStripLayout();
      maybeApplyImageTenthShuffle(roundImageSizeMainBarStep(clamped));
      setTileLayout((prev) => {
        const next = tileLayoutFromImageSize(clamped);
        return next === prev ? prev : next;
      });
    },
    [scheduleStripLayout, maybeApplyImageTenthShuffle],
  );

  useStripMobileManagedVideoPlayback({
    stripRef,
    narrowViewport: imageSizeViewportNarrow,
    lightboxOpen: lightbox != null,
    stripTiles,
  });

  /** Order among **assets** only (0,1,2,…). Stable when blank count/positions change so Mux memo + load order are not disturbed by interleaved blanks. */
  const assetStripOrdinalByIndex = useMemo(() => {
    let o = 0;
    return stripTiles.map((t) => (t.type === "asset" ? o++ : null));
  }, [stripTiles]);

  const pauseStripVideos = useCallback(() => {
    const root = stripRef.current;
    if (!root) return;
    root.querySelectorAll("video").forEach((v) => {
      v.pause();
    });
  }, []);

  const resumeStripVideos = useCallback(() => {
    const root = stripRef.current;
    if (!root) return;
    root.querySelectorAll("video").forEach((v) => {
      v.play().catch(() => {});
    });
  }, []);

  const handleImageSizeGrabStart = useCallback(() => {
    imageSliderGrabbedRef.current = true;
  }, []);

  const handleImageSizeGrabEnd = useCallback(() => {
    imageSliderGrabbedRef.current = false;
  }, []);

  useEffect(() => {
    const releaseGrab = () => {
      if (!imageSliderGrabbedRef.current) return;
      imageSliderGrabbedRef.current = false;
    };
    window.addEventListener("pointerup", releaseGrab);
    window.addEventListener("pointercancel", releaseGrab);
    window.addEventListener("mouseup", releaseGrab);
    window.addEventListener("touchend", releaseGrab);
    return () => {
      window.removeEventListener("pointerup", releaseGrab);
      window.removeEventListener("pointercancel", releaseGrab);
      window.removeEventListener("mouseup", releaseGrab);
      window.removeEventListener("touchend", releaseGrab);
    };
  }, []);

  useEffect(() => {
    if (!stripRowHeightDebug) {
      setStripRowDebugBands(null);
      setStripDebugAspectByKey(null);
    }
  }, [stripRowHeightDebug]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "d" && e.key !== "D") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.closest("input, textarea, select") != null || t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setShowDebugPanel((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * Top control bar only: commits the slider value to React state on release
   * (or click-on-track). Tenth crossings during a drag are handled live by
   * `handleImageSizeStripLive`; the same check here covers the case where the
   * commit value lands in a new band without an `input` event having fired
   * (e.g. keyboard nudge, click on track). Shares the same throttle gate.
   */
  const handleImageSize = useCallback(
    (raw) => {
      const clamped = Math.min(
        imageSizeRange.max,
        Math.max(imageSizeRange.min, raw),
      );
      const next = roundImageSizeMainBarStep(clamped);
      const bounded = Math.min(
        imageSizeRange.max,
        Math.max(imageSizeRange.min, next),
      );
      maybeApplyImageTenthShuffle(bounded);
      setImageSize(bounded);
    },
    [maybeApplyImageTenthShuffle, imageSizeRange.min, imageSizeRange.max],
  );

  /** Debug panel image slider: same `imageSize` / CSS, but no tenth-mark shuffle. */
  const handleDebugImageSize = useCallback(
    (raw) => {
      const clamped = Math.min(
        imageSizeRange.max,
        Math.max(imageSizeRange.min, raw),
      );
      const next = roundImageSizeStep(clamped);
      const bounded = Math.min(
        imageSizeRange.max,
        Math.max(imageSizeRange.min, next),
      );
      imageTenthIndexRef.current = imageSizeTenthIndex(bounded);
      setImageSize(bounded);
    },
    [imageSizeRange.min, imageSizeRange.max],
  );

  return (
    <div
      className="app-root"
      style={{
        "--panel-text-size": String(textSize),
        "--panel-image-size": String(imageSize),
      }}
    >
      <ControlPanel
        textSize={textSize}
        onTextSize={setTextSize}
        imageSize={imageSize}
        imageSizeRange={imageSizeRange}
        onImageSize={handleImageSize}
        onDebugImageSize={handleDebugImageSize}
        blankTilesPercent={blankTilesPercent}
        blankTilesPercentMax={maxBlankForImageSize}
        onBlankTilesPercent={setBlankTilesPercent}
        displayMode={displayMode}
        onDisplayMode={setDisplayMode}
        sizeMode={sizeMode}
        onSizeMode={setSizeMode}
        layoutMode={layoutMode}
        onLayoutMode={setLayoutMode}
        onImageSizeGrabStart={handleImageSizeGrabStart}
        onImageSizeGrabEnd={handleImageSizeGrabEnd}
        onImageSizeStripLive={handleImageSizeStripLive}
        imageSliderGrabbedRef={imageSliderGrabbedRef}
        showDebugPanel={showDebugPanel}
        stripRowHeightDebug={stripRowHeightDebug}
        onStripRowHeightDebug={setStripRowHeightDebug}
      />
      <main id="main" className="app">
        <SiteIntro project={projects.find((p) => p.staticSiteIntro)} />
        <ul
          className="selected-strip selected-strip--js-flex"
          aria-label="Selected work"
          ref={stripRef}
        >
          {stripRowHeightDebug && stripRowDebugBands?.length ? (
            <div
              className="selected-strip__row-debug"
              aria-hidden="true"
            >
              {stripRowDebugBands.map((band, ri) => (
                <div
                  key={ri}
                  className="selected-strip__row-debug-band"
                  style={{
                    left: band.x,
                    top: band.y,
                    width: band.width,
                    height: band.height,
                  }}
                  title={band.tallestMath || undefined}
                >
                  <div className="selected-strip__row-debug-band-stack">
                    {band.tallestMath ? (
                      <span className="selected-strip__row-debug-band-math">
                        {band.tallestMath}
                      </span>
                    ) : null}
                    {band.tallestLabel ? (
                      <span className="selected-strip__row-debug-band-label">
                        {band.tallestLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {stripTiles.map((tile, i) => {
            const tileKey = stripTileListKey(tile);
            const factor = getTileSizeFactor(tile);
            const openLightbox =
              tile.type === "asset" && tile.asset?.kind !== "text";
            const itemClasses = [
              "selected-strip__item",
              openLightbox ? "selected-strip__item--interactive" : "",
              tile.type === "blank" && tile.exiting
                ? "selected-strip__item--blank-exiting"
                : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li
                key={tileKey}
                data-tile-key={tileKey}
                className={itemClasses}
                ref={bindStripListItemEl(tileKey)}
                style={{
                  "--tile-size-factor": String(factor),
                }}
                {...(openLightbox
                  ? {
                      tabIndex: -1,
                      role: "button",
                      "aria-haspopup": "dialog",
                      onClick: (e) => {
                        if (window.getSelection?.()?.toString()) return;
                        lightboxReturnFocusRef.current = e.currentTarget;
                        setLightbox({ project: tile.project, asset: tile.asset });
                      },
                      onKeyDown: (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          lightboxReturnFocusRef.current = e.currentTarget;
                          setLightbox({ project: tile.project, asset: tile.asset });
                        }
                      },
                    }
                  : {})}
              >
                {tile.type === "blank" ? (
                  <article
                    className={[
                      "asset-tile",
                      "asset-tile--blank",
                      tileLayout === TILE_LAYOUT_TEXT_LEFT
                        ? "asset-tile--text-left"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-hidden="true"
                  >
                    <div className="asset-tile__media" />
                  </article>
                ) : (
                  <AssetTile
                    project={tile.project}
                    asset={tile.asset}
                    tileLayout={tileLayout}
                    stripListIndex={assetStripOrdinalByIndex[i] ?? 0}
                    stripTileKey={tileKey}
                    registerStripMediaAspect={registerStripMediaAspect}
                    registerStripTileMetaLayout={registerStripTileMetaLayout}
                    textSize={textSize}
                  />
                )}
                {stripRowHeightDebug && stripDebugAspectByKey ? (
                  <span
                    className="selected-strip__item-aspect-debug"
                    title={
                      stripDebugAspectByKey[tileKey] != null
                        ? `W÷H ≈ ${stripDebugAspectByKey[tileKey]}`
                        : "No aspect in strip map (fallback height)"
                    }
                  >
                    {formatStripDebugAspect(stripDebugAspectByKey[tileKey])}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <SiteFooter
          project={projects.find((p) => p.staticSiteFooter)}
          introProject={projects.find((p) => p.staticSiteIntro)}
        />
      </main>
      {lightbox && (
        <ProjectLightbox
          project={lightbox.project}
          initialAsset={lightbox.asset}
          onAfterOpenFade={pauseStripVideos}
          onExitStart={resumeStripVideos}
          onClose={() => {
            setLightbox(null);
            requestAnimationFrame(() =>
              lightboxReturnFocusRef.current?.focus?.({ preventScroll: true }),
            );
          }}
        />
      )}
    </div>
  );
}
