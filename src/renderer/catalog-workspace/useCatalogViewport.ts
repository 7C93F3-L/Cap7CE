import { useEffect, useState } from "react";

const readViewport = (previous?: { detailsConstrained: boolean; filtersConstrained: boolean }) => ({
  width: window.innerWidth, height: window.innerHeight,
  detailsConstrained: window.innerWidth < (previous?.detailsConstrained ? 960 : 900),
  filtersConstrained: window.innerHeight < (previous?.filtersConstrained ? 560 : 520)
});
export function useCatalogViewport() {
  const [viewport, setViewport] = useState(() => readViewport());
  useEffect(() => {
    const resize = () => setViewport(previous => readViewport(previous));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return viewport;
}
