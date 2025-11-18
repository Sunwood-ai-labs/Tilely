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
import { parseAspectRatio } from "@/lib/canvas-utils";
import { layoutPresets, aspectRatioPresets } from "@/lib/presets";
import { useProjectStore } from "@/lib/store";
import { clamp, formatDuration, getExportFileName } from "@/lib/utils";
import { BadgePercent, Blend, Grid3X3 } from "lucide-react";

const RESOLUTION_PRESETS = [
  { value: 1280, label: "1280px · HD 720p" },
  { value: 1920, label: "1920px · Full HD 1080p" },
  { value: 2048, label: "2048px · Default" },
  { value: 2560, label: "2560px · QHD 1440p" },
  { value: 3840, label: "3840px · 4K UHD" }
] as const;

const FPS_PRESETS = [
  { value: 24, label: "24 fps · Cinema" },
  { value: 25, label: "25 fps · PAL" },
  { value: 30, label: "30 fps · NTSC" },
  { value: 50, label: "50 fps" },
  { value: 60, label: "60 fps" }
] as const;

export function PropertiesPanel() {
  const project = useProjectStore((state) => state.project);
  const updateComposition = useProjectStore((state) => state.updateComposition);
  const applyLayoutPreset = useProjectStore((state) => state.applyLayoutPreset);
  const updateTrack = useProjectStore((state) => state.updateTrack);
  const updateAudio = useProjectStore((state) => state.updateAudio);
  const exportSettings = useProjectStore((state) => state.exportSettings);
  const updateExportSettings = useProjectStore((state) => state.updateExportSettings);
  const updateAssetMetadata = useProjectStore((state) => state.updateAssetMetadata);
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

  type NumericExportSettingKey = Exclude<keyof typeof exportSettings, "aspectRatio">;

  const rawAspectSetting = exportSettings.aspectRatio;
  const exportAspectSelection =
    typeof rawAspectSetting === "string" && rawAspectSetting.trim().length > 0 ? rawAspectSetting.trim() : "project";

  const handleExportSettingChange = (key: NumericExportSettingKey, value: number) => {
    updateExportSettings((current) => ({
      ...current,
      [key]:
        key === "maxDimension"
          ? clamp(Math.round(value) || current.maxDimension, 256, 8192)
          : value
    }));
  };

  const handleExportAspectChange = (value: string) => {
    updateExportSettings((current) => ({
      ...current,
      aspectRatio: value
    }));
  };

  const targetAspectRatio = exportAspectSelection === "project"
    ? project.composition.aspectRatio
    : exportAspectSelection;

  const { width: exportRatioWidthRaw, height: exportRatioHeightRaw } = parseAspectRatio(targetAspectRatio);
  const exportRatioWidth = Math.max(1, exportRatioWidthRaw);
  const exportRatioHeight = Math.max(1, exportRatioHeightRaw);
  const ratioMax = Math.max(exportRatioWidth, exportRatioHeight);
  const maxDimension = clamp(Math.round(exportSettings.maxDimension) || 2048, 256, 8192);
  const scaledWidth = Math.round((exportRatioWidth / ratioMax) * maxDimension);
  const scaledHeight = Math.round((exportRatioHeight / ratioMax) * maxDimension);
  const formattedWidth = scaledWidth.toLocaleString();
  const formattedHeight = scaledHeight.toLocaleString();
  const formattedMaxDimension = maxDimension.toLocaleString();
  const hasCustomResolution = !RESOLUTION_PRESETS.some((preset) => preset.value === maxDimension);

  const exportAspectOptions = useMemo(
    () => [
      { id: "project", label: "プロジェクトと同じ" },
      ...aspectRatioPresets.filter((preset) => preset.id !== "custom")
    ],
    []
  );

  const displayAspectLabel = exportAspectSelection === "project"
    ? `${project.composition.aspectRatio} · プロジェクト比率`
    : exportAspectSelection;

  const fpsPreset = FPS_PRESETS.some((preset) => preset.value === exportSettings.fps)
    ? String(exportSettings.fps)
    : "custom";

  const handleFpsPresetChange = (value: string) => {
    if (value === "custom") return;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      handleExportSettingChange("fps", parsed);
    }
  };

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
                <div className="space-y-2 rounded border border-border/50 bg-zinc-950/80 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    メタデータ / タグ
                  </p>
                  <div className="space-y-2">
                    <Label className="text-[10px]">AI ツール</Label>
                    <Input
                      type="text"
                      placeholder="例: DALL-E 3, Midjourney"
                      value={activeAsset.metadata?.aiTool ?? ""}
                      onChange={(event) =>
                        updateAssetMetadata(activeAsset.id, {
                          ...activeAsset.metadata,
                          aiTool: event.target.value
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px]">プロンプト形式</Label>
                    <Select
                      value={activeAsset.metadata?.promptFormat ?? ""}
                      onValueChange={(value) =>
                        updateAssetMetadata(activeAsset.id, {
                          ...activeAsset.metadata,
                          promptFormat: value
                        })
                      }
                    >
                      <SelectTrigger>
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
                      value={activeAsset.metadata?.prompt ?? ""}
                      onChange={(event) =>
                        updateAssetMetadata(activeAsset.id, {
                          ...activeAsset.metadata,
                          prompt: event.target.value
                        })
                      }
                    />
                  </div>
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
        <AccordionItem value="export-settings" className="rounded-2xl border border-border/50 bg-zinc-950/60">
          <AccordionTrigger className="px-4 py-3 text-sm font-semibold">書き出し設定</AccordionTrigger>
          <AccordionContent className="space-y-4 px-4 pb-4 text-xs text-muted-foreground">
            <div className="space-y-2">
              <Label htmlFor="export-resolution">解像度 (長辺)</Label>
              <Select
                value={String(maxDimension)}
                onValueChange={(value) => handleExportSettingChange("maxDimension", Number(value))}
              >
                <SelectTrigger id="export-resolution">
                  <SelectValue placeholder="解像度を選択" />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTION_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={String(preset.value)}>
                      {preset.label}
                    </SelectItem>
                  ))}
                  {hasCustomResolution ? (
                    <SelectItem value={String(maxDimension)}>{formattedMaxDimension}px · Custom</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-aspect">書き出しアスペクト</Label>
              <Select value={exportAspectSelection} onValueChange={handleExportAspectChange}>
                <SelectTrigger id="export-aspect">
                  <SelectValue placeholder="アスペクトを選択" />
                </SelectTrigger>
                <SelectContent>
                  {exportAspectOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                現在の出力比率 {displayAspectLabel} ／ 実出力 {formattedWidth}×{formattedHeight}px だよ〜
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-fps">フレームレート</Label>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em]">
                <span className="font-mono text-xs text-indigo-200">{exportSettings.fps} fps</span>
                <Select value={fpsPreset} onValueChange={handleFpsPresetChange}>
                  <SelectTrigger id="export-fps" className="h-8 w-36 text-xs">
                    <SelectValue placeholder="プリセットを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {FPS_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={String(preset.value)}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    {fpsPreset === "custom" ? <SelectItem value="custom">Custom</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>
              <Slider
                value={[exportSettings.fps]}
                min={10}
                max={60}
                step={1}
                onValueChange={(values) => handleExportSettingChange("fps", values[0])}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-duration">尺 (秒)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="export-duration"
                  type="number"
                  min={1}
                  max={120}
                  value={exportSettings.durationSeconds}
                  onChange={(event) =>
                    handleExportSettingChange("durationSeconds", clamp(Number(event.target.value) || 0, 1, 600))
                  }
                />
                <span className="text-[10px] text-muted-foreground">秒</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-video-bitrate">動画ビットレート</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="export-video-bitrate"
                  type="number"
                  min={5}
                  max={200}
                  value={exportSettings.videoBitrateMbps}
                  onChange={(event) =>
                    handleExportSettingChange("videoBitrateMbps", clamp(Number(event.target.value) || 0, 5, 500))
                  }
                />
                <span className="text-[10px] text-muted-foreground">Mbps</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                4K タイルは 20Mbps 以上が推し。値を上げるほど容量もアップするよ。
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-audio-bitrate">音声ビットレート</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="export-audio-bitrate"
                  type="number"
                  min={64}
                  max={320}
                  step={16}
                  value={exportSettings.audioBitrateKbps}
                  onChange={(event) =>
                    handleExportSettingChange("audioBitrateKbps", clamp(Number(event.target.value) || 0, 32, 512))
                  }
                />
                <span className="text-[10px] text-muted-foreground">kbps</span>
              </div>
            </div>
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
                    ? `${(renderJob.fileExtension ?? "file").toUpperCase()}は上のボタンとトップバーからダウンロードできるよ。`
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
