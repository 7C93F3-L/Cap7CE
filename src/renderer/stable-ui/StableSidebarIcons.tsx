import type { ReactNode } from "react";

export type StableSidebarIconName = "add" | "more";

const paths: Record<StableSidebarIconName, ReactNode> = {
  add: <path d="M12 5v14M5 12h14" />,
  more: <><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /></>
};

const StableSidebarIcon = ({ name }: { name: StableSidebarIconName }) => (
  <svg className="cap-stable-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
);

export default StableSidebarIcon;
