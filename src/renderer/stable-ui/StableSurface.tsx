import type { ReactNode } from "react";

const StableSurface = ({ children, scrollable = false }: { children: ReactNode; scrollable?: boolean }) => (
  <section className={`cap-stable-surface${scrollable ? " cap-stable-scroll-surface" : ""}`}>
    {children}
  </section>
);

export default StableSurface;
