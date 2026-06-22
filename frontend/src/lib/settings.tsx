// App settings persisted to localStorage: OS behaviors (tray, autostart) and the
// "reduce motion" toggle (disables the ascii + typing animations). The default
// output folder is kept in the studio state (dlDest/cvDest), not here.

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface AppSettings {
  /** Keep a tray icon and hide-to-tray on close instead of quitting. */
  tray: boolean;
  /** Launch with Windows, minimized to the tray. */
  autostart: boolean;
  /** Disable the nebula + typewriter animations. */
  reduceMotion: boolean;
}

const DEFAULTS: AppSettings = { tray: false, autostart: false, reduceMotion: false };
const KEY = "ngc7023.settings";

interface SettingsCtx extends AppSettings {
  set: (patch: Partial<AppSettings>) => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

function initial(): AppSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object") return { ...DEFAULTS, ...saved };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppSettings>(initial);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo<SettingsCtx>(
    () => ({ ...state, set: (patch) => setState((s) => ({ ...s, ...patch })) }),
    [state],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
