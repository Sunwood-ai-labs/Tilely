"use client";

import Image from "next/image";
import { type CSSProperties, type SVGProps, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { useProjectStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ImageOff, MoveHorizontal, MoveVertical } from "lucide-react";

export function CanvasPreview() {
  const project = useProjectStore((state) => state.project);
  const activeCell = useProjectStore((state) => state.activeCell);
  const setActiveCell = useProjectStore((state) => state.setActiveCell);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const { widthRatio, heightRatio } = useMemo(() => parseAspectRatio(project.composition.aspectRatio), [
    project.composition.aspectRatio
  ]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const previewDimensions = useMemo(() => {
    if (!containerSize.width || !containerSize.height) {
      return null;
    }

    const safeWidth = Math.max(widthRatio, 1);
    const safeHeight = Math.max(heightRatio, 1);
    const scale = Math.min(containerSize.width / safeWidth, containerSize.height / safeHeight);

    return {
      width: safeWidth * scale,
      height: safeHeight * scale
    };
  }, [containerSize.height, containerSize.width, heightRatio, widthRatio]);

  const cells = project.composition.grid.cells;
  const gridStyle = {
    gridTemplateColumns: `repeat(${project.composition.grid.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${project.composition.grid.rows}, minmax(0, 1fr))`,
    gap: `${project.composition.style.gap}px`,
    padding: `${project.composition.style.padding}px`,
    borderRadius: `${project.composition.style.radius}px`,
    borderWidth: `${project.composition.style.borderWidth}px`,
    borderStyle: "solid",
    borderColor: `${hexWithAlpha(project.composition.style.borderColor, project.composition.style.borderOpacity)}`,
    background: project.composition.style.backgroundColor
  } as const;

  return (
    <section className="flex min-h-[420px] flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          プレビュー
        </h2>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <MoveHorizontal className="h-3 w-3" />
          {project.composition.grid.cols} / {project.composition.grid.rows}
          <MoveVertical className="h-3 w-3" />
        </div>
      </div>
      <Card className="relative flex min-h-[360px] flex-1 items-center justify-center overflow-hidden border border-border/40 bg-zinc-950/80">
        <div ref={containerRef} className="relative flex h-full w-full items-center justify-center">
          <div
            className="relative overflow-hidden"
            style={{
              ...(previewDimensions
                ? { width: previewDimensions.width, height: previewDimensions.height }
                : { aspectRatio: `${widthRatio} / ${heightRatio}`, width: "100%" }),
              background: project.composition.bgColor,
              borderRadius: "1.5rem"
            }}
          >
            <div className="absolute inset-0 grid" style={gridStyle as CSSProperties}>
              {cells.map((cell, index) => {
                const track = project.tracks.find((item) => item.cellIndex === index);
                const asset = track ? project.assets.find((item) => item.id === track.assetId) : undefined;
                const isActive = activeCell === index;
                return (
                  <button
                    key={cell.id}
                    type="button"
                    onClick={() => setActiveCell(index)}
                    className={cn(
                      "relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit] border border-transparent transition",
                      isActive ? "border-indigo-400 shadow-[0_0_0_2px_rgba(129,140,248,0.6)]" : "border-white/5"
                    )}
                  >
                    {asset ? (
                      <AssetPreview trackId={track!.id} />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                        <ImageOff className="h-5 w-5" />
                        セル {index + 1}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

function AssetPreview({ trackId }: { trackId: string }) {
  const track = useProjectStore((state) => state.project.tracks.find((item) => item.id === trackId));
  const asset = useProjectStore((state) =>
    state.project.assets.find((item) => (track ? item.id === track.assetId : false))
  );

  if (!track || !asset) {
    return null;
  }

  const style: CSSProperties = {
    objectFit: track.fit === "cover" ? "cover" : "contain",
    transform: `scale(${track.scale}) translate(${track.panX}px, ${track.panY}px)`
  };

  if (asset.type === "video") {
    return (
      <video
        className="h-full w-full"
        src={asset.url}
        muted
        loop
        playsInline
        autoPlay
        style={style}
      />
    );
  }

  if (asset.type === "image" || asset.type === "logo") {
    return (
      <Image
        src={asset.url}
        alt={asset.name}
        fill
        sizes="100%"
        style={style}
        unoptimized
      />
    );
  }

  if (asset.type === "audio") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-indigo-200">
        <MusicWaveIcon className="h-6 w-6" />
        オーディオトラック
      </div>
    );
  }

  return null;
}

function parseAspectRatio(value: string) {
  const [w, h] = value.split(":").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) {
    return { widthRatio: 1, heightRatio: 1 };
  }
  return { widthRatio: w, heightRatio: h };
}

function hexWithAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function MusicWaveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M5 9v6M9 5v14M13 7v10M17 3v18M21 9v6" strokeLinecap="round" />
    </svg>
  );
}
