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
import { ProgressiveProjectImage } from "./ProgressiveProjectImage";
import { createPortal } from "react-dom";
import { getProjectAssetsInOrder } from "../data/projects";
import { getTextTileBodyProps } from "../renderTextWithLineBreaks";

/** Open/close fade; must match `.lightbox__scrim` / `.lightbox__body` opacity transition (0.4s). */
const LIGHTBOX_FADE_MS = 400;
const SLIDE_MS = 420;
const REDUCED = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

function LightboxNavArrowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="21"
      height="11"
      viewBox="0 0 21 11"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M0 5.35352H20M20 5.35352L15 0.353516M20 5.35352L15 10.3535"
        stroke="currentColor"
      />
    </svg>
  );
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

/** Movement at or below this (px) counts as a tap: only a tap on the adjacent slide goes prev/next; above = drag. Stray `click` after track gestures is swallowed on the track. */
const CAROUSEL_DRAG_DISMISS_SUPPRESS_PX = 8;

/** Pointer `dx` vs carousel width to advance one slide (else snap back to current). */
const LIGHTBOX_CAROUSEL_DRAG_COMMIT_FRACTION = 0.2;

/** Max distance (px) from viewport bottom to the nav midpoint — keeps arrows from sitting too high in a tall gap. */
const LIGHTBOX_NAV_MAX_FROM_VIEWPORT_BOTTOM_PX = 40;

/**
 * True when the event path hits media, text, nav, or the “media unavailable” box.
 * Used for click-to-dismiss and for `pointerdown` (capture), because `setPointerCapture`
 * on the track can retarget the following `click` away from `IMG`/`VIDEO`.
 */
function lightboxPathKeepsDialogOpen(path) {
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    const t = node.tagName;
    if (t === "IMG" || t === "VIDEO") return true;
    if (node.classList?.contains("lightbox__text")) return true;
    if (node.classList?.contains("lightbox__media")) return true;
    if (node.classList?.contains("lightbox__btn")) return true;
  }
  return false;
}

function lightboxClickShouldKeepOpen(e) {
  return lightboxPathKeepsDialogOpen(getEventComposedPath(e));
}

/**
 * Resolve simple lengths from `--lightbox-media-inset` etc. (`20vw`, `12px`, `1.5rem`).
 * `Number.parseFloat("20vw")` is wrong (20); this matches `.lightbox__media` max-width math.
 */
