import AndroidWaitlist from "./AndroidWaitlist";
import StoreButton from "./StoreButton";

const spine = "block rounded-[4px_4px_1px_1px] origin-bottom";

export default function ClosingPanel() {
  return (
    <section id="get" className="mx-auto mt-18 max-w-[1200px] px-5 pb-10">
      <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-[28px] bg-dark px-6 pt-[clamp(48px,7vw,96px)] pb-[132px] text-center text-dark-text">
        <div
          aria-hidden
          className="absolute inset-x-6 bottom-14 h-3 rounded-[3px] bg-linear-to-b from-dark-plank-2 via-dark-plank to-dark-3 shadow-[0_12px_20px_rgba(0,0,0,.5)]"
        />
        <div
          aria-hidden
          className="absolute bottom-[68px] left-11 hidden items-end gap-[5px] min-[760px]:flex"
        >
          <span className={`${spine} h-[70px] w-[22px] bg-ember`} />
          <span className={`${spine} h-[58px] w-[18px] bg-terracotta`} />
          <span
            className={`${spine} h-[78px] w-[26px] -rotate-6 bg-ember-soft`}
          />
        </div>
        <div
          aria-hidden
          className="absolute right-11 bottom-[68px] hidden items-end gap-[5px] min-[760px]:flex"
        >
          <span className={`${spine} h-16 w-5 bg-[#8d8271]`} />
          <span className={`${spine} h-20 w-6 bg-ember`} />
          <span className={`${spine} h-[52px] w-4 rotate-5 bg-dark-text`} />
        </div>

        <h2 className="font-display relative max-w-[16ch] text-[clamp(40px,6vw,88px)] leading-[.95] text-balance">
          A quieter place for everything interesting.
        </h2>
        <p className="relative text-[17px] font-medium text-dark-muted">
          On iPhone now. Android is on the way.
        </p>
        <div className="relative">
          <StoreButton source="footer" />
        </div>
        <AndroidWaitlist />
      </div>
    </section>
  );
}
