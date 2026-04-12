import { useState } from "react";
import type { Project, ProjectAsset } from "../data/projects";

type Props = {
  project: Project;
  asset: ProjectAsset;
};

function hasSrc(src: string | undefined): src is string {
  return typeof src === "string" && src.trim().length > 0;
}

export function AssetTile({ project, asset }: Props) {
  const [mediaFailed, setMediaFailed] = useState(false);
  const missing = !hasSrc(asset.src) || mediaFailed;
  const category = asset.category ?? project.category;

  return (
    <article className="asset-tile">
      <div className="asset-tile__media" data-kind={asset.kind}>
        {missing ? (
          <div className="asset-tile__placeholder" role="img" aria-label="No media loaded">
            {!hasSrc(asset.src) ? "No asset specified" : "Asset missing"}
          </div>
        ) : asset.kind === "video" ? (
          <video
            className="asset-tile__video"
            src={asset.src}
            muted
            loop
            playsInline
            autoPlay
            controls
            onError={() => setMediaFailed(true)}
          />
        ) : (
          <img
            className="asset-tile__img"
            src={asset.src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setMediaFailed(true)}
          />
        )}
      </div>
      <div className="asset-tile__meta">
        <p className="asset-tile__title">{project.title}</p>
        <p className="asset-tile__sub">
          <span>{category}</span>
          <span className="asset-tile__dot" aria-hidden>
            ·
          </span>
          <span>{project.year}</span>
        </p>
      </div>
    </article>
  );
}
