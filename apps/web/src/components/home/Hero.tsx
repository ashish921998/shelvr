"use client";

import Image from "next/image";
import { type CSSProperties, useEffect, useRef } from "react";
import AppStoreButton from "@/components/AppStoreButton";
import styles from "./Landing.module.css";

const reels = [
  {
    src: "lisbon-arch",
    caption: "3 stops for your first day in lisbon",
    style: { "--r": "-8deg", left: "-6%", top: "6%" },
    depth: 18,
  },
  {
    src: "lisbon-rooftops",
    caption: "this miradouro at sunset, no crowds",
    style: { "--r": "6deg", right: "-7%", top: "2%" },
    depth: 26,
  },
  {
    src: "lisbon-tram",
    caption: "take the 28 up to the castle",
    style: { "--r": "-4deg", left: "-8%", bottom: "4%" },
    depth: 30,
  },
  {
    src: "lisbon-street",
    caption: "the €3 bifana locals queue for",
    style: { "--r": "9deg", right: "-5%", bottom: "8%" },
    depth: 14,
  },
];

export default function Hero() {
  const cards = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (reduce || !fine) return;

    // Gentle pointer parallax, eased towards the pointer each frame.
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let tick = 0;
    let running = false;
    const onMove = (e: PointerEvent) => {
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
      if (!running) {
        running = true;
        tick = requestAnimationFrame(step);
      }
    };
    const step = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      cards.current.forEach((card, i) => {
        if (card)
          card.style.translate = `${-x * reels[i].depth}px ${-y * reels[i].depth}px`;
      });
      // Stop once the cards have caught up; the next move restarts it.
      running = Math.abs(tx - x) + Math.abs(ty - y) > 0.001;
      if (running) tick = requestAnimationFrame(step);
    };
    addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(tick);
      removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div className={styles.wrap}>
      <section id="top" className={styles.hero}>
        <div>
          <h1 className={styles.title}>
            saved it.
            <br />
            <span>now go there.</span>
          </h1>
          <p className={`${styles.text} ${styles.lede}`}>
            Share a reel or TikTok to Shelvr. The places in it land on a map of
            their city, ready for a date night or a trip.
          </p>
          <div className={styles.ctaRow}>
            <AppStoreButton source="hero" />
            <span className={styles.ctaNote}>
              For iPhone. <a href="#android">Android soon.</a>
            </span>
          </div>
        </div>

        <div className={styles.art}>
          {reels.map((reel, i) => (
            <div
              key={reel.src}
              ref={(el) => {
                cards.current[i] = el;
              }}
              className={styles.reel}
              style={{
                ...(reel.style as CSSProperties),
                animationDelay: `${200 + i * 90}ms`,
              }}
            >
              <Image
                src={`/images/landing/${reel.src}.jpg`}
                alt=""
                fill
                sizes="132px"
              />
              <p>{reel.caption}</p>
            </div>
          ))}
          <div className={styles.phone}>
            <Image
              src="/images/landing/app-reel.jpg"
              alt="Shelvr finding the places in a reel about Lisbon"
              width={640}
              height={1391}
              sizes="300px"
              priority
            />
          </div>
        </div>
      </section>
    </div>
  );
}
