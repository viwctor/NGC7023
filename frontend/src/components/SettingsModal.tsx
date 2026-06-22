// Settings window: behavior checkboxes (tray / autostart / reduce motion), a
// default output folder, and footer actions (check for updates, reset). The
// default folder lives in the studio state (dlDest/cvDest) so the download /
// convert flows stop asking where to save.

import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { useStudio } from "../lib/studio";
import { api } from "../lib/api";
import { Modal } from "./Modal";

function shorten(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() || p;
}

interface UpdState {
  phase: "idle" | "checking" | "done";
  msg?: string;
  url?: string;
}

export function SettingsModal({ open: isOpen, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const settings = useSettings();
  const s = useStudio();
  const [upd, setUpd] = useState<UpdState>({ phase: "idle" });
  const [confirmReset, setConfirmReset] = useState(false);

  const dir = s.cvDest ?? s.dlDest ?? null;

  async function chooseDir() {
    try {
      const d = await open({ directory: true });
      if (typeof d === "string") s.set({ dlDest: d, cvDest: d });
    } catch {
      /* not under the bridge */
    }
  }

  function toggleTray() {
    const v = !settings.tray;
    settings.set({ tray: v });
    api.setTray(v).catch(() => {});
  }
  function toggleAutostart() {
    const v = !settings.autostart;
    settings.set({ autostart: v });
    api.setAutostart(v).catch(() => {});
  }

  async function checkUpdates() {
    setUpd({ phase: "checking" });
    try {
      const r = await api.checkUpdates();
      if (!r.configured) setUpd({ phase: "done", msg: t("settings.updateNoRepo") });
      else if (r.available) setUpd({ phase: "done", msg: `${t("settings.updateAvailable")}: ${r.version ?? ""}`, url: r.url });
      else setUpd({ phase: "done", msg: t("settings.upToDate") });
    } catch {
      setUpd({ phase: "done", msg: t("settings.updateError") });
    }
  }

  function doReset() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("ngc7023."))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    api.restartApp().catch(() => {});
  }

  const Check = ({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) => (
    <div className={`set-check ${checked ? "on" : ""}`} onClick={onClick}>
      <span className="set-box">{checked ? "[x]" : "[ ]"}</span> {children}
    </div>
  );

  return (
    <Modal open={isOpen} onClose={onClose} title={t("settings.title")}>
      <div className="set-section">
        <span className="field-label">{t("settings.behavior")}</span>
        <Check checked={settings.tray} onClick={toggleTray}>{t("settings.tray")}</Check>
        <Check checked={settings.autostart} onClick={toggleAutostart}>{t("settings.autostart")}</Check>
        <Check checked={settings.reduceMotion} onClick={() => settings.set({ reduceMotion: !settings.reduceMotion })}>
          {t("settings.reduceMotion")}
        </Check>
      </div>

      <div className="set-section">
        <span className="field-label">{t("settings.defaultDir")}</span>
        <div className="set-dir">
          <button className="btn-ghost chip" onClick={chooseDir}>{t("settings.chooseDir")}</button>
          {dir && (
            <span className="set-dir-path" title={dir}>
              {shorten(dir)}
              <button className="set-x" onClick={() => s.set({ dlDest: null, cvDest: null })}>×</button>
            </span>
          )}
        </div>
      </div>

      {upd.phase !== "idle" && (
        <div className="set-upd">
          {upd.phase === "checking" ? t("settings.checking") : upd.msg}
          {upd.url && (
            <button className="btn-ghost chip" onClick={() => openUrl(upd.url!).catch(() => {})}>
              {t("settings.download")}
            </button>
          )}
        </div>
      )}

      <div className="set-actions">
        <button className="btn-ghost chip" onClick={checkUpdates}>{t("settings.checkUpdates")}</button>
        {confirmReset ? (
          <span className="set-confirm">
            {t("settings.resetConfirm")}
            <button className="btn-ghost chip" onClick={doReset}>{t("common.confirm")}</button>
            <button className="btn-ghost chip" onClick={() => setConfirmReset(false)}>{t("common.cancel")}</button>
          </span>
        ) : (
          <button className="btn-ghost chip" onClick={() => setConfirmReset(true)}>{t("settings.reset")}</button>
        )}
      </div>

      <button className="btn-ghost chip set-close" onClick={onClose}>{t("common.close")}</button>
    </Modal>
  );
}
