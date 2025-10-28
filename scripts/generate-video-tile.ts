import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { probeVideoMetadata } from "../lib/server/ffprobe";
import { exportProjectToMp4 } from "../lib/video-exporter";
import type { Asset, Project, Track } from "../lib/types";

const DEFAULT_OUTPUT_FILENAME = "tiled-output.mp4";

type CliOptions = {
  aspect?: string;
  maxDimension?: number;
  output?: string;
};

const parseCliOptions = (): CliOptions => {
  const options: CliOptions = {};
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const entry = args[index];
    if (!entry.startsWith("--")) {
      continue;
    }
    const [flag, inlineValue] = entry.split("=", 2);
    let value = inlineValue;
    if (typeof value === "undefined") {
      const next = args[index + 1];
      if (next && !next.startsWith("--")) {
        value = next;
        index += 1;
      }
    }
    switch (flag) {
      case "--aspect": {
        if (value) {
          options.aspect = value;
        }
        break;
      }
      case "--max-dimension": {
        if (value) {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            options.maxDimension = parsed;
          }
        }
        break;
      }
      case "--output": {
        if (value) {
          options.output = value;
        }
        break;
      }
      default:
        break;
    }
  }
  return options;
};

type InputClip = {
  fileName: string;
  absolutePath: string;
  size: number;
  metadata: Awaited<ReturnType<typeof probeVideoMetadata>>;
};

const notEmpty = <T>(value: T | null | undefined): value is T => value !== null && typeof value !== "undefined";

const pickFirstPositive = (...values: Array<number | null | undefined>): number | undefined => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
};

const ensureEven = (value: number) => Math.max(2, Math.round(value / 2) * 2);

const isAspectRatio = (value: string) => /^\d+:\d+$/.test(value);

async function readInputClips(exampleDir: string, excludedFilenames: string[]): Promise<InputClip[]> {
  const entries = await fs.readdir(exampleDir);
  const excluded = new Set(excludedFilenames.map((name) => name.toLowerCase()));
  const mp4Files = entries
    .filter((entry) => entry.endsWith(".mp4"))
    .filter((entry) => {
      const lower = entry.toLowerCase();
      return !excluded.has(entry) && !excluded.has(lower) && !lower.startsWith("tiled-output");
    })
    .sort();
  if (!mp4Files.length) {
    throw new Error(`No MP4 files found in ${exampleDir}`);
  }

  const clips: InputClip[] = [];
  for (const fileName of mp4Files) {
    const absolutePath = path.join(exampleDir, fileName);
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      continue;
    }
    const metadata = await probeVideoMetadata(absolutePath);
    clips.push({ fileName, absolutePath, size: stats.size, metadata });
  }

  return clips;
}

const toKbps = (value?: number) => (typeof value === "number" && Number.isFinite(value) ? value / 1_000 : undefined);

