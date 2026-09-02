import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface WindowTitlebarPortalProps {
  children: ReactNode;
}

const WindowTitlebarPortal = ({ children }: WindowTitlebarPortalProps) => createPortal(children, document.body);

export default WindowTitlebarPortal;
