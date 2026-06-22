# NGC7023 v0.1.0

First public release of **NGC7023** — a local-first desktop app to download and
convert media, entirely on your own machine. No account, no cloud, no telemetry.

## Highlights

**Downloader (yt-dlp)**
- Paste a link from YouTube, X/Twitter, Facebook, Instagram, TikTok, Reddit and more.
- Download as video (choose a max resolution) or extract audio (mp3, opus, …).
- Links validated up front; thumbnail + metadata embedded automatically.

**Media converter (FFmpeg)**
- mp4 / mkv / mov / webm / gif / mp3 / opus / flac and more.
- Detailed per-file editing: resolution, fps, crop, trim, speed (incl. slow-motion).
- Hardware-accelerated encoding per GPU vendor — AMD (AMF/VAAPI), NVIDIA (NVENC),
  Intel (QSV) — with a software fallback.

**PDF tools** — image(s) → PDF, merge PDFs, extract/delete pages, PDF → images.

**Subtitles** — soft embed or burn-in (GPU-accelerated), with +/− re-sync delay.

**Cover → video** — still cover + audio → upload-ready video (square/widescreen,
optional blurred background, lossless audio, loudness normalization).

**Quality-of-life** — Portuguese / English / Spanish, themes, system tray,
start-with-Windows, in-app update check.

## Install

### Windows
Download **`NGC7023-Setup-0.1.0.exe`** below and run it. FFmpeg and yt-dlp come
bundled — nothing else to install.

### Linux
Download **`NGC7023-0.1.0-x86_64.AppImage`**, make it executable and run:

```bash
chmod +x NGC7023-0.1.0-x86_64.AppImage
./NGC7023-0.1.0-x86_64.AppImage
```

## Notes
- Windows 10/11 and modern Linux (x86-64) are supported. macOS is not yet available.
- yt-dlp updates itself at runtime, so download support keeps working between releases.

---

_Developed with [Claude Code](https://claude.com/claude-code) by
[viwctor](https://github.com/viwctor)._