function parseCssLengthToPixels(raw, widthBasePx, heightBasePx) {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const m = s.match(/^(-?[\d.]+)\s*(%|px|em|rem|vw|vh|dvw|dvh|svw|svh|lvw|lvh)?$/i);
  if (!m) return 0;
  const n = Number.parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const u = (m[2] || "px").toLowerCase();
  switch (u) {
    case "px":
      return n;
    case "%":
      return (n / 100) * widthBasePx;
    case "vw":
    case "dvw":
    case "svw":
    case "lvw":
      return (n / 100) * widthBasePx;
    case "vh":
    case "dvh":
    case "svh":
    case "lvh":
      return (n / 100) * heightBasePx;
    case "rem":
      return (
        n *
        (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
      );
    case "em":
      return n * 16;
    default:
      return n;
  }
}

/** Which `.lightbox__slide` (index in `track.children`) is topmost under the point, or `-1`. */
function tapHitSlideIndex(track, clientX, clientY) {
  if (!(track instanceof Element)) return -1;
  if (typeof document.elementsFromPoint !== "function") return -1;
  const stack = document.elementsFromPoint(clientX, clientY);
  if (!stack?.length) return -1;
  for (const el of stack) {
    if (!(el instanceof Element)) continue;
    const slide = el.closest?.(".lightbox__slide");
    if (slide && track.contains(slide)) {
      return [...track.children].indexOf(slide);
    }
  }
  return -1;
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
    const viewW = window.innerWidth;
    const viewH =
      typeof window !== "undefined" && window.visualViewport?.height
        ? window.visualViewport.height
        : window.innerHeight;
    const insetPx = parseCssLengthToPixels(insetRaw, viewW, viewH);
    const maxW = Math.max(1, viewW - insetPx);
    const maxH = Math.max(1, viewH - insetPx);
    if (!(maxW > 0) || !(maxH > 0)) return;

    const vidW = Number(player.videoWidth) || 0;
    const vidH = Number(player.videoHeight) || 0;
    if (vidW > 0 && vidH > 0) {
      muxAspectRef.current = vidW / vidH;
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
        tabIndex={-1}
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
    <ProgressiveProjectImage
      fullSrc={asset.src}
      className={className}
      stackClass="lightbox__img-stack"
      alt=""
      draggable={false}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onLoadFull={fire}
      onErrorFull={() => setFailed(true)}
      fetchPriority={priority ? "high" : undefined}
    />
  );
}

/**
 * @param {object} props
 * @param {import("../data/projects").projects[number]} props.project
 * @param {object} props.initialAsset
 * @param {() => void} props.onClose
 * @param {() => void} [props.onAfterOpenFade] After scrim/body fade-in (`LIGHTBOX_FADE_MS`).
 * @param {() => void} [props.onExitStart] First thing when closing (before fade-out); e.g. resume strip videos.
 */
export function ProjectLightbox({
  project,
  initialAsset,
  onClose,
  onAfterOpenFade,
  onExitStart,
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const prevId = `lb-prev-${id}`;
  const nextId = `lb-next-${id}`;
  const [exiting, setExiting] = useState(false);
  const [reveal, setReveal] = useState(false);
  const rootRef = useRef(null);
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [m, setM] = useState({
    idealT: [],
    tMax: 0,
    tMin: 0,
    n: 0,
    viewportW: 0,
  });
  /** `null` when not dragging; else live translateX (px) while dragging. */
  const [dragT, setDragT] = useState(null);
  const dragTRef = useRef(null);
  const drag = useRef({ startX: 0, startT: 0 });
  /** One synthetic `click` after a carousel drag/tap; stopped on the track (not on Prev/Next). */
  const suppressNextTrackClickBubbleFromDragRef = useRef(false);
  const trackClickSuppressClearTimerRef = useRef(0);
  /** Set in `pointerdown` capture on body; avoids bogus dismiss after track `setPointerCapture`. */
  const pointerDownKeepsDialogOpenRef = useRef(false);
  const closeTimer = useRef(null);
  const exitingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onExitStartRef = useRef(onExitStart);
  onExitStartRef.current = onExitStart;
  const onAfterOpenFadeRef = useRef(onAfterOpenFade);
  onAfterOpenFadeRef.current = onAfterOpenFade;
  const remeasureRaf = useRef(0);
  /** Viewport Y (px) of midpoint between carousel bottom and viewport bottom; drives fixed nav. */
  const [navMidpointPx, setNavMidpointPx] = useState(null);

  const updateNavMidpoint = useCallback(() => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const gap = Math.max(0, vh - rect.bottom);
    const rawMid = rect.bottom + gap / 2;
    const minMidY = vh - LIGHTBOX_NAV_MAX_FROM_VIEWPORT_BOTTOM_PX;
    setNavMidpointPx(Math.max(rawMid, minMidY));
  }, []);

  const runClose = useCallback(() => {
    if (exitingRef.current) return;
    onExitStartRef.current?.();
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
    const root = rootRef.current;
    if (!t) return;
    const next = measureTrack(t);
    setM((prev) => {
      if (prev.n === next.n && next.idealT.length) {
        let same = true;
        if (Math.abs((prev.viewportW ?? 0) - next.viewportW) > 0.25) {
          same = false;
        }
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
        viewportW: next.viewportW,
      };
    });

    /** Cap carousel / body to the tallest slide so the shell is not taller than the assets. */
    if (root instanceof HTMLElement) {
      let maxH = 0;
      for (const slide of t.children) {
        if (!(slide instanceof HTMLElement)) continue;
        const cell = slide.querySelector(".lightbox__slideCell");
        if (!(cell instanceof HTMLElement)) continue;
        maxH = Math.max(maxH, cell.getBoundingClientRect().height);
      }
      if (maxH > 8) {
        root.style.setProperty(
          "--lightbox-body-content-max",
          `${Math.ceil(maxH)}px`,
        );
      } else {
        root.style.removeProperty("--lightbox-body-content-max");
      }
    }
    updateNavMidpoint();
  }, [updateNavMidpoint]);

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
  }, [runMeasure, scheduleRemeasure, count]);

  const open = reveal && !exiting;

  const displayT =
    dragT != null
      ? dragT
      : m.idealT[activeIndex] != null
        ? m.idealT[activeIndex]
        : 0;

  useLayoutEffect(() => {
    if (!open) {
      setNavMidpointPx(null);
      return undefined;
    }
    updateNavMidpoint();
    window.addEventListener("resize", updateNavMidpoint);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", updateNavMidpoint);
    vv?.addEventListener("scroll", updateNavMidpoint);
    return () => {
      window.removeEventListener("resize", updateNavMidpoint);
      vv?.removeEventListener("resize", updateNavMidpoint);
      vv?.removeEventListener("scroll", updateNavMidpoint);
    };
  }, [open, updateNavMidpoint]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => updateNavMidpoint());
    return () => cancelAnimationFrame(id);
  }, [open, activeIndex, displayT, exiting, dragT, updateNavMidpoint]);

  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => {
      onAfterOpenFadeRef.current?.();
    }, LIGHTBOX_FADE_MS);
    return () => window.clearTimeout(id);
  }, [open]);

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

  const onLightboxBodyPointerDownCapture = useCallback((e) => {
    pointerDownKeepsDialogOpenRef.current = lightboxPathKeepsDialogOpen(
      getEventComposedPath(e),
    );
  }, []);

  const onLightboxBodyClick = useCallback(
    (e) => {
      if (pointerDownKeepsDialogOpenRef.current) {
        pointerDownKeepsDialogOpenRef.current = false;
        return;
      }
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
    /** Swallow the synthetic `click` after track gestures so body click-to-dismiss does not run. */
    if (m.n >= 2) {
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
    const W = m.viewportW ?? 0;
    const thresh = LIGHTBOX_CAROUSEL_DRAG_COMMIT_FRACTION * W;
    let best = activeIndex;
    const tap =
      m.n >= 2 && Math.abs(dx) <= CAROUSEL_DRAG_DISMISS_SUPPRESS_PX;
    if (tap) {
      const trackEl = e.currentTarget;
      const hit = tapHitSlideIndex(trackEl, e.clientX, e.clientY);
      if (hit === activeIndex - 1) {
        best = activeIndex - 1;
      } else if (hit === activeIndex + 1) {
        best = activeIndex + 1;
      }
      /* else: current slide, gap, or non-adjacent — stay on `activeIndex` */
    } else if (W > 0 && thresh > 0) {
      if (dx <= -thresh && activeIndex < m.n - 1) {
        best = activeIndex + 1;
      } else if (dx >= thresh && activeIndex > 0) {
        best = activeIndex - 1;
      }
    } else {
      let bestD = Math.abs(m.idealT[0] - t);
      best = 0;
      for (let i = 1; i < m.idealT.length; i += 1) {
        const d = Math.abs(m.idealT[i] - t);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
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
      <div
        className="lightbox__body"
        onPointerDownCapture={onLightboxBodyPointerDownCapture}
        onClick={onLightboxBodyClick}
      >
        <div
          className="lightbox__carousel"
          ref={containerRef}
          role="region"
          aria-label="Project images"
        >
          <div className="lightbox__carousel-stage">
            <div
              ref={trackRef}
              className={trackClass}
              style={{
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
        </div>
        <div
          className="lightbox__bar"
          style={
            open && navMidpointPx != null
              ? {
                  position: "fixed",
                  left: "50%",
                  top: `${navMidpointPx}px`,
                  transform: "translate(-50%, -50%)",
                  zIndex: 4,
                }
              : undefined
          }
        >
          <button
            type="button"
            className="lightbox__btn lightbox__btn--prev"
            id={prevId}
            aria-label="Previous"
            tabIndex={-1}
            disabled={count < 2 || activeIndex === 0}
            onClick={goPrev}
          >
            <span className="lightbox__btn-icon" aria-hidden="true">
              <LightboxNavArrowIcon />
            </span>
          </button>
          <button
            type="button"
            className="lightbox__btn lightbox__btn--next"
            id={nextId}
            aria-label="Next"
            tabIndex={-1}
            disabled={count < 2 || activeIndex >= count - 1}
            onClick={goNext}
          >
            <span className="lightbox__btn-icon" aria-hidden="true">
              <LightboxNavArrowIcon />
            </span>
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
