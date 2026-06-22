// Central pre-configuration state for the terminal UI. The menu bar writes into
// it; the terminal reads from it when an input is submitted. There is no more
// "download tab" vs "converter tab" — a single config object describes how the
// next link (download) or file (conversion) should be handled, and the input
// type decides which half applies.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CoverLayout, DownloadKind } from "./api";

/** Video-editing values folded into a MediaJob. */
export interface VideoToolValues {
  cropOn: boolean;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  trimOn: boolean;
  /** Timecodes "HH:MM:SS" (converted to seconds when building the job). */
  trimStart: string;
  trimEnd: string;
  speed: number;
  /** When true, speed is a user-entered value rather than a preset. */
  speedCustom: boolean;
  fps: number | null;
  /** When true, fps is a user-entered value rather than a preset. */
  fpsCustom: boolean;
  scaleHeight: number | null;
}

export const DEFAULT_VIDEO_TOOLS: VideoToolValues = {
  cropOn: false,
  cropX: 0,
  cropY: 0,
  cropW: 1280,
  cropH: 720,
  trimOn: false,
  trimStart: "00:00:00",
  trimEnd: "00:00:10",
  speed: 1,
  speedCustom: false,
  fps: null,
  fpsCustom: false,
  scaleHeight: null,
};

export interface StudioState {
  // download config
  dlKind: DownloadKind;
  dlFormat: string;
  dlQuality: string; // "auto" or a numeric string
  dlDest: string | null;
  // converter config
  cvFormat: string;
  cvDest: string | null;
  /** Base video codec for re-encodes: "h264" | "hevc" | "av1". The concrete
   *  encoder is derived from this + the GPU choice (e.g. hevc + amf = hevc_amf). */
  cvCodec: string;
  /** GPU acceleration: "auto" (best detected), "off", or a family
   *  ("amf"/"nvenc"/"qsv"/"vaapi"/"video_toolbox"). Default on (auto). */
  gpu: string;
  /** Which preset fields the user has explicitly set (drives the menu dots and
   *  whether the numbered wizard appears). Keys: dlKind/dlFormat/dlQuality/
   *  cvFormat/ytLayout/ytImage/ytAudio. */
  touched: Record<string, boolean>;
  tools: VideoToolValues;
  // youtube* (private) config
  ytImage: string | null;
  ytAudio: string | null;
  ytLayout: CoverLayout;
  ytBlurred: boolean;
  ytCopyAudio: boolean;
  ytNormalize: boolean;
}

const DEFAULT_STATE: StudioState = {
  dlKind: "video",
  dlFormat: "mp4",
  dlQuality: "auto",
  dlDest: null,
  cvFormat: "mp4",
  cvDest: null,
  cvCodec: "h264",
  gpu: "auto",
  touched: {},
  tools: DEFAULT_VIDEO_TOOLS,
  ytImage: null,
  ytAudio: null,
  ytLayout: "square",
  ytBlurred: true,
  ytCopyAudio: true,
  ytNormalize: false,
};

interface StudioCtx extends StudioState {
  set: (patch: Partial<StudioState>) => void;
  setTools: (patch: Partial<VideoToolValues>) => void;
  touch: (field: string, on: boolean) => void;
  reset: () => void;
}

const Ctx = createContext<StudioCtx | null>(null);
const STORAGE_KEY = "ngc7023.studio";

// Presets persist across restarts (merged onto defaults so new fields survive a
// schema bump).
function initialState(): StudioState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      return {
        ...DEFAULT_STATE,
        ...saved,
        tools: { ...DEFAULT_VIDEO_TOOLS, ...(saved.tools || {}) },
        touched: { ...(saved.touched || {}) },
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_STATE;
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StudioState>(initialState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo<StudioCtx>(
    () => ({
      ...state,
      set: (patch) => setState((s) => ({ ...s, ...patch })),
      setTools: (patch) => setState((s) => ({ ...s, tools: { ...s.tools, ...patch } })),
      touch: (field, on) => setState((s) => ({ ...s, touched: { ...s.touched, [field]: on } })),
      reset: () => setState(DEFAULT_STATE),
    }),
    [state],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio(): StudioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStudio must be used within StudioProvider");
  return ctx;
}
