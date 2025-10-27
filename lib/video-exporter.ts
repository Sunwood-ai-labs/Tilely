import { exportProjectToImage } from "./exporter";
import type { Project } from "./types";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

type ExportOptions = {
  durationSeconds?: number;
  fps?: number;
};

const DEFAULT_OPTIONS: Required<ExportOptions> = {
  durationSeconds: 3,
  fps: 30
};

const CORE_VERSION = "0.12.6";
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
const CORE_MT_BASE_URL = `https://unpkg.com/@ffmpeg/core-mt@${CORE_VERSION}/dist/umd`;

let ffmpegInstance: FFmpeg | null = null;

async function ensureFfmpeg() {
  if (ffmpegInstance) {
    console.log("[video-exporter] Reusing FFmpeg instance");
    return ffmpegInstance;
  }

  console.log("[video-exporter] Creating FFmpeg instance");
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const instance = new FFmpeg();
  await instance.load({
    coreURL: `${CORE_BASE_URL}/ffmpeg-core.js`,
    wasmURL: `${CORE_BASE_URL}/ffmpeg-core.wasm`,
    workerURL: `${CORE_MT_BASE_URL}/ffmpeg-core.worker.js`
  });
  console.log("[video-exporter] FFmpeg core loaded");
  ffmpegInstance = instance;
  return instance;
}

export async function exportProjectToMp4(project: Project, options: ExportOptions = {}): Promise<Blob> {
  const { durationSeconds, fps } = { ...DEFAULT_OPTIONS, ...options };
  console.log("[video-exporter] exportProjectToMp4 started", { durationSeconds, fps });

  const imageBlob = await exportProjectToImage(project);
  console.log("[video-exporter] Base image exported");
  const arrayBuffer = await imageBlob.arrayBuffer();
  const frameData = new Uint8Array(arrayBuffer);

  const ffmpeg = await ensureFfmpeg();

  // Provide unique filenames to avoid conflicts between concurrent exports.
  const frameFile = `frame-${Date.now()}.png`;
  const outputFile = `output-${Date.now()}.mp4`;
  const deleteIfExists = async (file: string) => {
    try {
      await ffmpeg.deleteFile(file);
    } catch {
      // noop
    }
  };

  try {
    await deleteIfExists(frameFile);
    await deleteIfExists(outputFile);
    console.log("[video-exporter] Temporary files cleared");
    await ffmpeg.writeFile(frameFile, frameData);
    console.log("[video-exporter] Frame written to FFmpeg FS");

    console.log("[video-exporter] Running FFmpeg command");
    await ffmpeg.exec([
      "-y",
      "-loop",
      "1",
      "-framerate",
      String(fps),
      "-i",
      frameFile,
      "-c:v",
      "mpeg4",
      "-t",
      String(durationSeconds),
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "faststart",
      outputFile,
    ]);
    console.log("[video-exporter] FFmpeg command finished");

    const data = await ffmpeg.readFile(outputFile);
    console.log("[video-exporter] Output file read from FFmpeg FS");
    const binary = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    console.log("[video-exporter] Video blob ready");
    return new Blob([binary], { type: "video/mp4" });
  } finally {
    console.log("[video-exporter] Cleaning temp files");
    await deleteIfExists(frameFile);
    await deleteIfExists(outputFile);
  }
}
