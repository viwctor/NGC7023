// Appearance prefs: theme (swaps CSS custom properties — see `[data-theme=...]`
// in App.css) and terminal font size in px (a `--term-font` var the terminal
// text reads). Both persist to localStorage and apply to <html>.

import { createContext, useContext, useEffect, useState } from "react";

export const THEMES = [
  "nebula",
  "supernova",
  "crimson",
  "solar",
  "cluster",
  "matrix",
  "rgb",
] as const;
export type Theme = (typeof THEMES)[number];

/** Selectable terminal font sizes (px). */
export const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20, 24];
const DEFAULT_FONT = 14;

/** Optional feature menus the user can show/hide (all on by default). */
export const MODULES = ["pdf", "youtube"] as const;
export type ModuleId = (typeof MODULES)[number];
export type Modules = Record<ModuleId, boolean>;

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  fontPx: number;
  setFontPx: (px: number) => void;
  modules: Modules;
  toggleModule: (id: ModuleId) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const THEME_KEY = "ngc7023.theme";
const FONT_KEY = "ngc7023.fontpx";
const MODULES_KEY = "ngc7023.modules";

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY) as Theme | null;
  return saved && THEMES.includes(saved) ? saved : "nebula";
}
function initialFont(): number {
  const saved = Number(localStorage.getItem(FONT_KEY));
  return FONT_SIZES.includes(saved) ? saved : DEFAULT_FONT;
}
function initialModules(): Modules {
  // Both tools ship enabled now (youtube is no longer a private/niche toggle).
  return { pdf: true, youtube: true };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [fontPx, setFontPx] = useState<number>(initialFont);
  const [modules, setModules] = useState<Modules>(initialModules);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--term-font", `${fontPx}px`);
    localStorage.setItem(FONT_KEY, String(fontPx));
  }, [fontPx]);

  useEffect(() => {
    localStorage.setItem(MODULES_KEY, JSON.stringify(modules));
  }, [modules]);

  const toggleModule = (id: ModuleId) => setModules((m) => ({ ...m, [id]: !m[id] }));

  return (
    <Ctx.Provider value={{ theme, setTheme, fontPx, setFontPx, modules, toggleModule }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
