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

/**
 * Mux HLS URL (public or signed via `tokens.playback` JWT).
 * `min_resolution` + `rendition_order=desc` bias the master playlist toward high
 * rungs so display size / layout changes do not lock playback to tiny renditions.
 * @see https://docs.mux.com/guides/control-playback-resolution
 */
export function muxPlaybackM3u8Url(playbackId, tokens) {
  const id = typeof playbackId === "string" ? playbackId.trim() : "";
  if (!id) return "";
  const base = `https://stream.mux.com/${id}.m3u8`;
  const params = new URLSearchParams();
  params.set("min_resolution", "720p");
  params.set("rendition_order", "desc");
  const jwt =
    typeof tokens?.playback === "string" ? tokens.playback.trim() : "";
  if (jwt.length > 0) {
    params.set("token", jwt);
  }
  return `${base}?${params.toString()}`;
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
  prev.onError === next.onError &&
  prev.stripLoadOrder === next.stripLoadOrder;

/**
 * Native &lt;video&gt; + hls.js (no mux-player). Muted, looping, no controls.
 * @param {object} props
 * @param {boolean} [props.deferMount] When true, use strip load scheduling (see `muxStripLoadScheduler.js`).
 * @param {number} [props.stripLoadOrder] List index in the strip (0 = top); only when limiter is on.
 * @param {string} [props.wrapClassName] Wrapper class when `deferMount` (e.g. tile stand-in).
 * @param {import('react').CSSProperties} [props.style] Inline style on the video (lightbox sizing).
 * @param {() => void} [props.onLoadedData]
 * @param {() => void} [props.onLoadedMetadata]
 */
export const MuxHlsVideo = memo(
  forwardRef(function MuxHlsVideo(
    {
      className,
      style,
      deferMount = false,
      stripLoadOrder,
      wrapClassName = "asset-tile__mux-wrap",
      onError: onErrorProp,
      onLoadedData,
      onLoadedMetadata,
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
    const src = useMemo(() => {
      if (!tokenPlayback) {
        return muxPlaybackM3u8Url(playbackId, undefined);
      }
      return muxPlaybackM3u8Url(playbackId, { playback: tokenPlayback });
    }, [playbackId, tokenPlayback]);
    const onErrorRef = useRef(onErrorProp);
    onErrorRef.current = onErrorProp;

    useEffect(() => {
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
    }, [deferMount, show]);

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
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            onErrorRef.current?.();
            releaseStripSlotOnce();
          }
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
          <div className="asset-tile__mux-standin" aria-hidden />
        </div>
      );
    }

    const v = (
      <video
        ref={setVideoRef}
        className={className}
        style={style}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        onError={onErrorProp}
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
    prev.wrapClassName === next.wrapClassName &&
    prev.className === next.className &&
    prev.style === next.style &&
    prev.playbackId === next.playbackId &&
    prev.tokens === next.tokens &&
    prev.onError === next.onError &&
    prev.onLoadedData === next.onLoadedData &&
    prev.onLoadedMetadata === next.onLoadedMetadata,
);

/**
 * Strip: load order from `stripLoadOrder` when `STRIP_MUX_LOAD_LIMIT_ENABLED` (code toggle).
 * DRM (`tokens.drm`) is not supported.
 */
export const MuxStripHlsVideo = memo(
  function MuxStripHlsVideo({ className, onError, playbackId, stripLoadOrder, tokens }) {
    return (
      <MuxHlsVideo
        className={className}
        deferMount
        stripLoadOrder={stripLoadOrder}
        wrapClassName="asset-tile__mux-wrap"
        onError={onError}
        playbackId={playbackId}
        tokens={tokens}
      />
    );
  },
  muxHlsDefaultCompare,
);
