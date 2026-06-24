// The menu bar — only "arquivo" (preferências / configurações / sobre) and a
// "ajuda" button. Everything else is driven by slash commands now. Submenus
// auto-flip to whichever side fits the (small) window.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LANG_LABELS, LANGS, useI18n } from "../lib/i18n";
import { FONT_SIZES, THEMES, useTheme } from "../lib/theme";
import { useStudio } from "../lib/studio";

// Base video codecs (the concrete encoder is derived from this + the GPU choice
// in the builder; all three are encodable in software on any machine).
const VIDEO_CODECS: { id: string; label: string }[] = [
  { id: "h264", label: "h264 (x264)" },
  { id: "hevc", label: "h265 (x265)" },
  { id: "av1", label: "av1" },
];
const GPU_LABELS: Record<string, string> = {
  amf: "amd (amf)",
  nvenc: "nvidia (nvenc)",
  qsv: "intel (qsv)",
  vaapi: "vaapi",
  video_toolbox: "apple (videotoolbox)",
};

export interface MenuActions {
  hwEncoders: string[];
  onLog: (text: string) => void;
  onAbout: () => void;
  onSettings: () => void;
  onHelp: () => void;
}

export function MenuBar(actions: MenuActions) {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme, fontPx, setFontPx } = useTheme();
  const s = useStudio();
  const [openId, setOpenId] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const close = () => setOpenId(null);
  const log = actions.onLog;

  useEffect(() => {
    if (!openId) return;
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  const gpuLabel = (g: string) =>
    g === "auto" ? t("gpu.auto") : g === "off" ? t("gpu.off") : GPU_LABELS[g] ?? g;
  const gpuValues = ["auto", ...actions.hwEncoders, "off"];

  return (
    <nav className="menubar" ref={navRef}>
      <ul className="mb-bar">
        {/* ── arquivo ─────────────────────────────────────── */}
        <Root id="file" label={t("menu.file")} openId={openId} setOpenId={setOpenId}>
          <Sub label={t("menu.prefs")}>
            <Sub label={t("menu.langs")}>
              {LANGS.map((l) => (
                <Radio key={l} selected={lang === l} onClick={() => { setLang(l); log(`${t("menu.langs")} = ${LANG_LABELS[l]}`); }}>
                  {LANG_LABELS[l]}
                </Radio>
              ))}
            </Sub>
            <Sub label={t("menu.gpu")}>
              {gpuValues.map((g) => (
                <Radio
                  key={g}
                  selected={s.gpu === g}
                  onClick={() => { s.set({ gpu: g }); log(`${t("menu.gpu")} = ${gpuLabel(g)}`); }}
                >
                  {gpuLabel(g)}
                </Radio>
              ))}
            </Sub>
            <Sub label={t("menu.video")}>
              {VIDEO_CODECS.map((c) => (
                <Radio key={c.id} selected={s.cvCodec === c.id} onClick={() => { s.set({ cvCodec: c.id }); log(`${t("menu.codec")} = ${c.label}`); }}>
                  {c.label}
                </Radio>
              ))}
            </Sub>
            <Sub label={t("menu.theme")}>
              {THEMES.map((th) => (
                <Radio key={th} selected={theme === th} onClick={() => { setTheme(th); log(`${t("set.theme")} ${th}`); }}>
                  {th}
                </Radio>
              ))}
            </Sub>
            <Sub label={t("menu.font")}>
              {FONT_SIZES.map((px) => (
                <Radio key={px} selected={fontPx === px} onClick={() => setFontPx(px)}>
                  {px}px
                </Radio>
              ))}
            </Sub>
          </Sub>
          <Item onClick={() => { close(); actions.onSettings(); }}>{t("menu.settings")}</Item>
          <Item onClick={() => { close(); actions.onAbout(); }}>{t("menu.about")}</Item>
        </Root>

        {/* ── ajuda ───────────────────────────────────────── */}
        <li className="mb-rootli">
          <button className="mb-root" onClick={() => { close(); actions.onHelp(); }}>
            {t("menu.help")}
          </button>
        </li>
      </ul>
    </nav>
  );
}

// ── primitives ───────────────────────────────────────────────
const EDGE_PAD = 6;

function Root({
  id,
  label,
  openId,
  setOpenId,
  children,
}: {
  id: string;
  label: string;
  openId: string | null;
  setOpenId: (v: string | null) => void;
  children: React.ReactNode;
}) {
  const isOpen = openId === id;
  const dropRef = useRef<HTMLUListElement>(null);
  const [flipX, setFlipX] = useState(false);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = dropRef.current;
    const li = el?.parentElement;
    if (!el || !li) return;
    const left = li.getBoundingClientRect().left;
    setFlipX(left + el.offsetWidth > window.innerWidth - EDGE_PAD);
  }, [isOpen]);

  return (
    <li className={`mb-rootli ${isOpen ? "open" : ""}`}>
      <button className="mb-root" onClick={() => setOpenId(isOpen ? null : id)} onMouseEnter={() => openId && setOpenId(id)}>
        {label}
      </button>
      {isOpen && (
        <ul ref={dropRef} className={`mb-drop ${flipX ? "flipx" : ""}`}>
          {children}
        </ul>
      )}
    </li>
  );
}

function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  const liRef = useRef<HTMLLIElement>(null);
  const nestedRef = useRef<HTMLUListElement>(null);
  const [flip, setFlip] = useState(false);

  function measure() {
    const li = liRef.current;
    const el = nestedRef.current;
    if (!li || !el) return;
    const rect = li.getBoundingClientRect();
    const w = el.offsetWidth;
    setFlip(rect.right + w > window.innerWidth - EDGE_PAD && rect.left - w > EDGE_PAD);
  }

  return (
    <li className="mb-subli" ref={liRef} onMouseEnter={() => requestAnimationFrame(measure)}>
      <span className="mb-item mb-has">
        <span>{label}</span>
        <span className="mb-arrow">▸</span>
      </span>
      <ul ref={nestedRef} className={`mb-drop mb-nested ${flip ? "flip" : ""}`}>
        {children}
      </ul>
    </li>
  );
}

function Item({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <li className="mb-item" onClick={onClick}>
      {children}
    </li>
  );
}

function Radio({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className={`mb-item mb-radio ${selected ? "on" : ""}`} onClick={onClick}>
      <span className="mb-mark">{selected ? "▸" : " "}</span>
      {children}
    </li>
  );
}
