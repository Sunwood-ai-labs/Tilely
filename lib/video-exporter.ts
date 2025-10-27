import { applyRoundedRect, calculateCanvasLayout, drawPlaceholder, drawVisualInCell, getTrackByCell, hexToRgba } from "./canvas-utils";
import { loadImageAsset, loadVideoAsset, type LoadedImage, type LoadedVideo } from "./media-loaders";
import type { Project, Asset, Track } from "./types";

type ExportOptions = {
  durationSeconds?: number;
  fps?: number;
};

export type VideoExportResult = {
  blob: Blob;
  mimeType: string;
  fileExtension: string;
};

const DEFAULT_OPTIONS: Required<ExportOptions> = {
  durationSeconds: 3,
  fps: 30
};

const MEDIA_TYPE_CANDIDATES = [
  { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" },
  { mimeType: "video/webm;codecs=vp9", extension: "webm" },
  { mimeType: "video/webm;codecs=vp8", extension: "webm" },
  { mimeType: "video/webm", extension: "webm" }
] as const;

const LOG_PREFIX = "[video-exporter]";

const now = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());

const logInfo = (message: string, extra?: unknown) => {
  if (typeof extra === "undefined") {
    console.log(`${LOG_PREFIX} ${message}`);
    return;
  }
  console.log(`${LOG_PREFIX} ${message}`, extra);
};

const logWarn = (message: string, extra?: unknown) => {
  if (typeof extra === "undefined") {
    console.warn(`${LOG_PREFIX} ${message}`);
    return;
  }
  console.warn(`${LOG_PREFIX} ${message}`, extra);
};

const logError = (message: string, extra?: unknown) => {
  if (typeof extra === "undefined") {
    console.error(`${LOG_PREFIX} ${message}`);
    return;
  }
  console.error(`${LOG_PREFIX} ${message}`, extra);
};

type CellRenderState = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  track?: Track;
  asset?: Asset;
  image?: LoadedImage;
  video?: LoadedVideo;
};

const pickMediaType = () => {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  if (typeof MediaRecorder.isTypeSupported === "function") {
    for (const candidate of MEDIA_TYPE_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
        return candidate;
      }
    }
  }

  // Fall back to the most widely supported codec.
  return MEDIA_TYPE_CANDIDATES[MEDIA_TYPE_CANDIDATES.length - 1];
};

const drawCellFrame = (ctx: CanvasRenderingContext2D, state: CellRenderState, style: Project["composition"]["style"]) => {
  const radius = Math.max(0, style.radius ?? 0);

  ctx.save();
  applyRoundedRect(ctx, state.x, state.y, state.width, state.height, radius);
  ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fillRect(state.x, state.y, state.width, state.height);

  if (state.track && state.video && state.asset?.type === "video") {
    const videoElement = state.video.element;
    const videoWidth = videoElement.videoWidth || state.video.width;
    const videoHeight = videoElement.videoHeight || state.video.height;
    if (videoWidth > 0 && videoHeight > 0 && videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      drawVisualInCell(
        ctx,
        { element: videoElement, width: videoWidth, height: videoHeight },
        state.track,
        state.x,
        state.y,
        state.width,
        state.height
      );
    } else {
      drawPlaceholder(ctx, state.x, state.y, state.width, state.height, "video");
    }
  } else if (state.track && state.image && (state.asset?.type === "image" || state.asset?.type === "logo")) {
    drawVisualInCell(
      ctx,
      { element: state.image.element, width: state.image.width, height: state.image.height },
      state.track,
      state.x,
      state.y,
      state.width,
      state.height
    );
  } else if (state.asset?.type === "audio") {
    drawPlaceholder(ctx, state.x, state.y, state.width, state.height, "audio");
  } else if (state.asset?.type === "video") {
    drawPlaceholder(ctx, state.x, state.y, state.width, state.height, "video");
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(state.x, state.y, state.width, state.height);
  }

  ctx.restore();

  if ((style.borderWidth ?? 0) > 0) {
    ctx.save();
    ctx.lineWidth = style.borderWidth!;
    ctx.strokeStyle = hexToRgba(style.borderColor ?? "#ffffff", style.borderOpacity ?? 1);
    applyRoundedRect(ctx, state.x, state.y, state.width, state.height, radius);
    ctx.stroke();
    ctx.restore();
  }
};

const renderFrame = (
  ctx: CanvasRenderingContext2D,
  project: Project,
  layout: ReturnType<typeof calculateCanvasLayout>,
  cells: CellRenderState[]
) => {
  ctx.clearRect(0, 0, layout.canvasWidth, layout.canvasHeight);
  ctx.fillStyle = project.composition.bgColor ?? "#111";
  ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);

  const { style } = project.composition;
  if (style.backgroundColor) {
    ctx.fillStyle = style.backgroundColor;
    applyRoundedRect(ctx, layout.padding, layout.padding, layout.innerWidth, layout.innerHeight, style.radius ?? 0);
    ctx.fill();
  }

  cells.forEach((cell) => drawCellFrame(ctx, cell, style));

  if (style.borderWidth && style.borderWidth > 0) {
    ctx.save();
    ctx.lineWidth = style.borderWidth;
    ctx.strokeStyle = hexToRgba(style.borderColor ?? "#ffffff", style.borderOpacity ?? 1);
    applyRoundedRect(ctx, layout.padding, layout.padding, layout.innerWidth, layout.innerHeight, style.radius ?? 0);
    ctx.stroke();
    ctx.restore();
  }
};

