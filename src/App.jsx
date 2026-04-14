import { useState } from "react";
import { AssetTile } from "./components/AssetTile";
import {
  ControlPanel,
  imageSizeRange,
  textSizeRange,
} from "./components/ControlPanel";
import { getSelectedAssets, projects } from "./data/projects";
import "./App.css";

export function App() {
  const [textSize, setTextSize] = useState(textSizeRange.defaultValue);
  const [imageSize, setImageSize] = useState(imageSizeRange.defaultValue);

  const tiles = projects.flatMap((project) =>
    getSelectedAssets(project).map((asset) => ({ project, asset })),
  );

  return (
    <div
      className="app-root"
      style={{
        "--panel-text-size": String(textSize),
        "--panel-image-size": String(imageSize),
      }}
    >
      <ControlPanel
        textSize={textSize}
        onTextSize={setTextSize}
        imageSize={imageSize}
        onImageSize={setImageSize}
      />
      <main id="main" className="app">
        <ul className="selected-strip" aria-label="Selected work">
          {tiles.map(({ project, asset }) => (
            <li key={`${project.id}-${asset.id}`} className="selected-strip__item">
              <AssetTile project={project} asset={asset} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
