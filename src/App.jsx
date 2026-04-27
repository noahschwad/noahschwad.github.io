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
  intersperseBlankTiles,
  orderTilesWithStripLeads,
  tileLayoutFromImageSize,
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

  const resolveTileSizeFactor = useMemo(() => createTileSizeFactorResolver(), []);

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
    return intersperseBlankTiles(withLeads, blankTilesPercent, {
      reservedLeadingSlots: stripLeadCount,
    });
  }, [displayMode, blankTilesPercent, stripLeadCount, projects]);

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
      const key =
        tile.type === "blank"
          ? tile.blankId
          : `${tile.project.id}-${tile.asset.id}`;
      map.set(key, choices[Math.floor(Math.random() * choices.length)]);
    }
    return map;
  }, [layoutMode, tiles]);

  const tileKeyFn = useCallback(
    (t) =>
      t.type === "blank" ? t.blankId : `${t.project.id}-${t.asset.id}`,
    [],
  );

  const tileSizeFactorForKey = useCallback(
    (key) => resolveTileSizeFactor(sizeMode, key),
    [resolveTileSizeFactor, sizeMode],
  );

  const { registerTileEl } = useJsFlexStrip({
    stripRef,
    tiles: stripTiles,
    tileKeyFn,
    imageSize,
    textSize,
    tileLayout,
    sizeMode,
    tileSizeFactor: tileSizeFactorForKey,
    alignSelfByKey: tileAlignSelfByKey,
    onExitingBlankDone: handleExitingBlankDone,
  });

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

  const handleImageSize = useCallback((raw) => {
    const next = roundImageSizeStep(raw);
    const t = imageSizeTenthIndex(next);
    if (imageTenthIndexRef.current !== t) {
      pendingImageTenthShuffleRef.current = true;
      if (!imageSliderGrabbedRef.current) {
        flushPendingImageTenthShuffle();
      }
    }
    imageTenthIndexRef.current = t;
    setImageSize(next);
  }, [flushPendingImageTenthShuffle]);

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
        blankTilesPercent={blankTilesPercent}
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
          {stripTiles.map((tile) => {
            const tileKey =
              tile.type === "blank"
                ? tile.blankId
                : `${tile.project.id}-${tile.asset.id}`;
            const factor = resolveTileSizeFactor(sizeMode, tileKey);
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
                    className="asset-tile asset-tile--blank"
                    aria-hidden="true"
                  >
                    <div className="asset-tile__media" />
                  </article>
                ) : (
                  <AssetTile
                    project={tile.project}
                    asset={tile.asset}
                    tileLayout={tileLayout}
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
