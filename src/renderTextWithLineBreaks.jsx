import { Fragment } from "react";

/** Project copy may use HTML-style `<br>`; React text nodes do not parse tags. */
export function renderTextWithLineBreaks(text) {
  const lines = String(text)
    .replace(/\r\n/g, "\n")
    .split(/<br\s*\/?\s*>/i)
    .join("\n")
    .split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}

/** `textHtml: true` in projects.js: trusted HTML in `text` (links, <br>, etc.); otherwise line-break helper only. */
export function getTextTileBodyProps(text, textHtml) {
  if (textHtml) {
    return { dangerouslySetInnerHTML: { __html: String(text) } };
  }
  return { children: renderTextWithLineBreaks(text) };
}
