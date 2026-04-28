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
  imageSizeRange,
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
  intersperseBlankTiles,
  maxBlankTilesPercentForImageSize,
  orderTilesWithStripLeads,
  stripTileBumpBasisRem,
  stripTileListKey,
  tileLayoutFromImageSize,
  TILE_LAYOUT_TEXT_LEFT,
} from "./functionality";
import "./App.css";

export function App() {
  const [textSize, setTextSize] = useState(textSizeRange.defaultValue);
  const [imageSize, setImageSize] = useState(imageSizeRange.defaultValue);
  const imageTenthIndexRef = useRef(
    imageSizeTenthIndex(roundImageSizeStep(imageSizeRange.defaultValue)),
  );
  const [displayMode, setDisplayMode] = useState("default");
  const [sizeMode, setSizeMode] = useState(SIZE_MODE_UNIFORM);
  const [blankTilesPercent, setBlankTilesPercent] = useState(
    blankTilesPercentRange.defaultValue,
  );
  const [layoutMode, setLayoutMode] = useState(LAYOUT_FLEX_START);
  const [exitingBlankIds, setExitingBlankIds] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const lightboxReturnFocusRef = useRef(null);
  const stripRef = useRef(null);
  const prevLayoutBlankIdsRef = useRef(new Set());
  const imageSliderGrabbedRef = useRef(false);
  const pendingImageTenthShuffleRef = useRef(false);

  const tileSizeApi = useMemo(() => createTileSizeFactorResolver(), []);

  const maxBlankForImageSize = useMemo(
    () => maxBlankTilesPercentForImageSize(imageSize),
    [imageSize],
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
  const tiles = useMemo(() => {
    const ordered =
      displayMode === "chronological"
        ? buildChronologicalTiles(projects)
        : displayMode === "random"
          ? buildRandomTiles(projects)
          : buildDefaultTiles(projects);
    const withLeads = orderTilesWithStripLeads(ordered, projects);
    return intersperseBlankTiles(
      duplicateEachStripContentTile(withLeads),
      effectiveBlankTilesPercent,
      {
      reservedLeadingSlots: stripLeadCount,
        imageSize,
      },
    );
  }, [displayMode, effectiveBlankTilesPercent, stripLeadCount, imageSize, projects]);

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

  const tileAlignSelfByKey = useMemo(() => {
    if (layoutMode !== LAYOUT_FLEX_RANDOM) return null;
    const choices = ["flex-start", "flex-end", "center", "baseline", "stretch"];
    const map = new Map();
    for (const tile of tiles) {
      if (tile.type === "blank") {
        map.set(tile.blankId, choices[Math.floor(Math.random() * choices.length)]);
      } else {
        map.set(
          stripTileListKey(tile),
          choices[Math.floor(Math.random() * choices.length)],
        );
      }
    }
    return map;
  }, [layoutMode, tiles]);

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
    alignSelfByKey: tileAlignSelfByKey,
    onExitingBlankDone: handleExitingBlankDone,
  });

  /** Order among **assets** only (0,1,2,…). Stable when blank count/positions change so Mux memo + load order are not disturbed by interleaved blanks. */
  const assetStripOrdinalByIndex = useMemo(() => {
    let o = 0;
    return stripTiles.map((t) => (t.type === "asset" ? o++ : null));
  }, [stripTiles]);

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

  /** Top control bar only: crossing 0.1 “tenths” can run `applyImageTenthCrossShuffle` (coarse mode tweaks). */
  const handleImageSize = useCallback(
    (raw) => {
      const next = roundImageSizeMainBarStep(raw);
      const t = imageSizeTenthIndex(next);
      if (imageTenthIndexRef.current !== t) {
        pendingImageTenthShuffleRef.current = true;
        if (!imageSliderGrabbedRef.current) {
          flushPendingImageTenthShuffle();
        }
      }
      imageTenthIndexRef.current = t;
      setImageSize(next);
    },
    [flushPendingImageTenthShuffle],
  );

  /** Debug panel image slider: same `imageSize` / CSS, but no tenth-mark shuffle. */
  const handleDebugImageSize = useCallback((raw) => {
    const next = roundImageSizeStep(raw);
    imageTenthIndexRef.current = imageSizeTenthIndex(next);
    setImageSize(next);
  }, []);

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
                      tabIndex: 0,
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
        <SiteFooter project={projects.find((p) => p.staticSiteFooter)} />
      </main>
      {lightbox && (
        <ProjectLightbox
          project={lightbox.project}
          initialAsset={lightbox.asset}
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
