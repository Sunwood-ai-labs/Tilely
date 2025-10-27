import type { Asset } from "./types";

export type LoadedImage = {
  element: HTMLImageElement;
  width: number;
  height: number;
};

export type LoadedVideo = {
  element: HTMLVideoElement;
  width: number;
  height: number;
  duration: number;
};

export const loadImageAsset = (asset: Asset): Promise<LoadedImage> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      resolve({
        element: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height
      });
    };
    image.onerror = (error) => reject(error);
    image.src = asset.url;
  });

export const loadVideoAsset = (asset: Asset): Promise<LoadedVideo> =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";

    const handleLoadedData = () => {
      cleanup();
      resolve({
        element: video,
        width: video.videoWidth || asset.width || 0,
        height: video.videoHeight || asset.height || 0,
        duration: Number.isFinite(video.duration) ? video.duration : asset.duration ?? 0
      });
    };

    const handleError = (event: Event | string) => {
      cleanup();
      reject(typeof event === "string" ? new Error(event) : event);
    };

    const cleanup = () => {
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("loadeddata", handleLoadedData, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.src = asset.url;
    video.load();
  });
