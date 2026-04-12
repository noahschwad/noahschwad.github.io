export type MediaKind = "image" | "video";

export type ProjectAsset = {
  id: string;
  kind: MediaKind;
  /** Remote URL or `/public` path. Empty / omitted shows “no asset” UI. */
  src?: string;
  /** Extra tiles beyond the first asset, which is always selected. */
  selected?: boolean;
  /** Optional label shown instead of the project `category` for this tile (e.g. secondary selected work). */
  category?: string;
};

export type Project = {
  id: string;
  title: string;
  category: string;
  year: number;
  assets: ProjectAsset[];
};

/** First asset is always selected; any other with `selected: true` is included, in array order. */
export function getSelectedAssets(project: Project): ProjectAsset[] {
  if (project.assets.length === 0) return [];
  const first = project.assets[0];
  const extras = project.assets.slice(1).filter((a) => a.selected === true);
  return [first, ...extras];
}

export const projects: Project[] = [
  {
    id: "signals",
    title: "Signals",
    category: "Web",
    year: 2024,
    assets: [
      {
        id: "signals-cover",
        kind: "image",
        src: "https://picsum.photos/seed/signals-a/720/480",
      },
      {
        id: "signals-detail",
        kind: "image",
        src: "https://picsum.photos/seed/signals-b/720/480",
        selected: true,
        category: "Motion",
      },
    ],
  },
  {
    id: "draft-tables",
    title: "Draft Tables",
    category: "Identity",
    year: 2023,
    assets: [
      {
        id: "draft-hero",
        kind: "image",
        src: "",
      },
      {
        id: "draft-motion",
        kind: "video",
        src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm",
        selected: true,
        category: "Film",
      },
    ],
  },
  {
    id: "north-lobby",
    title: "North Lobby",
    category: "Exhibition",
    year: 2022,
    assets: [
      {
        id: "lobby-still",
        kind: "image",
        src: "https://picsum.photos/seed/north-lobby/720/480",
      },
    ],
  },
  {
    id: "untitled-catalog",
    title: "Untitled Catalog",
    category: "Print",
    year: 2021,
    assets: [
      {
        id: "catalog-spread",
        kind: "video",
      },
    ],
  },
];
