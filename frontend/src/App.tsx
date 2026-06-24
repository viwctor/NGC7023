// The app is a single terminal. The menu bar pre-configures everything; the
// terminal takes input (paste / drop / choose) and decides for itself: a link →
// download, a file → conversion. If the relevant presets were never touched, a
// numbered wizard asks for them right in the terminal (1–9 to pick, 0 to go
// back) instead of silently using defaults.

import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MenuBar } from "./components/MenuBar";
import { TitleBar } from "./components/TitleBar";
import { Terminal, type TermLine, type WizardView } from "./features/terminal/Terminal";
import { AboutModal } from "./components/AboutModal";
import { api, type CoverLayout, type CoverVideoJob, type DownloadKind, type HwAccel, type MediaJob, type DownloadJob, type SubtitleJob } from "./lib/api";
import {
  AUDIO_FORMATS,
  AUDIO_QUALITIES,
  CONVERT_AUDIO,
  CONVERT_GROUPS,
  CONVERT_IMAGE,
  CONVERT_VIDEO,
  DOWNLOAD_AUDIO,
  DOWNLOAD_VIDEO,
  VIDEO_QUALITIES,
} from "./lib/formats";
import { HelpModal } from "./components/HelpModal";
import { SettingsModal } from "./components/SettingsModal";
import { ALL_FORMATS, isFormatCommand } from "./lib/commands";
import { errorKey } from "./lib/errors";
import { isEditableTarget, isFilePath, isUrl } from "./lib/keys";
import { useI18n, LANGS, LANG_LABELS, type TKey } from "./lib/i18n";
import { useStudio, DEFAULT_VIDEO_TOOLS, type VideoToolValues } from "./lib/studio";
import { DEFAULTS, matchesBinding } from "./lib/shortcuts";
import { useSettings } from "./lib/settings";
import { useJobs } from "./lib/useJobs";
import "./App.css";

const MAX_BATCH = 50;
const VIDEO_OUT = new Set<string>(CONVERT_VIDEO);
const IMAGE_IN = new Set<string>(CONVERT_IMAGE);
const DIVIDER = "*".repeat(46);

// Base video codec → label, for the detailed-convert codec step (the concrete
// encoder is derived from this + the GPU choice in the builder).
const VIDEO_CODECS: { id: string; label: string }[] = [
  { id: "h264", label: "h264 (x264)" },
  { id: "hevc", label: "h265 (x265)" },
  { id: "av1", label: "av1" },
];
type PdfOp = "image" | "merge" | "png" | "jpg" | "extract" | "delete";
interface CoverOpts {
  layout: CoverLayout;
  blurred: boolean;
  copyAudio: boolean;
  normalize: boolean;
}

// Input-extension → broad category, for the converter's compatibility guard.
const AUDIO_IN = new Set<string>([
  ...CONVERT_AUDIO, ...DOWNLOAD_AUDIO, "aiff", "aif", "mka", "oga", "ac3", "amr", "ape", "weba", "caf",
]);
const VIDEO_IN = new Set<string>([
  ...CONVERT_VIDEO, "flv", "wmv", "m4v", "mpg", "mpeg", "3gp", "m2ts", "mts", "ogv", "vob", "f4v", "divx", "rm", "rmvb",
]);
const IMAGE_IN_EXTRA = ["jpeg", "heic", "heif", "jfif", "ico", "svg"];

function inputCategory(ext: string): "video" | "audio" | "image" | null {
  if (IMAGE_IN.has(ext) || IMAGE_IN_EXTRA.includes(ext)) return "image";
  if (AUDIO_IN.has(ext)) return "audio";
  if (VIDEO_IN.has(ext)) return "video";
  return null; // unknown → let FFmpeg try (its errors are mapped to messages)
}

// An i18n key when a conversion can't possibly work, else null. Audio has no
// picture (→ image/video impossible) and an image has no audio track.
function conversionIssue(inExt: string, format: string): TKey | null {
  const inCat = inputCategory(inExt);
  const outAudio = AUDIO_FORMATS.has(format);
  const outVisual = !outAudio && format !== "pdf"; // video / image / gif
  const outVideo = VIDEO_OUT.has(format) && format !== "gif"; // real video (not gif)
  if (inCat === "audio" && outVisual) return "conv.audioNoVisual";
  if (inCat === "image" && outAudio) return "conv.noAudio";
  // A still image can't become a real video (it would be a 0-second clip).
  if (inCat === "image" && outVideo) return "conv.imageNoVideo";
  return null;
}

function downloadFormatFor(fmt: string, kind: DownloadKind): string {
  const valid = kind === "audio" ? DOWNLOAD_AUDIO : DOWNLOAD_VIDEO;
  return (valid as readonly string[]).includes(fmt) ? fmt : kind === "audio" ? "mp3" : "mp4";
}

let lineSeq = 0;
const nextId = () => ++lineSeq;

interface Wizard extends WizardView {
  onPick: (i: number) => void;
  onBack?: () => void;
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

function dirOf(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(0, i) : norm;
}

// "2-5, 8" → [2,3,4,5,8]
function parseRange(s: string): number[] {
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const t = part.trim();
    const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = Number(m[1]);
      let b = Number(m[2]);
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) out.add(i);
    } else if (/^\d+$/.test(t)) {
      out.add(Number(t));
    }
  }
  return [...out].sort((a, b) => a - b);
}

function notify(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    /* notifications unavailable */
  }
}

// "HH:MM:SS" / "MM:SS" / "SS" → seconds (lenient; ignores junk).
// "HH:MM:SS", "MM:SS", "SS" → seconds (accepts "," as the decimal point). An
// optional 4th part is milliseconds, e.g. "01:33:59:270" = 5639.27s.
function hmsToSecs(tc: string): number {
  const parts = tc.split(":").map((p) => Number(p.trim().replace(",", ".")) || 0);
  let ms = 0;
  if (parts.length === 4) ms = (parts.pop() ?? 0) / 1000;
  return parts.reduce((acc, n) => acc * 60 + n, 0) + ms;
}

