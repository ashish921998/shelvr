import { analytics } from "@/lib/analytics";

export function bestEffort(code: string, run: () => void): void {
  try {
    run();
  } catch (error) {
    analytics.captureError(code, error);
  }
}
