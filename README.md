<div align="center">

<img src="docs/logo.png" width="96" height="96" alt="NGC7023 logo" />

# NGC7023 · Downloader & Converter

A local-first desktop app to **download** videos and audio from the web and
**convert** media, images, PDFs and subtitles — entirely on your own machine.
No account, no cloud, no telemetry.

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-2b6cb0)](#install)
[![Python](https://img.shields.io/badge/python-3.12%2B-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Built with Claude Code](https://img.shields.io/badge/built%20with-Claude%20Code-d97757)](https://claude.com/claude-code)

</div>

---

<!--
  Screenshots: capture a few PNGs/GIFs of the terminal in action, drop them into
  docs/ (e.g. docs/downloader.png, docs/converter.png, docs/pdf.png) and
  uncomment the block below.

## Screenshots

| Download | Convert | PDF & subtitles |
| :---: | :---: | :---: |
| ![Downloader](docs/downloader.png) | ![Converter](docs/converter.png) | ![PDF](docs/pdf.png) |
-->

## Overview

NGC7023 is a desktop application with a **terminal-style interface**: you paste a
link or drop a file, answer a few numbered questions, and it runs the job. All the
heavy lifting is done by bundled command-line tools — **yt-dlp** for downloads and
**FFmpeg** for media — orchestrated locally. Nothing is uploaded anywhere.

It is a Python rewrite of an earlier Tauri/Rust app, keeping the same interface and
visual identity.

## Features

### Downloader
- Paste a link from YouTube, X/Twitter, Facebook, Instagram, TikTok, Reddit and
  the many other sites yt-dlp supports.
- Download as **video** (pick a max resolution) or extract **audio** (mp3, opus, …).
- Links are validated up front, so an unsupported or private URL is reported before
  you pick a format.
- Thumbnail and metadata embedded automatically.

### Media converter
- Convert between mp4, mkv, mov, webm, gif, mp3, opus, flac and more.
- **Detailed editing** per file: resolution, frame rate, crop, trim and playback
  speed (slow-motion included).
- **Hardware-accelerated encoding** detected per GPU vendor — AMD (AMF / VAAPI),
  NVIDIA (NVENC), Intel (QSV) — with a software fallback.

### PDF tools
- Image(s) → PDF (one page per image, sized to the image).
- Merge several PDFs into one.
- Extract or delete pages.
- PDF → images (one file per page).

### Subtitles
- **Soft embed** a selectable subtitle track, or **burn-in** (hardsub) directly
  into the picture.
- Re-sync out-of-time subtitles with a simple +/− delay.
- Burn-in uses your selected GPU encoder, so it isn't forced onto the CPU.

### Cover → video
- Turn a still cover image + an audio file into an upload-ready video (square or
  widescreen, optional blurred background, lossless audio passthrough, optional
  loudness normalization).

### Quality-of-life
- Three languages — **Portuguese, English, Spanish** — with automatic detection.
- Themes and adjustable font size.
- System-tray support and optional start-with-Windows.
- Built-in update check against GitHub releases.
- A settings window for defaults (default output folder, animations, tray, …).

## Install

> Packaged installers (Windows `.exe`, Linux AppImage) are published on the
> [**Releases**](https://github.com/viwctor/ngc7023/releases) page. Download the
> latest one and run it — FFmpeg and yt-dlp come bundled, nothing else to install.

Until a release is available, see [Run from source](#run-from-source) below.

## Run from source

Requirements: **Python 3.12+** and **Node.js 18+**.

```bash
# 1. Frontend (run inside ./frontend) — outputs into ../ngc7023/web
cd frontend
npm install
npm run build          # REQUIRED before launching: the app loads ngc7023/web/index.html
cd ..

# 2. Python environment
python -m venv .venv
.venv\Scripts\activate         # Windows  (use: source .venv/bin/activate on Linux)
pip install -e .

# 3. Sidecar binaries (not in git): drop ffmpeg, ffprobe and yt-dlp
#    (plain names, .exe on Windows) into ./binaries/

# 4. Launch
python -m ngc7023
```

Environment variables: `NGC_DEBUG=1` opens the webview devtools;
`NGC_DEV_URL=http://localhost:7023` loads a live Vite dev server instead of the
built files.

### Tests

```bash
python -m pytest -q
```

The suite is pure and runs anywhere; the integration tests spawn real FFmpeg and
auto-skip if no FFmpeg binary is found.

## How it works

The single most important convention: **the UI never builds a command string.** It
fills a typed options object, and a pure builder turns that into the exact argument
vector for FFmpeg / yt-dlp. This keeps the "no typing commands" promise and isolates
portable logic from platform glue.

```mermaid
flowchart LR
  UI["React terminal UI<br/>(fills typed options)"]
  Bridge["pywebview bridge<br/>(window.pywebview.api)"]
  Core["core/ builders<br/>(pure → argv)"]
  Engine["job engine<br/>(spawns processes, streams progress)"]
  Tools["FFmpeg · yt-dlp · pdfium"]

  UI --> Bridge --> Core --> Engine --> Tools
  Engine -->|"progress / done events"| UI
```

| Layer | Technology |
| --- | --- |
| Shell | Python + [pywebview](https://pywebview.flowrl.com) (WebView2 on Windows, WebKitGTK on Linux) |
| Frontend | React 19, TypeScript, Vite (terminal UI) |
| Downloads | [yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| Media | [FFmpeg](https://ffmpeg.org) |
| PDF | [pypdf](https://github.com/py-pdf/pypdf) (pages), [pypdfium2](https://github.com/pypdfium2-team/pypdfium2) (rasterize), [Pillow](https://python-pillow.org) (image → PDF) |
| Packaging | PyInstaller → Inno Setup (Windows) / AppImage (Linux) |

## Roadmap

- [ ] Packaged installers for Windows and Linux
- [ ] Auto-update download (not just notification)
- [ ] More subtitle conveniences
- [ ] macOS support

## License

Released under the [MIT License](LICENSE).

Developed with [Claude Code](https://claude.com/claude-code) by
[viwctor](https://github.com/viwctor).
