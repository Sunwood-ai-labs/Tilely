import {
  applyRoundedRect,
  calculateCanvasLayout,
  drawPlaceholder,
  drawVisualInCell,
  getTrackByCell,
  hexToRgba,
  BASE_EXPORT_SIZE
} from "./canvas-utils";
import { sanitizeAudioBitrateKbps, sanitizeFrameRate } from "./media-metadata";
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
  fps: number;
  durationSeconds: number;
};

const DEFAULT_OPTIONS: { durationSeconds: number; fps: number } = {
  durationSeconds: 3,
  fps: 30
};

const MIN_CANVAS_DIMENSION = 256;
const MAX_CANVAS_DIMENSION = 8192;
const MIN_VIDEO_BITS_PER_SECOND = 1_000_000;
const MAX_VIDEO_BITS_PER_SECOND = 40_000_000;
const DEFAULT_AUDIO_BITS_PER_SECOND = 130_000;

const sanitizeBitsPerSecond = (value?: number | null) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.round(Math.min(MAX_VIDEO_BITS_PER_SECOND, Math.max(MIN_VIDEO_BITS_PER_SECOND, value)));
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

const isBrowserEnvironment = () => typeof window !== "undefined" && typeof document !== "undefined";

type ProbeModule = typeof import("./server/ffprobe");
type ProbeVideoMetadata = Awaited<ReturnType<ProbeModule["probeVideoMetadata"]>>;

const ensureEvenDimension = (value: number) => Math.max(2, Math.round(value / 2) * 2);

const pickFirstPositive = (...values: Array<number | null | undefined>) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
};

const toAbsoluteAssetPath = (
  input: string,
  resolve: (path: string) => string,
  isAbsolute: (path: string) => boolean,
  fileURLToPath: (url: string) => string
) => {
  if (input.startsWith("file://")) {
    return fileURLToPath(input);
  }
  if (isAbsolute(input)) {
    return input;
  }
  return resolve(input);
};

