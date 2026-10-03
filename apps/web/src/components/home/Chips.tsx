import {
  CalendarIcon,
  DocumentDuplicateIcon,
  MapIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

// Web recreations of the app's chips (apps/native/src/components).

export function TagChip({
  label,
  emphasized = false,
}: {
  label: string;
  emphasized?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center rounded-full px-3 text-[13px] font-medium whitespace-nowrap ${
        emphasized
          ? "bg-ember-soft text-ember-deep"
          : "bg-paper-deep text-muted"
      }`}
    >
      {label}
    </span>
  );
}

const INTENT_ICONS = {
  copy: DocumentDuplicateIcon,
  open_maps: MapIcon,
  add_event: CalendarIcon,
};

export type IntentKind = keyof typeof INTENT_ICONS;

export function IntentChip({
  kind,
  label,
}: {
  kind: IntentKind;
  label: string;
}) {
  const Icon = INTENT_ICONS[kind];
  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ember-soft px-3 text-[13px] font-medium whitespace-nowrap text-ember-deep">
      <Icon aria-hidden className="size-3.5" strokeWidth={2} />
      {label}
    </span>
  );
}

export function SuggestedBadge() {
  return (
    <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-cream shadow-[0_1px_3px_rgba(43,36,24,0.18)]">
      <SparklesIcon aria-hidden className="size-3 text-ember" strokeWidth={2} />
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="self-start rounded-full bg-ember-soft px-3 py-1.5 text-xs font-bold tracking-[0.08em] text-ember-deep uppercase">
      {children}
    </span>
  );
}