export async function exportProjectToMp4(project: Project, options: ExportOptions = {}): Promise<VideoExportResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Video export is only available in the browser.");
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this environment.");
  }

  const startedAt = now();
  const { durationSeconds, fps } = { ...DEFAULT_OPTIONS, ...options };
  logInfo("exportProjectToMp4 started", { durationSeconds, fps });
  logInfo("Project snapshot", {
    id: project.id,
    title: project.title,
    assetCount: project.assets?.length ?? 0,
    trackCount: project.tracks?.length ?? 0,
    grid: `${project.composition.grid.rows}x${project.composition.grid.cols}`,
    aspectRatio: project.composition.aspectRatio
  });

  const layout = calculateCanvasLayout(project.composition);
  logInfo("Canvas layout calculated", layout);

  const canvas = document.createElement("canvas");
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to obtain 2D rendering context.");
  }

  const trackByCell = getTrackByCell(project.tracks ?? []);
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));

  const cellStates: CellRenderState[] = await Promise.all(
    project.composition.grid.cells.map(async (cell, index) => {
      const x = layout.padding + cell.col * (layout.cellWidth + layout.gap);
      const y = layout.padding + cell.row * (layout.cellHeight + layout.gap);

      const track = trackByCell.get(index);
      const asset = track ? assetById.get(track.assetId) : undefined;
      const baseState: CellRenderState = {
        index,
        x,
        y,
        width: layout.cellWidth,
        height: layout.cellHeight,
        track,
        asset
      };

      if (!asset) {
        return baseState;
      }

      if (asset.type === "video") {
        const meta = { assetId: asset.id, assetName: asset.name, url: asset.url, cellIndex: index };
        try {
          logInfo("Loading video asset", meta);
          const video = await loadVideoAsset(asset);
          logInfo("Video asset loaded", { ...meta, width: video.width, height: video.height, duration: video.duration });
          return { ...baseState, video };
        } catch (error) {
          logWarn("Failed to load video asset", { ...meta, error });
          return baseState;
        }
      }

      if (asset.type === "image" || asset.type === "logo") {
        const meta = { assetId: asset.id, assetName: asset.name, url: asset.url, cellIndex: index };
        try {
          const image = await loadImageAsset(asset);
          logInfo("Image asset loaded for video export", { ...meta, width: image.width, height: image.height });
          return { ...baseState, image };
        } catch (error) {
          logWarn("Failed to load image asset for video export", { ...meta, error });
          return baseState;
        }
      }

      return baseState;
    })
  );

  const playableVideos = cellStates
    .map((state) => state.video?.element)
    .filter((video): video is HTMLVideoElement => Boolean(video));

  await Promise.all(
    playableVideos.map(async (video, index) => {
      try {
        video.currentTime = 0;
        await video.play();
        logInfo("Video playback started", { index, src: video.currentSrc || video.src });
      } catch (error) {
        logWarn("Autoplay failed for video element", { index, error });
      }
    })
  );

  const { mimeType, extension } = pickMediaType();
  logInfo("MediaRecorder configuration chosen", { mimeType, extension });

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType });

  const chunks: BlobPart[] = [];
  const recordingPromise = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = (event) => {
      logError("MediaRecorder error", event);
      reject(event.error ?? new Error("MediaRecorder encountered an error."));
    };
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  const timeslice = Math.max(250, Math.round(1000 / fps));
  recorder.start(timeslice);

  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
  const frameInterval = 1000 / fps;
  let framesRendered = 0;
  let rafId = 0;
  let lastFrameTime = now();

  await new Promise<void>((resolve) => {
    const step = (time: number) => {
      if (framesRendered === 0 || time - lastFrameTime >= frameInterval) {
        renderFrame(ctx, project, layout, cellStates);
        framesRendered += 1;
        lastFrameTime = time;
      }

      if (framesRendered >= totalFrames) {
        resolve();
        return;
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
  });

  cancelAnimationFrame(rafId);

  if (recorder.state !== "inactive") {
    recorder.stop();
  }

  const blob = await recordingPromise;
  logInfo("exportProjectToMp4 finished", {
    durationSeconds,
    fps,
    framesRendered,
    blobSize: blob.size,
    mimeType: blob.type,
    elapsedMs: Math.round(now() - startedAt)
  });

  playableVideos.forEach((video) => {
    try {
      video.pause();
      video.currentTime = 0;
    } catch {
      // ignore cleanup errors
    }
  });

  return {
    blob,
    mimeType: blob.type || mimeType,
    fileExtension: extension
  };
}
