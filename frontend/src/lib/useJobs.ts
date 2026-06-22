// Job queue with bounded concurrency. No matter how many links the user pastes,
// at most MAX_CONCURRENT external processes run at once. The queue doesn't hold
// its own display state: it reports new jobs and progress through callbacks, so
// the caller can render each job *in place* in the terminal scrollback (keeping
// everything in the order it happened).

import { useEffect, useRef } from "react";
import type { CoverVideoJob, DownloadJob, MediaJob, SubtitleJob } from "./api";
import {
  cancelJob,
  onJobDone,
  onJobProgress,
  runCoverJob,
  runDownloadJob,
  runImagePdfJob,
  runImagesPdfJob,
  runMediaJob,
  runMergePdfJob,
  runPdfImagesJob,
  runPdfPagesJob,
  runSubtitleJob,
} from "./jobs";

const MAX_CONCURRENT = 3;

export interface JobPatch {
  progress?: number | null; // 0–100, or null when finished
  error?: boolean;
  detail?: string;
  queued?: boolean;
  cancelled?: boolean;
  speed?: string;
  eta?: string;
}

export interface JobCallbacks {
  /** A job entered the queue (starts queued). `out` is its output file/folder. */
  onNew: (uid: number, label: string, tag: string, out: string) => void;
  /** A job's state changed (started, progressed, finished, errored). */
  onUpdate: (uid: number, patch: JobPatch) => void;
}

type PendingItem =
  | { uid: number; kind: "media"; job: MediaJob }
  | { uid: number; kind: "download"; job: DownloadJob }
  | { uid: number; kind: "cover"; job: CoverVideoJob }
  | { uid: number; kind: "subtitle"; job: SubtitleJob }
  | { uid: number; kind: "pdf"; input: string; output: string }
  | { uid: number; kind: "pdfimages"; inputs: string[]; output: string }
  | { uid: number; kind: "pdfmerge"; inputs: string[]; output: string }
  | { uid: number; kind: "pdfimg"; input: string; stem: string; format: string }
  | { uid: number; kind: "pdfpages"; input: string; output: string; pages: number[]; keep: boolean };

