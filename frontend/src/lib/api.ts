// Typed wrappers around the Python Api methods. The UI fills these objects; it
// never builds an ffmpeg/yt-dlp command string by hand.

import { invoke } from "@tauri-apps/api/core";

export type HwAccel =
  | "none"
  | "amf" // AMD on Windows
  | "vaapi" // AMD / Intel on Linux
  | "nvenc" // NVIDIA
  | "qsv" // Intel QuickSync
  | "video_toolbox"; // macOS

export interface Capabilities {
  ffmpegAvailable: boolean;
  ffmpegVersion: string | null;
  ytdlpAvailable: boolean;
  ytdlpVersion: string | null;
  /** Detected hardware encoder families, e.g. ["amf"]. */
  hwEncoders: string[];
}

export interface SystemInfo {
  os: string;
  osVersion: string;
  cpu: string;
  cpuThreads: number;
  totalMemoryGb: number;
  gpus: string[];
}

export interface Trim {
  startSec: number;
  endSec: number;
}

export interface Crop {
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface MediaJob {
  input: string;
  output: string;
  videoCodec?: string | null;
  audioCodec?: string | null;
  hwAccel?: HwAccel | null;
  fps?: number | null;
  scaleHeight?: number | null;
  speed?: number | null;
  crop?: Crop | null;
  trim?: Trim | null;
  audioOnly: boolean;
  crf?: number | null;
  overwrite: boolean;
}

export type CoverLayout = "square" | "wide" | "fit_image";

export interface CoverVideoJob {
  image: string;
  audio: string;
  output: string;
  layout: CoverLayout;
  blurredBackground: boolean;
  copyAudio: boolean;
  normalizeAudio: boolean;
  overwrite: boolean;
}

export interface SubtitleJob {
  video: string;
  subtitle: string;
  output: string;
  /** true = burn-in (hardsub); false = soft embed (selectable track). */
  burn: boolean;
  /** Seconds to shift the subtitle (+ later, − earlier). */
  delaySec?: number | null;
  /** Burn-in re-encodes the picture, so it honours the codec + GPU choice. */
  videoCodec?: string | null;
  hwAccel?: HwAccel | null;
  overwrite: boolean;
}

/** An embedded subtitle track in a video (from `listSubtitleTracks`). */
export interface SubtitleTrack {
  index: number; // absolute stream index, used as -map 0:<index>
  lang: string;
  codec: string;
  text: boolean; // false for image subs (PGS/VobSub) — can't extract to text
}

export type DownloadKind = "video" | "audio";

export interface DownloadJob {
  url: string;
  outputDir: string;
  kind: DownloadKind;
  format?: string | null;
  maxHeight?: number | null;
  /** Audio bitrate in kbps; null = "auto" (best, no re-encode). */
  audioQuality?: number | null;
  outputTemplate?: string | null;
  embedThumbnail: boolean;
  embedMetadata: boolean;
}

// Host capabilities and system info don't change during a session, so cache the
// promise — reopening Settings won't re-run ffmpeg/ffprobe/PowerShell probes.
let capsCache: Promise<Capabilities> | null = null;
let sysCache: Promise<SystemInfo> | null = null;

export const api = {
  detectCapabilities: () => (capsCache ??= invoke<Capabilities>("detect_capabilities")),
  getSystemInfo: () => (sysCache ??= invoke<SystemInfo>("get_system_info")),
  previewFfmpegArgs: (job: MediaJob) =>
    invoke<string[]>("preview_ffmpeg_args", { job }),
  previewYtdlpArgs: (job: DownloadJob) =>
    invoke<string[]>("preview_ytdlp_args", { job }),
  /** Pre-flight check: is this link supported (and reachable) by yt-dlp? */
  validateUrl: (url: string) =>
    invoke<{ ok: boolean; message: string }>("validate_url", { url }),
  previewCoverVideoArgs: (job: CoverVideoJob) =>
    invoke<string[]>("preview_cover_video_args", { job }),
  /** Persists clipboard bytes (a pasted image/file) to a temp path for conversion. */
  savePastedFile: (name: string, bytes: number[]) =>
    invoke<string>("save_pasted_file", { name, bytes }),

  /** Embedded subtitle tracks of a video (for the extract tool). */
  listSubtitleTracks: (video: string) =>
    invoke<SubtitleTrack[]>("list_subtitle_tracks", { video }),

  // ── settings / OS integration ──
  setTray: (enabled: boolean) => invoke<void>("set_tray", { enabled }),
  setAutostart: (enabled: boolean) => invoke<void>("set_autostart", { enabled }),
  restartApp: () => invoke<void>("restart_app"),
  checkUpdates: () =>
    invoke<{
      configured: boolean;
      available: boolean;
      version?: string;
      url?: string;
      assetUrl?: string | null;
      assetName?: string | null;
    }>("check_updates"),
  /** Download the release asset for this OS and launch it (progress via update:* events). */
  downloadUpdate: (assetUrl: string, assetName: string) =>
    invoke<void>("download_update", { assetUrl, assetName }),
};
