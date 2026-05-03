import { getSelectedAssets } from "../data/projects";
import { getTextTileBodyProps } from "../renderTextWithLineBreaks";
import { IntroFooterBlurbs } from "./SiteIntro";

/**
 * Static footer: copyright from `staticSiteFooter` in `projects.js`, plus optional
 * contact and recognition from `introProject` (`staticSiteIntro`) in one column.
 */
export function SiteFooter({ project, introProject }) {
  if (!project?.staticSiteFooter) return null;
  const asset =
    project.assets?.find((a) => a.id === "copyright-text") ??
    getSelectedAssets(project)[0];
  if (!asset) return null;

  const contact = introProject?.assets?.find((a) => a.id === "contact");
  const recognition = introProject?.assets?.find((a) => a.id === "recognition");

  return (
    <footer
      className="site-footer"
      aria-label="Contact, credits, and copyright"
    >
      <div className="site-footer__stack">
        <IntroFooterBlurbs contact={contact} recognition={recognition} />
        <div
          className="site-footer__inner"
          {...getTextTileBodyProps(asset.text, asset.textHtml)}
        />
      </div>
    </footer>
  );
}