async function exportProjectToMp4Node(project: Project, options: ExportOptions = {}): Promise<VideoExportResult> {
  const pathModule = await import(/* webpackIgnore: true */ "node:path");
  const fsModule = await import(/* webpackIgnore: true */ "node:fs/promises");
  const osModule = await import(/* webpackIgnore: true */ "node:os");
  const childProcessModule = await import(/* webpackIgnore: true */ "node:child_process");
  const cryptoModule = await import(/* webpackIgnore: true */ "node:crypto");
  const urlModule = await import(/* webpackIgnore: true */ "node:url");
  const probeModule = (await import("./server/ffprobe")) as ProbeModule;

  const { join, resolve, isAbsolute } = pathModule;
  const { mkdtemp, readFile, rm } = fsModule;
  const { tmpdir } = osModule;
  const { spawn } = childProcessModule;
  const { randomUUID } = cryptoModule;
  const { fileURLToPath } = urlModule;
  const { probeVideoMetadata } = probeModule;

  type NodeCell = {
    index: number;
    row: number;
    col: number;
    track: Track;
    asset: Asset;
    filePath: string;
  };

  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const trackByCell = getTrackByCell(project.tracks ?? []);

  const cells: NodeCell[] = project.composition.grid.cells
    .map((cell, index) => {
      const track = trackByCell.get(index);
      const asset = track ? assetById.get(track.assetId) : undefined;
      if (!track || !asset || asset.type !== "video") {
        return undefined;
      }
      const filePath = toAbsoluteAssetPath(asset.url, resolve, isAbsolute, fileURLToPath);
      return {
        index,
        row: cell.row,
        col: cell.col,
        track,
        asset,
        filePath
      } satisfies NodeCell;
    })
    .filter((value): value is NodeCell => Boolean(value));

  if (cells.length === 0) {
    throw new Error("Video export requires at least one video asset.");
  }

  const metadata: ProbeVideoMetadata[] = await Promise.all(
    cells.map(async (cell) => {
      try {
        return await probeVideoMetadata(cell.filePath);
      } catch (error) {
        throw new Error(`Failed to probe video asset at ${cell.filePath}: ${(error as Error).message}`);
      }
    })
  );

  const firstCell = cells[0];
  const firstMeta = metadata[0];

  const fps =
    sanitizeFrameRate(
      pickFirstPositive(
        options.fps,
        firstCell.asset.fps,
        firstMeta?.fps,
        cells
          .map((cell, index) => metadata[index]?.fps ?? cell.asset.fps)
          .find((value) => typeof value === "number")
      )
    ) ?? DEFAULT_OPTIONS.fps;

  const durationSeconds =
    pickFirstPositive(
      options.durationSeconds,
      firstCell.track.duration,
      firstCell.asset.duration,
      firstMeta?.duration,
      metadata.map((item) => item.duration).find((value) => typeof value === "number")
    ) ?? DEFAULT_OPTIONS.durationSeconds;

  let videoBitsPerSecond = sanitizeBitsPerSecond(
    options.videoBitsPerSecond ??
      (options.videoBitrateMbps ? options.videoBitrateMbps * 1_000_000 : firstMeta?.bitrate)
  );
  if (!videoBitsPerSecond) {
    const metaBitrates = metadata
      .map((item) => item.bitrate)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    if (metaBitrates.length) {
      videoBitsPerSecond = sanitizeBitsPerSecond(Math.max(...metaBitrates));
    }
  }
  if (!videoBitsPerSecond) {
    videoBitsPerSecond = sanitizeBitsPerSecond(5_000_000 * Math.max(1, cells.length));
  }

  let audioBitsPerSecond =
    options.audioBitsPerSecond ?? (options.audioBitrateKbps ? Math.round(options.audioBitrateKbps * 1_000) : undefined);
  if (!audioBitsPerSecond) {
    const audioMeta = metadata.find((item) => typeof item.audioBitrate === "number" && item.audioBitrate > 0);
    if (audioMeta?.audioBitrate) {
      audioBitsPerSecond = Math.round(audioMeta.audioBitrate);
    }
  }
  if (!audioBitsPerSecond && metadata.some((item) => item.hasAudio)) {
    audioBitsPerSecond = DEFAULT_AUDIO_BITS_PER_SECOND;
  }

  const baseLayout = calculateCanvasLayout(project.composition, options.maxDimension ?? BASE_EXPORT_SIZE);
  const padding = Math.max(0, Math.round(baseLayout.padding ?? 0));
  const gap = Math.max(0, Math.round(baseLayout.gap ?? 0));
  const cellWidth = ensureEvenDimension(Math.round(baseLayout.cellWidth));
  const cellHeight = ensureEvenDimension(Math.round(baseLayout.cellHeight));
  const rawWidth = cellWidth * project.composition.grid.cols + gap * Math.max(0, project.composition.grid.cols - 1);
  const rawHeight = cellHeight * project.composition.grid.rows + gap * Math.max(0, project.composition.grid.rows - 1);
  const canvasWidth = ensureEvenDimension(rawWidth + padding * 2);
  const canvasHeight = ensureEvenDimension(rawHeight + padding * 2);

  const positions = cells.map((cell) => ({
    x: cell.col * (cellWidth + gap),
    y: cell.row * (cellHeight + gap)
  }));

  const filterChains: string[] = cells.map((_, index) =>
    `[${index}:v]scale=${cellWidth}:${cellHeight}:force_original_aspect_ratio=increase,crop=${cellWidth}:${cellHeight},setsar=1[v${index}]`
  );
  const layoutParts = positions.map((position) => `${Math.round(position.x)}_${Math.round(position.y)}`);
  const xstackOutputLabel = padding > 0 ? "stacked" : "vout";
  filterChains.push(
    `${cells.map((_, index) => `[v${index}]`).join("")}xstack=inputs=${cells.length}:layout=${layoutParts.join("|")}:fill=black[${xstackOutputLabel}]`
  );
  if (padding > 0) {
    filterChains.push(`[${xstackOutputLabel}]pad=${canvasWidth}:${canvasHeight}:${padding}:${padding}:color=black[vout]`);
  }

  const filterComplex = filterChains.join(";");
  const inputArgs = cells.flatMap((cell) => ["-i", cell.filePath]);
  const hasAudio = metadata.some((item) => item.hasAudio);

  const tmpDir = await mkdtemp(join(tmpdir(), "tilely-export-"));
  const outputPath = join(tmpDir, `export-${randomUUID()}.mp4`);

  const args = [
    "-hide_banner",
    "-y",
    ...inputArgs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "fast",
    "-r",
    String(fps),
    "-movflags",
    "+faststart",
    "-shortest"
  ];

  if (videoBitsPerSecond) {
    args.push("-b:v", String(videoBitsPerSecond));
  }

  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    args.push("-t", durationSeconds.toFixed(3));
  }

  if (hasAudio) {
    args.push("-map", "0:a:0?");
    args.push("-c:a", "aac");
    if (audioBitsPerSecond) {
      args.push("-b:a", String(audioBitsPerSecond));
    }
  }

  args.push(outputPath);

  logInfo("Executing ffmpeg for Node export", { args, canvasWidth, canvasHeight, fps, hasAudio });

  try {
    const subprocess = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    subprocess.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    await new Promise<void>((resolvePromise, rejectPromise) => {
      subprocess.on("error", (error) => rejectPromise(error));
      subprocess.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
        } else {
          rejectPromise(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
        }
      });
    });

    const buffer = await readFile(outputPath);
    const blob = new Blob([buffer], { type: "video/mp4" });
    return {
      blob,
      mimeType: "video/mp4",
      fileExtension: "mp4",
      fps,
      durationSeconds
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

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
  if (!isBrowserEnvironment()) {
    return exportProjectToMp4Node(project, options);
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
  const firstCellTrack = project.tracks.find((track) => track.cellIndex === 0);
  const firstCellAsset = firstCellTrack ? assetById.get(firstCellTrack.assetId) : undefined;
  const estimatedFirstCellBitrate = sanitizeBitsPerSecond(
    firstCellAsset && firstCellAsset.duration && firstCellAsset.duration > 0 && firstCellAsset.size
      ? (firstCellAsset.size * 8) / firstCellAsset.duration
      : undefined
  );

  const firstCellDuration = firstCellTrack?.duration ?? firstCellAsset?.duration;
  const derivedDuration =
    typeof firstCellDuration === "number" && Number.isFinite(firstCellDuration) && firstCellDuration > 0
      ? firstCellDuration
      : undefined;
  const durationSeconds =
    options.durationSeconds ??
    (derivedDuration ??
      (trackDurations.length ? Math.max(DEFAULT_OPTIONS.durationSeconds, ...trackDurations) : DEFAULT_OPTIONS.durationSeconds));
  const fallbackAssetFps =
    assetFps.length ? Math.min(60, Math.max(DEFAULT_OPTIONS.fps, ...assetFps)) : undefined;
  let derivedFps = sanitizeFrameRate(firstCellAsset?.fps);
  let fps =
    options.fps ??
    (derivedFps ?? sanitizeFrameRate(fallbackAssetFps) ?? DEFAULT_OPTIONS.fps);
  const maxDimensionCandidate = options.maxDimension;
  const maxDimension =
    Number.isFinite(maxDimensionCandidate) && maxDimensionCandidate && maxDimensionCandidate > 0
      ? Math.min(MAX_CANVAS_DIMENSION, Math.max(MIN_CANVAS_DIMENSION, Math.round(maxDimensionCandidate)))
      : BASE_EXPORT_SIZE;
  let effectiveFps = fps;
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
          logInfo("Video asset loaded", {
            ...meta,
            width: video.width,
            height: video.height,
            duration: video.duration,
            fps: video.fps,
            audioBitrateKbps: video.audioBitrateKbps
          });
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

  const firstCellMedia = cellMedia.find((cell) => cell.index === 0);
  const firstCellAudioBitrateKbps = sanitizeAudioBitrateKbps(
    firstCellAsset?.audioBitrateKbps ?? firstCellMedia?.video?.audioBitrateKbps
  );

  if (!options.fps && !derivedFps) {
    const measuredFps = sanitizeFrameRate(firstCellMedia?.video?.fps);
    if (measuredFps) {
      derivedFps = measuredFps;
      fps = measuredFps;
    }
  }

  logInfo("exportProjectToMp4 started", {
    durationSeconds,
    fps,
    maxDimension,
    firstCellTrackId: firstCellTrack?.id,
    firstCellAssetId: firstCellAsset?.id,
    derivedDuration,
    derivedFps,
    firstCellAssetDuration: firstCellAsset?.duration,
    firstCellAssetFps: firstCellAsset?.fps,
    measuredFirstCellFps: firstCellMedia?.video?.fps,
    firstCellAudioBitrateKbps,
    estimatedFirstCellBitrate
  });

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

  let videoBitsPerSecond = sanitizeBitsPerSecond(
    options.videoBitsPerSecond ??
      (options.videoBitrateMbps ? options.videoBitrateMbps * 1_000_000 : estimatedFirstCellBitrate)
  );
  if (!videoBitsPerSecond) {
    const basePerTrack = 5_000_000;
    videoBitsPerSecond =
      sanitizeBitsPerSecond(basePerTrack * Math.max(1, videoTrackCount)) ?? basePerTrack;
  }

  let audioBitsPerSecond =
    options.audioBitsPerSecond ??
    (options.audioBitrateKbps ? Math.round(options.audioBitrateKbps * 1_000) : undefined);
  if ((!audioBitsPerSecond || !Number.isFinite(audioBitsPerSecond) || audioBitsPerSecond <= 0) && firstCellAudioBitrateKbps) {
    audioBitsPerSecond = Math.round(firstCellAudioBitrateKbps * 1_000);
  }
  if (!audioBitsPerSecond || !Number.isFinite(audioBitsPerSecond) || audioBitsPerSecond <= 0) {
    audioBitsPerSecond = DEFAULT_AUDIO_BITS_PER_SECOND;
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

  const durationMs = Math.max(1, durationSeconds * 1000);
  const frameInterval = 1000 / Math.max(fps, 1);
  let framesRendered = 0;
  let rafId = 0;
  let lastFrameTime = now();
  let renderStartTime = 0;

  await new Promise<void>((resolve) => {
    const step = (time: number) => {
      if (framesRendered === 0) {
        renderStartTime = time;
        lastFrameTime = time - frameInterval;
      }

      if (time - lastFrameTime >= frameInterval) {
        renderFrame(ctx, project, layout, cellStates);
        framesRendered += 1;
        lastFrameTime = time;
      }

      if (time - renderStartTime >= durationMs) {
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
    fileExtension: extension,
    fps: effectiveFps,
    durationSeconds
  };
}
