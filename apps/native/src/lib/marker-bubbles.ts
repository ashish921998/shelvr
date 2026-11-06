export type BubbleRequest = { emoji: string; selected: boolean };

export function bubbleKey({ emoji, selected }: BubbleRequest): string {
  return `${selected ? 1 : 0}:${emoji}`;
}

export function parseBubbleKey(key: string): BubbleRequest {
  return { selected: key.startsWith("1"), emoji: key.slice(2) };
}

export function bubbleSignature(requests: BubbleRequest[]): string {
  return [...new Set(requests.map(bubbleKey))].sort().join("\n");
}

export function signatureKeys(signature: string): string[] {
  return signature ? signature.split("\n") : [];
}

const BUBBLE_RETRY_MS = [1000, 4000, 15000];

export function loadWithRetry<T>(
  load: () => Promise<T | null>,
  onLoad: (value: T) => void,
  delays: readonly number[] = BUBBLE_RETRY_MS,
): () => void {
  let live = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = (tries: number) => {
    void load().then((value) => {
      if (!live) return;
      if (value) onLoad(value);
      else if (tries < delays.length) {
        timer = setTimeout(() => attempt(tries + 1), delays[tries]);
      }
    });
  };
  attempt(0);
  return () => {
    live = false;
    clearTimeout(timer);
  };
}
