"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useProjectStore } from "@/lib/store";
import { formatDuration } from "@/lib/utils";
import type { Track } from "@/lib/types";
import { AudioLines, Crop, Trash2 } from "lucide-react";

export function TimelineView() {
  const project = useProjectStore((state) => state.project);
  const updateTrack = useProjectStore((state) => state.updateTrack);
  const removeTrack = useProjectStore((state) => state.removeTrack);
  const setActiveCell = useProjectStore((state) => state.setActiveCell);
  const activeCell = useProjectStore((state) => state.activeCell);

  const clips = [...project.tracks].sort((a, b) => a.cellIndex - b.cellIndex);

  return (
    <section className="flex min-h-[240px] flex-col rounded-2xl border border-border/50 bg-zinc-950/70 p-4 shadow-inner shadow-black/40">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">タイムライン</h2>
          <p className="text-[11px] text-muted-foreground">各セルのトリムと音量をここで調整できるよ。</p>
        </div>
        <div className="rounded-full bg-zinc-900/70 px-3 py-1 text-[10px] text-muted-foreground">
          全長: {formatDuration(getMaxDuration(clips))}
        </div>
      </header>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 pr-2">
          {clips.length === 0 ? (
            <EmptyTimelineState />
          ) : (
            clips.map((clip) => {
              const asset = project.assets.find((item) => item.id === clip.assetId);
              if (!asset) return null;
              const isActive = activeCell === clip.cellIndex;
              return (
                <div
                  key={clip.id}
                  className="rounded-xl border border-border/40 bg-zinc-900/60 p-3 text-xs text-muted-foreground"
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveCell(clip.cellIndex)}
                      className="flex flex-col items-start text-left"
                    >
                      <span className="text-sm font-semibold text-foreground">
                        セル {clip.cellIndex + 1}: {asset.name}
                      </span>
                      <span className="text-[11px]">
                        {asset.type.toUpperCase()} · {formatDuration(clip.in)} – {formatDuration(clip.out)} / 合計
                        {formatDuration(clip.duration)}
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      <span>ミュート</span>
                      <Switch
                        checked={clip.muted}
                        onCheckedChange={(checked) =>
                          updateTrack(clip.id, (track) => ({ ...track, muted: checked }))
                        }
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeTrack(clip.id)}
                        className="text-red-300 hover:text-red-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
                      <Crop className="h-3 w-3" /> トリム
                    </div>
                    <Slider
                      min={0}
                      max={clip.duration}
                      step={0.05}
                      value={[clip.in, Math.min(clip.out, clip.duration)]}
                      onValueChange={(values) => {
                        const [start, end] = values;
                        updateTrack(clip.id, (track) => ({
                          ...track,
                          in: Math.max(0, Math.min(start, clip.duration)),
                          out: Math.max(start, Math.min(end, clip.duration))
                        }));
                      }}
                    />
                    <div className="flex items-center justify-between text-[10px]">
                      <span>{formatDuration(clip.in)}</span>
                      <span>{formatDuration(clip.out)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.16em]">
                      <span>音量 (dB)</span>
                      <span className="font-mono text-indigo-200">{clip.volume}</span>
                    </div>
                    <Slider
                      min={-24}
                      max={12}
                      step={1}
                      value={[clip.volume]}
                      onValueChange={(values) =>
                        updateTrack(clip.id, (track) => ({ ...track, volume: values[0] }))
                      }
                    />
                  </div>
                  {isActive ? (
                    <div className="mt-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-[11px] text-indigo-100">
                      選択中のセルだよ。右側のプロパティパネルでさらに調整してみてね！
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

function EmptyTimelineState() {
  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 bg-zinc-900/40 text-xs text-muted-foreground">
      <AudioLines className="h-5 w-5" />
      セルに素材を配置すると、ここでトリムとオーディオが編集できるよ。
    </div>
  );
}

function getMaxDuration(clips: Track[]) {
  return clips.reduce((max, clip) => Math.max(max, clip.out), 0);
}
