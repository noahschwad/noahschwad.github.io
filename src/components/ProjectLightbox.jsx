import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MuxHlsVideo } from "./MuxStripHlsVideo";
import { createPortal } from "react-dom";
import { getProjectAssetsInOrder } from "../data/projects";
import { getTextTileBodyProps } from "../renderTextWithLineBreaks";

const LIGHTBOX_FADE_MS = 400;
const SLIDE_MS = 420;
const REDUCED = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

function hasSrc(src) {
  return typeof src === "string" && src.trim().length > 0;
}
function hasPlaybackId(id) {
  return typeof id === "string" && id.trim().length > 0;
}
function hasTextBody(s) {
  return typeof s === "string" && s.trim().length > 0;
}

function assetReady(asset) {
  if (asset.kind === "mux") return hasPlaybackId(asset.playbackId);
  if (asset.kind === "text") return hasTextBody(asset.text);
  return hasSrc(asset.src);
}

/**
 * Composed event path. React’s synthetic `e` has no `composedPath`; the native
 * event on `e.nativeEvent` does. If that is missing, walk DOM and hop shadow hosts.
 */
function getEventComposedPath(e) {
  const ne = e?.nativeEvent ?? e;
  if (ne && typeof ne.composedPath === "function") {
    try {
      const raw = ne.composedPath();
      if (raw != null && typeof raw[Symbol.iterator] === "function") {
        const p = Array.from(raw);
        if (p.length) return p;
      }
    } catch {
      /* ignore */
    }
  }
  if (e && e !== ne && typeof e.composedPath === "function") {
    try {
      const raw = e.composedPath();
      if (raw != null && typeof raw[Symbol.iterator] === "function") {
        const p = Array.from(raw);
        if (p.length) return p;
      }
    } catch {
      /* ignore */
    }
  }
  const out = [];
  let n = e?.target;
  if (n && n.nodeType === 3) n = n.parentElement;
  while (n) {
    out.push(n);
    if (n === document || n === document.documentElement) break;
    const p = n.parentNode;
    if (p) {
      n = p;
    } else {
      const r = n.getRootNode?.();
      if (r && r !== document && r instanceof ShadowRoot) {
        n = r.host;
      } else {
        break;
      }
    }
  }
  return out;
}

/** After a horizontal carousel drag, the browser may emit a stray `click`; we swallow it on the track. */
const CAROUSEL_DRAG_DISMISS_SUPPRESS_PX = 8;

/**
 * True when a body click should not close: actual media, nav
 * buttons, and the lightbox video/img wrapper (incl. “media unavailable” box).
 */
function lightboxClickShouldKeepOpen(e) {
  for (const node of getEventComposedPath(e)) {
    if (!(node instanceof Element)) continue;
    const t = node.tagName;
    if (t === "IMG" || t === "VIDEO") return true;
    if (node.classList?.contains("lightbox__text")) return true;
    if (node.classList?.contains("lightbox__media")) return true;
    if (node.classList?.contains("lightbox__btn")) return true;
  }
  return false;
}

function measureTrack(track) {
  const el = track;
  if (!el) return { centers: [], n: 0, idealT: [], tMax: 0, tMin: 0, viewportW: 0 };
  const container = el.parentElement;
  const W = container?.clientWidth ?? 0;
  const n = el.children.length;
  const centers = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const slide = el.children[i];
    centers[i] = slide.offsetLeft + slide.offsetWidth * 0.5;
  }
  const idealT = centers.map((c) => W * 0.5 - c);
  const tMax = n > 0 ? Math.max(...idealT) : 0;
  const tMin = n > 0 ? Math.min(...idealT) : 0;
  return { centers, n, idealT, tMax, tMin, viewportW: W };
}

