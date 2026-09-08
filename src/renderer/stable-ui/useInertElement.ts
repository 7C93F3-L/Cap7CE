import { useLayoutEffect, useRef } from "react";

export const useInertElement = <T extends HTMLElement>(inert: boolean) => {
  const elementRef = useRef<T | null>(null);

  useLayoutEffect(() => {
    if (elementRef.current) elementRef.current.inert = inert;
  }, [inert]);

  return elementRef;
};
