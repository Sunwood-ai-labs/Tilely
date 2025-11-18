"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { v4 as uuid } from "uuid";
import { layoutPresets } from "./presets";
import { clamp, structuredCloneSafe } from "./utils";
import {
  Asset,
  AssetMetadata,
  AssetType,
  Composition,
  ExportSettings,
  Project,
  RenderJob,
  Track,
  TimelineClipSelection
} from "./types";
import { exportProjectToImage } from "./exporter";
import { exportProjectToMp4 } from "./video-exporter";
import { detectAudioBitrateKbps, detectFrameRate, sanitizeAudioBitrateKbps, sanitizeFrameRate } from "./media-metadata";

const PROJECT_VERSION = "2025.10.01";

const DEFAULT_PROJECT_TITLE = "Project Draft";

const DEFAULT_RENDER_META = {
  mimeType: "image/png",
  extension: "png",
  label: "PNG を保存"
};

const RENDER_PRESET_META: Record<string, typeof DEFAULT_RENDER_META> = {
  "video-mp4": {
    mimeType: "video/mp4",
    extension: "mp4",
    label: "MP4 を保存"
  }
};

const getRenderMeta = (presetId: string) => RENDER_PRESET_META[presetId] ?? DEFAULT_RENDER_META;

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  fps: 24,
  durationSeconds: 8,
  videoBitrateMbps: 50,
  audioBitrateKbps: 130,
  maxDimension: 2048,
  aspectRatio: "project"
};

const pad = (value: number) => value.toString().padStart(2, "0");

