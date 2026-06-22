// "sobre" window — what NGC7023 detected on this machine (OS/CPU/GPU/RAM +
// bundled tools) plus the author credit. Opened from arquivo › sobre.

import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, type Capabilities, type SystemInfo } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Modal } from "./Modal";

// The "viwctor" credit links to the author's GitHub profile.
const PROJECT_URL = "https://github.com/viwctor";

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);

  useEffect(() => {
    if (!open) return;
    api.getSystemInfo().then(setSys).catch(() => {});
    api.detectCapabilities().then(setCaps).catch(() => {});
  }, [open]);

  function openProject() {
    if (PROJECT_URL) openUrl(PROJECT_URL).catch(() => {});
  }

  return (
    <Modal open={open} onClose={onClose} title={t("about.title")}>
      <div className="field">
        <span className="field-label">{t("settings.system")}</span>
        {sys ? (
          <dl className="info-grid">
            <dt>{t("settings.os")}</dt>
            <dd>
              {sys.os} {sys.osVersion}
            </dd>
            <dt>{t("settings.cpu")}</dt>
            <dd>
              {sys.cpu} · {sys.cpuThreads} threads
            </dd>
            <dt>{t("settings.gpu")}</dt>
            <dd>{sys.gpus.length ? sys.gpus.join(" · ") : "—"}</dd>
            <dt>{t("settings.ram")}</dt>
            <dd>{sys.totalMemoryGb} gb</dd>
          </dl>
        ) : (
          <span className="hint">{t("settings.detecting")}</span>
        )}
      </div>

      <div className="field">
        <span className="field-label">{t("settings.tools")}</span>
        {caps ? (
          <dl className="info-grid">
            <dt>ffmpeg</dt>
            <dd className={caps.ffmpegAvailable ? "badge-ok" : "badge-off"}>
              {caps.ffmpegAvailable ? caps.ffmpegVersion : t("settings.notFound")}
            </dd>
            <dt>yt-dlp</dt>
            <dd className={caps.ytdlpAvailable ? "badge-ok" : "badge-off"}>
              {caps.ytdlpAvailable ? caps.ytdlpVersion : t("settings.notFound")}
            </dd>
            <dt>{t("settings.hwaccel")}</dt>
            <dd className={caps.hwEncoders.length ? "badge-ok" : ""}>
              {caps.hwEncoders.length ? caps.hwEncoders.join(", ") : t("settings.none")}
            </dd>
          </dl>
        ) : (
          <span className="hint">{t("settings.detecting")}</span>
        )}
      </div>

      <div className="credit">
        {t("settings.creditPre")} <span className="cc">Claude Code</span> {t("settings.creditBy")}{" "}
        <span className="author" onClick={openProject}>
          viwctor
        </span>
      </div>

      <button className="btn-ghost chip" onClick={onClose}>
        {t("common.close")}
      </button>
    </Modal>
  );
}
