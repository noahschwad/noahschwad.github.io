import Hls from "hls.js";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  requestStripMuxLoad,
  STRIP_MUX_LOAD_LIMIT_ENABLED,
} from "../muxStripLoadScheduler";

/** Max combined fatal `NETWORK_ERROR` / `MEDIA_ERROR` recoveries per Hls instance before surfacing `onError`. */
const HLS_FATAL_RECOVERY_BUDGET = 3;

/** Viewport width below this uses mobile Mux resolution caps (matches `App.jsx`). */
export const MUX_PLAYBACK_NARROW_VIEWPORT_MQ = "(max-width: 599px)";

/**
 * Mux HLS URL (public or signed via `tokens.playback` JWT).
 * Desktop / lightbox: `min_resolution=720p` + `rendition_order=desc` so layout
 * changes do not lock playback to tiny renditions. Strip on narrow viewports:
 * 360p–720p band (`narrowViewport` on `MuxStripHlsVideo` only).
 * @see https://docs.mux.com/guides/control-playback-resolution
 * @param {string} playbackId
 * @param {{ playback?: string } | undefined} tokens
 * @param {{ narrowViewport?: boolean }} [opts]
 */
export function muxPlaybackM3u8Url(playbackId, tokens, opts = {}) {
  const id = typeof playbackId === "string" ? playbackId.trim() : "";
  if (!id) return "";
  const base = `https://stream.mux.com/${id}.m3u8`;
  const params = new URLSearchParams();
  if (opts.narrowViewport === true) {
    params.set("min_resolution", "360p");
    params.set("max_resolution", "720p");
  } else {
    params.set("min_resolution", "720p");
  }
  params.set("rendition_order", "desc");
  const jwt =
    typeof tokens?.playback === "string" ? tokens.playback.trim() : "";
  if (jwt.length > 0) {
    params.set("token", jwt);
  }
  return `${base}?${params.toString()}`;
}

/**
 * Mux static thumbnail (WebP). Shown as `poster` and in the deferred strip stand-in.
 * Signed playback IDs require the same `tokens.playback` JWT as stream URLs (`token` query).
 * @see https://docs.mux.com/guides/get-images-from-a-video
 * @param {string} playbackId
 * @param {{ playback?: string } | undefined} tokens
 * @param {{ width?: number }} [opts]
 */
export function muxThumbnailUrl(playbackId, tokens, opts = {}) {
  const id = typeof playbackId === "string" ? playbackId.trim() : "";
  if (!id) return "";
  const w = opts.width;
  const width =
    typeof w === "number" && Number.isFinite(w) && w > 0 ? Math.round(w) : 200;
  const params = new URLSearchParams();
  params.set("width", String(width));
  const jwt =
    typeof tokens?.playback === "string" ? tokens.playback.trim() : "";
  if (jwt.length > 0) {
    params.set("token", jwt);
  }
  return `https://image.mux.com/${id}/thumbnail.webp?${params.toString()}`;
}

function canPlayNativeHls(video) {
  return (
    video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
    video.canPlayType("application/x-mpegURL") !== ""
  );
}

const muxHlsDefaultCompare = (prev, next) =>
  prev.className === next.className &&
  prev.playbackId === next.playbackId &&
  prev.tokens === next.tokens &&
  prev.narrowViewport === next.narrowViewport &&
  prev.onError === next.onError &&
  prev.stripLoadOrder === next.stripLoadOrder &&
  prev.onThumbnailNaturalSize === next.onThumbnailNaturalSize;

/**
 * Native &lt;video&gt; + hls.js (no mux-player). Muted, looping, no controls.
 * @param {object} props
 * @param {boolean} [props.deferMount] When true, use strip load scheduling (see `muxStripLoadScheduler.js`).
 * @param {number} [props.stripLoadOrder] List index in the strip (0 = top); only when limiter is on.
 * @param {string} [props.wrapClassName] Wrapper class when `deferMount` (e.g. tile stand-in).
 * @param {import('react').CSSProperties} [props.style] Inline style on the video (lightbox sizing).
 * @param {() => void} [props.onLoadedData]
 * @param {() => void} [props.onLoadedMetadata]
 * @param {(naturalW: number, naturalH: number) => void} [props.onThumbnailNaturalSize] Deferred stand-in Mux thumbnail `img` (e.g. strip layout aspect before video).
 */
