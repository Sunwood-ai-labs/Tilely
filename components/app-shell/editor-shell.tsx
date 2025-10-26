"use client";

import { useEffect, useMemo } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TimelineView } from "@/components/timeline/timeline-view";
import { PropertiesPanel } from "@/components/panels/properties-panel";
import { AssetsPanel } from "@/components/panels/assets-panel";
import { CanvasPreview } from "@/components/canvas/canvas-preview";
import { TopBar } from "@/components/app-shell/top-bar";
import { useProjectStore } from "@/lib/store";

export function EditorShell() {
  const project = useProjectStore((state) => state.project);
  const renderJob = useProjectStore((state) => state.renderJob);
  const updateRenderProgress = useProjectStore((state) => state.updateRenderProgress);

  const canvasKey = useMemo(
    () => `${project.composition.id}-${project.composition.grid.rows}x${project.composition.grid.cols}`,
    [project.composition.id, project.composition.grid.rows, project.composition.grid.cols]
  );

  useEffect(() => {
    if (!renderJob || (renderJob.status !== "queued" && renderJob.status !== "processing")) {
      return;
    }
    let progress = renderJob.progress;
    let frame = 0;
    updateRenderProgress(progress, "processing");
    const interval = window.setInterval(() => {
      frame += 1;
      progress = Math.min(100, progress + 12);
      if (progress >= 100) {
        const blob = new Blob(["Tilely export placeholder"], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        updateRenderProgress(100, "succeeded", url);
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        window.clearInterval(interval);
      } else {
        updateRenderProgress(progress, "processing");
      }
      if (frame > 20) {
        window.clearInterval(interval);
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [renderJob, updateRenderProgress]);

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={60}>
      <div className="flex h-screen w-full flex-col overflow-hidden">
        <TopBar />
        <div className="grid flex-1 grid-cols-[320px_1fr_340px] gap-0 overflow-hidden">
          <aside className="border-r border-border/50 bg-zinc-950/60 backdrop-blur-xl">
            <AssetsPanel />
          </aside>
          <main className="flex flex-col overflow-hidden">
            <div className="flex flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
              <CanvasPreview key={canvasKey} />
              <TimelineView />
            </div>
          </main>
          <aside className={cn("border-l border-border/50 bg-zinc-950/60 backdrop-blur-xl")}> 
            <PropertiesPanel />
          </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}
