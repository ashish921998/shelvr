import Image from "next/image";

const tiles = [
  {
    src: "/images/features/search-grid.jpg",
    alt: "Search results for travel across saved Lisbon places",
    label: "Full-text search",
  },
  {
    src: "/images/features/detail-hero.jpg",
    alt: "Saved article about a Lisbon weekend itinerary",
    label: "AI summary",
  },
  {
    src: "/images/features/map.jpg",
    alt: "Saved Lisbon places on a map",
    label: "Saved places",
  },
  {
    src: "/images/features/tidy.jpg",
    alt: "Photo tidy reviewing a night-sky photo",
    label: "Photo tidy",
  },
] as const;

export default function Features() {
  return (
    <section id="search" className="border-t border-line py-20 sm:py-28">
      <div className="container grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="text-center lg:text-left">
          <p className="section-kicker justify-center lg:justify-start">
            More than bookmarks
          </p>
          <h2 className="mt-4 text-5xl font-bold leading-[0.96] tracking-[-0.06em] text-ink sm:text-6xl">
            Your saves become useful again.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
            Search full article text, revisit the AI summary, explore related
            saves, or see saved places on a map. Shelvr gives every save
            somewhere useful to go.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {tiles.map((tile) => (
            <figure key={tile.label} className="min-w-0">
              <div className="relative aspect-[5/4] overflow-hidden rounded-[1.4rem] bg-paper-deep">
                <Image
                  src={tile.src}
                  alt={tile.alt}
                  fill
                  sizes="(max-width: 1024px) 45vw, 280px"
                  className="object-cover"
                />
              </div>
              <figcaption className="mt-2 text-sm font-semibold text-ink">
                {tile.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
