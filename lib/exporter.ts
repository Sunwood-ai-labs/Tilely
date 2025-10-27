import { type Project, Asset } from "./types";
import {
  applyRoundedRect,
  calculateCanvasLayout,
  drawPlaceholder,
  drawVisualInCell,
  getTrackByCell,
  hexToRgba
} from "./canvas-utils";
import { loadImageAsset, type LoadedImage } from "./media-loaders";

const EXPORT_LOG_PREFIX = "[image-exporter]";
const logInfo = (message: string, extra?: unknown) => {
  if (typeof extra === "undefined") {
    console.log(`${EXPORT_LOG_PREFIX} ${message}`);
    return;
  }
  console.log(`${EXPORT_LOG_PREFIX} ${message}`, extra);
};

const logWarn = (message: string, extra?: unknown) => {
  if (typeof extra === "undefined") {
    console.warn(`${EXPORT_LOG_PREFIX} ${message}`);
    return;
  }
  console.warn(`${EXPORT_LOG_PREFIX} ${message}`, extra);
};

const logError = (message: string, extra?: unknown) => {
  if (typeof extra === "undefined") {
    console.error(`${EXPORT_LOG_PREFIX} ${message}`);
    return;
  }
  console.error(`${EXPORT_LOG_PREFIX} ${message}`, extra);
};

export async function exportProjectToImage(project: Project): Promise<Blob> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Image export is only available in the browser.");
  }

  logInfo("exportProjectToImage started", {
    id: project.id,
    title: project.title,
    assetCount: project.assets?.length ?? 0,
    trackCount: project.tracks?.length ?? 0,
    aspectRatio: project.composition.aspectRatio,
  });

  const layout = calculateCanvasLayout(project.composition);
  const {
    canvasWidth,
    canvasHeight,
    padding,
    gap,
    innerWidth,
    innerHeight,
    cellWidth,
    cellHeight
  } = layout;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to obtain 2D rendering context.");
  }

  ctx.fillStyle = project.composition.bgColor ?? "#111";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const { style, grid } = project.composition;
  logInfo("Canvas prepared", {
    canvasWidth: layout.canvasWidth,
    canvasHeight: layout.canvasHeight,
    padding: layout.padding,
    gap: layout.gap,
  });

  const trackByCell = getTrackByCell(project.tracks ?? []);
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const loadedImages = new Map<string, LoadedImage>();

  // Preload images
  await Promise.all(
    project.tracks
      .map((track) => assetById.get(track.assetId))
      .filter((asset): asset is Asset => Boolean(asset && (asset.type === "image" || asset.type === "logo")))
      .map(async (asset) => {
        const meta = { assetId: asset.id, assetName: asset.name, url: asset.url };
        const start = performance.now();
        try {
          logInfo("Loading image asset", meta);
          const image = await loadImageAsset(asset);
          const duration = Math.round(performance.now() - start);
          loadedImages.set(asset.id, image);
          logInfo("Image asset loaded", { ...meta, durationMs: duration, width: image.width, height: image.height });
        } catch (error) {
          logWarn("Failed to load asset for export", { ...meta, error });
        }
      })
  );

  // Draw composition background within padding area
  if (style.backgroundColor) {
    ctx.fillStyle = style.backgroundColor;
    applyRoundedRect(ctx, padding, padding, innerWidth, innerHeight, style.radius ?? 0);
    ctx.fill();
  }

  grid.cells.forEach((cell, index) => {
    const x = padding + cell.col * (cellWidth + gap);
    const y = padding + cell.row * (cellHeight + gap);

    const radius = Math.max(0, style.radius ?? 0);
    ctx.save();
    applyRoundedRect(ctx, x, y, cellWidth, cellHeight, radius);
    ctx.clip();
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(x, y, cellWidth, cellHeight);

    const track = trackByCell.get(index);
    const asset = track ? assetById.get(track.assetId) : undefined;

    if (asset) {
      logInfo("Rendering cell", {
        cellIndex: index,
        assetId: asset.id,
        assetType: asset.type,
        trackId: track?.id,
      });
      if ((asset.type === "image" || asset.type === "logo") && loadedImages.has(asset.id)) {
        const image = loadedImages.get(asset.id)!;
        drawVisualInCell(
          ctx,
          { element: image.element, width: image.width, height: image.height },
          track!,
          x,
          y,
          cellWidth,
          cellHeight
        );
      } else if (asset.type === "video") {
        drawPlaceholder(ctx, x, y, cellWidth, cellHeight, "video");
      } else if (asset.type === "audio") {
        drawPlaceholder(ctx, x, y, cellWidth, cellHeight, "audio");
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x, y, cellWidth, cellHeight);
      logWarn("Cell rendered without asset", { cellIndex: index });
    }

    ctx.restore();

    if ((style.borderWidth ?? 0) > 0) {
      ctx.save();
      ctx.lineWidth = style.borderWidth!;
      ctx.strokeStyle = hexToRgba(style.borderColor ?? "#ffffff", style.borderOpacity ?? 1);
      applyRoundedRect(ctx, x, y, cellWidth, cellHeight, radius);
      ctx.stroke();
      ctx.restore();
    }
  });

  if (style.borderWidth && style.borderWidth > 0) {
    ctx.save();
    ctx.lineWidth = style.borderWidth;
    ctx.strokeStyle = hexToRgba(style.borderColor ?? "#ffffff", style.borderOpacity ?? 1);
    applyRoundedRect(ctx, padding, padding, innerWidth, innerHeight, style.radius ?? 0);
    ctx.stroke();
    ctx.restore();
  }

  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/png");
    });

    if (!blob) {
      throw new Error("Failed to export canvas to blob.");
    }

    logInfo("exportProjectToImage finished", { blobSize: blob.size, mimeType: blob.type });
    return blob;
  } catch (error) {
    logError("exportProjectToImage failed", error);
    throw error;
  }
}
