"use client";

import { type ComponentType, ChangeEvent, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useProjectStore, fileToAsset } from "@/lib/store";
import { type Project, Asset, AssetType } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";
import { toast } from "sonner";
import { AudioLines, ImageIcon, Layers, Music4, UploadCloud, VideoIcon } from "lucide-react";

const TAB_DEFS: Array<{ id: AssetType | "all"; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "all", label: "すべて", icon: Layers },
  { id: "video", label: "動画", icon: VideoIcon },
  { id: "image", label: "画像", icon: ImageIcon },
  { id: "logo", label: "ロゴ", icon: ImageIcon },
  { id: "audio", label: "BGM", icon: Music4 }
];

export function AssetsPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const project = useProjectStore((state) => state.project);
  const addAssets = useProjectStore((state) => state.addAssets);
  const assignAssetToCell = useProjectStore((state) => state.assignAssetToCell);
  const activeCell = useProjectStore((state) => state.activeCell);
  const setActiveCell = useProjectStore((state) => state.setActiveCell);
  const [tab, setTab] = useState<AssetType | "all">("all");

  const filteredAssets = useMemo(() => {
    if (tab === "all") return project.assets;
    return project.assets.filter((asset) => asset.type === tab);
  }, [project.assets, tab]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const onFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const tasks = files.map((file) => fileToAsset(file, inferAssetType(file)));
    toast.promise(
      Promise.all(tasks).then((assets) => {
        addAssets(assets);
        autoAssignAssetsToCells(assets);
      }),
      {
        loading: "アセット解析中...",
        success: "アセットをライブラリに追加したよ！",
        error: "読み込みに失敗しちゃった…"
      }
    );
    event.target.value = "";
  };

  const handleAssign = (asset: Asset) => {
    const cellIndex = determineTargetCell(project, activeCell);
    assignAssetToCell(cellIndex, asset.id);
    setActiveCell(cellIndex);
    toast.success(`${asset.name} をセル ${cellIndex + 1} に配置したよ✨`);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="rounded-2xl border border-border/60 bg-zinc-950/70 p-4 shadow-inner shadow-black/40">
        <Label className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          アップロード
        </Label>
        <div className="flex flex-col gap-3">
          <Button variant="secondary" className="gap-2" onClick={handleUploadClick}>
            <UploadCloud className="h-4 w-4" /> ファイルを追加
          </Button>
          <p className="text-xs text-muted-foreground">
            MP4 / MOV / WebM / PNG / JPG / WebP / WAV / MP3 に対応。複数選択 OK だよ。
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept="video/*,image/*,audio/*"
            onChange={onFilesSelected}
          />
        </div>
      </div>
      <Tabs value={tab} onValueChange={(value) => setTab(value as AssetType | "all")}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {TAB_DEFS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              className={cn(
                "flex items-center gap-2 rounded-full border border-transparent px-3 py-1 text-xs",
                tab === id ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-100" : "bg-zinc-900 text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TAB_DEFS.map(({ id }) => (
          <TabsContent key={id} value={id} className="mt-4">
            <ScrollArea className="h-[calc(100vh-260px)] pr-2">
              <div className="flex flex-col gap-3">
                {filteredAssets.length === 0 && (
                  <EmptyState message="まだアセットがないよ。ファイルを投げ込んでみて！" />
                )}
                {filteredAssets.map((asset) => (
                  <AssetItem key={asset.id} asset={asset} onAssign={() => handleAssign(asset)} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function AssetItem({ asset, onAssign }: { asset: Asset; onAssign: () => void }) {
  return (
    <Card className="group flex items-center justify-between rounded-2xl border-border/40 bg-zinc-950/80 p-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground/90">{asset.name}</h4>
        <p className="text-xs text-muted-foreground">
          {asset.type.toUpperCase()} · {formatMeta(asset)}
        </p>
      </div>
      <Button size="sm" variant="outline" className="opacity-80 transition group-hover:opacity-100" onClick={onAssign}>
        セルに配置
      </Button>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/50 bg-zinc-950/50 p-6 text-center text-xs text-muted-foreground">
      <AudioLines className="mx-auto mb-3 h-5 w-5 opacity-60" />
      {message}
    </div>
  );
}

function inferAssetType(file: File): AssetType {
  if (file.type.startsWith("video")) return "video";
  if (file.type.startsWith("audio")) return "audio";
  if (file.name.toLowerCase().includes("logo")) return "logo";
  return "image";
}

function formatMeta(asset: Asset) {
  const bits: string[] = [];
  if (asset.width && asset.height) bits.push(`${asset.width}×${asset.height}`);
  if (asset.duration) bits.push(`${formatDuration(asset.duration)}`);
  if (asset.size) bits.push(`${(asset.size / (1024 * 1024)).toFixed(1)}MB`);
  return bits.join(" · ");
}

function determineTargetCell(project: Project, activeCell?: number) {
  if (typeof activeCell === "number") return activeCell;
  const used = new Set(project.tracks.map((track) => track.cellIndex));
  const firstEmpty = project.composition.grid.cells.findIndex((_, index) => !used.has(index));
  return firstEmpty >= 0 ? firstEmpty : 0;
}

function autoAssignAssetsToCells(assets: Asset[]) {
  const visualAssets = assets.filter((asset) => asset.type === "image" || asset.type === "logo" || asset.type === "video");
  if (visualAssets.length === 0) {
    return;
  }

  const placements: string[] = [];

  visualAssets.forEach((asset) => {
    const state = useProjectStore.getState();
    const cellIndex = determineTargetCell(state.project);
    state.assignAssetToCell(cellIndex, asset.id);
    state.setActiveCell(cellIndex);
    placements.push(`セル ${cellIndex + 1}: ${asset.name}`);
  });

  if (placements.length) {
    toast.success("アップロードした素材を自動配置したよ！", {
      description: placements.join(" / ")
    });
  }
}
