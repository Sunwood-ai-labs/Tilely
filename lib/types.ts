export type AssetType = "video" | "image" | "audio" | "logo";

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  url: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  waveform?: number[];
  createdAt: number;
}

export type FitMode = "contain" | "cover";

export interface CompositionStyle {
  gap: number;
  padding: number;
  radius: number;
  borderWidth: number;
  borderColor: string;
  borderOpacity: number;
  backgroundColor: string;
}

export interface GridCell {
  id: string;
  row: number;
  col: number;
}

export interface CompositionGrid {
  rows: number;
  cols: number;
  cells: GridCell[];
}

export interface Composition {
  id: string;
  title: string;
  aspectRatio: string;
  grid: CompositionGrid;
  style: CompositionStyle;
  bgColor: string;
}

export interface Track {
  id: string;
  assetId: string;
  cellIndex: number;
  in: number;
  out: number;
  duration: number;
  volume: number;
  muted: boolean;
  fit: FitMode;
  panX: number;
  panY: number;
  scale: number;
}

export interface AudioBusSettings {
  masterGain: number;
  muted: boolean;
  bgmTrackId?: string;
}

export interface ExportPreset {
  id: string;
  label: string;
  resolution: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  description: string;
}

export interface Project {
  id: string;
  title: string;
  assets: Asset[];
  composition: Composition;
  tracks: Track[];
  audio: AudioBusSettings;
  createdAt: number;
  updatedAt: number;
  version: string;
}

export interface RenderJob {
  id: string;
  projectId: string;
  presetId: string;
  target: "browser" | "server";
  progress: number;
  status: "idle" | "queued" | "processing" | "succeeded" | "failed";
  outputUrl?: string;
}

export interface TimelineClipSelection {
  trackId: string;
  cellIndex: number;
}
