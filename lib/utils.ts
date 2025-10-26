import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number | undefined) {
  if (seconds == null || Number.isNaN(seconds)) {
    return "--:--";
  }
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.round(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getExportFileName(projectTitle: string | undefined) {
  const base = (projectTitle || "tilely-project").trim().toLowerCase();
  const slug = base.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "tilely-project"}-export.txt`;
}
