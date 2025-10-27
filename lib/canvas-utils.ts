import type { Composition, Track } from "./types";

export const BASE_EXPORT_SIZE = 2048;

export type Aspect = { width: number; height: number };

export const parseAspectRatio = (value: string): Aspect => {
  const [w, h] = value.split(":").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) {
    return { width: 1, height: 1 };
  }
  return { width: w, height: h };
};

export const applyRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
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

export const hexToRgba = (hex: string, opacity = 1) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return `rgba(255, 255, 255, ${opacity})`;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export const getTrackByCell = (tracks: Track[]) => {
  const map = new Map<number, Track>();
  tracks.forEach((track) => {
    if (!map.has(track.cellIndex)) {
      map.set(track.cellIndex, track);
    }
  });
  return map;
};

export type CanvasLayout = {
  canvasWidth: number;
  canvasHeight: number;
  padding: number;
  gap: number;
  innerWidth: number;
  innerHeight: number;
  cellWidth: number;
  cellHeight: number;
};

export const calculateCanvasLayout = (composition: Composition, baseSize = BASE_EXPORT_SIZE): CanvasLayout => {
  const { width: aspectWidth, height: aspectHeight } = parseAspectRatio(composition.aspectRatio);
  const clampedBaseSize = Math.max(1, baseSize);
  const aspectMaxDimension = Math.max(aspectWidth, aspectHeight);
  const scaleFactor = clampedBaseSize / Math.max(aspectMaxDimension, 1);
  const canvasWidth = Math.round(aspectWidth * scaleFactor);
  const canvasHeight = Math.round(aspectHeight * scaleFactor);

  const padding = composition.style.padding ?? 0;
  const gap = composition.style.gap ?? 0;
  const innerWidth = canvasWidth - padding * 2;
  const innerHeight = canvasHeight - padding * 2;

  if (innerWidth <= 0 || innerHeight <= 0) {
    throw new Error("Composition size is too small to render.");
  }

  const cellWidth = (innerWidth - gap * (composition.grid.cols - 1)) / composition.grid.cols;
  const cellHeight = (innerHeight - gap * (composition.grid.rows - 1)) / composition.grid.rows;

  return {
    canvasWidth,
    canvasHeight,
    padding,
    gap,
    innerWidth,
    innerHeight,
    cellWidth,
    cellHeight
  };
};

export const drawPlaceholder = (
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

export type VisualSource = {
  element: CanvasImageSource;
  width: number;
  height: number;
};

export const drawVisualInCell = (
  ctx: CanvasRenderingContext2D,
  source: VisualSource,
  track: Track,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const assetWidth = source.width;
  const assetHeight = source.height;

  if (!assetWidth || !assetHeight) {
    return;
  }

  const fitMode = track.fit ?? "cover";
  const scale = track.scale ?? 1;

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
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.drawImage(source.element, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  } else {
    ctx.drawImage(source.element, drawX, drawY, drawWidth, drawHeight);
  }
};
