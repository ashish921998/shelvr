import Image from "next/image";

const photos = [
  {
    src: "/images/spaces/gifts.jpg",
    alt: "Espresso machine saved into Gift ideas",
    className: "left-[6%] top-[8%] h-[40%] w-[44%] rotate-[-6deg]",
  },
  {
    src: "/images/spaces/office.jpg",
    alt: "Dashboard screenshot saved into Home office",
    className: "right-[6%] top-[14%] h-[30%] w-[42%] rotate-[5deg]",
  },
  {
    src: "/images/spaces/recipes.jpg",
    alt: "Ramen bowl saved into Recipes",
    className: "left-[34%] top-[36%] z-10 h-[24%] w-[30%] rotate-[8deg]",
  },
  {
    src: "/images/spaces/reading.jpg",
    alt: "Bookshelf saved into Reading list",
    className: "bottom-[8%] left-[8%] h-[34%] w-[38%] rotate-[3deg]",
  },
  {
    src: "/images/spaces/trips.jpg",
    alt: "Riverside city saved into Trips",
    className: "bottom-[8%] right-[6%] h-[36%] w-[40%] rotate-[-4deg]",
  },
];

export default function Spaces() {
  return (
    <section id="spaces" className="border-t border-line py-20 sm:py-28">
      <div className="container grid items-stretch gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
        <div className="relative min-h-[26rem] overflow-hidden rounded-[1.75rem] bg-paper-deep sm:min-h-[32rem] lg:min-h-[38rem]">
          {photos.map((photo) => (
            <div
              key={photo.src}
              className={`absolute overflow-hidden rounded-[1.4rem] bg-cream shadow-[0_24px_50px_rgba(43,36,24,0.18)] ${photo.className}`}
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(max-width: 1024px) 45vw, 280px"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        <div className="flex flex-col justify-center text-center lg:text-left">
          <p className="section-kicker justify-center lg:justify-start">
            Living collections
          </p>
          <h2 className="mt-4 text-5xl font-bold leading-[0.96] tracking-[-0.06em] text-ink sm:text-6xl">
            Spaces fill themselves.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
            Create a space like Recipes, Gift ideas, or Trips. Shelvr reaches
            back through your library, finds what belongs, and keeps adding
            matching saves over time.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
            {["Retroactive", "Automatic", "Always editable"].map((item) => (
              <span
                key={item}
                className="rounded-full bg-ember-soft px-3 py-2 text-xs font-bold text-ember-deep"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
