import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readSystemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function useSystemTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(readSystemTheme);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return theme;
}

export interface ThemeControl {
  theme: Theme;
  toggle: () => void;
}

export function useTheme(): ThemeControl {
  const systemTheme = useSystemTheme();
  const [override, setOverride] = useState<Theme | null>(null);
  const theme = override ?? systemTheme;

  useEffect(() => {
    const root = document.documentElement;
    if (override === null) delete root.dataset.theme;
    else root.dataset.theme = override;
  }, [override]);

  return { theme, toggle: () => setOverride(theme === "dark" ? "light" : "dark") };
}
