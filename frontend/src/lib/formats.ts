// Central catalogue of supported formats, so the UI and (later) validation
// share one source of truth. Expand here — the views read from these lists.

export const DOWNLOAD_VIDEO = ["mp4", "mkv", "webm", "mov"] as const;
export const DOWNLOAD_AUDIO = ["mp3", "m4a", "opus", "aac", "flac", "wav", "ogg"] as const;

/** Video quality presets (max height). "auto" = best available, lossless. */
export const VIDEO_QUALITIES = ["auto", "2160", "1440", "1080", "720", "480", "360", "240", "144"] as const;
/** Audio quality presets (kbps). "auto" = best, downloaded without re-encoding. */
export const AUDIO_QUALITIES = ["auto", "320", "256", "192", "128", "96"] as const;

export const CONVERT_VIDEO = ["mp4", "mkv", "webm", "mov", "avi", "gif", "ts"] as const;
export const CONVERT_AUDIO = [
  "mp3",
  "m4a",
  "opus",
  "aac",
  "flac",
  "wav",
  "ogg",
  "wma",
] as const;
export const CONVERT_IMAGE = ["png", "jpg", "webp", "bmp", "tiff", "gif", "avif"] as const;
export const CONVERT_DOC = ["pdf"] as const;

export type FormatCategory = "video" | "audio" | "image" | "pdf";

/** Grouped options for the converter's output picker, colored by category. */
export const CONVERT_GROUPS: { cat: FormatCategory; label: string; formats: readonly string[] }[] = [
  { cat: "video", label: "vídeo", formats: CONVERT_VIDEO },
  { cat: "audio", label: "áudio", formats: CONVERT_AUDIO },
  { cat: "image", label: "imagem", formats: CONVERT_IMAGE },
  { cat: "pdf", label: "pdf", formats: CONVERT_DOC },
];

/** Formats that are audio-only (selecting one implies dropping the video). */
export const AUDIO_FORMATS = new Set<string>([...CONVERT_AUDIO, ...DOWNLOAD_AUDIO]);
