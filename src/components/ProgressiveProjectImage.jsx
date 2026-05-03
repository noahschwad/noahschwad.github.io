import { useCallback, useState } from "react";
import { projectAssetThumbUrl } from "../imageThumbUrl";

/**
 * Low-res `*.thumb.webp` (build-generated) while full-res loads, then the thumb
 * is removed. Falls back to a single `img` when there is no thumb or the thumb 404s.
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
        onLoad={onLoadFull}
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
