# branding

`icon.svg` / `icon.png` — the app icon (the "iris" concept). The in-app titlebar
loads `icon.svg`; the native/taskbar icons were generated from `icon.png` with:

```
npm run tauri icon public/branding/icon.png
```

(that writes `src-tauri/icons/*`, referenced by `tauri.conf.json`). To change the
icon, replace these two files and re-run that command.