export function useJobs(cb: JobCallbacks) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const pending = useRef<PendingItem[]>([]);
  const running = useRef(0);
  const idMap = useRef<Map<number, number>>(new Map()); // backend id -> local uid
  const uidToId = useRef<Map<number, number>>(new Map()); // local uid -> backend id
  const uidCounter = useRef(0);

  function pump() {
    while (running.current < MAX_CONCURRENT && pending.current.length > 0) {
      const item = pending.current.shift()!;
      running.current++;
      cbRef.current.onUpdate(item.uid, { queued: false, progress: 0 });
      const start =
        item.kind === "download"
          ? runDownloadJob(item.job)
          : item.kind === "cover"
            ? runCoverJob(item.job)
            : item.kind === "subtitle"
              ? runSubtitleJob(item.job)
              : item.kind === "pdf"
              ? runImagePdfJob(item.input, item.output)
              : item.kind === "pdfimages"
                ? runImagesPdfJob(item.inputs, item.output)
                : item.kind === "pdfmerge"
                  ? runMergePdfJob(item.inputs, item.output)
                  : item.kind === "pdfimg"
                    ? runPdfImagesJob(item.input, item.stem, item.format)
                    : item.kind === "pdfpages"
                      ? runPdfPagesJob(item.input, item.output, item.pages, item.keep)
                      : runMediaJob(item.job);
      start
        .then((backendId) => {
          idMap.current.set(backendId, item.uid);
          uidToId.current.set(item.uid, backendId);
        })
        .catch((e) => {
          running.current = Math.max(0, running.current - 1);
          cbRef.current.onUpdate(item.uid, { progress: null, error: true, detail: String(e) });
          pump();
        });
    }
  }

  useEffect(() => {
    const subs = [
      onJobProgress((e) => {
        const uid = idMap.current.get(e.id);
        if (uid != null) cbRef.current.onUpdate(uid, { progress: Math.round(e.percent), speed: e.speed, eta: e.eta });
      }),
      onJobDone((e) => {
        const uid = idMap.current.get(e.id);
        idMap.current.delete(e.id);
        if (uid != null) uidToId.current.delete(uid);
        running.current = Math.max(0, running.current - 1);
        if (uid != null) {
          cbRef.current.onUpdate(uid, {
            progress: null,
            error: !e.success && !e.cancelled,
            cancelled: e.cancelled,
            detail: e.success ? undefined : e.message,
          });
        }
        pump();
      }),
    ];
    return () => {
      subs.forEach((p) => p.then((un) => un()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enqueue(
    item:
      | { kind: "media"; job: MediaJob }
      | { kind: "download"; job: DownloadJob }
      | { kind: "cover"; job: CoverVideoJob }
      | { kind: "subtitle"; job: SubtitleJob }
      | { kind: "pdf"; input: string; output: string }
      | { kind: "pdfimages"; inputs: string[]; output: string }
      | { kind: "pdfmerge"; inputs: string[]; output: string }
      | { kind: "pdfimg"; input: string; stem: string; format: string }
      | { kind: "pdfpages"; input: string; output: string; pages: number[]; keep: boolean },
    label: string,
    tag: string,
    out: string,
  ) {
    const uid = ++uidCounter.current;
    cbRef.current.onNew(uid, label, tag, out);
    pending.current.push({ uid, ...item });
    pump();
  }

  const runMedia = (job: MediaJob, label: string) => enqueue({ kind: "media", job }, label, "convert", job.output);
  const runDownload = (job: DownloadJob, label: string) => enqueue({ kind: "download", job }, label, "download", job.outputDir);
  const runCover = (job: CoverVideoJob, label: string) => enqueue({ kind: "cover", job }, label, "youtube", job.output);
  const runSub = (job: SubtitleJob, label: string) => enqueue({ kind: "subtitle", job }, label, "convert", job.output);
  const runPdf = (input: string, output: string, label: string) => enqueue({ kind: "pdf", input, output }, label, "pdf", output);
  const runImages = (inputs: string[], output: string, label: string) => enqueue({ kind: "pdfimages", inputs, output }, label, "pdf", output);
  const runMerge = (inputs: string[], output: string, label: string) => enqueue({ kind: "pdfmerge", inputs, output }, label, "pdf", output);
  const runPdfToImg = (input: string, stem: string, format: string, label: string) =>
    enqueue({ kind: "pdfimg", input, stem, format }, label, "pdf", `${stem}-1.${format}`);
  const runPdfPages = (input: string, output: string, pages: number[], keep: boolean, label: string) =>
    enqueue({ kind: "pdfpages", input, output, pages, keep }, label, "pdf", output);

  /** Cancel a queued job (drop it) or a running one (kill the process). */
  function cancel(uid: number) {
    const idx = pending.current.findIndex((p) => p.uid === uid);
    if (idx >= 0) {
      pending.current.splice(idx, 1);
      cbRef.current.onUpdate(uid, { queued: false, progress: null, cancelled: true });
      return;
    }
    const backendId = uidToId.current.get(uid);
    if (backendId != null) cancelJob(backendId).catch(() => {});
  }

  /** Cancel everything: drop the whole queue and kill every running process. */
  function cancelAll() {
    const queued = pending.current.splice(0, pending.current.length);
    queued.forEach((p) => cbRef.current.onUpdate(p.uid, { queued: false, progress: null, cancelled: true }));
    uidToId.current.forEach((backendId) => cancelJob(backendId).catch(() => {}));
  }

  return { runMedia, runDownload, runCover, runSub, runPdf, runImages, runMerge, runPdfToImg, runPdfPages, cancel, cancelAll };
}
