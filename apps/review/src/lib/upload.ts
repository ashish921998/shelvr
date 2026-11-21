export function putFile(
  url: string,
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
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