const createProject = (clips: InputClip[], defaultDurationSeconds: number, aspectOverride?: string): Project => {
  const now = Date.now();
  const cols = Math.ceil(Math.sqrt(clips.length));
  const rows = Math.ceil(clips.length / cols);

  const baseAspect = rows === cols ? "1:1" : `${cols}:${rows}`;
  const normalizedAspect = aspectOverride?.trim();
  const aspectRatio = normalizedAspect && isAspectRatio(normalizedAspect) ? normalizedAspect : baseAspect;

  const cells = Array.from({ length: rows * cols }, (_, index) => ({
    id: randomUUID(),
    row: Math.floor(index / cols),
    col: index % cols
  }));

  const assets: Asset[] = clips.map((clip) => ({
    id: randomUUID(),
    name: clip.fileName,
    type: "video",
    url: clip.absolutePath,
    size: clip.size,
    width: clip.metadata.width ? ensureEven(Math.round(clip.metadata.width)) : undefined,
    height: clip.metadata.height ? ensureEven(Math.round(clip.metadata.height)) : undefined,
    duration: clip.metadata.duration,
    fps: clip.metadata.fps,
    audioBitrateKbps: toKbps(clip.metadata.audioBitrate),
    createdAt: now
  }));

  const tracks: Track[] = clips.map((clip, index) => {
    const asset = assets[index];
    const clipDuration = pickFirstPositive(clip.metadata.duration, defaultDurationSeconds) ?? defaultDurationSeconds;
    return {
      id: randomUUID(),
      assetId: asset.id,
      cellIndex: index,
      in: 0,
      out: clipDuration,
      duration: clipDuration,
      volume: 1,
      muted: false,
      fit: "cover",
      panX: 0,
      panY: 0,
      scale: 1
    } satisfies Track;
  });

  return {
    id: randomUUID(),
    title: "Tile Export Test",
    assets,
    composition: {
      id: randomUUID(),
      title: "CLI Composition",
      aspectRatio,
      grid: {
        rows,
        cols,
        cells
      },
      style: {
        gap: 24,
        padding: 48,
        radius: 32,
        borderWidth: 4,
        borderColor: "#ffffff",
        borderOpacity: 0.25,
        backgroundColor: "#101013"
      },
      bgColor: "#050505"
    },
    tracks,
    audio: {
      masterGain: 1,
      muted: false
    },
    createdAt: now,
    updatedAt: now,
    version: "cli-test"
  };
};

const summarizeValues = (label: string, values: Array<number | undefined>) => {
  const filtered = values.filter(notEmpty);
  if (!filtered.length) {
    return `${label}: (unknown)`;
  }
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  return min === max ? `${label}: ${min.toFixed(3)}` : `${label}: ${min.toFixed(3)} – ${max.toFixed(3)}`;
};

async function main() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(currentDir, "..");
  const exampleDir = path.join(projectRoot, "example");
  const cliOptions = parseCliOptions();
  const outputFilename = cliOptions.output ?? DEFAULT_OUTPUT_FILENAME;
  const outputPath = path.join(exampleDir, outputFilename);

  const clips = await readInputClips(exampleDir, [outputFilename, DEFAULT_OUTPUT_FILENAME]);

  const fpsCandidate = pickFirstPositive(
    ...clips.map((clip) => clip.metadata.fps)
  ) ?? 30;
  const durationCandidate = pickFirstPositive(
    ...clips.map((clip) => clip.metadata.duration)
  ) ?? 5;

  console.log(`Loaded ${clips.length} source clips from ${exampleDir}`);
  console.log(summarizeValues("Input FPS", clips.map((clip) => clip.metadata.fps)));
  console.log(summarizeValues("Input duration", clips.map((clip) => clip.metadata.duration)));

  const project = createProject(clips, durationCandidate, cliOptions.aspect);

  const exportResult = await exportProjectToMp4(project, {
    fps: fpsCandidate,
    durationSeconds: durationCandidate,
    maxDimension: cliOptions.maxDimension ?? 1080
  });

  const arrayBuffer = await exportResult.blob.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(arrayBuffer));

  const outputMetadata = await probeVideoMetadata(outputPath);

  console.log("Generated tiled video:\n", outputPath);
  console.log(`Output FPS: ${outputMetadata.fps?.toFixed(3) ?? "unknown"}`);
  console.log(`Output duration: ${outputMetadata.duration?.toFixed(3) ?? "unknown"}`);

  const tolerance = 0.05;
  const fpsDelta = Math.abs((outputMetadata.fps ?? fpsCandidate) - fpsCandidate);
  const durationDelta = Math.abs((outputMetadata.duration ?? durationCandidate) - durationCandidate);
  if (fpsDelta > tolerance || durationDelta > tolerance) {
    console.warn("Warning: output timing deviates beyond tolerance", {
      expectedFps: fpsCandidate,
      actualFps: outputMetadata.fps,
      expectedDuration: durationCandidate,
      actualDuration: outputMetadata.duration
    });
  } else {
    console.log("Timing check passed ✨");
  }
}

main().catch((error) => {
  console.error("Failed to generate tiled video", error);
  process.exitCode = 1;
});
