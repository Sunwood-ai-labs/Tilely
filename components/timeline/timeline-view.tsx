"use client";

import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjectStore } from "@/lib/store";
import { formatDuration } from "@/lib/utils";
import type { Track } from "@/lib/types";
import { AudioLines, Crop, Tag, Trash2 } from "lucide-react";

const TAG_OPTIONS = [
  "AI生成",
  "手動編集",
  "アニメーション",
  "背景",
  "キャラクター",
  "ロゴ",
  "テキスト",
  "エフェクト",
  "音楽",
  "効果音",
  "ボイス"
] as const;

const AI_TOOL_OPTIONS = [
  "DALL-E 3",
  "Grok",
  "Whisk",
  "Midjourney",
  "Stable Diffusion",
  "Firefly (Adobe)",
  "Imagen (Google)",
  "Leonardo.AI",
  "Flux Kontext",
  "Reve",
  "Runway",
  "Pika",
  "Sora (OpenAI)",
  "Kling",
  "Veo (Google)",
  "Seedream 4.0",
  "Nano Banana",
  "Multi Ref",
  "その他"
] as const;

export function TimelineView() {
  const project = useProjectStore((state) => state.project);
  const updateTrack = useProjectStore((state) => state.updateTrack);
  const removeTrack = useProjectStore((state) => state.removeTrack);
  const setActiveCell = useProjectStore((state) => state.setActiveCell);
  const updateAssetMetadata = useProjectStore((state) => state.updateAssetMetadata);
  const activeCell = useProjectStore((state) => state.activeCell);

  const [showBulkEdit, setShowBulkEdit] = React.useState(false);
  const [bulkMetadata, setBulkMetadata] = React.useState<{
    aiTool: string[];
    promptFormat: string;
    prompt: string;
    tags: string[];
  }>({
    aiTool: [],
    promptFormat: "",
    prompt: "",
    tags: []
  });

  const clips = [...project.tracks].sort((a, b) => a.cellIndex - b.cellIndex);

  const applyBulkEdit = () => {
    clips.forEach((clip) => {
      const asset = project.assets.find((item) => item.id === clip.assetId);
      if (asset) {
        updateAssetMetadata(asset.id, {
          ...asset.metadata,
          ...bulkMetadata
        });
      }
    });
    setShowBulkEdit(false);
  };

  return (
    <section className="flex min-h-[260px] shrink-0 flex-col rounded-2xl border border-border/50 bg-zinc-950/70 p-4 shadow-inner shadow-black/40">
      <header className="mb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">タイムライン</h2>
            <p className="text-[11px] text-muted-foreground">各セルのトリム、音量、メタデータをここで調整できるよ。</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-zinc-900/70 px-3 py-1 text-[10px] text-muted-foreground">
              全長: {formatDuration(getMaxDuration(clips))}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBulkEdit(!showBulkEdit)}
              className="text-xs"
            >
              {showBulkEdit ? "一括編集を閉じる" : "全セル一括編集"}
            </Button>
          </div>
        </div>
        {showBulkEdit && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-emerald-200">全セル一括編集</p>
              <Button size="sm" onClick={applyBulkEdit} className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                全セルに適用
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-[10px] text-emerald-100">AI ツール（複数選択可）</Label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto bg-zinc-950/40 rounded p-2">
                  {AI_TOOL_OPTIONS.map((tool) => (
                    <div key={tool} className="flex items-center space-x-2">
                      <Checkbox
                        id={`bulk-ai-${tool}`}
                        checked={bulkMetadata.aiTool.includes(tool)}
                        onCheckedChange={(checked) => {
                          setBulkMetadata({
                            ...bulkMetadata,
                            aiTool: checked
                              ? [...bulkMetadata.aiTool, tool]
                              : bulkMetadata.aiTool.filter((t) => t !== tool)
                          });
                        }}
                      />
                      <label htmlFor={`bulk-ai-${tool}`} className="text-[10px] text-white leading-none">
                        {tool}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-emerald-100">タグ（複数選択可）</Label>
                <div className="grid grid-cols-2 gap-2 bg-zinc-950/40 rounded p-2">
                  {TAG_OPTIONS.map((tag) => (
                    <div key={tag} className="flex items-center space-x-2">
                      <Checkbox
                        id={`bulk-tag-${tag}`}
                        checked={bulkMetadata.tags.includes(tag)}
                        onCheckedChange={(checked) => {
                          setBulkMetadata({
                            ...bulkMetadata,
                            tags: checked
                              ? [...bulkMetadata.tags, tag]
                              : bulkMetadata.tags.filter((t) => t !== tag)
                          });
                        }}
                      />
                      <label htmlFor={`bulk-tag-${tag}`} className="text-[10px] text-white leading-none">
                        {tag}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-emerald-100">プロンプト形式</Label>
                <Select
                  value={bulkMetadata.promptFormat}
                  onValueChange={(value) => setBulkMetadata({ ...bulkMetadata, promptFormat: value })}
                >
                  <SelectTrigger className="h-8 text-xs bg-zinc-950/40">
                    <SelectValue placeholder="形式を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JSON">JSON</SelectItem>
                    <SelectItem value="YAML">YAML</SelectItem>
                    <SelectItem value="Plain Text">Plain Text</SelectItem>
                    <SelectItem value="Markdown">Markdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-emerald-100">プロンプト内容</Label>
                <Input
                  type="text"
                  placeholder="プロンプトの内容"
                  value={bulkMetadata.prompt}
                  onChange={(e) => setBulkMetadata({ ...bulkMetadata, prompt: e.target.value })}
                  className="h-8 text-xs bg-zinc-950/40"
                />
              </div>
            </div>
          </div>
        )}
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
                      className="flex flex-col items-start gap-1 text-left"
                    >
                      <span className="text-sm font-semibold text-foreground">
                        セル {clip.cellIndex + 1}: {asset.name}
                      </span>
                      <span className="text-[11px]">
                        {asset.type.toUpperCase()} · {formatDuration(clip.in)} – {formatDuration(clip.out)} / 合計
                        {formatDuration(clip.duration)}
                      </span>
                      {asset.metadata && ((asset.metadata.aiTool && asset.metadata.aiTool.length > 0) || asset.metadata.promptFormat || asset.metadata.prompt || (asset.metadata.tags && asset.metadata.tags.length > 0)) && (
                        <div className="flex flex-wrap gap-2 text-[10px]">
                          {asset.metadata.aiTool && asset.metadata.aiTool.map((tool) => (
                            <span key={tool} className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-200">
                              {tool}
                            </span>
                          ))}
                          {asset.metadata.promptFormat && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-200">
                              形式: {asset.metadata.promptFormat}
                            </span>
                          )}
                          {asset.metadata.prompt && (
                            <span className="max-w-xs truncate rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-200">
                              {asset.metadata.prompt}
                            </span>
                          )}
                          {asset.metadata.tags && asset.metadata.tags.map((tag) => (
                            <span key={tag} className="rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-200">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
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
                  <div className="mt-3 space-y-2 rounded-lg border border-border/30 bg-zinc-950/40 p-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      <Tag className="h-3 w-3" /> メタデータ / タグ
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px]">AI ツール（複数選択可）</Label>
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {AI_TOOL_OPTIONS.map((tool) => {
                          const isChecked = asset.metadata?.aiTool?.includes(tool) ?? false;
                          return (
                            <div key={tool} className="flex items-center space-x-2">
                              <Checkbox
                                id={`${asset.id}-ai-${tool}`}
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const currentTools = asset.metadata?.aiTool ?? [];
                                  const newTools = checked
                                    ? [...currentTools, tool]
                                    : currentTools.filter((t) => t !== tool);
                                  updateAssetMetadata(asset.id, {
                                    ...asset.metadata,
                                    aiTool: newTools
                                  });
                                }}
                              />
                              <label
                                htmlFor={`${asset.id}-ai-${tool}`}
                                className="text-[10px] leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {tool}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px]">プロンプト形式</Label>
                      <Select
                        value={asset.metadata?.promptFormat ?? ""}
                        onValueChange={(value) =>
                          updateAssetMetadata(asset.id, {
                            ...asset.metadata,
                            promptFormat: value
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="形式を選択" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="JSON">JSON</SelectItem>
                          <SelectItem value="YAML">YAML</SelectItem>
                          <SelectItem value="Plain Text">Plain Text</SelectItem>
                          <SelectItem value="Markdown">Markdown</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px]">プロンプト内容</Label>
                      <Input
                        type="text"
                        placeholder="プロンプトの内容"
                        value={asset.metadata?.prompt ?? ""}
                        onChange={(event) =>
                          updateAssetMetadata(asset.id, {
                            ...asset.metadata,
                            prompt: event.target.value
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px]">タグ（複数選択可）</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {TAG_OPTIONS.map((tag) => {
                          const isChecked = asset.metadata?.tags?.includes(tag) ?? false;
                          return (
                            <div key={tag} className="flex items-center space-x-2">
                              <Checkbox
                                id={`${asset.id}-${tag}`}
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const currentTags = asset.metadata?.tags ?? [];
                                  const newTags = checked
                                    ? [...currentTags, tag]
                                    : currentTags.filter((t) => t !== tag);
                                  updateAssetMetadata(asset.id, {
                                    ...asset.metadata,
                                    tags: newTags
                                  });
                                }}
                              />
                              <label
                                htmlFor={`${asset.id}-${tag}`}
                                className="text-[10px] leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {tag}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {isActive ? (
                    <div className="mt-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-[11px] text-indigo-100">
                      選択中のセルだよ。プロパティパネルでスケールやパンも調整できるよ！
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
