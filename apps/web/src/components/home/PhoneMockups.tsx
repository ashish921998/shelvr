import type { ReactNode } from "react";

const feedItems = [
  {
    type: "Link",
    title: "The craft of slow software",
    meta: "design · 4 min",
    tags: ["#product", "#writing"],
    swatch: "from-[#1f2937] to-[#4b5563]",
  },
  {
    type: "Note",
    title: "Brown-butter miso pasta",
    meta: "weekend cooking",
    tags: ["#recipes"],
    swatch: "from-shelf to-shelf-soft",
  },
  {
    type: "Image",
    title: "Tokyo alley light",
    meta: "travel · photos",
    tags: ["#travel"],
    swatch: "from-ember to-ember-deep",
  },
];

const spaces = [
  { name: "Design systems", count: 48, color: "#E4572E" },
  { name: "Cooking", count: 23, color: "#0F766E" },
  { name: "Research", count: 31, color: "#0B1128" },
];

function PhoneShell({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      {label ? (
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.16em] text-muted-soft">
          {label}
        </p>
      ) : null}
      <div className="phone-frame aspect-[9/19] w-full max-w-[240px] mx-auto">
        <div className="phone-screen h-full pt-9 px-2.5 pb-2.5">{children}</div>
      </div>
    </div>
  );
}

export function HeroPhones() {
  return (
    <div className="relative mx-auto mt-14 w-full max-w-4xl">
      <div className="absolute inset-x-10 top-10 h-48 rounded-full bg-ember/10 blur-3xl" />
      <div className="relative flex items-end justify-center gap-3 sm:gap-5 px-2">
        {/* Left phone - spaces */}
        <div className="hidden sm:block w-[190px] lg:w-[210px] -rotate-6 translate-y-6 opacity-95">
          <PhoneShell>
            <div className="rounded-2xl bg-white p-3 h-full border border-line">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Spaces
              </p>
              <h3 className="mt-1 text-sm font-semibold text-ink">Your shelves</h3>
              <div className="mt-3 space-y-2">
                {spaces.map((space) => (
                  <div
                    key={space.name}
                    className="flex items-center gap-2 rounded-xl border border-line bg-paper px-2.5 py-2"
                  >
                    <span
                      className="h-8 w-1 rounded-full"
                      style={{ backgroundColor: space.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-ink truncate">
                        {space.name}
                      </p>
                      <p className="text-[10px] text-muted">{space.count} items</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </PhoneShell>
        </div>

        {/* Center phone - feed */}
        <div className="w-[220px] sm:w-[240px] lg:w-[260px] z-10">
          <PhoneShell>
            <div className="rounded-2xl bg-white p-3 h-full border border-line flex flex-col">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ember">
                    Shelvr
                  </p>
                  <h3 className="text-sm font-semibold text-ink">Your shelf</h3>
                </div>
                <span className="rounded-full bg-ink px-2 py-1 text-[10px] font-semibold text-white">
                  + Save
                </span>
              </div>

              <div className="mt-3 rounded-xl border border-line bg-paper px-2.5 py-2 text-[11px] text-muted">
                Search everything you’ve saved…
              </div>

              <div className="mt-3 space-y-2 flex-1">
                {feedItems.map((item) => (
                  <article
                    key={item.title}
                    className="rounded-xl border border-line bg-paper p-2.5 flex gap-2.5"
                  >
                    <div
                      className={`h-11 w-11 shrink-0 rounded-lg bg-gradient-to-br ${item.swatch}`}
                    />
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ember">
                        {item.type}
                      </p>
                      <p className="text-xs font-semibold text-ink truncate">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-muted">{item.meta}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </PhoneShell>
        </div>

        {/* Right phone - just classified */}
        <div className="hidden sm:block w-[190px] lg:w-[210px] rotate-6 translate-y-6 opacity-95">
          <PhoneShell>
            <div className="rounded-2xl bg-white p-3 h-full border border-line">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Just saved
              </p>
              <div className="mt-3 rounded-2xl bg-ink text-white p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/60">
                  Classified
                </p>
                <p className="mt-2 text-sm font-semibold leading-snug">
                  The craft of slow software
                </p>
                <p className="mt-2 text-[11px] text-white/70">
                  Filed into{" "}
                  <span className="text-[#F0B59A] font-medium">Research</span>
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {["#product", "#writing", "#systems"].map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex mr-1.5 rounded-full border border-line bg-paper px-2 py-1 text-[10px] font-medium text-ink-soft"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-line-strong p-3 text-center">
                <p className="text-[11px] font-medium text-ink">Ready to find later</p>
                <p className="mt-1 text-[10px] text-muted">Title · tags · space</p>
              </div>
            </div>
          </PhoneShell>
        </div>
      </div>
    </div>
  );
}

export function StepPhones() {
  const steps = [
    {
      label: "01 Save",
      body: (
        <div className="rounded-2xl bg-white border border-line p-3 h-full">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ember">
            New save
          </p>
          <h4 className="mt-1 text-sm font-semibold text-ink">Paste a link</h4>
          <div className="mt-3 rounded-xl border border-line bg-paper px-3 py-2.5 text-[11px] text-muted break-all">
            https://example.com/slow-software
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded-full bg-ink py-2.5 text-xs font-semibold text-white"
          >
            Save to Shelvr
          </button>
          <div className="mt-4 grid grid-cols-3 gap-1.5">
            {["Link", "Note", "Image"].map((t) => (
              <div
                key={t}
                className="rounded-lg border border-line bg-paper py-2 text-center text-[10px] font-medium text-ink-soft"
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      label: "02 Classify",
      body: (
        <div className="rounded-2xl bg-white border border-line p-3 h-full">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-shelf">
            Processing
          </p>
          <h4 className="mt-1 text-sm font-semibold text-ink">AI filing</h4>
          <div className="mt-3 space-y-2">
            {[
              ["Title", "The craft of slow software"],
              ["Tags", "product, writing"],
              ["Space", "Research"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-paper px-3 py-2">
                <p className="text-[9px] uppercase tracking-[0.12em] text-muted">{k}</p>
                <p className="text-xs font-medium text-ink mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      label: "03 Find",
      body: (
        <div className="rounded-2xl bg-white border border-line p-3 h-full">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ember">
            Library
          </p>
          <h4 className="mt-1 text-sm font-semibold text-ink">Ready on the shelf</h4>
          <div className="mt-3 rounded-xl bg-ink text-white p-3">
            <p className="text-[10px] text-white/60">In Research</p>
            <p className="mt-1 text-sm font-semibold leading-snug">
              The craft of slow software
            </p>
          </div>
          <div className="mt-3 space-y-2">
            {feedItems.slice(0, 2).map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-line bg-paper px-2.5 py-2"
              >
                <p className="text-xs font-semibold text-ink truncate">{item.title}</p>
                <p className="text-[10px] text-muted">{item.meta}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="mt-12 grid sm:grid-cols-3 gap-6 lg:gap-8">
      {steps.map((step) => (
        <div key={step.label} className="flex flex-col items-center">
          <PhoneShell className="w-full max-w-[220px]">{step.body}</PhoneShell>
          <p className="mt-4 text-sm font-semibold text-ink">{step.label}</p>
        </div>
      ))}
    </div>
  );
}
