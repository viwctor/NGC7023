// The whole screen is one terminal. Banner on top (title → galaxy → tagline),
// then lines appear one at a time (typed), then the live job log, then the
// prompt. A pasted/dropped/chosen *link* becomes a download, a *file* a
// conversion; "/" opens a command palette; an untouched preset triggers a
// numbered wizard.

import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../../lib/i18n";
import { Galaxy } from "../../components/Galaxy";
import { Typed } from "../../components/Typed";
import { paletteEntries } from "../../lib/commands";
import { errorKey } from "../../lib/errors";
import { useTheme } from "../../lib/theme";
import { APP_VERSION } from "../../lib/version";

export type LineKind = "info" | "echo" | "cmd" | "out" | "err" | "divider" | "job" | "credit";

export interface TermLine {
  id: number;
  text: string;
  kind: LineKind;
  /** Optional text color (CSS value) — used to tint /about categories. */
  color?: string;
  // Job fields (kind === "job") — updated in place so the queue stays in order.
  jobUid?: number;
  progress?: number | null;
  error?: boolean;
  cancelled?: boolean;
  detail?: string;
  queued?: boolean;
  tag?: string;
  out?: string; // output file (convert) or folder (download)
  speed?: string;
  eta?: string;
}

export interface WizardView {
  title: string;
  options: string[];
  back: boolean;
}

