import { useCallback, useState } from "react";
import { getTextTileBodyProps } from "../renderTextWithLineBreaks";

export function SiteIntroEmailCopy({ email }) {
  const [copiedWave, setCopiedWave] = useState(0);

  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      return;
    }
    setCopiedWave((w) => w + 1);
  }, [email]);

  return (
    <span className="site-intro__email-row">
      <button
        type="button"
        className="site-intro__email-btn"
        onClick={onClick}
        aria-label={`Copy ${email} to clipboard`}
      >
        email
      </button>
      {copiedWave > 0 ? (
        <span
          key={copiedWave}
          className="site-intro__email-copied"
          aria-live="polite"
        >
          copied
        </span>
      ) : null}
    </span>
  );
}

/** Contact + recognition copy from the `staticSiteIntro` project; rendered above copyright in `SiteFooter`. */
export function IntroFooterBlurbs({ contact, recognition }) {
  return (
    <>
      {contact && (
        <div className="site-footer__blurb">
          <div className="site-footer__blurb-inner">
            {contact.copyEmail ? (
              <>
                <SiteIntroEmailCopy email={contact.copyEmail} />
                <br />
                <span
                  {...getTextTileBodyProps(contact.text, contact.textHtml)}
                />
              </>
            ) : (
              <div
                {...getTextTileBodyProps(contact.text, contact.textHtml)}
              />
            )}
          </div>
        </div>
      )}
      {recognition && (
        <div className="site-footer__blurb">
          <p
            className="site-footer__blurb-inner"
            {...getTextTileBodyProps(recognition.text, recognition.textHtml)}
          />
        </div>
      )}
    </>
  );
}

/**
 * Static intro copy (from a `staticSiteIntro` project in `projects.js`). Not using
 * control-panel `--panel-text-size` / tile layout; typography is set in `App.css` (`.site-intro`).
 * Contact and recognition render in `SiteFooter` above the copyright line.
 */
export function SiteIntro({ project }) {
  if (!project?.staticSiteIntro) return null;
  const bio = project.assets?.find((a) => a.id === "bio");

  return (
    <section className="site-intro" aria-label="About">
      {bio && (
        <p
          className={`site-intro__bio${
            bio.textLarge !== false ? " site-intro__bio--large" : ""
          }`}
          {...getTextTileBodyProps(bio.text, bio.textHtml)}
        />
      )}
    </section>
  );
}
