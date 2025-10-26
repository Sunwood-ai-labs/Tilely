import { type Project, Asset, Track } from "./types";

const BASE_EXPORT_SIZE = 2048;

type LoadedImage = {
  element: HTMLImageElement;
  width: number;
  height: number;
};

const loadImage = (asset: Asset): Promise<LoadedImage> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      resolve({
        element: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height
      });
    };
    image.onerror = (error) => reject(error);
    image.src = asset.url;
  });
};

const parseAspectRatio = (value: string) => {
  const [w, h] = value.split(":").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) {
    return { width: 1, height: 1 };
  }
  return { width: w, height: h };
};

const applyRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const hexToRgba = (hex: string, opacity = 1) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return `rgba(255, 255, 255, ${opacity})`;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const getTrackByCell = (tracks: Track[]) => {
  const map = new Map<number, Track>();
  tracks.forEach((track) => {
    if (!map.has(track.cellIndex)) {
      map.set(track.cellIndex, track);
    }
  });
  return map;
};

const drawPlaceholder = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  type: "audio" | "video"
) => {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  if (type === "audio") {
    gradient.addColorStop(0, "#1e1a45");
    gradient.addColorStop(1, "#3a2b7a");
  } else {
    gradient.addColorStop(0, "#1a3a45");
    gradient.addColorStop(1, "#2b7387");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `bold ${Math.max(24, Math.round(height * 0.12))}px "Inter", "Helvetica", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(type.toUpperCase(), x + width / 2, y + height / 2);
};

const drawImageInCell = (
  ctx: CanvasRenderingContext2D,
  asset: LoadedImage,
  track: Track,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const { element } = asset;
  const assetWidth = asset.width || element.width;
  const assetHeight = asset.height || element.height;

  if (!assetWidth || !assetHeight) {
    return;
  }

  const fitMode = track.fit ?? "cover";
  const scale = track.scale ?? 1;

  const cellAspect = width / height;
  const assetAspect = assetWidth / assetHeight;

  let drawWidth: number;
  let drawHeight: number;

  if (fitMode === "cover") {
    const factor = Math.max(width / assetWidth, height / assetHeight) * scale;
    drawWidth = assetWidth * factor;
    drawHeight = assetHeight * factor;
  } else {
    const factor = Math.min(width / assetWidth, height / assetHeight) * scale;
    drawWidth = assetWidth * factor;
    drawHeight = assetHeight * factor;
  }

  const offsetX = track.panX ?? 0;
  const offsetY = track.panY ?? 0;

  const drawX = x + (width - drawWidth) / 2 + offsetX;
  const drawY = y + (height - drawHeight) / 2 + offsetY;

  if (fitMode === "contain") {
    // Ensure the image stays within bounds for contain mode by clipping
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.drawImage(element, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  } else {
    ctx.drawImage(element, drawX, drawY, drawWidth, drawHeight);
  }
};

export async function exportProjectToImage(project: Project): Promise<Blob> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Image export is only available in the browser.");
  }

  const { width: aspectWidth, height: aspectHeight } = parseAspectRatio(project.composition.aspectRatio);
  const maxDimension = Math.max(aspectWidth, aspectHeight);
  const scaleFactor = BASE_EXPORT_SIZE / maxDimension;
  const canvasWidth = Math.round(aspectWidth * scaleFactor);
  const canvasHeight = Math.round(aspectHeight * scaleFactor);

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
  const padding = style.padding ?? 0;
  const gap = style.gap ?? 0;

  const innerWidth = canvasWidth - padding * 2;
  const innerHeight = canvasHeight - padding * 2;

  if (innerWidth <= 0 || innerHeight <= 0) {
    throw new Error("Composition size is too small to render.");
  }

  const cellWidth = (innerWidth - gap * (grid.cols - 1)) / grid.cols;
  const cellHeight = (innerHeight - gap * (grid.rows - 1)) / grid.rows;

  const trackByCell = getTrackByCell(project.tracks ?? []);
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const loadedImages = new Map<string, LoadedImage>();

  // Preload images
  await Promise.all(
    project.tracks
      .map((track) => assetById.get(track.assetId))
      .filter((asset): asset is Asset => Boolean(asset && (asset.type === "image" || asset.type === "logo")))
      .map(async (asset) => {
        try {
          const image = await loadImage(asset);
          loadedImages.set(asset.id, image);
        } catch (error) {
          console.warn("[Tilely] Failed to load asset for export:", asset?.name ?? asset?.id, error);
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
      if ((asset.type === "image" || asset.type === "logo") && loadedImages.has(asset.id)) {
        const image = loadedImages.get(asset.id)!;
        drawImageInCell(ctx, image, track!, x, y, cellWidth, cellHeight);
      } else if (asset.type === "video") {
        drawPlaceholder(ctx, x, y, cellWidth, cellHeight, "video");
      } else if (asset.type === "audio") {
        drawPlaceholder(ctx, x, y, cellWidth, cellHeight, "audio");
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x, y, cellWidth, cellHeight);
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

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to export canvas to blob."));
      } else {
        resolve(blob);
      }
    }, "image/png");
  });
}
