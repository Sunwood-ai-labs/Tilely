"use client";

import { Download, Play, Redo2, Save, Undo2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useProjectStore } from "@/lib/store";
import { useHotkeys } from "@/lib/use-hotkeys";
import { toast } from "sonner";
import { useCallback, useEffect } from "react";
import { getExportFileName } from "@/lib/utils";

export function TopBar() {
  const project = useProjectStore((state) => state.project);
  const setProjectTitle = useProjectStore((state) => state.setProjectTitle);
  const queueRender = useProjectStore((state) => state.queueRender);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const saveAsFile = useProjectStore((state) => state.saveAsFile);
  const resetProject = useProjectStore((state) => state.resetProject);
  const ensureUniqueTitle = useProjectStore((state) => state.ensureUniqueTitle);

  useEffect(() => {
    ensureUniqueTitle();
  }, [ensureUniqueTitle]);

  const handleExport = useCallback(
    async (presetId: string) => {
      try {
        await queueRender(presetId, "browser");
        const state = useProjectStore.getState();
        const job = state.renderJob;
        if (!job) {
          throw new Error("render job missing after export");
        }

        const extension = job.fileExtension ?? "bin";
        const artifactLabel = job.fileExtension === "mp4" ? "MP4" : job.fileExtension === "png" ? "PNG" : "ファイル";

        if (job.status === "succeeded" && job.outputUrl) {
          if (window.isSecureContext) {
            const anchor = document.createElement("a");
            anchor.href = job.outputUrl;
            anchor.download = getExportFileName(state.project.title, extension);
            anchor.rel = "noopener";
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
          } else {
            toast.info(`${artifactLabel}は手動で保存してね。右パネルのリンクからアクセスできるよ✨`);
          }
          toast.success(`${artifactLabel}の準備ができたよ！右のプロパティ→書き出し状況からも保存できるから安心してね💾💕`);
        } else {
          toast.error("書き出しが完了しなかったみたい…もう一度トライしよ💦");
        }
      } catch (error) {
        console.error("[Tilely] export failed", error);
        toast.error("書き出しでコケちゃった…アセットの読み込みを確認してもう一回トライしよ💦");
      }
    },
    [queueRender]
  );

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
            <DropdownMenuItem
              onSelect={() => {
                void handleExport("still-png");
              }}
            >
              PNG 書き出し（ブラウザ合成）
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void handleExport("video-mp4");
              }}
            >
              MP4 レンダリング（ブラウザ合成）
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
