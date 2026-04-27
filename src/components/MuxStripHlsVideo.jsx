import Hls from "hls.js";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** Mux HLS URL (public or signed via `tokens.playback` JWT). */
export function muxPlaybackM3u8Url(playbackId, tokens) {
  const id = typeof playbackId === "string" ? playbackId.trim() : "";
  if (!id) return "";
  const base = `https://stream.mux.com/${id}.m3u8`;
  const jwt =
    typeof tokens?.playback === "string" ? tokens.playback.trim() : "";
  if (jwt.length > 0) return `${base}?token=${encodeURIComponent(jwt)}`;
  return base;
}

function canPlayNativeHls(video) {
  return (
    video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
    video.canPlayType("application/x-mpegURL") !== ""
  );
}

/**
 * Strip-only: native &lt;video&gt; + hls.js (no mux-player). Muted, looping, no controls.
 * Deferred mount via IntersectionObserver. DRM (`tokens.drm`) is not supported here.
 */
export const MuxStripHlsVideo = memo(
  function MuxStripHlsVideo({ className, onError, playbackId, tokens }) {
    const [show, setShow] = useState(false);
    const wrapRef = useRef(null);
    const videoRef = useRef(null);
    const src = useMemo(
      () => muxPlaybackM3u8Url(playbackId, tokens),
      [playbackId, tokens],
    );

    useEffect(() => {
      if (show) return undefined;
      const el = wrapRef.current;
      if (!el) return undefined;
      if (typeof IntersectionObserver === "undefined") {
        setShow(true);
        return undefined;
      }
      const o = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              setShow(true);
              break;
            }
          }
        },
        { root: null, rootMargin: "280px 0px", threshold: 0 },
      );
      o.observe(el);
      return () => o.disconnect();
    }, [show]);

    useEffect(() => {
      if (!show) return undefined;
      const resumeIfNeeded = () => {
        if (document.visibilityState !== "visible") return;
        const v = videoRef.current;
        if (!v || typeof v.play !== "function" || v.ended) return;
        v.play().catch(() => {});
      };
      document.addEventListener("visibilitychange", resumeIfNeeded);
      return () =>
        document.removeEventListener("visibilitychange", resumeIfNeeded);
    }, [show]);

    useLayoutEffect(() => {
      if (!show || !src) return undefined;
      const video = videoRef.current;
      if (!video) return undefined;

      const tryPlay = () => {
        video.play().catch(() => {});
      };

      let hls;
      const teardown = () => {
        video.removeEventListener("loadeddata", tryPlay);
        if (hls) {
          hls.destroy();
          hls = undefined;
        }
        video.removeAttribute("src");
        video.load();
      };

      if (canPlayNativeHls(video)) {
        video.addEventListener("loadeddata", tryPlay, { once: true });
        video.src = src;
        tryPlay();
      } else if (Hls.isSupported()) {
        // Bundlers (Vite) often break hls.js’s default web worker path; main-thread is fine here.
        hls = new Hls({
          enableWorker: false,
          capLevelToPlayerSize: true,
          maxBufferLength: 12,
          maxMaxBufferLength: 24,
        });
        hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) onError?.();
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } else {
        video.addEventListener("loadeddata", tryPlay, { once: true });
        video.src = src;
        tryPlay();
      }

      return teardown;
    }, [show, src, onError]);

    return (
      <div className="asset-tile__mux-wrap" ref={wrapRef}>
        {show ? (
          <video
            ref={videoRef}
            className={className}
            muted
            loop
            playsInline
            autoPlay
            preload="auto"
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            onError={onError}
          />
        ) : (
          <div className="asset-tile__mux-standin" aria-hidden />
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.className === next.className &&
    prev.playbackId === next.playbackId &&
    prev.tokens === next.tokens &&
    prev.onError === next.onError,
);
