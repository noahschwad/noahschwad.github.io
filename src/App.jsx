import { useCallback, useMemo, useRef, useState } from "react";
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
  SIZE_MODE_RANDOM_TIERS_ROW_FILL,
  SIZE_MODE_UNIFORM,
  buildChronologicalTiles,
  buildDefaultTiles,
  buildRandomTiles,
  countStripLeadTiles,
  createTileSizeFactorResolver,
  intersperseBlankTiles,
  orderTilesWithStripLeads,
  tileLayoutFromImageSize,
  useRowFillTileKeys,
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
  const [lightbox, setLightbox] = useState(null);
  const lightboxReturnFocusRef = useRef(null);

  const resolveTileSizeFactor = useMemo(() => createTileSizeFactorResolver(), []);

  const tileLayout = useMemo(
    () => tileLayoutFromImageSize(imageSize),
    [imageSize],
  );

  const rowFillSizeMode = sizeMode === SIZE_MODE_RANDOM_TIERS_ROW_FILL;
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

  const rowFillLayoutKey = useMemo(
    () =>
      `${tiles
        .map((t) =>
          t.type === "blank" ? t.blankId : `${t.project.id}-${t.asset.id}`,
        )
        .join("|")}|${textSize}|${imageSize}|${tileLayout}|${layoutMode}`,
    [tiles, textSize, imageSize, tileLayout, layoutMode],
  );

  const { stripRef, rowFillKeySet, rowFillMode } = useRowFillTileKeys(
    rowFillLayoutKey,
    rowFillSizeMode,
  );

  const handleImageSize = useCallback((raw) => {
    const next = roundImageSizeStep(raw);
    const t = imageSizeTenthIndex(next);
    if (imageTenthIndexRef.current !== t) {
      applyImageTenthCrossShuffle({
        sizeMode: setSizeMode,
        layoutMode: setLayoutMode,
        blankTilesPercent: setBlankTilesPercent,
        // e.g. displayMode: setDisplayMode,
      });
    }
    imageTenthIndexRef.current = t;
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
        blankTilesPercent={blankTilesPercent}
        onBlankTilesPercent={setBlankTilesPercent}
        displayMode={displayMode}
        onDisplayMode={setDisplayMode}
        sizeMode={sizeMode}
        onSizeMode={setSizeMode}
        layoutMode={layoutMode}
        onLayoutMode={setLayoutMode}
      />
      <main id="main" className="app">
        <SiteIntro project={projects.find((p) => p.staticSiteIntro)} />
        <ul
          className={
            rowFillMode
              ? "selected-strip selected-strip--row-fill-mode"
              : "selected-strip"
          }
          aria-label="Selected work"
          ref={stripRef}
        >
          {tiles.map((tile) => {
            const tileKey =
              tile.type === "blank"
                ? tile.blankId
                : `${tile.project.id}-${tile.asset.id}`;
            const factor = resolveTileSizeFactor(sizeMode, tileKey);
            const alignSelf = tileAlignSelfByKey?.get(tileKey);
            const openLightbox =
              tile.type === "asset" && tile.asset?.kind !== "text";
            const itemClasses = [
              "selected-strip__item",
              openLightbox ? "selected-strip__item--interactive" : "",
              rowFillKeySet.has(tileKey) && rowFillMode
                ? "selected-strip__item--row-fill"
                : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li
                key={tileKey}
                data-tile-key={tileKey}
                className={itemClasses}
                style={{
                  "--tile-size-factor": String(factor),
                  ...(alignSelf ? { alignSelf } : {}),
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
