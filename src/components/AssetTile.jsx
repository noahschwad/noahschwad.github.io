import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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

function randomGrowOriginCss() {
  const corners = ["0% 0%", "100% 0%", "0% 100%", "100% 100%"];
  return corners[Math.floor(Math.random() * corners.length)];
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

/** One corner grow-in per page load per strip asset (survives tile remount / flex reflow). */
const stripAssetIntroPlayed = new Set();

function stripAssetIntroKey(project, asset) {
  const pid = project?.id ?? "";
  const aid =
    asset?.id ??
    (asset.kind === "mux" ? asset.playbackId : null) ??
    asset?.src ??
    "";
  const kind = asset?.kind ?? "image";
  return `${pid}\0${String(aid)}\0${kind}`;
}

export function AssetTile({
  project,
  asset,
  tileLayout = TILE_LAYOUT_STACKED,
  stripListIndex,
}) {
  const introKey = useMemo(
    () => stripAssetIntroKey(project, asset),
    [
      project?.id,
      asset?.id,
      asset?.kind,
      asset?.src,
      asset?.playbackId,
    ],
  );

  const [mediaFailed, setMediaFailed] = useState(false);
  const [selectionTheme] = useState(randomSelectionTheme);
  const [mediaAspect, setMediaAspect] = useState(
    /** @type {{ w: number; h: number } | null} */ (null),
  );
  const [mediaRevealed, setMediaRevealed] = useState(
    () => asset.kind === "text" || stripAssetIntroPlayed.has(introKey),
  );
  const [introCssDone, setIntroCssDone] = useState(() =>
    asset.kind === "text" || stripAssetIntroPlayed.has(introKey),
  );
  const growOrigin = useMemo(() => randomGrowOriginCss(), []);

  useEffect(() => {
    if (asset.kind === "text") return;
    const played = stripAssetIntroPlayed.has(introKey);
    setIntroCssDone(played);
    setMediaRevealed(played);
    if (!played) setMediaAspect(null);
  }, [introKey, asset.kind]);

  useLayoutEffect(() => {
    if (asset.kind === "text" || !mediaRevealed || introCssDone) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    stripAssetIntroPlayed.add(introKey);
    setIntroCssDone(true);
  }, [asset.kind, mediaRevealed, introCssDone, introKey]);

  const onMuxStripLayoutReady = useCallback((w, h) => {
    if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
      setMediaAspect({ w, h });
    }
    setMediaRevealed(true);
  }, []);

  const onImageIntrinsic = useCallback((w, h) => {
    setMediaAspect({ w, h });
    setMediaRevealed(true);
  }, []);

  const onMediaGrowInEnd = useCallback(
    (e) => {
      if (e.animationName !== "asset-tile-media-grow-in") return;
      stripAssetIntroPlayed.add(introKey);
      setIntroCssDone(true);
    },
    [introKey],
  );

  const onMuxError = useCallback(() => setMediaFailed(true), []);
  const missing = !assetReady(asset) || mediaFailed;
  const category = asset.category ?? project.category;
  const textFirst = tileLayout === TILE_LAYOUT_TEXT_LEFT;
  const hasTitle = hasDisplayField(project.title);
  const hasCategory = hasDisplayField(category);
  const hasYear = hasDisplayField(project.year);
  const showSub = hasCategory || hasYear;
  const textTileLarge = asset.textLarge !== false;

  const useStripMediaSizer =
    !missing && asset.kind !== "text";

  const fallbackAspect =
    asset.kind === "mux" || asset.kind === "video" ? "16 / 9" : "4 / 3";

  const sizerStyle = useStripMediaSizer
    ? {
        "--media-grow-origin": growOrigin,
        aspectRatio: mediaAspect
          ? `${mediaAspect.w} / ${mediaAspect.h}`
          : fallbackAspect,
      }
    : undefined;

  const mediaBody = (
    <>
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
          onStripLayoutReady={onMuxStripLayoutReady}
        />
      ) : asset.kind === "video" ? (
        <video
          className="asset-tile__video"
          data-strip-playback-managed=""
          src={asset.src}
          tabIndex={-1}
          muted
          loop
          playsInline
          autoPlay
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            const w = v.videoWidth || 0;
            const h = v.videoHeight || 0;
            if (w > 0 && h > 0) setMediaAspect({ w, h });
            setMediaRevealed(true);
          }}
          onError={() => setMediaFailed(true)}
        />
      ) : (
        <ProgressiveProjectImage
          fullSrc={asset.src}
          className="asset-tile__img"
          stackClass="asset-tile__img-stack"
          alt=""
          loading="lazy"
          decoding="async"
          onErrorFull={() => setMediaFailed(true)}
          onIntrinsicLayoutReady={onImageIntrinsic}
        />
      )}
    </>
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
      <div className="asset-tile__media" data-kind={asset.kind}>
        {useStripMediaSizer ? (
          <div
            className={`asset-tile__media-sizer${
              textFirst ? " asset-tile__media-sizer--text-left" : ""
            }${mediaRevealed ? " asset-tile__media-sizer--revealed" : ""}`}
            style={sizerStyle}
          >
            <div
              className={`asset-tile__media-sizer__inner${
                introCssDone ? " is-intro-done" : ""
              }`}
              onAnimationEnd={onMediaGrowInEnd}
            >
              {mediaBody}
            </div>
          </div>
        ) : (
          mediaBody
        )}
      </div>
    </article>
  );
}
