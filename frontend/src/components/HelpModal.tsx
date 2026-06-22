// Help window — "como usar" guide, keyboard shortcuts (as key chips), and the
// full command list, split by ASCII rules. Opened from the "ajuda" menu button
// and the entry-screen "ajuda" link (there is no /help command).

import { useI18n } from "../lib/i18n";
import { helpCommands } from "../lib/commands";
import { Modal } from "./Modal";

// An ASCII section divider, e.g. "── atalhos ──────────────────".
function rule(label: string): string {
  return `── ${label} ` + "─".repeat(Math.max(3, 30 - label.length));
}

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();

  const guide: { label: string; desc: string }[] = [
    { label: t("help.dlLabel"), desc: t("help.dlDesc") },
    { label: t("help.cvLabel"), desc: t("help.cvDesc") },
    { label: t("help.extLabel"), desc: t("help.extDesc") },
  ];
  // Each row may list alternative key combos for the same action (shown once).
  const shortcuts: { combos: string[][]; desc: string }[] = [
    { combos: [["enter"]], desc: t("help.scEnter") },
    { combos: [["shift", "enter"]], desc: t("help.scNewline") },
    { combos: [["shift", "backspace"], ["ctrl", "l"]], desc: t("help.scClear") },
    { combos: [["f1"]], desc: t("help.scHelp") },
    { combos: [["/"]], desc: t("help.scSlash") },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t("help.modalTitle")} dismissOnAnyKey>
      <ul className="help-guide">
        {guide.map((g) => (
          <li key={g.label}>
            <span className="lbl">{g.label}:</span> {g.desc}
          </li>
        ))}
      </ul>

      <div className="help-rule">{rule(t("shortcuts.title"))}</div>
      <ul className="sc-list">
        {shortcuts.map((s, i) => (
          <li className="sc-row" key={i}>
            <span className="sc-keys">
              {s.combos.map((combo, ci) => (
                <span className="sc-combo" key={ci}>
                  {combo.map((k, j) => (
                    <span key={j}>
                      {j > 0 && <span className="sc-plus">+</span>}
                      <span className="kbd">{k}</span>
                    </span>
                  ))}
                </span>
              ))}
            </span>
            <span className="sc-label">{s.desc}</span>
          </li>
        ))}
      </ul>

      <div className="help-rule">{rule(t("help.cmdsTitle"))}</div>
      <dl className="info-grid">
        {helpCommands(true).map((c) => (
          <span key={c.name} style={{ display: "contents" }}>
            <dt>{c.name}</dt>
            <dd>{t(c.descKey)}</dd>
          </span>
        ))}
      </dl>

      <div className="help-dismiss">{t("help.dismiss")}</div>
    </Modal>
  );
}
