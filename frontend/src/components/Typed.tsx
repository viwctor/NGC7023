// Typewriter text: reveals `text` one character at a time, like a terminal
// printing a response. Calls `onDone` once when finished (used to drive the
// strictly-sequential line reveal in the terminal). A blinking cursor trails
// while typing.

import { useEffect, useRef, useState } from "react";
import { useSettings } from "../lib/settings";

export function Typed({
  text,
  speed = 8,
  onDone,
  className,
}: {
  text: string;
  speed?: number;
  onDone?: () => void;
  className?: string;
}) {
  const { reduceMotion } = useSettings();
  const [n, setN] = useState(reduceMotion ? text.length : 0);
  const done = useRef(false);

  // Re-animate from the start when the text changes (e.g. a wizard step swaps
  // its option labels in place).
  useEffect(() => {
    setN(reduceMotion ? text.length : 0);
    done.current = false;
  }, [text, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || n >= text.length) {
      if (!done.current) {
        done.current = true;
        onDone?.();
      }
      return;
    }
    const id = setTimeout(() => setN((v) => v + 1), speed);
    return () => clearTimeout(id);
  }, [n, text, speed, onDone, reduceMotion]);

  const typing = !reduceMotion && n < text.length;
  return (
    <span className={className}>
      {text.slice(0, n)}
      {typing && <span className="cursor">▋</span>}
    </span>
  );
}
