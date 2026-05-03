/**
 * Project order in this array is the **default** strip order. **Chronological** mode sorts projects by `year`
 * (newest first), then uses the same asset order within each project. **Random** shuffles the default strip.
 *
 * First asset is always selected; any other with `selected: true` is included, in array order.
 * `title`, `category`, and `year` are optional; if omitted, the tile shows only the asset (no meta line).
 *
 * Mux assets: `kind: "mux"`, `playbackId` from the Mux dashboard; optional `tokens.playback` for signed HLS URLs.
 * The work strip plays them with native video + hls.js; `ProjectLightbox` uses Mux Player (`metadata`, live, etc. there).
 * Text block tiles: `kind: "text"`, `text` (copy in the media area);
 * optional `textLarge: false` for 1em copy relative to the tile, omit or `true` for 1.5em (default);
 * optional `textHtml: true` to render `text` as HTML (for links, etc.); only use with trusted copy.
 * `stripLead: true` keeps this project’s selected tiles first in the strip for every order mode (default / chronological / random).
 * `staticSiteIntro: true` — copy is not shown as tiles; bio is in `SiteIntro` above the strip; contact + recognition render in `SiteFooter` above copyright (ignores control panel).
 * `staticSiteFooter: true` — same idea: rendered in `SiteFooter` below the work strip, full-width row (ignores control panel).
 */
export function getSelectedAssets(project) {
  if (project.assets.length === 0) return [];
  const first = project.assets[0];
  const extras = project.assets.slice(1).filter((a) => a.selected === true);
  return [first, ...extras];
}

/** All assets in `projects.js` file order; used for lightbox carousel. */
export function getProjectAssetsInOrder(project) {
  return project.assets ?? [];
}

