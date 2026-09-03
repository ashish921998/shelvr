import Image from "next/image";
import type { CSSProperties } from "react";
import AppStoreButton from "../AppStoreButton";
import AndroidWaitlist from "./AndroidWaitlist";
import styles from "./Hero.module.css";

const floatingSaves = [
  {
    position: "recipes",
    image: "/images/spaces/recipes.jpg",
    label: "Weeknight ramen",
    meta: "Recipes",
  },
  {
    position: "prague",
    image: "/images/spaces/prague.jpg",
    label: "Prague someday",
    meta: "Trips",
  },
  {
    position: "reading",
    image: "/images/spaces/reading.jpg",
    label: "Reading list",
    meta: "Ideas",
  },
  {
    position: "gifts",
    image: "/images/spaces/gifts.jpg",
    label: "Coffee setup",
    meta: "Wish list",
  },
] as const;

export default function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.glow} aria-hidden="true" />

      <div aria-hidden="true">
        {floatingSaves.map((save, index) => (
          <figure
            key={save.label}
            className={`${styles.save} ${styles[save.position]}`}
            style={{ "--save-index": index } as CSSProperties}
          >
            <span className={styles.saveImage}>
              <Image
                src={save.image}
                alt=""
                fill
                priority={index < 2}
                sizes="(max-width: 640px) 124px, (max-width: 1100px) 150px, 220px"
              />
            </span>
            <figcaption>
              <strong>{save.label}</strong>
              <span>{save.meta}</span>
            </figcaption>
          </figure>
        ))}

        <aside className={styles.note}>
          <span>NOTE</span>
          <p>Build a home full of things worth remembering.</p>
        </aside>

        <aside className={styles.linkCard}>
          <span className={styles.linkIcon}>↗</span>
          <div>
            <strong>The quiet joy of keeping things</strong>
            <span>every.to</span>
          </div>
        </aside>
      </div>

      <div className={styles.center}>
        <div className={styles.mark}>
          <Image
            src="/shelvr-mark.svg"
            alt=""
            width={52}
            height={52}
            priority
            aria-hidden
          />
        </div>

        <p className={styles.kicker}>Save it. Shelvr handles the rest.</p>
        <h1 id="hero-title">
          Your saved internet,
          <br />
          <em>finally useful.</em>
        </h1>
        <p className={styles.copy}>
          Save anything in one tap. Shelvr understands it, files it into the
          right Space, and keeps it ready for later.
        </p>

        <div
          className={styles.route}
          aria-label="Links, photos, and notes are automatically filed"
        >
          <span>Link</span>
          <span>Photo</span>
          <span>Note</span>
          <b aria-hidden>→</b>
          <strong>Auto-filed</strong>
        </div>

        <div className={styles.cta}>
          <AppStoreButton source="hero" />
          <AndroidWaitlist source="hero" />
        </div>

        <p className={styles.proof}>
          Available on iPhone <span>·</span> Private by design <span>·</span> No
          folder upkeep
        </p>
      </div>
    </section>
  );
}