export const MuxHlsVideo = memo(
  forwardRef(function MuxHlsVideo(
    {
      className,
      style,
      deferMount = false,
      stripLoadOrder,
      stripPlaybackManaged = false,
      wrapClassName = "asset-tile__mux-wrap",
      onError: onErrorProp,
      onLoadedData,
      onLoadedMetadata,
      onThumbnailNaturalSize,
      narrowViewport = false,
      playbackId,
      tokens,
    },
    forwardedRef,
  ) {
    const [show, setShow] = useState(() => {
      if (!deferMount) return true;
      if (!STRIP_MUX_LOAD_LIMIT_ENABLED) return true;
      if (typeof stripLoadOrder !== "number") return true;
      return false;
    });
    const wrapRef = useRef(null);
    const videoRef = useRef(null);
    const stripSlotReleaseRef = useRef(null);
    /** `video.load()` / `hls.destroy()` during effect teardown often emit `error`; ignore those. */
    const suppressSourceTeardownErrorRef = useRef(false);
    const setVideoRef = useCallback(
      (node) => {
        videoRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );
    const tokenPlayback =
      typeof tokens?.playback === "string" ? tokens.playback : "";
    const playbackOpts = useMemo(
      () => ({ narrowViewport: narrowViewport === true }),
      [narrowViewport],
    );
    const src = useMemo(() => {
      const tokenPayload = tokenPlayback
        ? { playback: tokenPlayback }
        : undefined;
      return muxPlaybackM3u8Url(playbackId, tokenPayload, playbackOpts);
    }, [playbackId, tokenPlayback, playbackOpts]);
    const posterUrl = useMemo(
      () =>
        muxThumbnailUrl(playbackId, tokens, {
          width: deferMount ? 60 : 480,
        }),
      [playbackId, tokens, deferMount],
    );
    const onErrorRef = useRef(onErrorProp);
    onErrorRef.current = onErrorProp;

    const onVideoError = useCallback(
      (e) => {
        if (suppressSourceTeardownErrorRef.current) return;
        onErrorProp?.(e);
      },
      [onErrorProp],
    );
    const muxThumbImgRef = useRef(null);
    const onThumbnailNaturalSizeRef = useRef(onThumbnailNaturalSize);
    useEffect(() => {
      onThumbnailNaturalSizeRef.current = onThumbnailNaturalSize;
    }, [onThumbnailNaturalSize]);

    const fireMuxThumbNaturalSize = useCallback((img) => {
      if (!img || !img.complete) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) onThumbnailNaturalSizeRef.current?.(w, h);
    }, []);

    /**
     * When `STRIP_MUX_LOAD_LIMIT_ENABLED` is false, strip Mux mounts `<video>` immediately and the
     * stand-in `<img>` is never shown—`onThumbnailNaturalSize` would never run from DOM alone.
     * `Image()` loads eagerly (strip tiles are `position:absolute`, so `loading="lazy"` on imgs
     * can stall decode) and shares HTTP cache with the poster / stand-in.
     */
    useEffect(() => {
      if (!posterUrl || !onThumbnailNaturalSize) return undefined;
      let cancelled = false;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        fireMuxThumbNaturalSize(img);
      };
      img.onerror = () => {};
      img.src = posterUrl;
      return () => {
        cancelled = true;
        img.onload = null;
        img.onerror = null;
      };
    }, [posterUrl, onThumbnailNaturalSize, fireMuxThumbNaturalSize]);

    useLayoutEffect(() => {
      if (show || !deferMount || !posterUrl) return;
      fireMuxThumbNaturalSize(muxThumbImgRef.current);
    }, [show, deferMount, posterUrl, fireMuxThumbNaturalSize]);

    useLayoutEffect(() => {
      if (!show || !deferMount) return;
      const v = videoRef.current;
      if (!v || v.readyState < 1 || v.videoWidth < 1) return;
      onLoadedMetadata?.({ currentTarget: v });
    }, [show, deferMount, src, onLoadedMetadata]);

    useEffect(() => {
      if (stripPlaybackManaged) return undefined;
      if (deferMount && !show) return undefined;
      const resumeIfNeeded = () => {
        if (document.visibilityState !== "visible") return;
        const v = videoRef.current;
        if (!v || typeof v.play !== "function" || v.ended) return;
        v.play().catch(() => {});
      };
      document.addEventListener("visibilitychange", resumeIfNeeded);
      return () =>
        document.removeEventListener("visibilitychange", resumeIfNeeded);
    }, [stripPlaybackManaged, deferMount, show]);

    useEffect(() => {
      if (!deferMount) return undefined;
      if (!STRIP_MUX_LOAD_LIMIT_ENABLED) return undefined;
      if (typeof stripLoadOrder !== "number") {
        setShow(true);
        return undefined;
      }
      const cancel = requestStripMuxLoad(stripLoadOrder, (release) => {
        stripSlotReleaseRef.current = release;
        setShow(true);
      });
      return () => {
        cancel();
        if (stripSlotReleaseRef.current) {
          stripSlotReleaseRef.current();
          stripSlotReleaseRef.current = null;
        }
      };
    }, [deferMount, stripLoadOrder]);

    const releaseStripSlotOnce = useCallback(() => {
      const fn = stripSlotReleaseRef.current;
      if (fn) {
        stripSlotReleaseRef.current = null;
        fn();
      }
    }, []);

    useLayoutEffect(() => {
      if (deferMount && !show) return undefined;
      if (!src) return undefined;
      const video = videoRef.current;
      if (!video) return undefined;

      const tryPlay = () => {
        video.play().catch(() => {});
      };

      let hls;
      let onNativeData;
      const teardown = () => {
        suppressSourceTeardownErrorRef.current = true;
        try {
          if (onNativeData) {
            video.removeEventListener("loadeddata", onNativeData);
          }
          if (hls) {
            hls.destroy();
            hls = undefined;
          }
          video.removeAttribute("src");
          video.load();
          releaseStripSlotOnce();
        } finally {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              suppressSourceTeardownErrorRef.current = false;
            });
          });
        }
      };

      if (canPlayNativeHls(video)) {
        onNativeData = () => {
          tryPlay();
          releaseStripSlotOnce();
        };
        video.addEventListener("loadeddata", onNativeData, { once: true });
        video.src = src;
        tryPlay();
      } else if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: false,
          // Do not tie ABR to element box (tiles/lightbox resize often).
          capLevelToPlayerSize: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const levels = hls.levels;
          if (levels && levels.length > 0) {
            hls.currentLevel = levels.length - 1;
          }
          tryPlay();
          releaseStripSlotOnce();
        });
        let hlsFatalRecoveryLeft = HLS_FATAL_RECOVERY_BUDGET;
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal || suppressSourceTeardownErrorRef.current) return;
          const { type } = data;
          if (type === Hls.ErrorTypes.NETWORK_ERROR && hlsFatalRecoveryLeft > 0) {
            hlsFatalRecoveryLeft -= 1;
            try {
              hls.startLoad();
            } catch {
              onErrorRef.current?.();
              releaseStripSlotOnce();
            }
            return;
          }
          if (type === Hls.ErrorTypes.MEDIA_ERROR && hlsFatalRecoveryLeft > 0) {
            hlsFatalRecoveryLeft -= 1;
            try {
              hls.recoverMediaError();
            } catch {
              onErrorRef.current?.();
              releaseStripSlotOnce();
            }
            return;
          }
          onErrorRef.current?.();
          releaseStripSlotOnce();
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } else {
        onNativeData = () => {
          tryPlay();
          releaseStripSlotOnce();
        };
        video.addEventListener("loadeddata", onNativeData, { once: true });
        video.src = src;
        tryPlay();
      }

      return teardown;
    }, [deferMount, show, src, releaseStripSlotOnce]);

    const videoNode = !deferMount || show;
    if (!videoNode) {
      return (
        <div className={wrapClassName} ref={wrapRef}>
          {posterUrl ? (
            <div
              className="asset-tile__mux-standin asset-tile__mux-standin--thumb"
              aria-hidden
            >
              <img
                ref={muxThumbImgRef}
                className="asset-tile__mux-thumb"
                src={posterUrl}
                alt=""
                tabIndex={-1}
                decoding="async"
                loading="eager"
                draggable={false}
                onLoad={(e) => fireMuxThumbNaturalSize(e.currentTarget)}
              />
            </div>
          ) : (
            <div className="asset-tile__mux-standin" aria-hidden />
          )}
        </div>
      );
    }

    const v = (
      <video
        ref={setVideoRef}
        className={className}
        style={style}
        poster={posterUrl || undefined}
        tabIndex={-1}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        {...(stripPlaybackManaged
          ? { "data-strip-playback-managed": "" }
          : {})}
        onError={onVideoError}
        onLoadedData={onLoadedData}
        onLoadedMetadata={onLoadedMetadata}
      />
    );

    if (!deferMount) {
      return v;
    }

    return (
      <div className={wrapClassName} ref={wrapRef}>
        {v}
      </div>
    );
  }),
  (prev, next) =>
    prev.deferMount === next.deferMount &&
    prev.stripLoadOrder === next.stripLoadOrder &&
    prev.stripPlaybackManaged === next.stripPlaybackManaged &&
    prev.wrapClassName === next.wrapClassName &&
    prev.className === next.className &&
    prev.style === next.style &&
    prev.playbackId === next.playbackId &&
    prev.tokens === next.tokens &&
    prev.narrowViewport === next.narrowViewport &&
    prev.onError === next.onError &&
    prev.onLoadedData === next.onLoadedData &&
    prev.onLoadedMetadata === next.onLoadedMetadata &&
    prev.onThumbnailNaturalSize === next.onThumbnailNaturalSize,
);

/**
 * Strip: load order from `stripLoadOrder` when `STRIP_MUX_LOAD_LIMIT_ENABLED` (code toggle).
 * DRM (`tokens.drm`) is not supported.
 */
export const MuxStripHlsVideo = memo(
  function MuxStripHlsVideo({
    className,
    narrowViewport = false,
    onError,
    onLoadedMetadata,
    onThumbnailNaturalSize,
    playbackId,
    stripLoadOrder,
    tokens,
  }) {
    return (
      <MuxHlsVideo
        className={className}
        deferMount
        narrowViewport={narrowViewport}
        stripLoadOrder={stripLoadOrder}
        stripPlaybackManaged
        wrapClassName="asset-tile__mux-wrap"
        onError={onError}
        onLoadedMetadata={onLoadedMetadata}
        onThumbnailNaturalSize={onThumbnailNaturalSize}
        playbackId={playbackId}
        tokens={tokens}
      />
    );
  },
  (prev, next) =>
    muxHlsDefaultCompare(prev, next) &&
    prev.onLoadedMetadata === next.onLoadedMetadata &&
    prev.onThumbnailNaturalSize === next.onThumbnailNaturalSize,
);
