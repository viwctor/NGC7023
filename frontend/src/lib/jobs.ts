// Frontend side of the job engine: start a real conversion and subscribe to the
// progress/done events the Rust backend emits.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CoverVideoJob, DownloadJob, MediaJob, SubtitleJob } from "./api";

export interface JobProgressEvent {
  id: number;
  percent: number;
  speed?: string;
  eta?: string;
}

export interface JobDoneEvent {
  id: number;
  success: boolean;
  cancelled: boolean;
  message: string;
}

export function runMediaJob(job: MediaJob): Promise<number> {
  return invoke<number>("run_media_job", { job });
}

export function runDownloadJob(job: DownloadJob): Promise<number> {
  return invoke<number>("run_download_job", { job });
}

export function runSubtitleJob(job: SubtitleJob): Promise<number> {
  return invoke<number>("run_subtitle_job", { job });
}

export function runCoverJob(job: CoverVideoJob): Promise<number> {
  return invoke<number>("run_cover_job", { job });
}

export function runImagePdfJob(input: string, output: string): Promise<number> {
  return invoke<number>("run_image_pdf_job", { input, output });
}

export function runImagesPdfJob(inputs: string[], output: string): Promise<number> {
  return invoke<number>("run_images_pdf_job", { inputs, output });
}

export function runPdfPagesJob(input: string, output: string, pages: number[], keep: boolean): Promise<number> {
  return invoke<number>("run_pdf_pages_job", { input, output, pages, keep });
}

export function runMergePdfJob(inputs: string[], output: string): Promise<number> {
  return invoke<number>("run_merge_pdf_job", { inputs, output });
}

export function runPdfImagesJob(input: string, stem: string, format: string): Promise<number> {
  return invoke<number>("run_pdf_images_job", { input, stem, format });
}

export function cancelJob(id: number): Promise<void> {
  return invoke<void>("cancel_job", { id });
}

export function onJobProgress(cb: (e: JobProgressEvent) => void): Promise<UnlistenFn> {
  return listen<JobProgressEvent>("job:progress", (ev) => cb(ev.payload));
}

export function onJobDone(cb: (e: JobDoneEvent) => void): Promise<UnlistenFn> {
  return listen<JobDoneEvent>("job:done", (ev) => cb(ev.payload));
}
