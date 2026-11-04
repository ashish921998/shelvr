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
