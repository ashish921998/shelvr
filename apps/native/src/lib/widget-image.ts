import { type Directory, File, Paths } from "expo-file-system";
import { Images } from "react-native-nitro-image";

export const WIDGET_DOWNLOAD_PREFIX = "widget-download-";
export const WIDGET_IMAGE_TIMEOUT = "widget_thumbnail_timeout";

const MAX_DIM = 512;
const TIMEOUT_MS = 30_000;

let attempt = 0;

export async function ensureWidgetImage(
  dir: Directory,
  fileName: string,
  url: string,
  tag: string,
): Promise<string> {
  const target = new File(dir, fileName);
  if (target.exists) return target.uri;

  const unique = `${tag}-${++attempt}`;
  const download = new File(Paths.cache, `${WIDGET_DOWNLOAD_PREFIX}${unique}`);
  const staged = new File(
    Paths.cache,
    `${WIDGET_DOWNLOAD_PREFIX}${unique}.jpg`,
  );
  deleteQuietly(download);
  deleteQuietly(staged);
  const build = buildImage(url, download, staged).finally(() =>
    deleteQuietly(download),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      build,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(WIDGET_IMAGE_TIMEOUT)),
          TIMEOUT_MS,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  } catch (error) {
    const discard = () => deleteQuietly(staged);
    build.then(discard, discard);
    throw error;
  }
  try {
    staged.moveSync(target, { overwrite: true });
  } catch (error) {
    deleteQuietly(staged);
    throw error;
  }
  return target.uri;
}

async function buildImage(
  url: string,
  download: File,
  staged: File,
): Promise<void> {
  await File.downloadFileAsync(url, download);
  const image = await Images.loadFromFileAsync(toPlainPath(download.uri));
  const scale = Math.min(1, MAX_DIM / Math.max(image.width, image.height));
  const resized =
    scale < 1
      ? await image.resizeAsync(
          Math.round(image.width * scale),
          Math.round(image.height * scale),
        )
      : image;
  await resized.saveToFileAsync(toPlainPath(staged.uri), "jpg", 80);
}

export function deleteQuietly(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {}
}

function toPlainPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}
