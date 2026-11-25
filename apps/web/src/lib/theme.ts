import { useState } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "sierra.theme";

/** Applies the theme to <html data-theme> and keeps the browser chrome colour in sync. */
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
  requestAnimationFrame(() => {
    const bg = getComputedStyle(root).getPropertyValue("--color-bg").trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute("content", pref === "system" ? (m.getAttribute("data-system") ?? bg) : bg);
    });
  });
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => (localStorage.getItem(KEY) as ThemePref) || "system");
  const set = (p: ThemePref) => {
    setPref(p);
    if (p === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
    applyTheme(p);
  };
  return [pref, set] as const;
}
