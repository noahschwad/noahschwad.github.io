import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useJsFlexStrip } from "./useJsFlexStrip";
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
  LAYOUT_FLEX_START,
  applyImageTenthCrossShuffle,
  SIZE_MODE_UNIFORM,
  buildChronologicalTiles,
  buildDefaultTiles,
  buildRandomTiles,
  countStripLeadTiles,
  createTileSizeFactorResolver,
  duplicateEachStripContentTile,
  getImageSizeRange,
  imageSizeRangeWide,
  intersperseBlankTiles,
  maxBlankTilesPercentForImageSize,
  orderTilesWithStripLeads,
  STRIP_RANDOM_ORDER_THROTTLE_MS,
  stripTileBumpBasisRem,
  stripTileListKey,
  tileLayoutFromImageSize,
  TILE_LAYOUT_TEXT_LEFT,
} from "./functionality";
import "./App.css";

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
  const imageTenthIndexRef = useRef(
    imageSizeTenthIndex(roundImageSizeStep(imageSizeRangeWide.defaultValue)),
  );
  const [displayMode, setDisplayMode] = useState("random");
  /** Throttles `buildRandomTiles` during slider/window churn; see `STRIP_RANDOM_ORDER_THROTTLE_MS`. */
  const randomStripOrderRef = useRef({
    order: null,
    lastAt: 0,
    projSig: "",
  });
  const [sizeMode, setSizeMode] = useState(SIZE_MODE_UNIFORM);
  const [blankTilesPercent, setBlankTilesPercent] = useState(
    blankTilesPercentRange.defaultValue,
  );
  const [layoutMode, setLayoutMode] = useState(LAYOUT_FLEX_START);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [exitingBlankIds, setExitingBlankIds] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const lightboxReturnFocusRef = useRef(null);
  const stripRef = useRef(null);
  const prevLayoutBlankIdsRef = useRef(new Set());
  const imageSliderGrabbedRef = useRef(false);
  const pendingImageTenthShuffleRef = useRef(false);

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

  const tileLayout = useMemo(
    () => tileLayoutFromImageSize(imageSize),
    [imageSize],
  );

  const stripLeadCount = useMemo(() => countStripLeadTiles(projects), [projects]);

  const orderedStripContentTiles = useMemo(() => {
    const clearRandomCache = () => {
      randomStripOrderRef.current = { order: null, lastAt: 0, projSig: "" };
    };
    if (displayMode === "chronological") {
      clearRandomCache();
      return buildChronologicalTiles(projects);
    }
    if (displayMode === "default") {
      clearRandomCache();
      return buildDefaultTiles(projects);
    }
    if (displayMode === "random") {
      const now = performance.now();
      const r = randomStripOrderRef.current;
      const projSig = projects.map((p) => p.id).join("\0");
      const projectsChanged = r.projSig !== projSig;
      if (
        r.order != null &&
        !projectsChanged &&
        now - r.lastAt < STRIP_RANDOM_ORDER_THROTTLE_MS
      ) {
        return r.order;
      }
      const next = buildRandomTiles(projects);
      r.order = next;
      r.lastAt = now;
      r.projSig = projSig;
      return next;
    }
    clearRandomCache();
    return buildDefaultTiles(projects);
  }, [
    displayMode,
    projects,
    imageSize,
    effectiveBlankTilesPercent,
    stripLeadCount,
    panelImageSizeExtent,
  ]);

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

  const { registerTileEl } = useJsFlexStrip({
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

  const flushPendingImageTenthShuffle = useCallback(() => {
    if (!pendingImageTenthShuffleRef.current) return;
    pendingImageTenthShuffleRef.current = false;
    applyImageTenthCrossShuffle({
      sizeMode: setSizeMode,
      layoutMode: setLayoutMode,
      blankTilesPercent: setBlankTilesPercent,
      // e.g. displayMode: setDisplayMode,
    });
  }, []);

  const handleImageSizeGrabStart = useCallback(() => {
    imageSliderGrabbedRef.current = true;
  }, []);

  const handleImageSizeGrabEnd = useCallback(() => {
    const wasGrabbed = imageSliderGrabbedRef.current;
    imageSliderGrabbedRef.current = false;
    if (wasGrabbed || pendingImageTenthShuffleRef.current) {
      flushPendingImageTenthShuffle();
    }
  }, [flushPendingImageTenthShuffle]);

  useEffect(() => {
    const releaseGrab = () => {
      if (!imageSliderGrabbedRef.current) return;
      handleImageSizeGrabEnd();
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
  }, [handleImageSizeGrabEnd]);

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

  /** Top control bar only: crossing 0.1 “tenths” can run `applyImageTenthCrossShuffle` (coarse mode tweaks). */
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
      const t = imageSizeTenthIndex(bounded);
      if (imageTenthIndexRef.current !== t) {
        pendingImageTenthShuffleRef.current = true;
        if (!imageSliderGrabbedRef.current) {
          flushPendingImageTenthShuffle();
        }
      }
      imageTenthIndexRef.current = t;
      setImageSize(bounded);
    },
    [flushPendingImageTenthShuffle, imageSizeRange.min, imageSizeRange.max],
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
        showDebugPanel={showDebugPanel}
      />
      <main id="main" className="app">
        <SiteIntro project={projects.find((p) => p.staticSiteIntro)} />
        <ul
          className="selected-strip selected-strip--js-flex"
          aria-label="Selected work"
          ref={stripRef}
        >
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
                ref={(el) => registerTileEl(tileKey, el)}
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
                  />
                )}
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
