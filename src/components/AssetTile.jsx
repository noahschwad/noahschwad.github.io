import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getTextTileBodyProps } from "../renderTextWithLineBreaks";
import { TILE_LAYOUT_STACKED, TILE_LAYOUT_TEXT_LEFT } from "../functionality";
import { MuxStripHlsVideo } from "./MuxStripHlsVideo";
import { ProgressiveProjectImage } from "./ProgressiveProjectImage";

function randomSelectionTheme() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const fg = luma > 160 ? 0 : 255;
  return { r, g, b, fg };
}

function hasSrc(src) {
  return typeof src === "string" && src.trim().length > 0;
}

function hasPlaybackId(id) {
  return typeof id === "string" && id.trim().length > 0;
}

function hasTextBody(s) {
  return typeof s === "string" && s.trim().length > 0;
}

function hasDisplayField(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" && !Number.isNaN(value)) return true;
  return false;
}

function assetReady(asset) {
  if (asset.kind === "mux") return hasPlaybackId(asset.playbackId);
  if (asset.kind === "text") return hasTextBody(asset.text);
  return hasSrc(asset.src);
}

export function AssetTile({
  project,
  asset,
  tileLayout = TILE_LAYOUT_STACKED,
  stripListIndex,
  stripTileKey,
  registerStripMediaAspect,
  registerStripTileMetaLayout,
  textSize = 1,
}) {
  const [mediaFailed, setMediaFailed] = useState(false);
  const [selectionTheme] = useState(randomSelectionTheme);
  const articleRef = useRef(null);
  const stripNativeVideoRef = useRef(null);

  const stripAssetMediaKey = useMemo(() => {
    const k = asset.kind;
    const pid = project?.id ?? "";
    const aid = asset?.id ?? "";
    if (k === "mux") {
      const tok =
        typeof asset.tokens?.playback === "string" ? asset.tokens.playback : "";
      return `mux:${pid}:${aid}:${String(asset.playbackId ?? "").trim()}:${tok}`;
    }
    if (k === "text") return `text:${pid}:${aid}`;
    return `${k}:${pid}:${aid}:${String(asset.src ?? "").trim()}`;
  }, [project?.id, asset]);

  useEffect(() => {
    setMediaFailed(false);
  }, [stripAssetMediaKey]);

  const reportAspect = useCallback(
    (w, h) => {
      if (!stripTileKey || !registerStripMediaAspect) return;
      if (w > 0 && h > 0) registerStripMediaAspect(stripTileKey, w / h);
    },
    [stripTileKey, registerStripMediaAspect],
  );

  const clearStripAspect = useCallback(() => {
    if (!stripTileKey || !registerStripMediaAspect) return;
    registerStripMediaAspect(stripTileKey, null);
  }, [stripTileKey, registerStripMediaAspect]);

  useEffect(() => {
    if (!stripTileKey || !registerStripMediaAspect) return undefined;
    return () => registerStripMediaAspect(stripTileKey, null);
  }, [
    stripTileKey,
    registerStripMediaAspect,
    asset.kind,
    asset.src,
    asset.playbackId,
  ]);

  const onMuxError = useCallback(() => {
    setMediaFailed(true);
    clearStripAspect();
  }, [clearStripAspect]);

  const measureStripTileMetaAndGap = useCallback(() => {
    if (!stripTileKey || !registerStripTileMetaLayout) return;
    const article = articleRef.current;
    if (!article) return;
    const anchorW = article.offsetWidth;
    if (anchorW < 1) return;

    const rootFs =
      parseFloat(getComputedStyle(document.documentElement).fontSize || "16") ||
      16;
    const cs = getComputedStyle(article);
    const flexDir = cs.flexDirection || "column";
    const isColumn =
      flexDir === "column" || flexDir === "column-reverse" || flexDir === "";
    /* Column flex: inter-item spacing is row-gap; column-gap is for wrapped columns. */
    let gapPx = parseFloat(
      (isColumn ? cs.rowGap : cs.columnGap) || cs.columnGap || "",
    );
    if (!Number.isFinite(gapPx) || gapPx < 0) {
      gapPx = parseFloat(cs.gap || "");
    }
    if (!Number.isFinite(gapPx) || gapPx < 0) {
      gapPx = 0.3 * rootFs;
    }

    const metaEl = article.querySelector(".asset-tile__meta");
    if (metaEl) {
      const br = metaEl.getBoundingClientRect();
      registerStripTileMetaLayout(stripTileKey, {
        metaW: br.width,
        metaH: br.height,
        gapPx,
        anchorW,
      });
    } else {
      registerStripTileMetaLayout(stripTileKey, {
        metaW: 0,
        metaH: 0,
        gapPx,
        anchorW,
      });
    }
  }, [
    stripTileKey,
    registerStripTileMetaLayout,
    project.title,
    project.year,
    project.category,
    asset.category,
    tileLayout,
    textSize,
  ]);

  useLayoutEffect(() => {
    measureStripTileMetaAndGap();
    const el = articleRef.current;
    if (!el || !stripTileKey || !registerStripTileMetaLayout) return undefined;
    const ro = new ResizeObserver(() => {
      measureStripTileMetaAndGap();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureStripTileMetaAndGap, stripTileKey, registerStripTileMetaLayout]);

  useEffect(() => {
    if (!stripTileKey || !registerStripTileMetaLayout) return undefined;
    return () => {
      registerStripTileMetaLayout(stripTileKey, null);
    };
  }, [stripTileKey, registerStripTileMetaLayout]);

  const onVideoMetadata = useCallback(
    (e) => {
      const v = e.currentTarget;
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (w > 0 && h > 0) reportAspect(w, h);
    },
    [reportAspect],
  );

  useLayoutEffect(() => {
    if (asset.kind !== "video" || mediaFailed || !hasSrc(asset.src)) return;
    const v = stripNativeVideoRef.current;
    if (!v || v.readyState < 1) return;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (w > 0 && h > 0) reportAspect(w, h);
  }, [asset.kind, asset.src, mediaFailed, reportAspect]);

  const missing = !assetReady(asset) || mediaFailed;
  const category = asset.category ?? project.category;
  const textFirst = tileLayout === TILE_LAYOUT_TEXT_LEFT;
  const hasTitle = hasDisplayField(project.title);
  const hasCategory = hasDisplayField(category);
  const hasYear = hasDisplayField(project.year);
  const showSub = hasCategory || hasYear;
  const textTileLarge = asset.textLarge !== false;

  const media = (
    <div className="asset-tile__media" data-kind={asset.kind}>
      {missing ? (
        <div className="asset-tile__placeholder" role="img" aria-label="No media loaded">
          {!assetReady(asset) ? "No asset specified" : "Asset missing"}
        </div>
      ) : asset.kind === "text" ? (
        <p
          className={`asset-tile__text-block${
            textTileLarge ? " asset-tile__text-block--large" : ""
          }`}
          {...getTextTileBodyProps(asset.text, asset.textHtml)}></p>
      ) : asset.kind === "mux" ? (
        <MuxStripHlsVideo
          className="asset-tile__video"
          stripLoadOrder={stripListIndex}
          playbackId={asset.playbackId.trim()}
          tokens={asset.tokens}
          onError={onMuxError}
          onLoadedMetadata={onVideoMetadata}
          onThumbnailNaturalSize={reportAspect}
        />
      ) : asset.kind === "video" ? (
        <video
          ref={stripNativeVideoRef}
          className="asset-tile__video"
          data-strip-playback-managed=""
          src={asset.src}
          tabIndex={-1}
          muted
          loop
          playsInline
          autoPlay
          onLoadedMetadata={onVideoMetadata}
          onError={() => {
            setMediaFailed(true);
            clearStripAspect();
          }}
        />
      ) : (
        <ProgressiveProjectImage
          fullSrc={asset.src}
          className="asset-tile__img"
          stackClass="asset-tile__img-stack"
          alt=""
          loading="eager"
          decoding="async"
          onNaturalSize={reportAspect}
          onErrorFull={() => {
            setMediaFailed(true);
            clearStripAspect();
          }}
        />
      )}
    </div>
  );

  const meta =
    hasTitle || showSub ? (
      <div className="asset-tile__meta">
        {hasTitle ? <p className="asset-tile__title">{project.title}</p> : null}
        {showSub ? (
          <p className="asset-tile__sub">
            {hasCategory ? <span>{category}</span> : null}
            {hasCategory && hasYear ? (
              <span className="asset-tile__dot" aria-hidden>
                ·
              </span>
            ) : null}
            {hasYear ? <span>{project.year}</span> : null}
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <article
      ref={articleRef}
      className={`asset-tile${textFirst ? " asset-tile--text-left" : ""}`}
      style={{
        "--tile-sel-r": selectionTheme.r,
        "--tile-sel-g": selectionTheme.g,
        "--tile-sel-b": selectionTheme.b,
        "--tile-sel-fg": selectionTheme.fg,
      }}
    >
      {/* Always meta then media so the media subtree (Mux) keeps the same React position when layout toggles; stacked mode uses CSS order to show media first. */}
      {meta}
      {media}
    </article>
  );
}