function bar(progress: number, width = 12): string {
  const filled = Math.round((progress / 100) * width);
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

const TYPED: Record<LineKind, boolean> = {
  info: true,
  out: true,
  err: true,
  echo: true, // echo the submitted path/link as if typed, for the terminal feel
  cmd: false,
  divider: false,
  job: false,
  credit: false,
};

const PREFIX: Record<LineKind, string> = {
  info: "# ",
  echo: "❯ ",
  cmd: "",
  out: "",
  err: "× ",
  divider: "",
  job: "",
  credit: "# ",
};

const GAP_TYPED = 45;
const GAP_INSTANT = 25;

// The "viwctor" credit links to the author's GitHub profile.
const PROJECT_URL = "https://github.com/viwctor";

export function Terminal({
  lines,
  inputRef,
  onSubmit,
  onDropFiles,
  onPasteFiles,
  onChooseFile,
  onOpenJob,
  onCancelJob,
  onHelp,
  boot,
  reduceMotion,
  wizard,
  onWizardKey,
  onWizardCancel,
  ask,
  onAsk,
  onAskCancel,
}: {
  lines: TermLine[];
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSubmit: (raw: string) => void;
  onDropFiles: (paths: string[]) => void;
  onPasteFiles: (files: File[]) => void;
  onChooseFile: () => void;
  onOpenJob: (line: TermLine) => void;
  onCancelJob: (uid: number) => void;
  onHelp: () => void;
  boot?: boolean;
  reduceMotion?: boolean;
  wizard: WizardView | null;
  onWizardKey: (n: number) => void;
  onWizardCancel: () => void;
  ask: { label: string } | null;
  onAsk: (text: string) => void;
  onAskCancel: () => void;
}) {
  const { t } = useI18n();
  const { modules } = useTheme();
  const [value, setValue] = useState("");
  const [over, setOver] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // On boot, the "paste / drop / choose" hint waits until the art + intro have
  // been generated (so it doesn't flash before the animation).
  const [bootDone, setBootDone] = useState(!boot);
  useEffect(() => {
    if (!boot) return;
    const id = setTimeout(() => setBootDone(true), 2000);
    return () => clearTimeout(id);
  }, [boot]);
  const screenRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const history = useRef<string[]>([]);
  const histIdx = useRef<number>(-1);
  // The drop listener registers once, so call the latest handler via a ref —
  // otherwise it keeps the mount-time closure (stale pendingFormat), which made
  // a slash-format + drag fall back to the basic flow.
  const onDropFilesRef = useRef(onDropFiles);
  onDropFilesRef.current = onDropFiles;

  function scrollIfPinned() {
    const el = screenRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }

  // Pin to the bottom on state changes, when the user is already near the end.
  useEffect(scrollIfPinned, [lines, value, revealed, wizard]);

  // Also follow content that grows between renders (a line typing itself out).
  // Observe only the body, not the banner — the galaxy mutates ~20×/s and would
  // otherwise trigger this on every frame.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const obs = new MutationObserver(scrollIfPinned);
    obs.observe(el, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  useEffect(() => {
    if (wizard || ask) inputRef.current?.focus();
  }, [wizard, ask, inputRef]);

  useEffect(() => {
    if (revealed > lines.length) setRevealed(lines.length);
  }, [lines.length, revealed]);

  useEffect(() => {
    if (revealed >= lines.length) return;
    if (reduceMotion) {
      setRevealed(lines.length); // no sequential reveal when motion is off
      return;
    }
    if (!TYPED[lines[revealed].kind]) {
      const id = setTimeout(() => setRevealed((r) => r + 1), GAP_INSTANT);
      return () => clearTimeout(id);
    }
  }, [revealed, lines, reduceMotion]);

  // Native drag-and-drop. Guard the async unlisten against StrictMode's
  // mount→unmount→mount so the listener isn't registered twice (which made the
  // dropped path appear duplicated).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload as { type: string; paths?: string[] };
        if (p.type === "over" || p.type === "enter") setOver(true);
        else if (p.type === "leave") setOver(false);
        else if (p.type === "drop") {
          setOver(false);
          if (p.paths?.length) onDropFilesRef.current(p.paths);
        }
      })
      .then((u) => {
        if (disposed) u();
        else unlisten = u;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    if (!value.trim()) return;
    history.current.push(value);
    histIdx.current = -1;
    onSubmit(value);
    setValue("");
  }

  function recallPrev() {
    const h = history.current;
    if (!h.length) return;
    histIdx.current = histIdx.current === -1 ? h.length - 1 : Math.max(0, histIdx.current - 1);
    setValue(h[histIdx.current]);
  }
  function recallNext() {
    const h = history.current;
    if (histIdx.current === -1) return;
    if (histIdx.current >= h.length - 1) {
      histIdx.current = -1;
      setValue("");
    } else {
      histIdx.current += 1;
      setValue(h[histIdx.current]);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (wizard) {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        onWizardKey(Number(e.key));
      } else if (e.key === "Escape") {
        e.preventDefault();
        onWizardCancel();
      } else {
        e.preventDefault();
      }
      return;
    }
    if (ask) {
      // Free-text answer (e.g. a page range): type normally, Enter submits it.
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const v = value;
        setValue("");
        onAsk(v);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onAskCancel();
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp" && e.currentTarget.selectionStart === 0) {
      e.preventDefault();
      recallPrev();
    } else if (e.key === "ArrowDown" && e.currentTarget.selectionStart === value.length) {
      e.preventDefault();
      recallNext();
    }
  }

  function copyCmd(line: TermLine) {
    navigator.clipboard
      ?.writeText(line.text)
      .then(() => {
        setCopiedId(line.id);
        setTimeout(() => setCopiedId((c) => (c === line.id ? null : c)), 1300);
      })
      .catch(() => {});
  }

  const rows = Math.min(6, Math.max(1, value.split("\n").length));
  const hintPre = t("term.hintPre");
  const hintChoose = t("term.hintChoose");
  const hintDash = "─".repeat(hintPre.length + hintChoose.length + 3);
  const suggestions =
    !wizard && value.startsWith("/")
      ? paletteEntries(modules.youtube)
          .filter((e) => e.name.toLowerCase().startsWith(value.toLowerCase()))
          .slice(0, 8)
      : [];

  return (
    <div
      className={`term-screen ${over ? "over" : ""}`}
      ref={screenRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <Galaxy boot={boot} reduceMotion={reduceMotion} />

      <div
        className="intro"
        style={boot ? { animation: "boot-in 0.5s ease both", animationDelay: "1.5s" } : undefined}
      >
        <div className="intro-ver">ngc7023 v{APP_VERSION}</div>
        <div className="intro-line">
          {t("intro.pre")}{" "}
          <button type="button" className="hint-choose" onClick={onHelp}>
            {t("intro.help")}
          </button>{" "}
          {t("intro.post")}
        </div>
      </div>


      <div className="term-body" ref={bodyRef}>
      {lines.map((l, i) => {
        if (i > revealed) return null;
        const active = i === revealed;
        if (l.kind === "divider") {
          return (
            <div className="tline-divider" key={l.id}>
              {l.text}
            </div>
          );
        }
        if (l.kind === "job") {
          const done = l.progress == null;
          const ok = done && !l.error && !l.cancelled;
          const cancelable = l.queued || (!done && l.progress != null);
          return (
            <div
              className={`tline tline-job ${ok ? "job-open" : ""}`}
              key={l.id}
              onClick={ok ? (e) => { e.stopPropagation(); onOpenJob(l); } : undefined}
              title={ok ? t("job.openHint") : l.error ? l.detail : undefined}
            >
              <span className="tline-prefix">›</span>
              {l.tag && <span className="job-tag">{l.tag}</span>}
              <span className="job-label">{l.text}</span>
              {l.queued ? (
                <span className="job-q">… {t("common.queued")}</span>
              ) : l.cancelled ? (
                <span className="job-cancel">{t("common.cancelled")}</span>
              ) : done ? (
                l.error ? (
                  <span className="job-err">× {t(errorKey(l.detail))}</span>
                ) : (
                  <span className="job-ok">ok</span>
                )
              ) : (
                <>
                  <span className="job-bar">{bar(l.progress!)}</span>
                  <span className="job-pct">{l.progress}%</span>
                  {l.speed && <span className="job-meta">{l.speed}</span>}
                  {l.eta && <span className="job-meta">ETA {l.eta}</span>}
                </>
              )}
              {cancelable && (
                <button
                  className="job-x"
                  title={t("job.cancelHint")}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (l.jobUid != null) onCancelJob(l.jobUid);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        }
        if (l.kind === "cmd") {
          return (
            <div
              className={`tline tline-cmd ${copiedId === l.id ? "copied" : ""}`}
              key={l.id}
              title={t("common.copy")}
              onClick={(e) => {
                e.stopPropagation();
                copyCmd(l);
              }}
            >
              <span className="tline-prefix">❯</span>
              <span className="cmd-text">{l.text}</span>
            </div>
          );
        }
        if (l.kind === "credit") {
          return (
            <div className="tline tline-credit" key={l.id}>
              <span className="tline-prefix">#</span>
              <span>
                {t("settings.creditPre")} <span className="cc">Claude Code</span> {t("settings.creditBy")}{" "}
                <span
                  className="author"
                  title={PROJECT_URL || undefined}
                  onClick={() => PROJECT_URL && openUrl(PROJECT_URL).catch(() => {})}
                >
                  viwctor
                </span>
              </span>
            </div>
          );
        }
        return (
          <div className={`tline tline-${l.kind}`} key={l.id} style={l.color ? { color: l.color } : undefined}>
            <span className="tline-prefix">{PREFIX[l.kind]}</span>
            {TYPED[l.kind] ? (
              <Typed text={l.text} onDone={active ? () => setTimeout(() => setRevealed((r) => r + 1), GAP_TYPED) : undefined} />
            ) : (
              <span>{l.text}</span>
            )}
          </div>
        );
      })}

      {wizard ? (
        // Lines cascade in top-to-bottom (each appears in sequence), like a
        // terminal printing rows — keyed per step so it replays each time.
        <div className="wizard" key={wizard.options.join("|")}>
          <div className="wiz-q wiz-line" style={{ animationDelay: "0ms" }}>
            {wizard.title}
          </div>
          {wizard.back && (
            <div className="wiz-opt wiz-back wiz-line" style={{ animationDelay: "55ms" }}>
              <span className="wiz-num">0 -</span> {t("wiz.back")}
            </div>
          )}
          {wizard.options.map((o, i) => (
            <div className="wiz-opt wiz-line" key={i} style={{ animationDelay: `${(1 + (wizard.back ? 1 : 0) + i) * 55}ms` }}>
              <span className="wiz-num">{i + 1} -</span> {o}
            </div>
          ))}
          <div className="wiz-opt wiz-esc wiz-line" style={{ animationDelay: `${(1 + (wizard.back ? 1 : 0) + wizard.options.length) * 55}ms` }}>
            <span className="wiz-num">ESC -</span> {t("wiz.cancel")}
          </div>
        </div>
      ) : ask ? (
        <div className="wizard">
          <div className="wiz-q">{ask.label}</div>
          <div className="wiz-opt wiz-esc">
            <span className="wiz-num">ESC -</span> {t("wiz.cancel")}
          </div>
        </div>
      ) : suggestions.length ? (
        <div className="slash">
          {suggestions.map((e) => (
            <div
              className="slash-row"
              key={e.name}
              onMouseDown={(ev) => {
                ev.preventDefault();
                setValue(e.name);
                inputRef.current?.focus();
              }}
            >
              <span className="slash-name">{e.name}</span>
              <span className="slash-desc">{t(e.descKey)}</span>
            </div>
          ))}
        </div>
      ) : bootDone ? (
        <div className="hint-box">
          <div className="hint-edge">┌{hintDash}┐</div>
          {/* prettier-ignore */}
          <div className="hint-mid">│ {hintPre} <button type="button" className="hint-choose" onClick={onChooseFile}>{hintChoose}</button> │</div>
          <div className="hint-edge">└{hintDash}┘</div>
        </div>
      ) : null}

      <div className="term-prompt">
        <span className="term-caret">❯</span>
        <textarea
          ref={inputRef}
          className="term-input"
          rows={rows}
          spellCheck={false}
          autoComplete="off"
          value={value}
          onChange={(e) => {
            histIdx.current = -1;
            setValue(e.currentTarget.value);
          }}
          onPaste={(e) => {
            // A pasted image/file (anything that isn't text) → conversion; plain
            // text falls through to the textarea (a link → download, a path →
            // conversion, both on Enter).
            const dt = e.clipboardData;
            const files = Array.from(dt?.files ?? []);
            // Some sources expose a pasted file only via items (e.g. a copied
            // image), not via `files` — gather those too.
            if (!files.length && dt?.items) {
              for (const it of Array.from(dt.items)) {
                if (it.kind === "file") {
                  const f = it.getAsFile();
                  if (f) files.push(f);
                }
              }
            }
            if (files.length) {
              e.preventDefault();
              onPasteFiles(files);
            }
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      </div>
    </div>
  );
}