function LightboxMedia({ asset, priority, onReady, className }) {
  const [failed, setFailed] = useState(false);
  const muxRef = useRef(null);
  const muxAspectRef = useRef(null);
  const [muxBox, setMuxBox] = useState(null);
  const reported = useRef(false);
  const fire = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onReady?.();
  }, [onReady]);
  const missing = !assetReady(asset) || failed;

  const onMuxError = useCallback(() => setFailed(true), []);

  const muxStyle = useMemo(
    () =>
      muxBox
        ? { width: `${muxBox.width}px`, height: `${muxBox.height}px` }
        : undefined,
    [muxBox],
  );

  const measureMuxBox = useCallback(() => {
    const player = muxRef.current;
    if (!player) return;
    const lightbox = player.closest(".lightbox");
    const insetRaw =
      lightbox instanceof HTMLElement
        ? getComputedStyle(lightbox).getPropertyValue("--lightbox-media-inset")
        : "";
    const inset = Number.parseFloat(insetRaw) || 100;
    const maxW = Math.max(1, window.innerWidth - inset);
    const maxH = Math.max(1, window.innerHeight - inset);
    if (!(maxW > 0) || !(maxH > 0)) return;

    const vw = Number(player.videoWidth) || 0;
    const vh = Number(player.videoHeight) || 0;
    if (vw > 0 && vh > 0) {
      muxAspectRef.current = vw / vh;
    }
    const aspect = muxAspectRef.current;
    if (!(aspect > 0)) {
      setMuxBox(null);
      return;
    }

    let width = maxW;
    let height = width / aspect;
    if (height > maxH) {
      height = maxH;
      width = height * aspect;
    }
    const next = {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
    setMuxBox((prev) => {
      if (prev && prev.width === next.width && prev.height === next.height) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (missing) fire();
  }, [missing, fire]);

  useEffect(() => {
    if (asset.kind === "text" && !missing) fire();
  }, [asset.kind, missing, fire]);

  useEffect(() => {
    if (asset.kind !== "mux" || missing) return undefined;
    measureMuxBox();
    const player = muxRef.current;
    const lightbox = player?.closest(".lightbox");
    if (!(lightbox instanceof HTMLElement)) return undefined;
    const ro = new ResizeObserver(() => measureMuxBox());
    ro.observe(lightbox);
    const onWinResize = () => measureMuxBox();
    window.addEventListener("resize", onWinResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
    };
  }, [asset.kind, missing, measureMuxBox]);

  if (missing) {
    return <div className={className}>Media unavailable</div>;
  }
  if (asset.kind === "mux") {
    return (
      <MuxHlsVideo
        ref={muxRef}
        className={className}
        style={muxStyle}
        playbackId={asset.playbackId.trim()}
        tokens={asset.tokens}
        onLoadedMetadata={measureMuxBox}
        onLoadedData={fire}
        onError={onMuxError}
      />
    );
  }
  if (asset.kind === "video") {
    return (
      <video
        className={className}
        src={asset.src}
        muted
        loop
        playsInline
        autoPlay
        preload={priority ? "auto" : "metadata"}
        onLoadedData={fire}
        onError={() => setFailed(true)}
      />
    );
  }
  if (asset.kind === "text") {
    const textTileLarge = asset.textLarge !== false;
    return (
      <p
        className={`${className} lightbox__text${
          textTileLarge ? " lightbox__text--large" : ""
        }`}
        {...getTextTileBodyProps(asset.text, asset.textHtml)}></p>
    );
  }
  return (
    <img
      className={className}
      src={asset.src}
      alt=""
      draggable={false}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onLoad={fire}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * @param {object} props
 * @param {import("../data/projects").projects[number]} props.project
 * @param {object} props.initialAsset
 * @param {() => void} props.onClose
 */
export function ProjectLightbox({ project, initialAsset, onClose }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const prevId = `lb-prev-${id}`;
  const nextId = `lb-next-${id}`;
  const [exiting, setExiting] = useState(false);
  const [reveal, setReveal] = useState(false);
  const rootRef = useRef(null);
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const [spaceBetween, setSpaceBetween] = useState(64);
  const [activeIndex, setActiveIndex] = useState(0);
  const [m, setM] = useState({
    idealT: [],
    tMax: 0,
    tMin: 0,
    n: 0,
  });
  /** `null` when not dragging; else live translateX (px) while dragging. */
  const [dragT, setDragT] = useState(null);
  const dragTRef = useRef(null);
  const drag = useRef({ startX: 0, startT: 0 });
  /** One synthetic `click` after a carousel drag; stopped on the track (not on Prev/Next). */
  const suppressNextTrackClickBubbleFromDragRef = useRef(false);
  const trackClickSuppressClearTimerRef = useRef(0);
  const closeTimer = useRef(null);
  const exitingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const remeasureRaf = useRef(0);

  const runClose = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      onCloseRef.current();
    }, LIGHTBOX_FADE_MS);
  }, []);

  const assets = getProjectAssetsInOrder(project);
  const initialIndex = Math.max(0, assets.findIndex((a) => a.id === initialAsset.id));
  const count = assets.length;

  useLayoutEffect(() => {
    setSpaceBetween((parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) * 4);
  }, []);

  useLayoutEffect(() => {
    setActiveIndex(initialIndex);
  }, [initialIndex]);

  useLayoutEffect(() => {
    const id0 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setReveal(true));
    });
    return () => cancelAnimationFrame(id0);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const sbw = Math.max(0, window.innerWidth - html.clientWidth);
    const supportsStableGutter =
      typeof CSS !== "undefined" && typeof CSS.supports === "function"
        ? CSS.supports("scrollbar-gutter: stable")
        : false;

    const prevBodyOverflow = body.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;
    const prevHtmlOverflow = html.style.overflow;

    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    if (!supportsStableGutter && sbw > 0) {
      body.style.paddingRight = `${sbw}px`;
    }

    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
      html.style.overflow = prevHtmlOverflow;
    };
  }, []);

  const runMeasure = useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    const next = measureTrack(t);
    setM((prev) => {
      if (prev.n === next.n && next.idealT.length) {
        let same = true;
        for (let i = 0; i < next.idealT.length; i += 1) {
          if (Math.abs((prev.idealT[i] ?? 0) - next.idealT[i]) > 0.25) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return {
        idealT: next.idealT,
        tMax: next.tMax,
        tMin: next.tMin,
        n: next.n,
      };
    });
  }, []);

  const scheduleRemeasure = useCallback(() => {
    if (remeasureRaf.current) cancelAnimationFrame(remeasureRaf.current);
    remeasureRaf.current = requestAnimationFrame(() => {
      remeasureRaf.current = 0;
      runMeasure();
    });
  }, [runMeasure]);

  useLayoutEffect(() => {
    const t = trackRef.current;
    if (!t) return undefined;
    runMeasure();
    const ro = new ResizeObserver(() => scheduleRemeasure());
    const c = containerRef.current;
    if (c) ro.observe(c);
    ro.observe(t);
    return () => ro.disconnect();
  }, [runMeasure, scheduleRemeasure, count, spaceBetween]);

  const open = reveal && !exiting;

  useEffect(() => {
    if (!open || count < 1) return undefined;
    const w = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        runClose();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (count < 1 ? 0 : Math.max(0, i - 1)));
        setDragT(null);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (count < 1 ? 0 : Math.min(count - 1, i + 1)));
        setDragT(null);
      }
    };
    window.addEventListener("keydown", w);
    return () => window.removeEventListener("keydown", w);
  }, [open, count, runClose]);

  const displayT =
    dragT != null
      ? dragT
      : m.idealT[activeIndex] != null
        ? m.idealT[activeIndex]
        : 0;

  useLayoutEffect(() => {
    if (m.n < 1) return;
    setActiveIndex((i) => (i > m.n - 1 ? m.n - 1 : i));
  }, [m.n]);

  const goPrev = useCallback(() => {
    if (count < 1) return;
    setActiveIndex((i) => Math.max(0, i - 1));
    setDragT(null);
  }, [count]);
  const goNext = useCallback(() => {
    if (count < 1) return;
    setActiveIndex((i) => Math.min(count - 1, i + 1));
    setDragT(null);
  }, [count]);

  const onScrim = (e) => {
    if (e.target === e.currentTarget) {
      runClose();
    }
  };

  const onLightboxBodyClick = useCallback(
    (e) => {
      if (lightboxClickShouldKeepOpen(e)) return;
      runClose();
    },
    [runClose],
  );

  /** Bubble phase: runs after the target, before `lightbox__body`’s click-to-dismiss. */
  const onTrackClickBubble = useCallback((e) => {
    if (!suppressNextTrackClickBubbleFromDragRef.current) return;
    suppressNextTrackClickBubbleFromDragRef.current = false;
    if (trackClickSuppressClearTimerRef.current) {
      clearTimeout(trackClickSuppressClearTimerRef.current);
      trackClickSuppressClearTimerRef.current = 0;
    }
    e.stopPropagation();
  }, []);

  const onTrackPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (m.n < 2) return;
    const startT = dragT != null ? dragT : m.idealT[activeIndex] ?? 0;
    drag.current = { startX: e.clientX, startT };
    e.currentTarget.setPointerCapture(e.pointerId);
    dragTRef.current = startT;
    setDragT(startT);
  };
  const onTrackPointerMove = (e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const { startX, startT } = drag.current;
    const raw = startT + (e.clientX - startX);
    const t = Math.max(m.tMin, Math.min(m.tMax, raw));
    dragTRef.current = t;
    setDragT(t);
  };
  const onTrackPointerUp = (e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const t = dragTRef.current;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > CAROUSEL_DRAG_DISMISS_SUPPRESS_PX) {
      if (trackClickSuppressClearTimerRef.current) {
        clearTimeout(trackClickSuppressClearTimerRef.current);
        trackClickSuppressClearTimerRef.current = 0;
      }
      suppressNextTrackClickBubbleFromDragRef.current = true;
      trackClickSuppressClearTimerRef.current = window.setTimeout(() => {
        suppressNextTrackClickBubbleFromDragRef.current = false;
        trackClickSuppressClearTimerRef.current = 0;
      }, 200);
    }
    dragTRef.current = null;
    if (t == null || m.idealT.length < 1) {
      setDragT(null);
      return;
    }
    let best = 0;
    let bestD = Math.abs(m.idealT[0] - t);
    for (let i = 1; i < m.idealT.length; i += 1) {
      const d = Math.abs(m.idealT[i] - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setActiveIndex(best);
    setDragT(null);
  };

  useLayoutEffect(() => {
    if (open) {
      rootRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => {
      runMeasure();
    });
    return () => cancelAnimationFrame(id);
  }, [open, runMeasure]);

  const transition =
    dragT == null && !REDUCED ? `transform ${SLIDE_MS}ms ${EASE}` : "transform 0ms";
  const trackClass =
    m.n >= 2 ? `lightbox__track${dragT != null ? " lightbox__track--drag" : ""}` : "lightbox__track";

  useEffect(
    () => () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
      if (trackClickSuppressClearTimerRef.current) {
        clearTimeout(trackClickSuppressClearTimerRef.current);
        trackClickSuppressClearTimerRef.current = 0;
      }
      if (remeasureRaf.current) {
        cancelAnimationFrame(remeasureRaf.current);
      }
    },
    [],
  );

  return createPortal(
    <div
      ref={rootRef}
      className={[
        "lightbox",
        open && "lightbox--entering",
        open && "lightbox--has-carousel",
        exiting && "lightbox--leaving",
      ]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <div className="lightbox__scrim" onClick={onScrim} aria-hidden="true" />
      <div className="lightbox__body" onClick={onLightboxBodyClick}>
        <div
          className="lightbox__carousel"
          ref={containerRef}
          role="region"
          aria-label="Project images"
        >
          <div
            ref={trackRef}
            className={trackClass}
            style={{
              gap: spaceBetween,
              transform: `translate3d(${displayT}px, 0, 0)`,
              transition,
            }}
            onClick={onTrackClickBubble}
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
            onPointerCancel={onTrackPointerUp}
          >
            {assets.map((asset) => (
              <div key={asset.id} className="lightbox__slide">
                <div className="lightbox__slideCell">
                  <LightboxSlideContent
                    asset={asset}
                    initialAsset={initialAsset}
                    onMediaLayout={scheduleRemeasure}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="lightbox__bar">
          <button
            type="button"
            className="lightbox__btn"
            id={prevId}
            aria-label="Previous"
            disabled={count < 2 || activeIndex === 0}
            onClick={goPrev}
          >
            Prev
          </button>
          <button
            type="button"
            className="lightbox__btn"
            id={nextId}
            aria-label="Next"
            disabled={count < 2 || activeIndex >= count - 1}
            onClick={goNext}
          >
            Next
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function LightboxSlideContent({ asset, initialAsset, onMediaLayout }) {
  const isOpenedHere = initialAsset.id === asset.id;
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const onReady = useCallback(() => {
    setMediaLoaded(true);
    onMediaLayout?.();
  }, [onMediaLayout]);
  const show = isOpenedHere || mediaLoaded;
  return (
    <div
      className={
        isOpenedHere
          ? "lightbox__inner lightbox__inner--opener"
          : show
            ? "lightbox__inner lightbox__inner--visible"
            : "lightbox__inner lightbox__inner--pre"
      }
    >
      <LightboxMedia
        className="lightbox__media"
        asset={asset}
        priority={isOpenedHere}
        onReady={onReady}
      />
    </div>
  );
}
