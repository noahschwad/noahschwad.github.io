import { getTextTileBodyProps } from "../renderTextWithLineBreaks";

/**
 * Static intro copy (from a `staticSiteIntro` project in `projects.js`). Not using
 * control-panel `--panel-text-size` / tile layout; typography is set in `App.css` (`.site-intro`).
 */
export function SiteIntro({ project }) {
  if (!project?.staticSiteIntro) return null;
  const bio = project.assets?.find((a) => a.id === "bio");
  const recognition = project.assets?.find((a) => a.id === "recognition");
  const contact = project.assets?.find((a) => a.id === "contact");

  return (
    <section
      className="site-intro"
      aria-label="About"
    >
      <div className="site-intro__grid">
        {bio && (
          <p
            className={`site-intro__bio${
              bio.textLarge !== false ? " site-intro__bio--large" : ""
            }`}
            {...getTextTileBodyProps(bio.text, bio.textHtml)}
          />
        )}
        {recognition && (
          <div className="site-intro__blurb site-intro__blurb--rec">
            <p
              className="site-intro__blurb-inner"
              {...getTextTileBodyProps(recognition.text, recognition.textHtml)}
            />
          </div>
        )}
        {contact && (
          <div className="site-intro__blurb site-intro__blurb--contact">
            <div
              className="site-intro__blurb-inner"
              {...getTextTileBodyProps(contact.text, contact.textHtml)}
            />
          </div>
        )}
      </div>
    </section>
  );
}
