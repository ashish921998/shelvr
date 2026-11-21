export function putFile(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`Upload failed (${request.status})`));
      }
    };
    request.onerror = () =>
      reject(new Error("Upload failed, check your connection"));
    request.send(file);
  });
}

export type VideoInfo = { duration?: number; width?: number; height?: number };

export function readVideoInfo(file: Blob): Promise<VideoInfo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (info: VideoInfo) => {
      URL.revokeObjectURL(url);
      resolve(info);
    };
    const timer = window.setTimeout(() => done({}), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done({
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
      });
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      done({});
    };
    video.src = url;
  });
}

export function videoContentType(file: Blob & { name?: string }): string {
  if (file.type) return file.type;
  const name = file.name?.toLowerCase() ?? "";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".webm")) return "video/webm";
  return "video/mp4";
}
