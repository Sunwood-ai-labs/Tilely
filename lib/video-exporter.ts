import {
  applyRoundedRect,
  calculateCanvasLayout,
  drawPlaceholder,
  drawVisualInCell,
  getTrackByCell,
  hexToRgba,
  BASE_EXPORT_SIZE
} from "./canvas-utils";
import { loadImageAsset, loadVideoAsset, type LoadedImage, type LoadedVideo } from "./media-loaders";
import type { Project, Asset, Track } from "./types";

type ExportOptions = {
  durationSeconds?: number;
  fps?: number;
  videoBitrateMbps?: number;
  videoBitsPerSecond?: number;
  audioBitrateKbps?: number;
  audioBitsPerSecond?: number;
  maxDimension?: number;
};

export type VideoExportResult = {
  blob: Blob;
  mimeType: string;
  fileExtension: string;
};

const DEFAULT_OPTIONS: { durationSeconds: number; fps: number } = {
  durationSeconds: 3,
  fps: 30
};

const MIN_CANVAS_DIMENSION = 256;
const MAX_CANVAS_DIMENSION = 8192;

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

type ExtendedCanvasLayout = ReturnType<typeof calculateCanvasLayout> & {
  columnWidths: number[];
  rowHeights: number[];
};

type CellRenderState = {
  index: number;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  track?: Track;
  asset?: Asset;
  image?: LoadedImage;
  video?: LoadedVideo;
};

