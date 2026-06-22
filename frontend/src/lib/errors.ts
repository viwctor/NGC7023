// Maps the raw (often huge, English) ffmpeg / yt-dlp error output to a short,
// translated message key. The original text is still kept (shown on hover) for
// debugging, but the user sees something clean in their language.

import type { TKey } from "./i18n";

const PATTERNS: { re: RegExp; key: TKey }[] = [
  { re: /403|forbidden/i, key: "err.forbidden" },
  { re: /429|too many requests|rate.?limit/i, key: "err.rateLimited" },
  { re: /private video/i, key: "err.private" },
  { re: /video unavailable|content isn.?t available|not available/i, key: "err.unavailable" },
  { re: /sign in to|confirm your age|age.?restricted|login required/i, key: "err.ageRestricted" },
  { re: /requested format|format is not available|no video formats/i, key: "err.noFormat" },
  { re: /unsupported url|is not a valid url|no suitable/i, key: "err.unsupportedUrl" },
  { re: /failed to start (ffmpeg|yt-dlp)|not recognized|command not found|cannot find/i, key: "err.toolMissing" },
  { re: /no such file|does not exist|could not open file/i, key: "err.noFile" },
  { re: /does not contain any stream|invalid argument|conversion failed|invalid data|matches no streams|encoder.*not found/i, key: "err.convertImpossible" },
  { re: /network|getaddrinfo|timed out|connection|unable to download/i, key: "err.network" },
];

/** Best-effort friendly key for a raw error string. */
export function errorKey(detail: string | undefined): TKey {
  if (!detail) return "err.generic";
  for (const { re, key } of PATTERNS) {
    if (re.test(detail)) return key;
  }
  return "err.generic";
}