function outputPath(input: string, format: string, dest: string | null): string {
  const norm = input.replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  const base = norm.slice(slash + 1).replace(/\.[^.]+$/, "");
  if (dest) {
    const d = dest.replace(/\\/g, "/").replace(/\/+$/, "");
    return `${d}/${base} (ngc).${format}`;
  }
  const dir = slash >= 0 ? norm.slice(0, slash + 1) : "";
  return `${dir}${base} (ngc).${format}`;
}

function App() {
  const { t, setLang } = useI18n();
  const s = useStudio();
  const settings = useSettings();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const [lines, setLines] = useState<TermLine[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // First run / after a reset (no language chosen yet) → play the boot animation
  // (the console + nebula are "generated" gradually). Read once, before the
  // first-run language effect marks it.
  const boot = useRef<boolean>(
    (() => {
      try {
        return !localStorage.getItem("ngc7023.langChosen");
      } catch {
        return false;
      }
    })(),
  );
  const [wizard, setWizard] = useState<Wizard | null>(null);
  // Free-text question (e.g. a page range for a PDF op).
  const [ask, setAsk] = useState<{ label: string; onAnswer: (text: string) => void } | null>(null);
  // One-shot format set via a slash command (e.g. /mp3) — applied to the next input.
  const [pendingFormat, setPendingFormat] = useState<string | null>(null);
  // Hardware encoder families detected on this machine (for the gpu picker).
  const [hwEncoders, setHwEncoders] = useState<string[]>([]);

  const log = (text: string, kind: TermLine["kind"] = "info", color?: string) =>
    setLines((prev) => [...prev, { id: nextId(), text, kind, ...(color ? { color } : {}) }]);
  const divider = () => log(DIVIDER, "divider");

  // Job bookkeeping for notifications + the destination of the last action.
  const jobMeta = useRef<Map<number, { label: string; tag: string }>>(new Map());
  const lastDir = useRef<string | null>(null);

  // Job lines live in the scrollback in the order they happened, updated in
  // place — so a download's progress stays put and later actions print below it.
  const { runMedia, runDownload, runCover, runSub, runSubExtract, runSubConvert, runPdf, runImages, runMerge, runPdfToImg, runPdfPages, cancel, cancelAll } = useJobs({
    onNew: (uid, label, tag, out) => {
      jobMeta.current.set(uid, { label, tag });
      lastDir.current = tag === "download" ? out : dirOf(out);
      setLines((prev) => [...prev, { id: nextId(), kind: "job", jobUid: uid, text: label, progress: null, queued: true, tag, out }]);
    },
    onUpdate: (uid, patch) => {
      setLines((prev) => prev.map((l) => (l.jobUid === uid ? { ...l, ...patch } : l)));
      // A finished job (success/error, not cancelled) notifies the OS.
      if (patch.progress === null && patch.error !== undefined && !patch.cancelled) {
        const meta = jobMeta.current.get(uid);
        if (meta) notify("NGC7023", `${basename(meta.label)} — ${t(patch.error ? "notify.failed" : "notify.done")}`);
        jobMeta.current.delete(uid);
      }
    },
  });

  const clearScreen = () => setLines([]);
  const focusPrompt = () => inputRef.current?.focus();

  function openJob(line: TermLine) {
    if (!line.out) return;
    (line.tag === "download" ? openPath(line.out) : revealItemInDir(line.out)).catch(() => {});
  }

  // Resolve the GPU choice to a concrete encoder family (or null = software).
  function resolveHw(): HwAccel | null {
    if (s.gpu === "off") return null;
    if (s.gpu === "auto") return (hwEncoders[0] as HwAccel) ?? null;
    return hwEncoders.includes(s.gpu) ? (s.gpu as HwAccel) : null;
  }

  // ── build jobs from config (with optional overrides for the wizard) ─────────
  function buildMediaJob(input: string, format = s.cvFormat, tools: VideoToolValues = s.tools, codec = s.cvCodec): MediaJob {
    const audioOnly = AUDIO_FORMATS.has(format);
    const isVideo = VIDEO_OUT.has(format); // includes gif (animated)
    const imageOut = IMAGE_IN.has(format) && format !== "gif"; // single still image
    const webm = format === "webm";
    const visual = isVideo || imageOut;
    const tl = tools;
    // Codecs: audio output lets FFmpeg infer the encoder from the extension
    // (mp3→libmp3lame, flac→flac, …); a still image carries no codec; webm must
    // be vp9+opus (software — hardware vp9 is rare). Otherwise the picked codec.
    let videoCodec: string | null = null;
    let audioCodec: string | null = null;
    if (!audioOnly && !imageOut) {
      videoCodec = webm ? "vp9" : codec;
      audioCodec = webm ? "libopus" : "aac";
    }
    return {
      input,
      output: outputPath(input, format, s.cvDest),
      videoCodec,
      audioCodec,
      hwAccel: isVideo && !webm ? resolveHw() : null,
      fps: isVideo ? tl.fps : null,
      scaleHeight: visual ? tl.scaleHeight : null,
      speed: isVideo && tl.speed !== 1 ? tl.speed : null,
      crop: visual && tl.cropOn ? { x: tl.cropX, y: tl.cropY, width: tl.cropW, height: tl.cropH } : null,
      // Ignore an invalid range (end ≤ start) so it doesn't produce an empty file.
      trim:
        isVideo && tl.trimOn && hmsToSecs(tl.trimEnd) > hmsToSecs(tl.trimStart)
          ? { startSec: hmsToSecs(tl.trimStart), endSec: hmsToSecs(tl.trimEnd) }
          : null,
      audioOnly,
      crf: audioOnly || imageOut ? null : 23,
      overwrite: true,
    };
  }

  function buildDownloadJob(
    url: string,
    dir: string,
    kind = s.dlKind,
    format = s.dlFormat,
    quality = s.dlQuality,
  ): DownloadJob {
    const q = quality === "auto" ? null : Number(quality);
    return {
      url,
      outputDir: dir,
      kind,
      format,
      maxHeight: kind === "video" ? q : null,
      audioQuality: kind === "audio" ? q : null,
      // Mark downloads with a "(ngc)" suffix, like converted files. Literal text
      // in the template (yt-dlp only expands %(field)s), parens are filename-safe.
      outputTemplate: "%(title)s (ngc).%(ext)s",
      embedThumbnail: true,
      embedMetadata: true,
    };
  }

  async function pickDir(): Promise<string | null> {
    try {
      const d = await open({ directory: true });
      return typeof d === "string" ? d : null;
    } catch {
      return null;
    }
  }
  async function pickFile(extensions: string[]): Promise<string | null> {
    try {
      const p = await open({ multiple: false, filters: [{ name: "file", extensions }] });
      return typeof p === "string" ? p : null;
    } catch {
      return null;
    }
  }

  // ── run (shared by the direct path and the wizard finish) ───────────────────
  async function runConvert(input: string, format: string, tools: VideoToolValues = s.tools, codec = s.cvCodec) {
    const inExt = (input.split(".").pop() ?? "").toLowerCase();

    // PDF input is not an FFmpeg path: route pdf→png/jpg to the pdf tool, else
    // point the user at the pdf menu.
    if (inExt === "pdf") {
      if (format === "png" || format === "jpg") {
        const stem = outStem(input);
        runPdfToImg(input, stem, format, basename(`${stem}-1.${format}`));
      } else {
        log(t("conv.pdfInput"), "info");
      }
      return;
    }

    // PDF output only makes sense from an image.
    if (format === "pdf") {
      if (IMAGE_IN.has(inExt)) {
        const output = outputPath(input, "pdf", s.cvDest);
        runPdf(input, output, basename(output));
      } else {
        log(t("conv.pdfImagesOnly"), "info");
      }
      return;
    }

    // Block the combinations that can't work (audio↔visual, image→audio) with a
    // clear message instead of a cryptic FFmpeg failure.
    const issue = conversionIssue(inExt, format);
    if (issue) {
      log(t(issue), "info");
      return;
    }

    log(t("term.detectFile"), "info");
    const job = buildMediaJob(input, format, tools, codec);
    const args = await api.previewFfmpegArgs(job).catch(() => null);
    if (args) log("ffmpeg " + args.join(" "), "cmd");
    runMedia(job, basename(job.output));
  }

  async function runDownloadFlow(url: string, kind: DownloadKind, format: string, quality: string) {
    log(t("term.detectLink"), "info");
    let dir = s.dlDest;
    if (!dir) {
      dir = await pickDir();
      if (!dir) {
        log(t("term.needFolder"), "err");
        return;
      }
      s.set({ dlDest: dir });
    }
    const job = buildDownloadJob(url, dir, kind, format, quality);
    const args = await api.previewYtdlpArgs(job).catch(() => null);
    if (args) log("yt-dlp " + args.join(" "), "cmd");
    runDownload(job, url);
  }

  // ── numbered wizards ─────────────────────────────────────────────────────
  // Output categories possible for an input. Group indices: 0=video, 1=audio,
  // 2=image, 3=pdf (see CONVERT_GROUPS).
  function allowedCategories(input: string): number[] {
    const inExt = (input.split(".").pop() ?? "").toLowerCase();
    const cat = inputCategory(inExt);
    if (inExt === "pdf") return [2]; // pdf → images
    if (cat === "audio") return [1]; // audio → audio only
    if (cat === "video") return [0, 1, 2]; // video → video / audio / image (frame)
    if (cat === "image") return [2, 3]; // image → image / pdf
    return [0, 1, 2, 3]; // unknown → let the user try anything
  }

  // Ask the output once for all dropped files; only offer categories valid for
  // EVERY file (so a batch never includes an impossible combination).
  function cvCategoryStep(inputs: string[]) {
    const sets = inputs.map((inp) => new Set(allowedCategories(inp)));
    const allowed = [0, 1, 2, 3].filter((c) => sets.every((set) => set.has(c)));
    if (!allowed.length) {
      log(t("conv.mixedTypes"), "info");
      return;
    }
    const labelOf = (i: number) =>
      i === 0 ? t("download.video") : i === 1 ? t("download.audio") : i === 2 ? t("download.image") : "pdf";
    setWizard({
      title: t("wiz.outputMethod"),
      options: allowed.map(labelOf),
      back: false,
      onPick: (k) => cvFormatStep(inputs, allowed[k]),
    });
  }
  function cvFormatStep(inputs: string[], catIndex: number) {
    const group = CONVERT_GROUPS[catIndex];
    setWizard({
      title: t("convert.output"),
      options: [...group.formats],
      back: true,
      onPick: (j) => {
        setWizard(null);
        const fmt = group.formats[j];
        // Several images → one combined PDF (not one file each).
        if (fmt === "pdf") imagesToPdf(inputs);
        else inputs.forEach((inp) => runConvert(inp, fmt));
      },
      onBack: () => cvCategoryStep(inputs),
    });
  }

  function dlKindStep(url: string) {
    setWizard({
      title: t("download.kind"),
      options: [t("download.video"), t("download.audio")],
      back: false,
      onPick: (i) => dlFormatStep(url, i === 0 ? "video" : "audio"),
    });
  }
  function dlFormatStep(url: string, kind: DownloadKind) {
    const formats = kind === "audio" ? DOWNLOAD_AUDIO : DOWNLOAD_VIDEO;
    setWizard({
      title: t("download.format"),
      options: [...formats],
      back: true,
      onPick: (j) => dlQualityStep(url, kind, formats[j]),
      onBack: () => dlKindStep(url),
    });
  }
  function dlQualityStep(url: string, kind: DownloadKind, format: string) {
    const quals = kind === "audio" ? AUDIO_QUALITIES : VIDEO_QUALITIES;
    setWizard({
      title: t("download.quality"),
      options: quals.map((q) => (q === "auto" ? t("common.auto") : q)),
      back: true,
      onPick: (k) => {
        setWizard(null);
        runDownloadFlow(url, kind, format, quals[k]);
      },
      onBack: () => dlFormatStep(url, kind),
    });
  }

  function wizardKey(n: number) {
    if (!wizard) return;
    if (n === 0) {
      if (wizard.back && wizard.onBack) wizard.onBack();
      return;
    }
    const i = n - 1;
    if (i >= 0 && i < wizard.options.length) wizard.onPick(i);
  }

  // ── detailed conversion wizard (slash /<format> + a file) ────────────────────
  // A numeric step: "keep" + presets + "other (typed)". onValue gets null (keep),
  // a preset, or the typed number; then it advances.
  function numStep(o: {
    title: string;
    presets: number[];
    askLabel: string;
    keepLabel?: string;
    onValue: (v: number | null) => void;
    goNext: () => void;
    goBack?: () => void;
  }) {
    const labels = [o.keepLabel ?? t("wiz.keep"), ...o.presets.map(String), t("wiz.other")];
    setWizard({
      title: o.title,
      options: labels,
      back: !!o.goBack,
      onBack: o.goBack,
      onPick: (j) => {
        if (j === 0) {
          o.onValue(null);
          o.goNext();
        } else if (j === labels.length - 1) {
          setWizard(null); // free-text prompt only shows when no wizard is open
          setAsk({
            label: o.askLabel,
            onAnswer: (txt) => {
              setAsk(null);
              const n = parseFloat(txt.replace(",", "."));
              o.onValue(!isNaN(n) && n > 0 ? n : null);
              o.goNext();
            },
          });
        } else {
          o.onValue(o.presets[j - 1]);
          o.goNext();
        }
      },
    });
  }

  // A yes/typed step (crop, trim): "no" advances; "yes" asks for typed values
  // that `parse` folds into the draft (an invalid answer is treated as "no").
  function askStep(o: {
    title: string;
    noLabel: string;
    yesLabel: string;
    askLabel: string;
    parse: (txt: string) => void;
    clear: () => void;
    goNext: () => void;
    goBack?: () => void;
  }) {
    setWizard({
      title: o.title,
      options: [o.noLabel, o.yesLabel],
      back: !!o.goBack,
      onBack: o.goBack,
      onPick: (j) => {
        if (j === 0) {
          o.clear();
          o.goNext();
        } else {
          setWizard(null);
          setAsk({
            label: o.askLabel,
            onAnswer: (txt) => {
              setAsk(null);
              o.parse(txt);
              o.goNext();
            },
          });
        }
      },
    });
  }

  // Walks the type-appropriate option steps once, then converts every input file
  // with those settings.
  function detailedConvert(inputs: string[], format: string) {
    const fmt = format.toLowerCase();
    // pdf input/output and audio outputs have no visual editor — let runConvert
    // handle them (and their own routing/messages) without the options wizard.
    if (fmt === "pdf" || AUDIO_FORMATS.has(fmt)) {
      inputs.forEach((inp) => runConvert(inp, fmt));
      return;
    }
    // Keep only the files that can actually become this format; warn about the
    // rest now, before asking any options.
    const ok: string[] = [];
    for (const inp of inputs) {
      const inExt = (inp.split(".").pop() ?? "").toLowerCase();
      if (inExt === "pdf") {
        runConvert(inp, fmt); // pdf input → runConvert routes/handles it
        continue;
      }
      const issue = conversionIssue(inExt, fmt);
      if (issue) log(t(issue), "info");
      else ok.push(inp);
    }
    if (!ok.length) return;

    const imageOut = IMAGE_IN.has(fmt) && fmt !== "gif";
    // Real video containers take a codec choice; gif/webm don't (webm forces vp9).
    const realVideo = VIDEO_OUT.has(fmt) && fmt !== "gif" && fmt !== "webm";
    const draft: VideoToolValues = { ...DEFAULT_VIDEO_TOOLS };
    let codec = s.cvCodec;
    const steps: Array<(next: () => void, back?: () => void) => void> = [];

    steps.push((next, back) =>
      numStep({
        title: t("wiz.resolution"),
        presets: [1080, 720, 480, 360],
        askLabel: t("wiz.askHeight"),
        onValue: (v) => (draft.scaleHeight = v == null ? null : Math.round(v)),
        goNext: next,
        goBack: back,
      }),
    );
    if (realVideo) {
      steps.push((next, back) =>
        setWizard({
          title: t("menu.codec"),
          options: VIDEO_CODECS.map((c) => c.label),
          back: !!back,
          onBack: back,
          onPick: (i) => {
            codec = VIDEO_CODECS[i].id;
            next();
          },
        }),
      );
    }
    if (!imageOut) {
      steps.push((next, back) =>
        numStep({
          title: t("convert.fps"),
          presets: [24, 30, 60],
          askLabel: t("wiz.askFps"),
          onValue: (v) => {
            draft.fps = v;
            draft.fpsCustom = v != null;
          },
          goNext: next,
          goBack: back,
        }),
      );
    }
    steps.push((next, back) =>
      askStep({
        title: t("wiz.crop"),
        noLabel: t("wiz.noCrop"),
        yesLabel: t("wiz.doCrop"),
        askLabel: t("wiz.askCrop"),
        clear: () => (draft.cropOn = false),
        parse: (txt) => {
          const n = txt.split(/[\s,]+/).map(Number).filter((x) => !isNaN(x));
          if (n.length === 4) {
            draft.cropOn = true;
            [draft.cropW, draft.cropH, draft.cropX, draft.cropY] = n;
          } else draft.cropOn = false;
        },
        goNext: next,
        goBack: back,
      }),
    );
    if (!imageOut) {
      // Trim: ask start, then (on Enter) ask end. "0" start = from the beginning.
      steps.push((next, back) =>
        setWizard({
          title: t("wiz.trim"),
          options: [t("wiz.full"), t("wiz.doTrim")],
          back: !!back,
          onBack: back,
          onPick: (j) => {
            if (j === 0) {
              draft.trimOn = false;
              next();
              return;
            }
            setWizard(null);
            setAsk({
              label: t("wiz.askTrimStart"),
              onAnswer: (startTxt) => {
                setAsk(null);
                const start = startTxt.trim();
                setAsk({
                  label: t("wiz.askTrimEnd"),
                  onAnswer: (endTxt) => {
                    setAsk(null);
                    draft.trimOn = true;
                    draft.trimStart = start === "" || start === "0" ? "00:00:00" : start;
                    draft.trimEnd = endTxt.trim();
                    next();
                  },
                });
              },
            });
          },
        }),
      );
      steps.push((next, back) =>
        numStep({
          title: t("convert.speed"),
          keepLabel: t("wiz.speedNormal"),
          presets: [0.5, 1.5, 2, 4],
          askLabel: t("wiz.askSpeed"),
          onValue: (v) => {
            draft.speed = v ?? 1;
            draft.speedCustom = v != null;
          },
          goNext: next,
          goBack: back,
        }),
      );
    }

    const run = (idx: number) => {
      if (idx >= steps.length) {
        setWizard(null);
        ok.forEach((inp) => runConvert(inp, fmt, draft, codec));
        return;
      }
      steps[idx](() => run(idx + 1), idx > 0 ? () => run(idx - 1) : undefined);
    };
    run(0);
  }

  // ── slash commands ──────────────────────────────────────────
  function doExit() {
    getCurrentWindow().close().catch(() => {});
  }

  // ── settings commands (the old top menu, as slash commands) ──────────────────
  // Each opens a numbered picker when typed bare, or takes a value directly.
  function pickSetting<T>(title: string, choices: { label: string; value: T }[], apply: (v: T) => void) {
    setWizard({
      title,
      options: choices.map((c) => c.label),
      back: false,
      onPick: (i) => {
        setWizard(null);
        apply(choices[i].value);
      },
    });
  }
  async function cmdDest() {
    const d = await pickDir();
    if (d) {
      s.set({ dlDest: d, cvDest: d });
      log(`${t("menu.destination")} = ${d}`, "info");
    }
  }
  // System info + tools + gpu + credits, printed as terminal text (no modal).
  function cmdPdf(arg: string) {
    const ops: { label: string; value: PdfOp }[] = [
      { label: t("pdf.imageToPdf"), value: "image" },
      { label: t("pdf.toPng"), value: "png" },
      { label: t("pdf.toJpg"), value: "jpg" },
      { label: t("pdf.extract"), value: "extract" },
      { label: t("pdf.deletePages"), value: "delete" },
      { label: t("pdf.merge"), value: "merge" },
    ];
    const direct = ops.find((o) => o.value === (arg.toLowerCase() as PdfOp));
    if (direct) return void onPdf(direct.value);
    pickSetting(t("pdf.title"), ops, (op) => void onPdf(op));
  }

  // /video: prompt for the cover image (or a video) first, then the audio, then
  // the options (layout, blurred bg, lossless audio, normalize), then render.
  async function videoSlash() {
    log(t("video.askImage"), "info");
    const image = await pickFile([
      "jpg", "jpeg", "png", "webp", "bmp", // image cover
      "mp4", "mkv", "mov", "webm", "avi", "m4v", // or a video
    ]);
    if (!image) return;
    log(image, "echo");
    log(t("video.askAudio"), "info");
    const audio = await pickFile(["mp3", "m4a", "opus", "flac", "wav", "aac", "ogg"]);
    if (!audio) return;
    log(audio, "echo");

    const opts: CoverOpts = {
      layout: s.ytLayout,
      blurred: s.ytBlurred,
      copyAudio: s.ytCopyAudio,
      normalize: s.ytNormalize,
    };
    const yesNo = (title: string, set: (v: boolean) => void, next: () => void, back?: () => void) =>
      setWizard({
        title,
        options: [t("common.yes"), t("common.no")],
        back: !!back,
        onBack: back,
        onPick: (i) => {
          set(i === 0);
          next();
        },
      });
    const layouts: CoverLayout[] = ["square", "wide", "fit_image"];
    const steps: Array<(next: () => void, back?: () => void) => void> = [
      (next, back) =>
        setWizard({
          title: t("cover.layout"),
          options: [t("cover.square"), t("cover.wide"), t("cover.fit")],
          back: !!back,
          onBack: back,
          onPick: (i) => {
            opts.layout = layouts[i];
            next();
          },
        }),
      (next, back) => yesNo(t("cover.blurred"), (v) => (opts.blurred = v), next, back),
      (next, back) => yesNo(t("cover.copyAudio"), (v) => (opts.copyAudio = v), next, back),
      (next, back) => yesNo(t("cover.normalize"), (v) => (opts.normalize = v), next, back),
    ];
    const run = (idx: number) => {
      if (idx >= steps.length) {
        setWizard(null);
        s.set({
          ytImage: image,
          ytAudio: audio,
          ytLayout: opts.layout,
          ytBlurred: opts.blurred,
          ytCopyAudio: opts.copyAudio,
          ytNormalize: opts.normalize,
        });
        coverRender(image, audio, opts);
        return;
      }
      steps[idx](() => run(idx + 1), idx > 0 ? () => run(idx - 1) : undefined);
    };
    run(0);
  }

  // /sub and /leg: attach a subtitle to a video — pick the video, then the
  // subtitle file, then ask delay (if any) and soft-embed vs burn-in.
  async function subSlash() {
    log(t("sub.askVideo"), "info");
    const video = await pickFile(["mp4", "mkv", "mov", "webm", "avi", "m4v", "ts"]);
    if (!video) return;
    log(video, "echo");
    log(t("sub.askFile"), "info");
    const subtitle = await pickFile(["srt", "vtt", "ass", "ssa", "sub"]);
    if (!subtitle) return;
    log(subtitle, "echo");

    const finish = (delay: number, burn: boolean) => {
      setWizard(null);
      if (lines.length) divider();
      const vext = (video.split(".").pop() || "mp4").toLowerCase();
      const output = outputPath(video, vext, s.cvDest);
      // Burn-in re-encodes the picture → use the chosen codec + GPU (h264_amf,
      // etc.) so it isn't forced onto software libx264. Soft embed ignores these.
      const job: SubtitleJob = {
        video, subtitle, output, burn, delaySec: delay, overwrite: true,
        videoCodec: burn ? s.cvCodec : null,
        hwAccel: burn ? resolveHw() : null,
      };
      runSub(job, basename(output));
    };
    const modeStep = (delay: number) =>
      setWizard({
        title: t("sub.modeQ"),
        options: [t("sub.soft"), t("sub.burn")],
        back: false,
        onPick: (i) => finish(delay, i === 1),
      });
    // First: is the subtitle out of sync?
    setWizard({
      title: t("sub.delayQ"),
      options: [t("common.no"), t("common.yes")],
      back: false,
      onPick: (i) => {
        if (i === 0) {
          modeStep(0);
          return;
        }
        setWizard(null);
        setAsk({
          label: t("sub.askDelay"),
          onAnswer: (txt) => {
            setAsk(null);
            const d = parseFloat(txt.replace(",", ".")) || 0;
            modeStep(d);
          },
        });
      },
    });
  }

  // /subextract: pull an embedded subtitle track out of a video into a file.
  async function subExtractSlash() {
    log(t("subx.askVideo"), "info");
    const video = await pickFile(["mkv", "mp4", "mov", "webm", "avi", "m4v", "ts"]);
    if (!video) return;
    log(video, "echo");
    log(t("subx.scanning"), "info");
    const tracks = (await api.listSubtitleTracks(video).catch(() => [])).filter((tr) => tr.text);
    if (!tracks.length) {
      log(t("subx.none"), "err");
      return;
    }
    const fmts = ["srt", "vtt", "ass"];
    setWizard({
      title: t("subx.pickTrack"),
      options: tracks.map((tr) => `${tr.lang || "und"} · ${tr.codec}`),
      back: false,
      onPick: (i) =>
        setWizard({
          title: t("sub.fmtQ"),
          options: fmts,
          back: false,
          onPick: (j) => {
            setWizard(null);
            if (lines.length) divider();
            const output = outputPath(video, fmts[j], s.cvDest);
            runSubExtract(video, tracks[i].index, output, basename(output));
          },
        }),
    });
  }

  // /subconvert: convert a subtitle file between srt / vtt / ass.
  async function subConvertSlash() {
    log(t("subc.askFile"), "info");
    const input = await pickFile(["srt", "vtt", "ass", "ssa", "sub"]);
    if (!input) return;
    log(input, "echo");
    const fmts = ["srt", "vtt", "ass"];
    setWizard({
      title: t("sub.fmtQ"),
      options: fmts,
      back: false,
      onPick: (j) => {
        setWizard(null);
        if (lines.length) divider();
        const output = outputPath(input, fmts[j], s.cvDest);
        runSubConvert(input, output, basename(output));
      },
    });
  }

  // Dispatch table for the slash commands (english canonical + pt aliases).
  // Appearance/gpu/codec/about/reset moved to the menu + settings window.
  const settingsCommands: Record<string, (arg: string) => void> = {
    dest: () => void cmdDest(), destino: () => void cmdDest(),
    video: videoSlash, "vídeo": videoSlash,
    sub: subSlash, leg: subSlash,
    subextract: subExtractSlash, legextrair: subExtractSlash,
    subconvert: subConvertSlash, legconverter: subConvertSlash,
  };

  // Pre-flight a link with yt-dlp so an unsupported/unavailable URL is reported
  // up front, before any download options. Returns whether to proceed.
  async function checkUrl(url: string): Promise<boolean> {
    log(t("term.checkingLink"), "info");
    const res = await api.validateUrl(url).catch(() => ({ ok: true, message: "" }));
    if (!res.ok) {
      log(t(errorKey(res.message)), "err");
      return false;
    }
    return true;
  }

  function applyFormatCommand(fmt: string, arg: string) {
    if (arg) {
      if (isUrl(arg)) {
        const kind: DownloadKind = AUDIO_FORMATS.has(fmt) ? "audio" : "video";
        checkUrl(arg).then((ok) => {
          if (ok) runDownloadFlow(arg, kind, downloadFormatFor(fmt, kind), "auto");
        });
      } else if (isFilePath(arg)) {
        // A slash format means "I want the detailed options for this file".
        detailedConvert([arg], fmt);
      } else {
        log(t("term.unknown"), "err");
      }
    } else {
      // Remember the format silently — the next dropped/pasted/chosen file opens
      // the detailed options. (No noisy confirmation line.)
      setPendingFormat(fmt);
    }
  }

  function handleSlash(raw: string) {
    log(raw, "echo");
    const parts = raw.slice(1).trim().split(/\s+/);
    const typed = (parts[0] || "").toLowerCase();
    const arg = parts.slice(1).join(" ").trim();

    // Autocomplete: if what was typed isn't an exact command but is a unique
    // prefix of one, run that (so "/vid" → video without finishing the word).
    const names = ["cancel", "cancelar", "c", "open", "abrir", "pdf", ...Object.keys(settingsCommands), ...ALL_FORMATS];
    let cmd = typed;
    if (typed && !names.includes(typed)) {
      const matches = names.filter((n) => n.startsWith(typed));
      if (matches.length === 1) cmd = matches[0];
    }

    if (cmd === "cancel" || cmd === "cancelar" || cmd === "c") cancelAll();
    else if (cmd === "open" || cmd === "abrir") {
      if (lastDir.current) openPath(lastDir.current).catch(() => {});
      else log(t("term.noDest"), "info");
    } else if (cmd === "pdf") cmdPdf(arg);
    else if (settingsCommands[cmd]) settingsCommands[cmd](arg);
    else if (isFormatCommand(cmd)) applyFormatCommand(cmd, arg);
    else log(`${t("cmd.unknown")}: /${typed}`, "err");
  }

  // ── submit handlers ─────────────────────────────────────────
  // Convert one or more files together. A slash format → the detailed wizard
  // (asked once, applied to all); otherwise the quick output picker (once, all).
  function startConvert(inputs: string[]) {
    const files = inputs.map((p) => p.trim()).filter(Boolean);
    if (!files.length) return;
    files.forEach((f) => log(f, "echo"));
    if (pendingFormat) {
      const fmt = pendingFormat;
      setPendingFormat(null);
      detailedConvert(files, fmt);
    } else {
      cvCategoryStep(files);
    }
  }

  async function submitLink(url: string) {
    log(url, "echo");
    if (!(await checkUrl(url))) return;
    if (pendingFormat) {
      const f = pendingFormat;
      setPendingFormat(null);
      const kind: DownloadKind = AUDIO_FORMATS.has(f) ? "audio" : "video";
      runDownloadFlow(url, kind, downloadFormatFor(f, kind), "auto");
    } else {
      dlKindStep(url);
    }
  }

  function submitRaw(raw: string) {
    const items = raw.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, MAX_BATCH);
    if (!items.length) return;
    if (lines.length) divider(); // separate this run from the previous output
    const files: string[] = [];
    for (const it of items) {
      if (it.toLowerCase() === "exit") doExit();
      else if (it.startsWith("/")) handleSlash(it);
      else if (isUrl(it)) submitLink(it);
      else if (isFilePath(it)) files.push(it);
      else {
        log(it, "echo");
        log(t("term.unknown"), "err");
      }
    }
    if (files.length) startConvert(files);
  }

  async function chooseFile() {
    try {
      const p = await open({ multiple: true });
      const paths = Array.isArray(p) ? p : typeof p === "string" ? [p] : [];
      if (paths.length) startConvert(paths);
    } catch {
      /* not under Tauri */
    }
  }

  // Dropped files: if several images are dropped while PDF is the chosen output,
  // combine them into one PDF; otherwise convert them together.
  function handleDrop(paths: string[]) {
    const isImg = (p: string) => IMAGE_IN.has((p.split(".").pop() ?? "").toLowerCase());
    const wantPdf = pendingFormat === "pdf" || (!!s.touched.cvFormat && s.cvFormat === "pdf");
    if (paths.length >= 2 && wantPdf && paths.every(isImg)) {
      if (pendingFormat === "pdf") setPendingFormat(null);
      imagesToPdf(paths);
      return;
    }
    if (lines.length) divider();
    startConvert(paths);
  }

  // A real filename for a pasted blob; screenshots arrive nameless or as the
  // generic "image.png", so synthesize a unique name from the MIME type.
  function pastedName(f: File): string {
    const raw = basename(f.name || "");
    if (raw && raw.toLowerCase() !== "image.png") return raw;
    const ext = (f.type.split("/")[1] || "bin").replace("jpeg", "jpg").replace("svg+xml", "svg");
    return `colado-${Date.now()}.${ext}`;
  }

  // Ctrl+V of an image/file (not text). The browser gives no real path, so the
  // bytes are written to a temp file and then converted like a dropped file.
  async function handlePaste(files: File[]) {
    const usable = files.filter((f) => f.size <= 300 * 1024 * 1024);
    if (!usable.length) {
      if (lines.length) divider();
      log(t("term.pasteBig"), "err"); // only reached when every file was too big
      return;
    }
    if (lines.length) divider();
    const paths: string[] = [];
    for (const f of usable) {
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        paths.push(await api.savePastedFile(pastedName(f), Array.from(buf)));
      } catch {
        log(t("term.pasteFail"), "err");
      }
    }
    if (paths.length) startConvert(paths);
  }

  // Build the destination for a combined "N images → 1 pdf".
  function imagesPdfOut(first: string): string {
    const dir = (s.cvDest ?? dirOf(first)).replace(/\\/g, "/").replace(/\/+$/, "");
    return `${dir}/imagens (ngc).pdf`;
  }

  // "C:\\a\\doc.pdf" → "C:/a/doc (ngc)" (the per-page images become "doc (ngc)-1.png", …).
  function outStem(input: string): string {
    const norm = input.replace(/\\/g, "/");
    const slash = norm.lastIndexOf("/");
    const base = norm.slice(slash + 1).replace(/\.[^.]+$/, "");
    const dir = s.cvDest ? s.cvDest.replace(/\\/g, "/").replace(/\/+$/, "") : slash >= 0 ? norm.slice(0, slash) : ".";
    return `${dir}/${base} (ngc)`;
  }

  // Turn one-or-more images into a PDF (1 image = 1 page, many = many pages).
  function imagesToPdf(list: string[]) {
    if (!list.length) return;
    if (lines.length) divider();
    if (list.length === 1) {
      log(list[0], "echo");
      const out = outputPath(list[0], "pdf", s.cvDest);
      runImages(list, out, basename(out));
    } else {
      log(`${list.length} ${t("pdf.imagesToPdf")}`, "echo");
      const out = imagesPdfOut(list[0]);
      runImages(list, out, basename(out));
    }
  }

  // PDF tools (dedicated menu category).
  async function onPdf(op: "image" | "merge" | "png" | "jpg" | "extract" | "delete") {
    try {
      if (op === "image") {
        // One menu item handles both: pick one or many images.
        const ps = await open({ multiple: true, filters: [{ name: "image", extensions: [...CONVERT_IMAGE] }] });
        imagesToPdf(Array.isArray(ps) ? ps : ps ? [ps] : []);
        return;
      }
      if (op === "png" || op === "jpg") {
        const pdf = await open({ multiple: false, filters: [{ name: "pdf", extensions: ["pdf"] }] });
        if (typeof pdf !== "string") return;
        if (lines.length) divider();
        log(pdf, "echo");
        const stem = outStem(pdf);
        runPdfToImg(pdf, stem, op, basename(`${stem}-1.${op}`));
        return;
      }
      if (op === "merge") {
        const ps = await open({ multiple: true, filters: [{ name: "pdf", extensions: ["pdf"] }] });
        const list = Array.isArray(ps) ? ps : ps ? [ps] : [];
        if (list.length < 2) return; // need at least two to merge
        if (lines.length) divider();
        log(`${t("pdf.merge")} (${list.length})`, "echo");
        const dir = (s.cvDest ?? dirOf(list[0])).replace(/\\/g, "/").replace(/\/+$/, "");
        const out = `${dir}/merged (ngc).pdf`;
        runMerge(list, out, basename(out));
        return;
      }
      const pdf = await open({ multiple: false, filters: [{ name: "pdf", extensions: ["pdf"] }] });
      if (typeof pdf !== "string") return;
      if (lines.length) divider();
      log(pdf, "echo");
      setAsk({
        label: t("pdf.askPages"),
        onAnswer: (range) => {
          setAsk(null);
          const pages = parseRange(range);
          if (!pages.length) {
            log(t("pdf.askPages"), "err");
            return;
          }
          const out = outputPath(pdf, "pdf", s.cvDest);
          runPdfPages(pdf, out, pages, op === "extract", basename(out));
        },
      });
    } catch {
      /* not under Tauri */
    }
  }

  // youtube (private): render the cover → video for real.
  async function coverRender(image: string, audio: string, opts: CoverOpts) {
    if (lines.length) divider();
    log(t("cover.render"), "echo");
    const job: CoverVideoJob = {
      image,
      audio,
      output: outputPath(audio, "mp4", s.cvDest),
      layout: opts.layout,
      blurredBackground: opts.blurred,
      copyAudio: opts.copyAudio,
      normalizeAudio: opts.normalize,
      overwrite: true,
    };
    const args = await api.previewCoverVideoArgs(job).catch(() => null);
    if (args && args.length) log("ffmpeg " + args.join(" "), "cmd");
    runCover(job, basename(job.output));
  }

  // Global keys: F1 opens help (always). Shift+Backspace / Ctrl+L clear the
  // screen; "/" focuses the prompt — both fire even while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F1") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      // Don't let the other shortcuts fire while a modal is open.
      if (document.querySelector(".modal-overlay")) return;
      if (matchesBinding(DEFAULTS.clear, e) || (e.ctrlKey && e.key.toLowerCase() === "l")) {
        e.preventDefault();
        clearScreen();
        return;
      }
      // "/" focuses the prompt — but not while editing text.
      if (e.key === "/" && !isEditableTarget()) {
        e.preventDefault();
        focusPrompt();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync OS-level settings to the backend on launch (so close-to-tray / autostart
  // reflect the saved prefs).
  useEffect(() => {
    api.setTray(settings.tray).catch(() => {});
    api.setAutostart(settings.autostart).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "remover animações" → a CSS hook on <html> that neutralizes every CSS
  // animation/transition (the JS nebula + typewriter are gated separately).
  useEffect(() => {
    const root = document.documentElement;
    if (settings.reduceMotion) root.dataset.reduceMotion = "1";
    else delete root.dataset.reduceMotion;
  }, [settings.reduceMotion]);

  // Ask once for OS notification permission (used when a job finishes).
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Detect hardware encoder families once (drives the gpu picker + default).
  useEffect(() => {
    api.detectCapabilities().then((c) => setHwEncoders(c.hwEncoders)).catch(() => {});
  }, []);

  // First run (default state): the app ships in English; immediately offer the
  // language picker. Shown once — choosing or dismissing won't reopen it.
  useEffect(() => {
    try {
      if (localStorage.getItem("ngc7023.langChosen")) return;
      localStorage.setItem("ngc7023.langChosen", "1");
    } catch {
      return;
    }
    // Let the boot animation play first, then offer the language picker.
    const id = setTimeout(
      () =>
        pickSetting(
          t("menu.langs"),
          LANGS.map((l) => ({ label: LANG_LABELS[l], value: l })),
          (l) => setLang(l),
        ),
      1700,
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="app">
      <TitleBar />
      <MenuBar
        hwEncoders={hwEncoders}
        onLog={(text) => log(text, "info")}
        onAbout={() => setAboutOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onHelp={() => setHelpOpen(true)}
      />

      <Terminal
        lines={lines}
        inputRef={inputRef}
        onSubmit={submitRaw}
        onDropFiles={handleDrop}
        onPasteFiles={handlePaste}
        onChooseFile={chooseFile}
        onOpenJob={openJob}
        onCancelJob={cancel}
        onHelp={() => setHelpOpen(true)}
        boot={boot.current && !settings.reduceMotion}
        reduceMotion={settings.reduceMotion}
        wizard={wizard}
        onWizardKey={wizardKey}
        onWizardCancel={() => setWizard(null)}
        ask={ask ? { label: ask.label } : null}
        onAsk={(text) => ask?.onAnswer(text)}
        onAskCancel={() => setAsk(null)}
      />

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

export default App;
