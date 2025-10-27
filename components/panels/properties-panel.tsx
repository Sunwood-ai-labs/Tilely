"use client";

import { useEffect, useMemo, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { layoutPresets, aspectRatioPresets } from "@/lib/presets";
import { useProjectStore } from "@/lib/store";
import { formatDuration, getExportFileName } from "@/lib/utils";
import { BadgePercent, Blend, Grid3X3 } from "lucide-react";

export function PropertiesPanel() {
  const project = useProjectStore((state) => state.project);
  const updateComposition = useProjectStore((state) => state.updateComposition);
  const applyLayoutPreset = useProjectStore((state) => state.applyLayoutPreset);
  const updateTrack = useProjectStore((state) => state.updateTrack);
  const updateAudio = useProjectStore((state) => state.updateAudio);
  const renderJob = useProjectStore((state) => state.renderJob);
  const activeCell = useProjectStore((state) => state.activeCell);

  const [customRatio, setCustomRatio] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const [w, h] = project.composition.aspectRatio.split(":").map(Number);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      setCustomRatio({ width: w, height: h });
    }
  }, [project.composition.aspectRatio]);

  const activeTrack = useMemo(
    () => project.tracks.find((track) => track.cellIndex === activeCell),
    [project.tracks, activeCell]
  );

  const activeAsset = useMemo(
    () => (activeTrack ? project.assets.find((asset) => asset.id === activeTrack.assetId) : undefined),
    [project.assets, activeTrack]
  );

  const currentAspectRatio = aspectRatioPresets.some((preset) => preset.id === project.composition.aspectRatio)
    ? project.composition.aspectRatio
    : "custom";

  const exportFileName = useMemo(
    () => getExportFileName(project.title, renderJob?.fileExtension ?? "png"),
    [project.title, renderJob?.fileExtension]
  );

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="rounded-2xl border border-border/60 bg-zinc-950/60 p-4 shadow-inner shadow-black/30">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          プロジェクトサマリー
        </p>
        <h3 className="mt-2 text-lg font-semibold text-foreground">{project.title || "Untitled"}</h3>
        <p className="text-xs text-muted-foreground">
          アセット {project.assets.length} · レイアウト {project.composition.grid.rows}×{project.composition.grid.cols}
        </p>
      </header>
      <Accordion type="multiple" defaultValue={["layout", "style", "audio"]} className="flex-1 space-y-3 overflow-y-auto pr-2">
        <AccordionItem value="layout" className="rounded-2xl border border-border/50 bg-zinc-950/60">
          <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
            レイアウト & アスペクト
          </AccordionTrigger>
          <AccordionContent className="space-y-4 px-4 pb-4">
            <div className="space-y-2">
              <Label>プリセット</Label>
              <div className="grid grid-cols-2 gap-2">
                {layoutPresets.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={
                      preset.rows === project.composition.grid.rows && preset.cols === project.composition.grid.cols
                        ? "default"
                        : "secondary"
                    }
                    className="justify-start"
                    onClick={() => applyLayoutPreset(preset.rows, preset.cols)}
                  >
                    <Grid3X3 className="mr-2 h-4 w-4" /> {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>キャンバス比率</Label>
              <Select
                value={currentAspectRatio}
                onValueChange={(value) => {
                  if (value === "custom") return;
                  updateComposition((composition) => ({ ...composition, aspectRatio: value }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="比率を選択" />
                </SelectTrigger>
                <SelectContent>
                  {aspectRatioPresets.map((ratio) => (
                    <SelectItem key={ratio.id} value={ratio.id}>
                      {ratio.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="space-y-1">
                  <Label className="text-[10px]">幅</Label>
                  <Input
                    type="number"
                    value={customRatio.width}
                    onChange={(event) =>
                      setCustomRatio((prev) => ({ ...prev, width: Number(event.target.value) || prev.width }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">高さ</Label>
                  <Input
                    type="number"
                    value={customRatio.height}
                    onChange={(event) =>
                      setCustomRatio((prev) => ({ ...prev, height: Number(event.target.value) || prev.height }))
                    }
                  />
                </div>
                <Button
                  className="col-span-2"
                  variant="outline"
                  onClick={() =>
                    updateComposition((composition) => ({
                      ...composition,
                      aspectRatio: `${customRatio.width}:${customRatio.height}`
                    }))
                  }
                >
                  カスタム比率を適用
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="style" className="rounded-2xl border border-border/50 bg-zinc-950/60">
          <AccordionTrigger className="px-4 py-3 text-sm font-semibold">スタイル</AccordionTrigger>
          <AccordionContent className="space-y-4 px-4 pb-4 text-xs text-muted-foreground">
            <StyleSlider
              label="ガター"
              value={project.composition.style.gap}
              min={0}
              max={72}
              onValueChange={(value) =>
                updateComposition((composition) => ({
                  ...composition,
                  style: { ...composition.style, gap: value }
                }))
              }
            />
            <StyleSlider
              label="パディング"
              value={project.composition.style.padding}
              min={0}
              max={120}
              onValueChange={(value) =>
                updateComposition((composition) => ({
                  ...composition,
                  style: { ...composition.style, padding: value }
                }))
              }
            />
            <StyleSlider
              label="角丸"
              value={project.composition.style.radius}
              min={0}
              max={120}
              onValueChange={(value) =>
                updateComposition((composition) => ({
                  ...composition,
                  style: { ...composition.style, radius: value }
                }))
              }
            />
            <StyleSlider
              label="枠線"
              value={project.composition.style.borderWidth}
              min={0}
              max={12}
              onValueChange={(value) =>
                updateComposition((composition) => ({
                  ...composition,
                  style: { ...composition.style, borderWidth: value }
                }))
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px]">枠線カラー</Label>
                <Input
                  type="color"
                  value={project.composition.style.borderColor}
                  onChange={(event) =>
                    updateComposition((composition) => ({
                      ...composition,
                      style: { ...composition.style, borderColor: event.target.value }
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">不透明度</Label>
                <Slider
                  value={[Math.round(project.composition.style.borderOpacity * 100)]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(values) =>
                    updateComposition((composition) => ({
                      ...composition,
                      style: { ...composition.style, borderOpacity: values[0] / 100 }
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">背景色</Label>
              <Input
                type="color"
                value={project.composition.bgColor}
                onChange={(event) =>
                  updateComposition((composition) => ({
                    ...composition,
                    bgColor: event.target.value
                  }))
                }
              />
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="cell" className="rounded-2xl border border-border/50 bg-zinc-950/60">
          <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
            セル調整 {typeof activeCell === "number" ? `#${activeCell + 1}` : "未選択"}
          </AccordionTrigger>
          <AccordionContent className="space-y-4 px-4 pb-4 text-xs text-muted-foreground">
            {activeTrack && activeAsset ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{activeAsset.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeAsset.type.toUpperCase()} · {activeAsset.width}×{activeAsset.height}
                    {activeAsset.duration ? ` · ${formatDuration(activeAsset.duration)}` : ""}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="sm"
                    variant={activeTrack.fit === "cover" ? "default" : "secondary"}
                    onClick={() => updateTrack(activeTrack.id, (track) => ({ ...track, fit: "cover" }))}
                  >
                    <Blend className="mr-2 h-3 w-3" /> カバー
                  </Button>
                  <Button
                    size="sm"
                    variant={activeTrack.fit === "contain" ? "default" : "secondary"}
                    onClick={() => updateTrack(activeTrack.id, (track) => ({ ...track, fit: "contain" }))}
                  >
                    <BadgePercent className="mr-2 h-3 w-3" /> コンテイン
                  </Button>
                </div>
                <StyleSlider
                  label="スケール"
                  value={Math.round(activeTrack.scale * 100)}
                  min={50}
                  max={200}
                  onValueChange={(value) =>
                    updateTrack(activeTrack.id, (track) => ({ ...track, scale: value / 100 }))
                  }
                />
                <StyleSlider
                  label="パン X"
                  value={activeTrack.panX}
                  min={-200}
                  max={200}
                  onValueChange={(value) => updateTrack(activeTrack.id, (track) => ({ ...track, panX: value }))}
                />
                <StyleSlider
                  label="パン Y"
                  value={activeTrack.panY}
                  min={-200}
                  max={200}
                  onValueChange={(value) => updateTrack(activeTrack.id, (track) => ({ ...track, panY: value }))}
                />
                <StyleSlider
                  label="ゲイン (dB)"
                  value={activeTrack.volume}
                  min={-24}
                  max={12}
                  onValueChange={(value) => updateTrack(activeTrack.id, (track) => ({ ...track, volume: value }))}
                />
                <div className="flex items-center justify-between">
                  <span>ミュート</span>
                  <Switch
                    checked={activeTrack.muted}
                    onCheckedChange={(checked) => updateTrack(activeTrack.id, (track) => ({ ...track, muted: checked }))}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">セルを選択して詳細を調整しよう！</p>
            )}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="audio" className="rounded-2xl border border-border/50 bg-zinc-950/60">
          <AccordionTrigger className="px-4 py-3 text-sm font-semibold">オーディオ</AccordionTrigger>
          <AccordionContent className="space-y-4 px-4 pb-4 text-xs text-muted-foreground">
            <StyleSlider
              label="マスター音量 (dB)"
              value={project.audio.masterGain}
              min={-24}
              max={12}
              onValueChange={(value) =>
                updateAudio((audio) => ({
                  ...audio,
                  masterGain: value
                }))
              }
            />
            <div className="flex items-center justify-between">
              <span>ミュート</span>
              <Switch
                checked={project.audio.muted}
                onCheckedChange={(checked) =>
                  updateAudio((audio) => ({
                    ...audio,
                    muted: checked
                  }))
                }
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              BGM トラックは音量 -6dB で追加されるよ。今後フェード機能も実装予定！
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="render" className="rounded-2xl border border-border/50 bg-zinc-950/60">
          <AccordionTrigger className="px-4 py-3 text-sm font-semibold">書き出し状況</AccordionTrigger>
          <AccordionContent className="space-y-3 px-4 pb-4 text-xs text-muted-foreground">
            {renderJob ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em]">
                  <span className="text-muted-foreground">{renderJob.presetId}</span>
                  <span
                    className={
                      renderJob.status === "succeeded"
                        ? "font-semibold text-emerald-200"
                        : renderJob.status === "failed"
                          ? "font-semibold text-rose-300"
                          : "font-semibold text-indigo-200"
                    }
                  >
                    {renderJob.status}
                  </span>
                </div>
                {(renderJob.status === "processing" || renderJob.status === "queued") && (
                  <Progress value={renderJob.progress} />
                )}
                {renderJob.outputUrl ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={renderJob.outputUrl} download={exportFileName}>
                      {renderJob.downloadLabel ?? "ファイルを保存"}
                    </a>
                  </Button>
                ) : null}
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {renderJob.status === "succeeded"
                    ? `${renderJob.fileExtension === "mp4" ? "MP4" : "PNG"}は上のボタンとトップバーからダウンロードできるよ。`
                    : renderJob.status === "failed"
                      ? "ごめん、書き出しに失敗しちゃった…。アセットの読み込みや HTTPS 設定をチェックしてみてね。"
                      : renderJob.target === "server"
                        ? "サーバーレンダリングは準備中。しばらくしてからまた試してみて！"
                        : "合成中…セル数が多いとちょっぴり時間がかかるよ〜。"}
                </p>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">まだ書き出しはスタンバイ状態だよ。</p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

interface StyleSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
}

function StyleSlider({ label, value, min, max, onValueChange }: StyleSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em]">
        <span>{label}</span>
        <span className="font-mono text-xs text-indigo-200">{value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} onValueChange={(values) => onValueChange(values[0])} />
    </div>
  );
}
