import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { projectAssetThumbUrl } from "../imageThumbUrl";

/**
 * Low-res `*.thumb.webp` (build-generated) while full-res loads, then the thumb
 * is removed. Falls back to a single `img` when there is no thumb or the thumb 404s.
 * @param {(naturalWidth: number, naturalHeight: number) => void} [onNaturalSize] When a decoded `<img>` has intrinsic size (thumb and/or full).
 */
export function ProgressiveProjectImage({
  fullSrc,
  className = "",
  alt = "",
  loading = "lazy",
  decoding = "async",
  draggable: draggableProp,
  stackClass = "",
  thumbClass = "",
  fullClass = "",
  onLoadFull,
  onErrorFull,
  onNaturalSize,
  fetchPriority,
}) {
  const thumbFromPath = projectAssetThumbUrl(fullSrc);
  const [noThumb, setNoThumb] = useState(!thumbFromPath);
  const [fullLoaded, setFullLoaded] = useState(false);
  const thumbImgRef = useRef(null);
  const fullImgRef = useRef(null);
  const singleImgRef = useRef(null);

  const onThumbError = useCallback(() => {
    setNoThumb(true);
  }, []);

  const notifyNaturalSize = useCallback(
    (img) => {
      if (!img || !img.complete) return;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (nw > 0 && nh > 0) onNaturalSize?.(nw, nh);
    },
    [onNaturalSize],
  );

  const fireNaturalSize = useCallback(
    (e) => {
      notifyNaturalSize(e.currentTarget);
    },
    [notifyNaturalSize],
  );

  /* Cached decode often skips `onLoad`; sync intrinsic size after paint (thumb then full). */
  useLayoutEffect(() => {
    if (noThumb || !thumbFromPath) {
      notifyNaturalSize(singleImgRef.current);
      return;
    }
    if (!fullLoaded) {
      notifyNaturalSize(thumbImgRef.current);
    }
    notifyNaturalSize(fullImgRef.current);
  }, [
    noThumb,
    fullLoaded,
    thumbFromPath,
    fullSrc,
    notifyNaturalSize,
  ]);

  const onFullLoad = useCallback(
    (e) => {
      setFullLoaded(true);
      fireNaturalSize(e);
      onLoadFull?.(e);
    },
    [onLoadFull, fireNaturalSize],
  );

  if (noThumb || !thumbFromPath) {
    return (
      <img
        ref={singleImgRef}
        className={className}
        src={fullSrc}
        alt={alt}
        tabIndex={-1}
        loading={loading}
        decoding={decoding}
        draggable={draggableProp}
        onLoad={(e) => {
          fireNaturalSize(e);
          onLoadFull?.(e);
        }}
        onError={onErrorFull}
        fetchPriority={fetchPriority}
      />
    );
  }

  const fullCls = [className, fullClass, "project-image-stack__full", fullLoaded && "is-loaded"]
    .filter(Boolean)
    .join(" ");
  const stackCls = ["project-image-stack", stackClass].filter(Boolean).join(" ");
  const thumbCls = [className, thumbClass, "project-image-stack__thumb"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={stackCls}>
      {!fullLoaded ? (
        <img
          ref={thumbImgRef}
          className={thumbCls}
          src={thumbFromPath}
          alt=""
          aria-hidden
          tabIndex={-1}
          loading={loading}
          decoding="async"
          draggable={false}
          onError={onThumbError}
          onLoad={fireNaturalSize}
        />
      ) : null}
      <img
        ref={fullImgRef}
        className={fullCls}
        src={fullSrc}
        alt={alt}
        tabIndex={-1}
        loading={loading}
        decoding={decoding}
        draggable={draggableProp}
        onLoad={onFullLoad}
        onError={onErrorFull}
        fetchPriority={fetchPriority}
      />
    </div>
  );
}
