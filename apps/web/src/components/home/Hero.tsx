import HeroStage from "./HeroStage";
import StoreButton from "./StoreButton";

export default function Hero() {
  return (
    <section
      id="top"
      className="mx-auto grid max-w-[1200px] grid-cols-1 items-center justify-items-center gap-7 px-5 pt-10 text-center min-[1000px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] min-[1000px]:gap-12 min-[1000px]:text-left"
    >
      <div className="flex min-w-0 flex-col items-center gap-[22px] min-[1000px]:items-start">
        <h1 className="font-display max-w-[16ch] text-[clamp(40px,6.4vw,92px)] leading-[.95] tracking-[-.01em] text-balance min-[1000px]:text-[clamp(44px,4.6vw,68px)]">
          Save the <span className="text-terracotta">mess</span>.
          <br />
          Find it on a <span className="text-ember-deep">shelf</span>.
        </h1>
        <p className="max-w-[36ch] text-[clamp(16px,1.4vw,20px)] leading-[1.45] text-pretty text-muted">
          Links, photos and notes, saved in a tap and filed into the right
          Space. No folders.
        </p>
        <div className="mt-1">
          <StoreButton source="hero" />
        </div>
        <p className="text-[13px] font-medium text-muted">
          Private by design · iPhone ·{" "}
          <a href="#android" className="text-ember-deep underline">
            Android? Join the waitlist
          </a>
        </p>
      </div>
      <HeroStage />
    </section>
  );
}
