export type ProbeVideoMetadata = {
  fps?: number;
  duration?: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  bitrate?: number;
  audioBitrate?: number;
};

const FRACTION_PATTERN = /^(\d+)\/(\d+)$/;

const parseFrameRate = (value?: string | number | null): number | undefined => {
  if (value === null || typeof value === "undefined") {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const fractionMatch = value.match(FRACTION_PATTERN);
  if (fractionMatch) {
    const numerator = Number.parseFloat(fractionMatch[1]);
    const denominator = Number.parseFloat(fractionMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      const result = numerator / denominator;
      return Number.isFinite(result) && result > 0 ? result : undefined;
    }
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const parseNumeric = (value?: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.length) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export async function probeVideoMetadata(filePath: string): Promise<ProbeVideoMetadata> {
  const { spawn } = await import(/* webpackIgnore: true */ "node:child_process");
  return new Promise<ProbeVideoMetadata>((resolve, reject) => {
    const args = ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", filePath];
    const ffprobe = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    ffprobe.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    ffprobe.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffprobe.on("error", (error) => {
      reject(error);
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        const payload = JSON.parse(stdout) as {
          streams?: Array<Record<string, unknown>>;
          format?: Record<string, unknown>;
        };
        const streams = Array.isArray(payload.streams) ? payload.streams : [];
        const videoStream = streams.find((stream) => stream.codec_type === "video") ?? {};
        const audioStream = streams.find((stream) => stream.codec_type === "audio");
        const format = payload.format ?? {};

        const videoRecord = videoStream as Record<string, unknown>;
        const audioRecord = audioStream as Record<string, unknown> | undefined;

        const scalar = (value: unknown): string | number | undefined => {
          if (typeof value === "string" || typeof value === "number") {
            return value;
          }
          return undefined;
        };

        const fps = parseFrameRate(scalar(videoRecord.avg_frame_rate) ?? scalar(videoRecord.r_frame_rate));
        const duration =
          parseNumeric(scalar(videoRecord.duration)) ??
          parseNumeric(scalar(format.duration)) ??
          parseNumeric(scalar(audioRecord?.duration));
        const width = parseNumeric(scalar(videoRecord.width));
        const height = parseNumeric(scalar(videoRecord.height));
        const bitrate = parseNumeric(scalar(videoRecord.bit_rate)) ?? parseNumeric(scalar(format.bit_rate));
        const audioBitrate = parseNumeric(scalar(audioRecord?.bit_rate));

        resolve({
          fps,
          duration,
          width,
          height,
          hasAudio: Boolean(audioStream),
          bitrate,
          audioBitrate
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}
