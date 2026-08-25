import { useEffect, useState } from "react";

export const useSystemThemeMode = () => {
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => (
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  ));

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) {
      return undefined;
    }

    const updateSystemTheme = () => {
      setSystemTheme(query.matches ? "dark" : "light");
    };

    updateSystemTheme();
    query.addEventListener("change", updateSystemTheme);
    return () => query.removeEventListener("change", updateSystemTheme);
  }, []);

  return systemTheme;
};