const createTimestampProjectTitle = () => {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(
    now.getMinutes()
  )}-${pad(now.getSeconds())}`;
  return `Project ${timestamp}-${now.getTime().toString().slice(-4)}`;
};

interface ProjectState {
  project: Project;
  selection?: TimelineClipSelection;
  activeCell?: number;
  renderJob?: RenderJob;
  future: Project[];
  history: Project[];
  exportSettings: ExportSettings;
  hydrateFromJson: (json: string) => void;
  resetProject: () => void;
  addAssets: (files: Asset[]) => void;
  setProjectTitle: (title: string) => void;
  assignAssetToCell: (cellIndex: number, assetId: string) => void;
  updateComposition: (updater: (composition: Composition) => Composition) => void;
  updateTrack: (trackId: string, updater: (track: Track) => Track) => void;
  removeTrack: (trackId: string) => void;
  setSelection: (selection?: TimelineClipSelection) => void;
  setActiveCell: (cellIndex?: number) => void;
  applyLayoutPreset: (rows: number, cols: number) => void;
  updateAudio: (updater: (audio: Project["audio"]) => Project["audio"]) => void;
  updateExportSettings: (updater: (settings: ExportSettings) => ExportSettings) => void;
  updateAssetMetadata: (assetId: string, metadata: AssetMetadata) => void;
  ensureUniqueTitle: () => void;
  queueRender: (presetId: string, target: RenderJob["target"]) => Promise<void>;
  updateRenderProgress: (progress: number, status: RenderJob["status"], outputUrl?: string) => void;
  saveAsFile: () => void;
  undo: () => void;
  redo: () => void;
}

type ProjectPersistedState = {
  project: ProjectState["project"];
  selection?: ProjectState["selection"];
  activeCell?: ProjectState["activeCell"];
  exportSettings?: ProjectState["exportSettings"];
  renderJob?: ProjectState["renderJob"];
  future?: ProjectState["future"];
  history?: ProjectState["history"];
};

const createInitialProject = (): Project => {
  const firstPreset = layoutPresets[0];
  return {
    id: uuid(),
    title: DEFAULT_PROJECT_TITLE,
    assets: [],
    composition: {
      id: uuid(),
      title: "Default Composition",
      aspectRatio: "1:1",
      bgColor: "#0f1014",
      grid: {
        rows: firstPreset.rows,
        cols: firstPreset.cols,
        cells: Array.from({ length: firstPreset.rows * firstPreset.cols }, (_, index) => ({
          id: uuid(),
          row: Math.floor(index / firstPreset.cols),
          col: index % firstPreset.cols
        }))
      },
      style: {
        gap: 12,
        padding: 24,
        radius: 24,
        borderWidth: 2,
        borderColor: "#ffffff",
        borderOpacity: 0.18,
        backgroundColor: "#10111a"
      }
    },
    tracks: [],
    audio: {
      masterGain: 0,
      muted: false
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: PROJECT_VERSION
  };
};

const createTrackForAsset = (asset: Asset, cellIndex: number): Track => {
  const duration = asset.duration ?? 10;
  return {
    id: uuid(),
    assetId: asset.id,
    cellIndex,
    in: 0,
    out: duration,
    duration,
    volume: asset.type === "audio" ? 0 : -6,
    muted: false,
    fit: "cover",
    panX: 0,
    panY: 0,
    scale: 1
  };
};

const sanitizeDurationSeconds = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const clamped = clamp(value, 0.1, 600);
  return Math.round(clamped * 1000) / 1000;
};

const deriveVideoBitrateMbps = (size?: number, duration?: number) => {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return undefined;
  }
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    return undefined;
  }
  const bitsPerSecond = (size * 8) / duration;
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) {
    return undefined;
  }
  return Math.max(5, Math.round(bitsPerSecond / 1_000_000));
};

const deriveAudioBitrateKbps = (size?: number, duration?: number) => {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return undefined;
  }
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    return undefined;
  }
  const kbps = (size * 8) / 1000 / duration;
  return sanitizeAudioBitrateKbps(kbps);
};

const deriveExportSettingsFromAsset = (asset: Asset, current: ExportSettings): ExportSettings | undefined => {
  // Export settings are no longer automatically changed when importing videos
  // to maintain user-configured default values
  return undefined;
};

const cloneProject = (project: Project) => structuredCloneSafe(project);

const isQuotaError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const message = (error as Error).message?.toLowerCase?.() ?? "";
  return (
    message.includes("quotaexceeded") ||
    message.includes("quota exceeded") ||
    message.includes("not enough space") ||
    (error as DOMException).name === "QuotaExceededError"
  );
};

const buildStorage = () => {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };
  }

  return {
    getItem: (name: string) => {
      try {
        const value = window.localStorage.getItem(name);
        if (value != null) return value;
      } catch (error) {
        console.warn("[Tilely] Failed to read localStorage:", error);
      }

      try {
        return window.sessionStorage.getItem(name);
      } catch (error) {
        console.warn("[Tilely] Failed to read sessionStorage:", error);
      }
      return null;
    },
    setItem: (name: string, value: string) => {
      try {
        window.localStorage.setItem(name, value);
        return;
      } catch (error) {
        if (!isQuotaError(error)) {
          console.warn("[Tilely] Failed to write localStorage:", error);
        } else {
          console.warn(
            "[Tilely] localStorage quota exceeded. Falling back to sessionStorage for lightweight persistence."
          );
        }
      }

      try {
        window.sessionStorage.setItem(name, value);
      } catch (sessionError) {
        if (!isQuotaError(sessionError)) {
          console.warn("[Tilely] Failed to write sessionStorage:", sessionError);
        } else {
          console.warn("[Tilely] sessionStorage quota exceeded. Persistence temporarily disabled.");
        }
      }
    },
    removeItem: (name: string) => {
      try {
        window.localStorage.removeItem(name);
      } catch (error) {
        console.warn("[Tilely] Failed to remove localStorage key:", error);
      }
      try {
        window.sessionStorage.removeItem(name);
      } catch (error) {
        console.warn("[Tilely] Failed to remove sessionStorage key:", error);
      }
    }
  };
};

export const useProjectStore = create<ProjectState>()(
  persist<ProjectState, [], [], ProjectPersistedState>(
    (set, get) => ({
      project: createInitialProject(),
      exportSettings: DEFAULT_EXPORT_SETTINGS,
      selection: undefined,
      activeCell: undefined,
      renderJob: undefined,
      future: [],
      history: [],
      hydrateFromJson: (json) => {
        try {
          const parsed = JSON.parse(json) as Project;
          set({ project: parsed, history: [], future: [] });
        } catch (error) {
          console.error("Failed to hydrate project", error);
        }
      },
      resetProject: () => set({ project: createInitialProject(), history: [], future: [] }),
      setProjectTitle: (title) => {
        set((state) => {
          const project = cloneProject(state.project);
          project.title = title;
          project.updatedAt = Date.now();
          return { project, history: [...state.history, state.project], future: [] };
        });
      },
      addAssets: (assets) => {
        set((state) => {
          const project = cloneProject(state.project);
          project.assets = [...project.assets, ...assets];
          project.updatedAt = Date.now();
          return { project, history: [...state.history, state.project], future: [] };
        });
      },
      assignAssetToCell: (cellIndex, assetId) => {
        set((state) => {
          const project = cloneProject(state.project);
          const asset = project.assets.find((item) => item.id === assetId);
          if (!asset) {
            return state;
          }
          const exportSettingsUpdate =
            cellIndex === 0 ? deriveExportSettingsFromAsset(asset, state.exportSettings) : undefined;
          const existingTrack = project.tracks.find((track) => track.cellIndex === cellIndex);
          if (existingTrack) {
            existingTrack.assetId = asset.id;
            existingTrack.duration = asset.duration ?? existingTrack.duration;
            existingTrack.out = clamp(existingTrack.out, 0, existingTrack.duration);
          } else {
            project.tracks.push(createTrackForAsset(asset, cellIndex));
          }
          project.updatedAt = Date.now();
          if (exportSettingsUpdate) {
            return {
              project,
              history: [...state.history, state.project],
              future: [],
              exportSettings: exportSettingsUpdate
            };
          }

          return { project, history: [...state.history, state.project], future: [] };
        });
      },
      updateComposition: (updater) => {
        set((state) => {
          const project = cloneProject(state.project);
          project.composition = updater(project.composition);
          project.updatedAt = Date.now();
          return { project, history: [...state.history, state.project], future: [] };
        });
      },
      updateTrack: (trackId, updater) => {
        set((state) => {
          const project = cloneProject(state.project);
          project.tracks = project.tracks.map((track) =>
            track.id === trackId ? updater({ ...track }) : track
          );
          project.updatedAt = Date.now();
          return { project, history: [...state.history, state.project], future: [] };
        });
      },
      removeTrack: (trackId) => {
        set((state) => {
          const project = cloneProject(state.project);
          project.tracks = project.tracks.filter((track) => track.id !== trackId);
          project.updatedAt = Date.now();
          return { project, history: [...state.history, state.project], future: [] };
        });
      },
      setSelection: (selection) => set({ selection }),
      setActiveCell: (cellIndex) => set({ activeCell: cellIndex }),
      ensureUniqueTitle: () => {
        set((state) => {
          if (state.project.title !== DEFAULT_PROJECT_TITLE) {
            return state;
          }
          const project = cloneProject(state.project);
          project.title = createTimestampProjectTitle();
          project.updatedAt = Date.now();
          return {
            project,
            history: [...state.history, state.project],
            future: []
          };
        });
      },
        applyLayoutPreset: (rows, cols) => {
          set((state) => {
            const project = cloneProject(state.project);
            project.composition.grid = {
              rows,
              cols,
              cells: Array.from({ length: rows * cols }, (_, index) => ({
                id: uuid(),
                row: Math.floor(index / cols),
                col: index % cols
              }))
            };
            project.tracks = project.tracks
              .map((track) => ({
                ...track,
                cellIndex: Math.min(track.cellIndex, rows * cols - 1)
              }))
              .filter((track, index, array) =>
                array.findIndex((item) => item.cellIndex === track.cellIndex) === index
              );
            project.updatedAt = Date.now();
            const nextActiveCell =
              typeof state.activeCell === "number"
                ? Math.min(state.activeCell, rows * cols - 1)
                : state.activeCell;
            return { project, history: [...state.history, state.project], future: [], activeCell: nextActiveCell };
          });
        },
      updateAudio: (updater) => {
        set((state) => {
          const project = cloneProject(state.project);
          project.audio = updater(project.audio);
          project.updatedAt = Date.now();
          return { project, history: [...state.history, state.project], future: [] };
        });
      },
      updateExportSettings: (updater) => {
        set((state) => ({
          exportSettings: updater({ ...state.exportSettings })
        }));
      },
      updateAssetMetadata: (assetId, metadata) => {
        set((state) => {
          const project = cloneProject(state.project);
          project.assets = project.assets.map((asset) =>
            asset.id === assetId ? { ...asset, metadata } : asset
          );
          project.updatedAt = Date.now();
          return { project, history: [...state.history, state.project], future: [] };
        });
      },
      queueRender: async (presetId, target) => {
        const project = cloneProject(get().project);
        const meta = getRenderMeta(presetId);
        const baseJob: RenderJob = {
          id: uuid(),
          projectId: project.id,
          presetId,
          target,
          progress: 0,
          status: target === "browser" ? "processing" : "queued",
          mimeType: meta.mimeType,
          fileExtension: meta.extension,
          downloadLabel: meta.label
        };

        const previousUrl = get().renderJob?.outputUrl;
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }

        set({ renderJob: baseJob });

        if (target !== "browser") {
          return;
        }

        try {
          const exportSettings = get().exportSettings;
          const rawAspect = exportSettings.aspectRatio ?? "project";
          const aspectSelection =
            typeof rawAspect === "string" && rawAspect.trim().length > 0 ? rawAspect.trim() : "project";
          if (aspectSelection !== "project") {
            const [ratioW, ratioH] = aspectSelection.split(":").map(Number);
            if (Number.isFinite(ratioW) && Number.isFinite(ratioH) && ratioW > 0 && ratioH > 0) {
              project.composition.aspectRatio = `${ratioW}:${ratioH}`;
            }
          }

          // Use export settings as-is without auto-adjustment
          const effectiveExportSettings = { ...exportSettings };
let workingJob: RenderJob = {
            ...baseJob,
            status: "processing",
            progress: 20
          };
          set({ renderJob: workingJob });

          let blob: Blob;
          let resolvedMimeType = meta.mimeType;
          let resolvedExtension = meta.extension;
          let resolvedLabel = meta.label;

          if (meta.extension === "mp4") {
            workingJob = { ...workingJob, progress: 45 };
            set({ renderJob: workingJob });
            const result = await exportProjectToMp4(project, {
              durationSeconds: effectiveExportSettings.durationSeconds,
              fps: effectiveExportSettings.fps,
              videoBitrateMbps: effectiveExportSettings.videoBitrateMbps,
              audioBitrateKbps: effectiveExportSettings.audioBitrateKbps,
              maxDimension: effectiveExportSettings.maxDimension
            });
            blob = result.blob;
            resolvedMimeType = result.mimeType;
            resolvedExtension = result.fileExtension;
            resolvedLabel = `${resolvedExtension.toUpperCase()} を保存`;
            workingJob = {
              ...workingJob,
              mimeType: resolvedMimeType,
              fileExtension: resolvedExtension,
              downloadLabel: resolvedLabel
            };
            set({ renderJob: workingJob });
          } else {
            blob = await exportProjectToImage(project);
          }

          const objectUrl = URL.createObjectURL(blob);

          const finalJob: RenderJob = {
            ...baseJob,
            mimeType: resolvedMimeType,
            fileExtension: resolvedExtension,
            downloadLabel: resolvedLabel,
            status: "succeeded",
            progress: 100,
            outputUrl: objectUrl
          };

          set({
            renderJob: finalJob
          });
        } catch (error) {
          console.error("[Tilely] Failed to export project", error);
          set({
            renderJob: {
              ...baseJob,
              status: "failed",
              progress: 0
            }
          });
          if (error instanceof Error) {
            throw error;
          }
          throw new Error("Failed to export project");
        }
      },
      updateRenderProgress: (progress, status, outputUrl) => {
        const previousUrl = get().renderJob?.outputUrl;
        if (previousUrl && outputUrl && previousUrl !== outputUrl) {
          URL.revokeObjectURL(previousUrl);
        }
        set((state) =>
          state.renderJob
            ? {
                renderJob: {
                  ...state.renderJob,
                  progress,
                  status,
                  outputUrl: outputUrl ?? state.renderJob.outputUrl
                }
              }
            : state
        );
      },
      saveAsFile: () => {
        const project = get().project;
        const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${project.title || "tilely-project"}.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      undo: () => {
        set((state) => {
          if (state.history.length === 0) return state;
          const history = [...state.history];
          const previous = history.pop()!;
          return {
            project: previous,
            history,
            future: [state.project, ...state.future]
          };
        });
      },
      redo: () => {
        set((state) => {
          if (state.future.length === 0) return state;
          const [next, ...rest] = state.future;
          return {
            project: next,
            future: rest,
            history: [...state.history, state.project]
          };
        });
      }
    }),
    {
      name: "tilely-project",
      version: 2,
      storage: createJSONStorage(buildStorage),
      partialize: (state): ProjectPersistedState => ({
        project: {
          ...state.project,
          assets: [],
          tracks: []
        },
        exportSettings: state.exportSettings
      }),
      migrate: (persistedState, version) => {
        if (!persistedState || typeof persistedState !== "object") {
          return { project: createInitialProject(), exportSettings: DEFAULT_EXPORT_SETTINGS };
        }

        const typed = persistedState as ProjectPersistedState & Partial<ProjectState>;

        if (version < 2) {
          if (typed.project) {
            typed.project.assets = [];
            typed.project.tracks = [];
          }
          if (typed.renderJob) {
            typed.renderJob = undefined;
          }
        }

        const exportSettings = {
          ...DEFAULT_EXPORT_SETTINGS,
          ...(typed.exportSettings ?? {})
        };

        return {
          project: typed.project ?? createInitialProject(),
          selection: typed.selection,
          activeCell: typed.activeCell,
          renderJob: version < 2 ? undefined : typed.renderJob,
          future: typed.future,
          history: typed.history,
          exportSettings
        };
      }
    }
  )
);

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

export async function fileToAsset(file: File, type: AssetType): Promise<Asset> {
  const dataUrl = await readFileAsDataUrl(file);
  const baseAsset: Asset = {
    id: uuid(),
    name: file.name,
    type,
    url: dataUrl,
    size: file.size,
    createdAt: Date.now()
  };

  if (type === "image" || type === "logo") {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.width, height: image.height });
      image.onerror = () => reject(new Error("Failed to load image metadata"));
      image.src = dataUrl;
    });
    return { ...baseAsset, ...dimensions };
  }

  if (type === "video") {
    const metadata = await new Promise<{
      duration: number;
      width: number;
      height: number;
      fps?: number;
      audioBitrateKbps?: number;
    }>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;

      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onerror = null;
      };

      video.onloadedmetadata = async () => {
        const duration = Number.isFinite(video.duration) ? video.duration : baseAsset.duration ?? 0;
        const width = video.videoWidth || baseAsset.width || 0;
        const height = video.videoHeight || baseAsset.height || 0;
        let fps: number | undefined;
        let audioBitrateKbps: number | undefined;

        try {
          fps = sanitizeFrameRate(await detectFrameRate(video));
        } catch {
          fps = undefined;
        }

        try {
          audioBitrateKbps = sanitizeAudioBitrateKbps(await detectAudioBitrateKbps(video));
        } catch {
          audioBitrateKbps = undefined;
        }

        cleanup();
        resolve({ duration, width, height, fps, audioBitrateKbps });
      };

      video.onerror = () => {
        cleanup();
        reject(new Error("Failed to load media metadata"));
      };

      video.src = dataUrl;
      video.load();
    });

    return { ...baseAsset, ...metadata };
  }

  if (type === "audio") {
    const metadata = await new Promise<{ duration: number }>((resolve, reject) => {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        resolve({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
      };
      audio.onerror = () => reject(new Error("Failed to load media metadata"));
      audio.src = dataUrl;
      audio.load();
    });

    const audioBitrateKbps = deriveAudioBitrateKbps(file.size, metadata.duration);

    return { ...baseAsset, ...metadata, audioBitrateKbps };
  }

  return baseAsset;
}
