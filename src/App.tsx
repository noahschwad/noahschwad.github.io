import { AssetTile } from "./components/AssetTile";
import { getSelectedAssets, projects } from "./data/projects";
import "./App.css";

export function App() {
  const tiles = projects.flatMap((project) =>
    getSelectedAssets(project).map((asset) => ({ project, asset })),
  );

  return (
    <main id="main" className="app">
      <ul className="selected-strip" aria-label="Selected work">
        {tiles.map(({ project, asset }) => (
          <li key={`${project.id}-${asset.id}`} className="selected-strip__item">
            <AssetTile project={project} asset={asset} />
          </li>
        ))}
      </ul>
    </main>
  );
}
