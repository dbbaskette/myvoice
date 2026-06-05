import { useEffect, useState } from "react";

import { type AiTells, getAiTells } from "../api/aiTells";

// The shared AI-tells are global and static, so fetch once and share the
// promise across every caller.
let cache: Promise<AiTells> | null = null;

function load(): Promise<AiTells> {
  if (cache === null) cache = getAiTells();
  return cache;
}

/** Returns the shared AI-tells layer (null until loaded). */
export function useAiTells(): AiTells | null {
  const [tells, setTells] = useState<AiTells | null>(null);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((t) => {
        if (!cancelled) setTells(t);
      })
      .catch(() => {
        // Inherited-rules display is non-critical; ignore fetch errors.
        cache = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return tells;
}
