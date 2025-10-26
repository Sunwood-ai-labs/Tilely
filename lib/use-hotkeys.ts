"use client";

import { useEffect } from "react";

interface HotkeyOptions {
  enabled?: boolean;
}

export function useHotkeys(mapping: Record<string, () => void>, options: HotkeyOptions = {}) {
  useEffect(() => {
    if (options.enabled === false) return;

    const handler = (event: KeyboardEvent) => {
      const parts = [
        event.metaKey || event.ctrlKey ? "mod" : undefined,
        event.shiftKey ? "shift" : undefined,
        event.altKey ? "alt" : undefined,
        event.key.toLowerCase()
      ].filter(Boolean);
      const key = parts.join("+");
      const action = mapping[key];
      if (action) {
        event.preventDefault();
        action();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mapping, options.enabled]);
}
