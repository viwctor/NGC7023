// Slash-command metadata for the "/" palette (the live suggestion list) and the
// /commands help. Format commands (/mp4, /mp3, /gif …) set the next action's
// output format at source quality; the fixed ones below do the rest.

import type { TKey } from "./i18n";
import {
  CONVERT_AUDIO,
  CONVERT_IMAGE,
  CONVERT_VIDEO,
  DOWNLOAD_AUDIO,
  DOWNLOAD_VIDEO,
} from "./formats";

export const ALL_FORMATS = Array.from(
  new Set<string>([
    ...CONVERT_VIDEO,
    ...CONVERT_AUDIO,
    ...CONVERT_IMAGE,
    ...DOWNLOAD_VIDEO,
    ...DOWNLOAD_AUDIO,
  ]),
);

export interface CmdDef {
  name: string;
  descKey: TKey;
  private?: boolean;
}

/** Non-format slash commands. Appearance/gpu/codec/about/reset live in the menu
 *  + settings window now; what's left is action commands. Aliases that share a
 *  descKey (e.g. /sub + /leg, /cancel + /c) are collapsed into one help row. */
export const FIXED_COMMANDS: CmdDef[] = [
  { name: "/video", descKey: "cmd.video" },
  { name: "/sub", descKey: "cmd.sub" },
  { name: "/leg", descKey: "cmd.sub" },
  { name: "/pdf", descKey: "cmd.pdf" },
  { name: "/dest", descKey: "cmd.dest" },
  { name: "/cancel", descKey: "cmd.cancel" },
  { name: "/c", descKey: "cmd.cancel" },
  { name: "/open", descKey: "cmd.open" },
  { name: "exit", descKey: "cmd.exit" },
];

export function isFormatCommand(name: string): boolean {
  return ALL_FORMATS.includes(name.toLowerCase());
}

/** Concrete entries for the live "/" palette (fixed commands + every /format). */
export function paletteEntries(includePrivate: boolean): CmdDef[] {
  const fixed = FIXED_COMMANDS.filter((c) => c.name.startsWith("/") && (includePrivate || !c.private));
  const formats: CmdDef[] = ALL_FORMATS.map((f) => ({ name: `/${f}`, descKey: "cmd.format" }));
  return [...fixed, ...formats];
}

/** Grouped help rows: one format row, and aliases sharing a descKey merged into
 *  a single row (so "/sub /leg" and "/cancel /c" each appear once). */
export function helpCommands(includePrivate: boolean): CmdDef[] {
  const byKey = new Map<TKey, string[]>();
  const order: TKey[] = [];
  for (const c of FIXED_COMMANDS) {
    if (!includePrivate && c.private) continue;
    if (!byKey.has(c.descKey)) {
      byKey.set(c.descKey, []);
      order.push(c.descKey);
    }
    byKey.get(c.descKey)!.push(c.name);
  }
  const merged = order.map((k) => ({ name: byKey.get(k)!.join(" "), descKey: k }));
  return [{ name: "/mp4 /mp3 /gif …", descKey: "cmd.format" }, ...merged];
}
