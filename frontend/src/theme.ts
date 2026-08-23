// Theme lets users override the OS colour scheme from inside the app.
// "system" defers to prefers-color-scheme (the default); "light"/"dark" pin a
// choice via a data-theme attribute on <html>, which styles.css keys off.
export type Theme = "system" | "light" | "dark";

const KEY = "theme";

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

// applyTheme reflects the stored choice onto <html>. Called once on boot (before
// render, to avoid a flash) and again whenever the user picks a new theme.
export function applyTheme(theme: Theme = getTheme()) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function setTheme(theme: Theme) {
  if (theme === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, theme);
  applyTheme(theme);
}
