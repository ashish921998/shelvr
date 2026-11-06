export function webUrl(path: string): string {
  const origin =
    process.env.EXPO_PUBLIC_WEB_URL || "https://shelvr-web.vercel.app";
  return new URL(path, origin).href;
}
