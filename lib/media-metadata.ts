const MIN_FPS = 1;
const MAX_FPS = 60;
const MIN_AUDIO_BITRATE_KBPS = 8;
const MAX_AUDIO_BITRATE_KBPS = 512;

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const isFinitePositive = (value: unknown): value is number => isFiniteNumber(value) && value > 0;

const resetPlayback = (media: HTMLMediaElement) => {
  try {
    if (!media.paused) {
      media.pause();
    }
  } catch {
    // ignore pause errors
  }

  try {
    media.currentTime = 0;
  } catch {
    // ignore seek errors
  }
};

const maybePlay = async (media: HTMLMediaElement) => {
  try {
    const result = media.play?.();
    if (result && typeof result.then === "function") {
      await result;
    }
  } catch {
    // Auto-play may fail; ignore and continue with best-effort detection.
  }
};

const stopTracks = (stream?: MediaStream) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // ignore
    }
  });
};

export const sanitizeFrameRate = (value?: number | null): number | undefined => {
  if (!isFinitePositive(value)) {
    return undefined;
  }
  return Math.min(MAX_FPS, Math.max(MIN_FPS, value));
};

const normalizeFrameRate = (value?: number | null): number | undefined =>
  sanitizeFrameRate(value ?? undefined);

const detectViaCaptureStream = async (video: HTMLVideoElement): Promise<number | undefined> => {
  const videoWithCapture = video as HTMLVideoElement & { captureStream?: () => MediaStream };

  if (typeof videoWithCapture.captureStream !== "function") {
    return undefined;
  }

  let stream: MediaStream | undefined;
  try {
    await maybePlay(video);
    stream = videoWithCapture.captureStream();
    const [track] = stream.getVideoTracks();
    const settings = track?.getSettings?.();
    const frameRate = normalizeFrameRate(settings?.frameRate);
    return frameRate;
  } catch {
    return undefined;
  } finally {
    stopTracks(stream);
    resetPlayback(video);
  }
};

const detectViaFrameCallback = async (video: HTMLVideoElement): Promise<number | undefined> => {
  if (typeof video.requestVideoFrameCallback !== "function") {
    return undefined;
  }

  return new Promise<number | undefined>(async (resolve) => {
    let cancelled = false;
    let lastTime: number | undefined;
    let handle = 0;

    const cleanup = () => {
      cancelled = true;
      if (typeof video.cancelVideoFrameCallback === "function" && handle) {
        try {
          video.cancelVideoFrameCallback(handle);
        } catch {
          // ignore
        }
      }
      resetPlayback(video);
    };

    const scheduleNext = () => {
      if (cancelled) return;
      handle = video.requestVideoFrameCallback(step);
    };

    const step = (_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
      if (cancelled) {
        return;
      }

      const mediaTime = isFiniteNumber(metadata.mediaTime) ? metadata.mediaTime : video.currentTime;

      if (isFiniteNumber(mediaTime) && isFiniteNumber(lastTime)) {
        const delta = mediaTime - (lastTime ?? 0);
        if (delta > 0.0005) {
          cleanup();
          resolve(normalizeFrameRate(1 / delta));
          return;
        }
      }

      lastTime = mediaTime;
      scheduleNext();
    };

    const safeResolve = (value: number | undefined) => {
      window.clearTimeout(timeout);
      cleanup();
      resolve(value);
    };

    const timeout = window.setTimeout(() => {
      safeResolve(undefined);
    }, 1000);

    try {
      scheduleNext();
      await maybePlay(video);
    } catch {
      safeResolve(undefined);
      return;
    }
  });
};

export const detectFrameRate = async (video: HTMLVideoElement): Promise<number | undefined> => {
  if (typeof window === "undefined") {
    return undefined;
  }

  const captureRate = await detectViaCaptureStream(video);
  if (captureRate) {
    return captureRate;
  }

  const callbackRate = await detectViaFrameCallback(video);
  if (callbackRate) {
    return callbackRate;
  }

  return undefined;
};

export const sanitizeAudioBitrateKbps = (value?: number | null): number | undefined => {
  if (!isFinitePositive(value)) {
    return undefined;
  }
  return Math.round(Math.min(MAX_AUDIO_BITRATE_KBPS, Math.max(MIN_AUDIO_BITRATE_KBPS, value)));
};

export const detectAudioBitrateKbps = async (media: HTMLMediaElement): Promise<number | undefined> => {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return undefined;
  }

  const mediaWithCapture = media as HTMLMediaElement & { captureStream?: () => MediaStream };

  if (typeof mediaWithCapture.captureStream !== "function") {
    return undefined;
  }

  let sourceStream: MediaStream | undefined;
  let audioStream: MediaStream | undefined;

  const cleanup = () => {
    stopTracks(audioStream);
    stopTracks(sourceStream);
    resetPlayback(media);
  };

  try {
    await maybePlay(media);
  } catch {
    cleanup();
    return undefined;
  }

  try {
    sourceStream = mediaWithCapture.captureStream();
  } catch {
    cleanup();
    return undefined;
  }

  const audioTracks = sourceStream.getAudioTracks();
  if (!audioTracks.length) {
    cleanup();
    return undefined;
  }

  audioStream = new MediaStream(audioTracks);

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(audioStream);
  } catch {
    cleanup();
    return undefined;
  }

  const measuredKbps = await new Promise<number | undefined>((resolve) => {
    const chunks: BlobPart[] = [];
    const startedAt = performance.now();
    let resolved = false;

    const finish = (value?: number) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(value);
    };

    recorder.ondataavailable = (event) => {
      if (event.data?.size) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = () => {
      finish(undefined);
    };
    recorder.onstop = () => {
      const elapsedSeconds = Math.max(0.001, (performance.now() - startedAt) / 1000);
      const blob = new Blob(chunks);
      const totalBits = blob.size * 8;
      const kbps = totalBits / 1000 / elapsedSeconds;
      finish(sanitizeAudioBitrateKbps(kbps));
    };

    try {
      recorder.start(250);
    } catch {
      finish(undefined);
      return;
    }

    window.setTimeout(() => {
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          finish(undefined);
        }
      }
    }, 1000);
  });

  cleanup();
  return measuredKbps;
};