type CellMedia = {
  index: number;
  row: number;
  col: number;
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

const renderFrame = (ctx: CanvasRenderingContext2D, project: Project, layout: ExtendedCanvasLayout, cells: CellRenderState[]) => {
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
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));

  const trackDurations = project.tracks
    .map((track) => track.duration ?? assetById.get(track.assetId)?.duration ?? 0)
    .filter((value): value is number => Number.isFinite(value) && value > 0);
  const assetFps = project.tracks
    .map((track) => assetById.get(track.assetId)?.fps ?? 0)
    .filter((value): value is number => Number.isFinite(value) && value > 0);

  const durationSeconds =
    options.durationSeconds ??
    (trackDurations.length ? Math.max(DEFAULT_OPTIONS.durationSeconds, ...trackDurations) : DEFAULT_OPTIONS.durationSeconds);
  const fps =
    options.fps ??
    (assetFps.length ? Math.min(60, Math.max(DEFAULT_OPTIONS.fps, ...assetFps)) : DEFAULT_OPTIONS.fps);
  const maxDimensionCandidate = options.maxDimension;
  const maxDimension =
    Number.isFinite(maxDimensionCandidate) && maxDimensionCandidate && maxDimensionCandidate > 0
      ? Math.min(MAX_CANVAS_DIMENSION, Math.max(MIN_CANVAS_DIMENSION, Math.round(maxDimensionCandidate)))
      : BASE_EXPORT_SIZE;
  let effectiveFps = fps;

  logInfo("exportProjectToMp4 started", { durationSeconds, fps, maxDimension });
  logInfo("Project snapshot", {
    id: project.id,
    title: project.title,
    assetCount: project.assets?.length ?? 0,
    trackCount: project.tracks?.length ?? 0,
    grid: `${project.composition.grid.rows}x${project.composition.grid.cols}`,
    aspectRatio: project.composition.aspectRatio
  });

  const baseLayout = calculateCanvasLayout(project.composition, maxDimension);
  logInfo("Initial canvas layout", baseLayout);

  const canvas = document.createElement("canvas");
  canvas.width = baseLayout.canvasWidth;
  canvas.height = baseLayout.canvasHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to obtain 2D rendering context.");
  }

  const trackByCell = getTrackByCell(project.tracks ?? []);
  const grid = project.composition.grid;

  const cellMedia: CellMedia[] = await Promise.all(
    grid.cells.map(async (cell, index) => {
      const track = trackByCell.get(index);
      const asset = track ? assetById.get(track.assetId) : undefined;

      const base: CellMedia = {
        index,
        row: cell.row,
        col: cell.col,
        track,
        asset
      };

      if (!asset) {
        return base;
      }

      const meta = { assetId: asset.id, assetName: asset.name, url: asset.url, cellIndex: index };

      if (asset.type === "video") {
        try {
          logInfo("Loading video asset", meta);
          const video = await loadVideoAsset(asset);
          logInfo("Video asset loaded", { ...meta, width: video.width, height: video.height, duration: video.duration });
          return { ...base, video };
        } catch (error) {
          logWarn("Failed to load video asset", { ...meta, error });
          return base;
        }
      }

      if (asset.type === "image" || asset.type === "logo") {
        try {
          logInfo("Loading image asset", meta);
          const image = await loadImageAsset(asset);
          logInfo("Image asset loaded", { ...meta, width: image.width, height: image.height });
          return { ...base, image };
        } catch (error) {
          logWarn("Failed to load image asset", { ...meta, error });
          return base;
        }
      }

      return base;
    })
  );

  const columnWidths = Array.from({ length: grid.cols }, () => baseLayout.cellWidth);
  const rowHeights = Array.from({ length: grid.rows }, () => baseLayout.cellHeight);

  const collectPositive = (values: Array<number | undefined>) =>
    values.filter((value): value is number => value !== undefined && Number.isFinite(value) && value > 0);

  cellMedia.forEach((cell) => {
    const scale = cell.track?.scale ?? 1;
    const widthCandidates = collectPositive([
      cell.video?.element.videoWidth,
      cell.video?.width,
      cell.image?.width,
      cell.asset?.width
    ]).map((value) => value * scale);
    const heightCandidates = collectPositive([
      cell.video?.element.videoHeight,
      cell.video?.height,
      cell.image?.height,
      cell.asset?.height
    ]).map((value) => value * scale);

    if (widthCandidates.length) {
      const width = Math.round(Math.max(...widthCandidates));
      columnWidths[cell.col] = Math.max(columnWidths[cell.col], width);
    }
    if (heightCandidates.length) {
      const height = Math.round(Math.max(...heightCandidates));
      rowHeights[cell.row] = Math.max(rowHeights[cell.row], height);
    }
  });

  const gap = baseLayout.gap;
  const padding = baseLayout.padding;

  const innerWidth = columnWidths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, grid.cols - 1);
  const innerHeight = rowHeights.reduce((sum, height) => sum + height, 0) + gap * Math.max(0, grid.rows - 1);

  const layout: ExtendedCanvasLayout = {
    ...baseLayout,
    columnWidths,
    rowHeights,
    innerWidth: Math.round(innerWidth),
    innerHeight: Math.round(innerHeight),
    canvasWidth: Math.round(innerWidth + padding * 2),
    canvasHeight: Math.round(innerHeight + padding * 2),
    cellWidth: columnWidths[0] ?? baseLayout.cellWidth,
    cellHeight: rowHeights[0] ?? baseLayout.cellHeight
  };

  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;
  logInfo("Adjusted canvas layout", {
    canvasWidth: layout.canvasWidth,
    canvasHeight: layout.canvasHeight,
    columnWidths,
    rowHeights
  });

  const columnOffsets: number[] = [];
  const rowOffsets: number[] = [];

  let xOffset = 0;
  for (let col = 0; col < grid.cols; col += 1) {
    columnOffsets[col] = xOffset;
    xOffset += columnWidths[col];
    if (col < grid.cols - 1) {
      xOffset += gap;
    }
  }

  let yOffset = 0;
  for (let row = 0; row < grid.rows; row += 1) {
    rowOffsets[row] = yOffset;
    yOffset += rowHeights[row];
    if (row < grid.rows - 1) {
      yOffset += gap;
    }
  }

  const cellStates: CellRenderState[] = cellMedia.map((cell) => ({
    index: cell.index,
    row: cell.row,
    col: cell.col,
    x: layout.padding + (columnOffsets[cell.col] ?? 0),
    y: layout.padding + (rowOffsets[cell.row] ?? 0),
    width: columnWidths[cell.col] ?? layout.cellWidth,
    height: rowHeights[cell.row] ?? layout.cellHeight,
    track: cell.track,
    asset: cell.asset,
    image: cell.image,
    video: cell.video
  }));

  const playableVideos = cellStates
    .map((state) => state.video?.element)
    .filter((video): video is HTMLVideoElement => Boolean(video));

  const videoTrackCount = cellStates.filter((cell) => cell.asset?.type === "video").length || playableVideos.length;

  let videoBitsPerSecond =
    options.videoBitsPerSecond ??
    (options.videoBitrateMbps ? Math.round(options.videoBitrateMbps * 1_000_000) : undefined);
  if (!videoBitsPerSecond || !Number.isFinite(videoBitsPerSecond) || videoBitsPerSecond <= 0) {
    const basePerTrack = 5_000_000;
    videoBitsPerSecond = basePerTrack * Math.max(1, videoTrackCount);
  }

  let audioBitsPerSecond =
    options.audioBitsPerSecond ??
    (options.audioBitrateKbps ? Math.round(options.audioBitrateKbps * 1_000) : undefined);
  if (!audioBitsPerSecond || !Number.isFinite(audioBitsPerSecond) || audioBitsPerSecond <= 0) {
    audioBitsPerSecond = 192_000;
  }

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
  const recorderOptions: MediaRecorderOptions = { mimeType };
  if (Number.isFinite(videoBitsPerSecond) && videoBitsPerSecond > 0) {
    recorderOptions.videoBitsPerSecond = Math.round(videoBitsPerSecond);
  }
  if (Number.isFinite(audioBitsPerSecond) && audioBitsPerSecond > 0) {
    recorderOptions.audioBitsPerSecond = Math.round(audioBitsPerSecond);
  }
  logInfo("MediaRecorder configuration chosen", {
    mimeType,
    extension,
    videoBitsPerSecond: recorderOptions.videoBitsPerSecond,
    audioBitsPerSecond: recorderOptions.audioBitsPerSecond
  });

  const captureFrameRate = Math.max(1, fps);
  const stream = canvas.captureStream(captureFrameRate);
  const [canvasTrack] = stream.getVideoTracks();

  if (canvasTrack && typeof canvasTrack.applyConstraints === "function") {
    try {
      await canvasTrack.applyConstraints({ frameRate: captureFrameRate });
    } catch (error) {
      logWarn("Failed to apply frameRate constraint to canvas track", { requestedFrameRate: captureFrameRate, error });
    }
  }

  if (canvasTrack && typeof canvasTrack.getSettings === "function") {
    try {
      const settings = canvasTrack.getSettings();
      if (settings?.frameRate && Number.isFinite(settings.frameRate)) {
        effectiveFps = settings.frameRate;
      }
    } catch (error) {
      logWarn("Failed to read canvas track settings", { error });
    }
  }

  if (!Number.isFinite(effectiveFps) || effectiveFps <= 0) {
    effectiveFps = captureFrameRate;
  }

  logInfo("Canvas capture stream configured", {
    requestedFps: fps,
    captureFrameRate,
    effectiveFps
  });

  const recorder = new MediaRecorder(stream, recorderOptions);

  const chunks: BlobPart[] = [];
  const recordingPromise = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = (event) => {
      logError("MediaRecorder error", event);
      const error = (event as { error?: DOMException | Error }).error ?? new Error("MediaRecorder encountered an error.");
      reject(error);
    };
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  const timeslice = Math.max(250, Math.round(1000 / Math.max(effectiveFps, 1)));
  recorder.start(timeslice);

  const totalFrames = Math.max(1, Math.round(durationSeconds * effectiveFps));
  const frameInterval = 1000 / Math.max(effectiveFps, 1);
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
    requestedFps: fps,
    effectiveFps,
    maxDimension,
    framesRendered,
    videoBitsPerSecond: recorderOptions.videoBitsPerSecond,
    audioBitsPerSecond: recorderOptions.audioBitsPerSecond,
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
