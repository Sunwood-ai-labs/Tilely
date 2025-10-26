"use client";

import { Download, Play, Redo2, Save, Undo2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useProjectStore } from "@/lib/store";
import { exportPresets } from "@/lib/presets";
import { useHotkeys } from "@/lib/use-hotkeys";
import { toast } from "sonner";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input as NumberInput } from "@/components/ui/input";

export function TopBar() {
  const [customExportOpen, setCustomExportOpen] = useState(false);
  const project = useProjectStore((state) => state.project);
  const setProjectTitle = useProjectStore((state) => state.setProjectTitle);
  const queueRender = useProjectStore((state) => state.queueRender);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const saveAsFile = useProjectStore((state) => state.saveAsFile);
  const resetProject = useProjectStore((state) => state.resetProject);

  const [customResolution, setCustomResolution] = useState(1080);
  const [customFps, setCustomFps] = useState(30);

  useHotkeys({
    "mod+z": undo,
    "mod+shift+z": redo,
    "space": () => toast.info("プレビューはデモ版だから静止画だよ✨")
  });

  return (
    <header className="flex items-center justify-between border-b border-border/60 bg-zinc-950/80 px-6 py-4 shadow-lg shadow-black/40 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200">
          Tilely
        </span>
        <Input
          value={project.title}
          onChange={(event) => setProjectTitle(event.target.value)}
          className="w-64 border-border/60 bg-zinc-950/70"
          placeholder="プロジェクト名"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={undo} title="Undo (⌘/Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={redo} title="Redo (⌘/Ctrl+Shift+Z)">
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => toast.info("同時再生は実機で体験してね🥺✨")}
          title="再生 / 一時停止 (Space)">
          <Play className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={saveAsFile} title="ローカル保存">
          <Save className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={resetProject} title="新規プロジェクト">
          <UploadCloud className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-2">
              <Download className="h-4 w-4" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onClick={() => handleExportPreset("browser", queueRender)}>
              ブラウザ即時レンダリング
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportPreset("server", queueRender)}>
              サーバレンダリング
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCustomExportOpen(true)}>
              カスタムプリセット...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={customExportOpen} onOpenChange={setCustomExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>カスタム書き出し</DialogTitle>
            <DialogDescription>解像度とフレームレートを好みでセットしてね。</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>解像度 (px)</Label>
              <NumberInput
                type="number"
                value={customResolution}
                onChange={(event) => setCustomResolution(Number(event.target.value) || 1080)}
              />
            </div>
            <div className="space-y-2">
              <Label>FPS</Label>
              <NumberInput
                type="number"
                value={customFps}
                onChange={(event) => setCustomFps(Number(event.target.value) || 30)}
              />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() => {
              queueRender("custom", customResolution * customFps > 40000 ? "server" : "browser");
              toast.success(
                `カスタム設定で書き出しキュー投入したよ！ ${customResolution}p / ${customFps}fps`
              );
              setCustomExportOpen(false);
            }}
          >
            書き出し開始
          </Button>
        </DialogContent>
      </Dialog>
    </header>
  );
}

function handleExportPreset(
  target: "browser" | "server",
  queueRender: (presetId: string, target: "browser" | "server") => void
) {
  const preset = exportPresets[target === "browser" ? 0 : 1];
  queueRender(preset.id, target);
  toast.success(`${preset.label} でレンダリング開始したよ〜！`);
}
