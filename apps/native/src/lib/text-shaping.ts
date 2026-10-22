export function needsNativeText(text: string): boolean {
  return /[^\u0020-\u024f\u2000-\u206f]|\p{M}|[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(
    text,
  );
}
