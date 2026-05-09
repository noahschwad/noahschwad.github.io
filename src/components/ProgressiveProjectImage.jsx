import { useCallback, useState } from "react";
import { projectAssetThumbUrl } from "../imageThumbUrl";

/**
 * Low-res `*.thumb.webp` (build-generated) while full-res loads, then the thumb
 * is removed. Falls back to a single `img` when there is no thumb or the thumb 404s.
 * @param {(naturalWidth: number, naturalHeight: number) => void} [onIntrinsicLayoutReady]
 *   After the thumb (or full-only `img`) decodes so layout can reserve the correct aspect ratio.
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
  fetchPriority,
  onIntrinsicLayoutReady,
}) {
  const thumbFromPath = projectAssetThumbUrl(fullSrc);
  const [noThumb, setNoThumb] = useState(!thumbFromPath);
  const [fullLoaded, setFullLoaded] = useState(false);

  const onThumbError = useCallback(() => {
    setNoThumb(true);
  }, []);

  const onFullLoad = useCallback(
    (e) => {
      setFullLoaded(true);
      onLoadFull?.(e);
    },
    [onLoadFull],
  );

  const reportIntrinsic = useCallback(
    (e) => {
      const el = e.currentTarget;
      const w = el.naturalWidth || 0;
      const h = el.naturalHeight || 0;
      if (w > 0 && h > 0) onIntrinsicLayoutReady?.(w, h);
    },
    [onIntrinsicLayoutReady],
  );

  if (noThumb || !thumbFromPath) {
    return (
      <img
        className={className}
        src={fullSrc}
        alt={alt}
        tabIndex={-1}
        loading={loading}
        decoding={decoding}
        draggable={draggableProp}
        onLoad={(e) => {
          reportIntrinsic(e);
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
          className={thumbCls}
          src={thumbFromPath}
          alt=""
          aria-hidden
          tabIndex={-1}
          loading={loading}
          decoding="async"
          draggable={false}
          onError={onThumbError}
          onLoad={reportIntrinsic}
        />
      ) : null}
      <img
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