export const projects = [
  {
    id: "noah-bio",
    staticSiteIntro: true,
    // title: "Biography",
    // category: "About",
    // year: 2026,
    assets: [
      // {
      //   id: "name",
      //   kind: "text",
      //   selected: true,
      //   textHtml: true,
      //   textLarge: true,
      //   text:
      //     "Noah Schwadron",
      // },    
      {
        id: "bio",
        kind: "text",
        selected: true,
        textLarge: true,
        text:
          "Noah is a graphic designer specialized in branding, digital experiences, and using code as a design tool. His work is driven by a commitment to specificity and capturing the nuanced overlap of contexts that shape a subject. He is currently a Designer/Coder at Cotton Design, and is living in Brooklyn, New York. Always open for projects and collaborations.",
      },
      {
        id: "recognition",
        kind: "text",
        selected: true,
        textLarge: false,
        text:
          "Recognition & Engagements: <br>ADC Silver — Branding 2025<br>Creative Innovation Award — Creative Review 2025<br>What Comes Next: Lecture at Parsons<br>AIGA NY Portfolio Review – 2025<br>Young Ones Silver — Branding 2024",
      },
      {
        id: "contact",
        kind: "text",
        selected: true,
        textHtml: true,
        textLarge: false,
        /** Shown in `SiteFooter` as a copy-to-clipboard control; not used when this asset is a strip tile. */
        copyEmail: "noah.schwadron@gmail.com",
        text:
          "<a href=\"https://www.instagram.com/noah_oclock_/\" target=\"_blank\" rel=\"noopener noreferrer\">instagram</a><br><a href=\"https://www.linkedin.com/in/nschwadron/\" target=\"_blank\" rel=\"noopener noreferrer\">linkedin</a>",
      },
    ],
  },

  { // new museum store
    id: "untitled-catalog",
    title: "New Museum Store",
    category: "Website",
    year: 2021,
    assets: [
      {
        id: "hero",
        kind: "mux",
        playbackId: "6SjPwOIcLaJCGkq8ifFjagwuYI0000DXwvjxqMvGWRaGo",
      },
      {
        id: "full-wordmark-animation",
        kind: "mux",
        playbackId: "4zBdPZCX1XPgmLmRpRGMKIN7z01CSgYKRNARTwNAIetg",
      },
      {
        id: "site-overview",
        kind: "mux",
        playbackId: "01qwDFrO00SZ7tjTw9Md2VW001QoA786V4ln00QcFsnQjTI",
        selected: true,
      },
      {
        id: "many-cards",
        kind: "image",
        src: "/project-assets/new-museum/many-cards.jpg",
        selected: true,
      },
      {
        id: "indiv-animations-wide",
        kind: "mux",
        playbackId: "M2dxyEovtNrt018cqDYyTNpc69rT02nO02l5zSlnfauu7Y",
        selected: true,
      },
      {
        id: "collections-page",
        kind: "mux",
        playbackId: "bP6aZ01oxCqEd02CL01UWOJZ4RVdQVmTWtla30100CMaZmA00",
      },
      {
        id: "modular-moment",
        kind: "mux",
        playbackId: "GzWfJGOkEkcRQDlcFaQGlFffIFSvCpKFQAQTli01r702U",
      },
      {
        id: "hover-demo",
        kind: "mux",
        playbackId: "plJxYgJpcqfM3YLdU2P01yjj3taZToqTqlhi3401x3hfg",
      },
    ],
  },
  { // kabaj
    id: "kabaj",
    title: "Kabaj",
    category: "Identity",
    year: 2024,
    assets: [
      {
        id: "kabaj-3-bottles",
        kind: "image",
        src: "/project-assets/kabaj/3-bottles.jpg",
      },
      {
        id: "kabaj-box-v1",
        kind: "image",
        src: "/project-assets/kabaj/box-v1.jpg",
        selected: true,
      },
      {
        id: "kabaj-corvus",
        kind: "image",
        src: "/project-assets/kabaj/corvus.jpg",
        selected: true,
      },
      {
        id: "kabaj-grid",
        kind: "image",
        src: "/project-assets/kabaj/grid.png",
        selected: true,
      },
      {
        id: "kabaj-guide",
        kind: "image",
        src: "/project-assets/kabaj/guide.jpg",
        selected: true,
      },
      {
        id: "kabaj-menu-v2",
        kind: "image",
        src: "/project-assets/kabaj/menu-v2.jpg",
        selected: true,
      },
      {
        id: "kabaj-generator-v1",
        kind: "mux",
        playbackId: "kb7bkFCIe8kwBM2zd3lUSCk9fQFkC025l3gEvVvDgIEE",
        metadata: {
          video_title: "kabaj-generator-v1",
        },
        selected: true,
      },
    ],
  },
  {
    id: "brocade",
    title: "Brocade",
    category: "Motion",
    year: 2025,
    assets: [
      {
        id: "brocade-generator",
        kind: "mux",
        playbackId: "YB8X3kjDH00VPi9kUs3kAlnvi7SlMpNHF83Ao8BmcX008",
        metadata: { video_title: "brocade-generator" },
      },
      {
        id: "brocade-scroll",
        kind: "mux",
        playbackId: "MSUxwbSmumWsCUi0101GJg4Jxsl3dl3fwiS9ktNfTMRFs",
        metadata: { video_title: "brocade-scroll" },
        selected: true,
      },
      {
        id: "brocade-ooh-mockup",
        kind: "image",
        src: "/project-assets/brocade/19-ooh-mockup-v3.jpg",
        selected: true,
      },
      {
        id: "brocade-visualdebugger-still",
        kind: "image",
        src: "/project-assets/brocade/09-visualdebugger-still.png",
        selected: true,
      },
      {
        id: "brocade-cursor-effect",
        kind: "mux",
        playbackId: "xQcq3i3TADc0001UsvR7iEpAjrmf3ffaUFAlVRfc2BIsc",
        metadata: { video_title: "brocade-cursor-effect" },
        selected: true,
      },
    ],
  },
  {
    id: "deviated-septum",
    title: "Deviated Septum",
    category: "Print",
    year: 2025,
    assets: [
      {
        id: "deviated-septum-scan-closeup",
        kind: "image",
        src: "/project-assets/deviated-septum/scan-closeup.jpg",
      },
      {
        id: "deviated-septum-holding-print",
        kind: "image",
        src: "/project-assets/deviated-septum/holding-print-5x4.jpg",
        selected: true,
      },
    ],
  },
  {
    id: "sinus-relief",
    title: "Sinus Relief",
    category: "Print",
    year: 2025,
    assets: [
      {
        id: "sinus-relief-5x4",
        kind: "image",
        src: "/project-assets/sinus-relief/sinus-relief-5x4.jpg",
      },
    ],
  },
  {
    id: "super-pulse",
    title: "Super Pulse",
    category: "Print",
    year: 2025,
    assets: [
      {
        id: "super-pulse-jersey",
        kind: "image",
        src: "/project-assets/super-pulse/super-pulse-jersey.jpg",
      },
    ],
  },
  {
    id: "magazine-for-snails",
    title: "Magazine for Snails",
    category: "Print",
    year: 2025,
    assets: [
      {
        id: "magazine-for-snails-v2-6-7",
        kind: "image",
        src: "/project-assets/magazine-for-snails/v2-_6-7.jpg",
      },
    ],
  },
  {
    id: "boundary",
    title: "Boundary",
    category: "Web",
    year: 2025,
    assets: [
      {
        id: "boundary-main-lockup",
        kind: "image",
        src: "/project-assets/boundary/main-lockup.png",
      },
      {
        id: "boundary-bust",
        kind: "image",
        src: "/project-assets/boundary/bust.png",
        selected: true,
      },
      {
        id: "boundary-dongle-mockup",
        kind: "image",
        src: "/project-assets/boundary/dongle-mockup-16x9.jpg",
        selected: true,
      },
      {
        id: "boundary-generator-tool",
        kind: "mux",
        playbackId: "y9JAAl2lDg5vuC9ueHo2d2NnRr601IioL7lmI2J01KWJY",
        metadata: { video_title: "boundary-generator-tool" },
        selected: true,
      },
      {
        id: "boundary-system-grid",
        kind: "mux",
        playbackId: "esPo2F8dsnrU2JpaWxwjbSpon02mUmI86jxg3Dv4KFCs",
        metadata: { video_title: "boundary-system-grid" },
        selected: true,
      },
      {
        id: "boundary-system-exports",
        kind: "mux",
        playbackId: "aEeXynrtkHJtEzjsEASZbTQWRo5yVlQ00hOnzpGb02qOk",
        metadata: { video_title: "boundary-system-exports" },
        selected: true,
      },
    ],
  },
  {
    id: "bloomberg-climate",
    title: "Bloomberg Climate",
    category: "Web",
    year: 2025,
    assets: [
      {
        id: "bloomberg-climate-ig-mockup",
        kind: "image",
        src: "/project-assets/bloomberg-climate/ig-mockup.jpg",
      },
      {
        id: "bloomberg-headlines-desktop",
        kind: "mux",
        playbackId: "o4asPgC6u8Lbtat5IpQ01MWckWWElBIcEPJDNRUzIUFo",
        metadata: { video_title: "bloomberg-headlines-desktop" },
        selected: true,
      },
    ],
  },
  {
    id: "backslash",
    title: "Backslash",
    category: "Web",
    year: 2025,
    assets: [
      {
        id: "backslash-composition-books",
        kind: "image",
        src: "/project-assets/backslash/composition-books.jpg",
      },
      {
        id: "backslash-patterns",
        kind: "mux",
        playbackId: "UioExKMeEokfhtoDLoATOzsSpzxEqczGAk00LwPRMd00E",
        metadata: { video_title: "backslash-patterns" },
        selected: true,
      },
      {
        id: "backslash-index",
        kind: "mux",
        playbackId: "B02UyRA00kBGuuqWxgdGAyVTHSU81nagg4p011ZsaS3hqE",
        metadata: { video_title: "backslash-index" },
        selected: true,
      },
      {
        id: "backslash-art-scroll",
        kind: "mux",
        playbackId: "Kr2HJAUfO6r02KGUVBUyYtonpPczviYrnSmBOmkQIQp00",
        metadata: { video_title: "backslash-art-scroll" },
        selected: true,
      },
      {
        id: "backslash-exhibitions",
        kind: "mux",
        playbackId: "Qya3XMmYusghsrJ00ECt4P02CkbCvi802QBa2V3eTOvUF00",
        metadata: { video_title: "backslash-exhibitions" },
        selected: true,
      },
      {
        id: "backslash-editorial-moments",
        kind: "mux",
        playbackId: "zjqTYNkN7PQCaroM01mZGbkmM00as01t2mQgnCPHYRV00N4",
        metadata: { video_title: "backslash-editorial-moments" },
        selected: true,
      },
    ],
  },
  {
    id: "system",
    title: "System",
    category: "Web",
    year: 2025,
    assets: [
      {
        id: "system-one-activates-another",
        kind: "mux",
        playbackId: "4xtrsfw2qY8uvdAsZ2AE1vNCcCNYxRCiqBNN02nigQ01I",
        metadata: { video_title: "one-activates-another" },
      },
      {
        id: "system-mellow-births",
        kind: "mux",
        playbackId: "PKrpjomkRrq8IeLEYoxTlUyEsmitEtxtTiNSSI5kmSw",
        metadata: { video_title: "mellow-births" },
        selected: true,
      },
      {
        id: "system-cover",
        kind: "image",
        src: "/project-assets/system/system-cover.jpg",
        selected: true,
      },
      {
        id: "system-more-important-less-important",
        kind: "mux",
        playbackId: "XEA101Tuy0101ADqLZCJTmytiTrZ5vDOQE4gKDa4Dt94es",
        metadata: { video_title: "system-more-important-less-important" },
        selected: true,
      },
      {
        id: "system-tv-mockup",
        kind: "mux",
        playbackId: "EA6hRQ5VtDNeVIiP6ueoizWqh15quFNatg46ZsM5v1M",
        metadata: { video_title: "tv-mockup" },
        selected: true,
      },
    ],
  },
  {
    id: "yellow",
    title: "Yellow",
    category: "Web",
    year: 2025,
    assets: [
      {
        id: "yellow-interactivity",
        kind: "mux",
        playbackId: "FQ94p00f7Nx2qkXJm9Tx7x7U1DchNzJEuoTrYos2gxvk",
        metadata: { video_title: "interactivity" },
      },
      {
        id: "yellow-debugger",
        kind: "mux",
        playbackId: "fNTTsUnXOEGGrO02LE00domk029fPxnhIsWslmskcB3au4",
        metadata: { video_title: "debugger" },
        selected: true,
      },
      {
        id: "yellow-conference-stage",
        kind: "image",
        src: "/project-assets/yellow/00-conference_stage-v3.jpg",
        selected: true,
      },
      {
        id: "yellow-huge-logo",
        kind: "image",
        src: "/project-assets/yellow/06-huge-logo.png",
        selected: true,
      },
      {
        id: "yellow-logo-in-app",
        kind: "image",
        src: "/project-assets/yellow/26-logo-in-app.jpg",
        selected: true,
      },
      {
        id: "yellow-digital-sign",
        kind: "image",
        src: "/project-assets/yellow/27-yellow-digital-sign-v3.jpg",
        selected: true,
      },
    ],
  },
  {
    id: "creative-week",
    title: "Creative Week",
    category: "Web",
    year: 2025,
    assets: [
      {
        id: "creative-week-generator",
        kind: "mux",
        playbackId: "izjJUmijgghBa801F8J6qo02M4g9ACarMxc6Hqcx95Yl8",
        metadata: { video_title: "generator" },
      },
      {
        id: "creative-week-hero",
        kind: "mux",
        playbackId: "VvwZc5MCFNn01g1KZCIukg00aRmpYUuK7vEqPj1LrCd01I",
        metadata: { video_title: "hero" },
        selected: true,
      },
      {
        id: "creative-week-instagram",
        kind: "mux",
        playbackId: "cbpAk6CQyt2c025hSkh02zalzh1ubnIkKnc3XMGdIY025o",
        metadata: { video_title: "instagram" },
        selected: true,
      },
      {
        id: "creative-week-print-nyt",
        kind: "image",
        src: "/project-assets/creative-week/PRINT_NYT.png",
        selected: true,
      },
    ],
  },
  {
    id: "eternal-research",
    title: "Eternal Research",
    category: "Web",
    year: 2025,
    assets: [
      {
        id: "eternal-research-stills-animating",
        kind: "mux",
        playbackId: "yPQm0102J01MJtvMergKAvuHPL9C01NNGVyRn00T202ceaILQ",
        metadata: { video_title: "stills-animating" },
      },
      {
        id: "eternal-research-pattern-logo-screen",
        kind: "mux",
        playbackId: "rr7OgSVcRitHAfrP4RAZN2UxkdcOavm1E6xBiTQJObY",
        metadata: { video_title: "pattern-logo-screen" },
        selected: true,
      },
      {
        id: "eternal-research-pattern-generator-tool",
        kind: "mux",
        playbackId: "XK34eiFk01500tMH00PCNhzCySk4RZgm9rHXDRfT9369n4",
        metadata: { video_title: "pattern-generator-tool" },
        selected: true,
      },
      {
        id: "eternal-research-stone-video",
        kind: "mux",
        playbackId: "v6tjmq6xOQbl8A2uEPtGZZs6vfLPn8vMazGwLLwXVIA",
        metadata: { video_title: "stone-video" },
        selected: true,
      },
      {
        id: "eternal-research-db-interface",
        kind: "image",
        src: "/project-assets/eternal-research/db-interface.jpg",
        selected: true,
      },
      {
        id: "eternal-research-db-schematic",
        kind: "image",
        src: "/project-assets/eternal-research/db-schematic.png",
        selected: true,
      },
      {
        id: "eternal-research-envelope",
        kind: "image",
        src: "/project-assets/eternal-research/envelope.jpg",
        selected: true,
      },
      {
        id: "eternal-research-ooh-triangle-pattern",
        kind: "image",
        src: "/project-assets/eternal-research/ooh-triangle-pattern.jpg",
        selected: true,
      },
      {
        id: "eternal-research-stationery",
        kind: "image",
        src: "/project-assets/eternal-research/stationery.jpg",
        selected: true,
      },
    ],
  },
  {
    id: "copyright",
    staticSiteFooter: true,
    // title: "Copyright",
    // category: "Info",
    // year: 2026,
    assets: [
      {
        id: "copyright-text",
        kind: "text",
        selected: true,
        textLarge: false,
        textHtml: true,
        text:
          "© 2026 Noah Schwadron. All rights reserved. Work shown is a combination of independent and collaborative projects developed across studios, clients, and personal practice; all materials are presented for portfolio purposes only and remain the property of their respective owners where applicable. Design and development by Noah Schwadron. Set in your default system font 😂",
      },
    ],
  },
];
