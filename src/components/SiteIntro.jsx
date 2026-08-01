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

/** Structured recognition / CV list (`heading` + `items`) for the intro meta row. */
export function IntroBlurbList({ blurb }) {
  const items = blurb?.items;
  if (!items?.length) return null;

  const className = blurb.hideBelow600
    ? "site-intro__blurb site-intro__blurb--hide-below-600"
    : "site-intro__blurb";

  return (
    <div className={className}>
      {blurb.heading ? (
        <p className="site-intro__blurb-heading">{blurb.heading}</p>
      ) : null}
      <ul className="site-intro__blurb-list">
        {items.map((item, i) => {
          const key = `${item.title ?? "item"}-${item.year ?? i}`;
          const title = item.link ? (
            <a href={item.link} target="_blank" rel="noopener noreferrer">
              {item.title}
            </a>
          ) : (
            item.title
          );
          return (
            <li key={key} className="site-intro__blurb-item">
              {title}
              {item.year != null ? (
                <span className="site-intro__blurb-year"> {item.year}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Static intro copy (from a `staticSiteIntro` project in `projects.js`). Not using
 * control-panel `--panel-text-size` / tile layout; typography is set in `App.css` (`.site-intro`).
 * Contact, recognition, and CV sit in a flex meta row beneath the bio.
 */
export function SiteIntro({ project }) {
  if (!project?.staticSiteIntro) return null;
  const bio = project.assets?.find((a) => a.id === "bio");
  const contact = project.assets?.find((a) => a.id === "contact");
  const recognition = project.assets?.find((a) => a.id === "recognition");
  const cv = project.assets?.find((a) => a.id === "cv");
  if (!bio && !contact && !recognition && !cv) return null;

  const bioLarge = bio ? bio.textLarge !== false : true;
  const hasBlurbs = recognition || cv;
  const hasMeta = contact || hasBlurbs;

  return (
    <section className="site-intro" aria-label="About">
      {bio ? (
        <p
          className={`site-intro__bio${
            bioLarge ? " site-intro__bio--large" : ""
          }`}
        >
          <span {...getTextTileBodyProps(bio.text, bio.textHtml)} />
        </p>
      ) : null}
      {hasMeta ? (
        <div className="site-intro__meta">
          {hasBlurbs ? (
            <div className="site-intro__meta-blurbs">
              <IntroBlurbList blurb={recognition} />
              <IntroBlurbList blurb={cv} />
            </div>
          ) : null}
          {contact ? (
            <div
              className={`site-intro__meta-links${
                bioLarge ? " site-intro__meta-links--large" : ""
              }`}
            >
              {contact.copyEmail ? (
                <SiteIntroEmailCopy email={contact.copyEmail} />
              ) : null}
              {contact.text ? (
                <span
                  {...getTextTileBodyProps(contact.text, contact.textHtml)}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
