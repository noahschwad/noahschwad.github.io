import { getSelectedAssets } from "../data/projects";
import { getTextTileBodyProps } from "../renderTextWithLineBreaks";

/**
 * Static footer copy (from a `staticSiteFooter` project in `projects.js`). Ignores control-panel sizing.
 */
export function SiteFooter({ project }) {
  if (!project?.staticSiteFooter) return null;
  const asset =
    project.assets?.find((a) => a.id === "copyright-text") ??
    getSelectedAssets(project)[0];
  if (!asset) return null;

  return (
    <footer className="site-footer" aria-label="Copyright and legal">
      <div
        className="site-footer__inner"
        {...getTextTileBodyProps(asset.text, asset.textHtml)}
      />
    </footer>
  );
}
