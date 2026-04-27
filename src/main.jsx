import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";

/** Absolute favicon URL so tabs/devtools resolve it reliably (Vite `public/` + optional non-root `base`). */
const faviconHref = new URL(
  "favicon.ico",
  new URL(import.meta.env.BASE_URL, window.location.origin),
).href;
for (const link of document.querySelectorAll(
  'link[rel="icon"], link[rel="shortcut icon"]',
)) {
  link.type = "image/x-icon";
  link.removeAttribute("sizes");
  link.href = faviconHref;
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error('Missing root element with id "root"');

/* No <StrictMode>: in dev it remounts the tree once, which tears down strip mux-players and restarts every loop. */
createRoot(rootEl).render(<App />);
