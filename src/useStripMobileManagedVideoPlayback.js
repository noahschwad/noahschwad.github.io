import { useEffect } from "react";

/** Same breakpoint as `imageSizeViewportNarrow` in `App.jsx`. */
export const STRIP_MANAGED_VIDEO_PLAYBACK_MQ = "(max-width: 599px)";
export const STRIP_MANAGED_VIDEO_MAX_PLAYING = 7;

const VIDEO_TILE_ITEM_SELECTOR =
  'li.selected-strip__item:has(.asset-tile__media[data-kind="mux"]), li.selected-strip__item:has(.asset-tile__media[data-kind="video"])';

/**
 * @param {HTMLElement} root
 */
function pauseAllManagedVideos(root) {
  root.querySelectorAll("video[data-strip-playback-managed]").forEach((v) => {
    v.pause();
  });
}

/**
 * @param {HTMLElement} root
 */
function playAllManagedVideos(root) {
  root.querySelectorAll("video[data-strip-playback-managed]").forEach((v) => {
    v.play().catch(() => {});
  });
}

/**
 * On narrow viewports: pause strip videos that are off-screen, and keep at most
 * {@link STRIP_MANAGED_VIDEO_MAX_PLAYING} playing (by visible overlap score).
 * Desktop: no-op aside from ensuring managed videos can autoplay freely.
 *
 * @param {object} params
 * @param {import("react").RefObject<HTMLElement|null>} params.stripRef
 * @param {boolean} params.narrowViewport matches `STRIP_MANAGED_VIDEO_PLAYBACK_MQ`
 * @param {boolean} params.lightboxOpen when true, observer is torn down (strip already paused)
 * @param {unknown[]} params.stripTiles strip list; changes rescans observed items
 */
export function useStripMobileManagedVideoPlayback({
  stripRef,
  narrowViewport,
  lightboxOpen,
  stripTiles,
}) {
  useEffect(() => {
    const root = stripRef.current;
    const enabled = narrowViewport && !lightboxOpen;

    if (!enabled) {
      if (root && !narrowViewport) {
        playAllManagedVideos(root);
      }
      return undefined;
    }

    if (!root) return undefined;

    /** @type {HTMLElement[]} */
    let observedItems = [];
    /** @type {Map<HTMLElement, IntersectionObserverEntry>} */
    const lastEntryByLi = new Map();

    const reconcile = () => {
      /** @type {{ video: HTMLVideoElement; score: number }[]} */
      const candidates = [];
      for (const li of observedItems) {
        const entry = lastEntryByLi.get(li);
        if (!entry || !entry.isIntersecting) continue;
        const video = li.querySelector("video[data-strip-playback-managed]");
        if (!(video instanceof HTMLVideoElement)) continue;
        const ir = entry.intersectionRect;
        const area = Math.max(0, ir.width) * Math.max(0, ir.height);
        const score = entry.intersectionRatio * area;
        if (score <= 0) continue;
        candidates.push({ video, score });
      }
      candidates.sort((a, b) => b.score - a.score);
      const playSet = new Set(
        candidates
          .slice(0, STRIP_MANAGED_VIDEO_MAX_PLAYING)
          .map((c) => c.video),
      );
      root.querySelectorAll("video[data-strip-playback-managed]").forEach((v) => {
        if (playSet.has(v)) {
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target instanceof HTMLElement) {
            lastEntryByLi.set(e.target, e);
          }
        }
        reconcile();
      },
      {
        root: null,
        rootMargin: "0px",
        threshold: [0, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1],
      },
    );

    const collectAndObserve = () => {
      for (const li of observedItems) {
        observer.unobserve(li);
      }
      observedItems = [];
      lastEntryByLi.clear();

      root.querySelectorAll(VIDEO_TILE_ITEM_SELECTOR).forEach((node) => {
        if (node instanceof HTMLElement) {
          observedItems.push(node);
          observer.observe(node);
        }
      });

      pauseAllManagedVideos(root);
      reconcile();
    };

    let moDebounce = 0;
    const mutationObserver = new MutationObserver(() => {
      window.clearTimeout(moDebounce);
      moDebounce = window.setTimeout(() => {
        collectAndObserve();
      }, 80);
    });

    collectAndObserve();
    mutationObserver.observe(root, { childList: true, subtree: true });

    const onResize = () => {
      window.requestAnimationFrame(() => reconcile());
    };
    window.addEventListener("resize", onResize);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        reconcile();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(moDebounce);
      mutationObserver.disconnect();
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      observedItems = [];
      lastEntryByLi.clear();
    };
  }, [stripRef, narrowViewport, lightboxOpen, stripTiles]);
}
