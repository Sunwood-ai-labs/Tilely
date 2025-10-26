import { ExportPreset } from "./types";

export const layoutPresets = [
  { id: "grid-2x2", label: "2×2", rows: 2, cols: 2 },
  { id: "grid-1x4", label: "1×4", rows: 1, cols: 4 },
  { id: "grid-4x1", label: "4×1", rows: 4, cols: 1 },
  { id: "grid-3x3", label: "3×3", rows: 3, cols: 3 },
  { id: "grid-2x3", label: "2×3", rows: 2, cols: 3 },
  { id: "grid-3x2", label: "3×2", rows: 3, cols: 2 },
  { id: "grid-1x3", label: "1×3 横", rows: 1, cols: 3 },
  { id: "grid-3x1", label: "1×3 縦", rows: 3, cols: 1 },
  { id: "grid-2x1", label: "2×1", rows: 2, cols: 1 },
  { id: "grid-1x2", label: "1×2", rows: 1, cols: 2 }
] as const;

export const aspectRatioPresets = [
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "4:5", label: "4:5" },
  { id: "3:4", label: "3:4" },
  { id: "custom", label: "カスタム" }
] as const;

export const exportPresets: ExportPreset[] = [
  {
    id: "social-1080p",
    label: "Social 1080p",
    resolution: 1080,
    fps: 30,
    videoCodec: "H.264",
    audioCodec: "AAC",
    description: "SNS 投稿向けバランス設定"
  },
  {
    id: "hq-2160p",
    label: "High Quality 4K",
    resolution: 2160,
    fps: 30,
    videoCodec: "H.265",
    audioCodec: "AAC",
    description: "高解像度でのプロダクション用"
  },
  {
    id: "webm",
    label: "WebM",
    resolution: 1440,
    fps: 30,
    videoCodec: "VP9",
    audioCodec: "Opus",
    description: "Web 表示に最適化"
  }
];

export const audioGainSteps = [-24, -12, -6, -3, 0, 3, 6, 9, 12];
