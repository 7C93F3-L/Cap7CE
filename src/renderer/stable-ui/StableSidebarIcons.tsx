import type { ReactNode } from "react";

export type StableSidebarIconName = "ai" | "sort" | "scope" | "folder" | "add" | "more";

const paths: Record<StableSidebarIconName, ReactNode> = {
  ai: <><path d="M12 3l1.15 3.35L16.5 7.5l-3.35 1.15L12 12l-1.15-3.35L7.5 7.5l3.35-1.15L12 3Z" /><path d="M18 12l.75 2.25L21 15l-2.25.75L18 18l-.75-2.25L15 15l2.25-.75L18 12Z" /><path d="M6 14l.65 1.85L8.5 16.5l-1.85.65L6 19l-.65-1.85-1.85-.65 1.85-.65L6 14Z" /></>,
  sort: <><path d="M7 4v15m0 0-3-3m3 3 3-3" /><path d="M13 6h7M13 12h5M13 18h3" /></>,
  scope: <><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></>,
  folder: <path d="M3.5 7.5h6l2-2h9v13h-17v-11Z" />,
  add: <path d="M12 5v14M5 12h14" />,
  more: <><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /></>
};

const StableSidebarIcon = ({ name }: { name: StableSidebarIconName }) => (
  <svg className="cap-stable-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
);

export default StableSidebarIcon;
