"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { v4 as uuid } from "uuid";
import { layoutPresets } from "./presets";
import { clamp, structuredCloneSafe } from "./utils";
import {
  Asset,
  AssetType,
  Composition,
  Project,
  RenderJob,
  Track,
  TimelineClipSelection
} from "./types";
import { exportProjectToImage } from "./exporter";
import { exportProjectToMp4 } from "./video-exporter";

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
  ensureUniqueTitle: () => void;
  queueRender: (presetId: string, target: RenderJob["target"]) => Promise<void>;
  updateRenderProgress: (progress: number, status: RenderJob["status"], outputUrl?: string) => void;
  saveAsFile: () => void;
  undo: () => void;
  redo: () => void;
}

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
  persist<ProjectState>(
    (set, get) => ({
      project: createInitialProject(),
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
          const existingTrack = project.tracks.find((track) => track.cellIndex === cellIndex);
          if (existingTrack) {
            existingTrack.assetId = asset.id;
            existingTrack.duration = asset.duration ?? existingTrack.duration;
            existingTrack.out = clamp(existingTrack.out, 0, existingTrack.duration);
          } else {
            project.tracks.push(createTrackForAsset(asset, cellIndex));
          }
          project.updatedAt = Date.now();
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
          let workingJob: RenderJob = {
            ...baseJob,
            status: "processing",
            progress: 20
          };
          set({ renderJob: workingJob });

          let blob: Blob;
          if (meta.extension === "mp4") {
            workingJob = { ...workingJob, progress: 45 };
            set({ renderJob: workingJob });
            blob = await exportProjectToMp4(project);
          } else {
            blob = await exportProjectToImage(project);
          }

          const objectUrl = URL.createObjectURL(blob);

          set({
            renderJob: {
              ...baseJob,
              status: "succeeded",
              progress: 100,
              outputUrl: objectUrl
            }
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
      partialize: (state) => ({
        project: {
          ...state.project,
          assets: [],
          tracks: []
        },
        selection: undefined,
        activeCell: undefined
      }),
      migrate: (persistedState, version) => {
        if (version < 2 && persistedState && typeof persistedState === "object") {
          const typed = persistedState as Partial<ProjectState>;
          if (typed.project) {
            typed.project.assets = [];
            typed.project.tracks = [];
          }
          if (typed.renderJob) {
            typed.renderJob = undefined;
          }
          return typed as ProjectState;
        }
        return persistedState as ProjectState;
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

  if (type === "video" || type === "audio") {
    const metadata = await new Promise<{ duration: number; width?: number; height?: number }>((resolve, reject) => {
      const element = document.createElement(type === "audio" ? "audio" : "video");
      element.preload = "metadata";
      element.onloadedmetadata = () => {
        resolve({
          duration: element.duration,
          width: element instanceof HTMLVideoElement ? element.videoWidth : undefined,
          height: element instanceof HTMLVideoElement ? element.videoHeight : undefined
        });
      };
      element.onerror = () => reject(new Error("Failed to load media metadata"));
      element.src = dataUrl;
      // Force metadata fetch for Safari; load() is a no-op elsewhere
      element.load();
    });
    return { ...baseAsset, ...metadata };
  }

  return baseAsset;
}
