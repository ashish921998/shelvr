"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./Landing.module.css";

const beats = [
  {
    title: "you’ve saved forty reels about prague.",
    body: "They sit in your saved tab between recipes and memes. When you finally book the trip, you can’t find any of them.",
  },
  {
    title: "shelvr finds the places in them.",
    body: "It reads the caption and listens to the voiceover, so it catches the bar the creator only said out loud.",
  },
  {
    title: "and pins them on your map.",
    body: "Kampa Park, Hemingway Bar, Café Louvre. Open Prague in Shelvr and they’re all there, next to the reels they came from.",
  },
];

// A saved tab of six reels; the three with places fly to their pins on the
// app's Prague map (x, y in percent of the map card).
const saved = [
  { src: "prague-kampa", pin: { x: 39, y: 22 } },
  { src: "reel-a" },
  { src: "prague-bar", pin: { x: 54, y: 30 } },
  { src: "reel-b" },
  { src: "prague-cafe", pin: { x: 60, y: 42 } },
  { src: "reel-c" },
];

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function place(card: HTMLElement, i: number, progress: number) {
  const gx = 16 + (i % 3) * 23.5;
  const gy = 3 + Math.floor(i / 3) * 47;
  const { pin } = saved[i];
  if (!pin) {
    // Reels with no place step back and fade out.
    const t = clamp((progress - 0.22) / 0.15);
    card.style.left = `${gx}%`;
    card.style.top = `${gy}%`;
    card.style.transform = `scale(${1 - 0.08 * t})`;
    card.style.opacity = `${1 - t}`;
    return;
  }
  const t = clamp((progress - 0.32 - i * 0.04) / 0.3);
  const e = easeOut(t);
  // The card's centre travels from its grid slot onto its pin, shrinking as it lands.
  const cx = gx + 11 + (pin.x - gx - 11) * e;
  const cy = gy + 24 + (pin.y - gy - 24) * e;
  card.style.left = `${cx - 11}%`;
  card.style.top = `${cy - 24}%`;
  card.style.transform = `scale(${1 - 0.88 * e})`;
  card.style.opacity = `${1 - clamp((t - 0.6) / 0.3)}`;
}

export default function Story() {
  const section = useRef<HTMLElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const [beat, setBeat] = useState(0);
  const [map, setMap] = useState(false);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const render = () => {
      const el = section.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = reduce ? 1 : clamp(-r.top / (r.height - innerHeight));
      setBeat(p < 0.25 ? 0 : p < 0.6 ? 1 : 2);
      setMap(p > 0.45);
      cards.current.forEach((card, i) => card && place(card, i, p));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    render();
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section ref={section} className={styles.story}>
      <div className={`${styles.wrap} ${styles.storyPin}`}>
        <div className={styles.beats}>
          {beats.map((b, i) => (
            <div
              key={b.title}
              className={styles.beat}
              data-on={i === beat}
              aria-hidden={i !== beat}
            >
              <h2 className={styles.heading}>{b.title}</h2>
              <p className={styles.text}>{b.body}</p>
            </div>
          ))}
        </div>
        <div className={styles.stage} data-map={map}>
          <Image
            className={styles.appMap}
            src="/images/landing/app-prague-map.jpg"
            alt="Shelvr’s map of Prague with three saved places pinned: Kampa Park, Hemingway Bar and Café Louvre"
            width={1056}
            height={863}
            sizes="(max-width: 860px) 100vw, 640px"
          />
          {saved.map((reel, i) => (
            <div
              key={reel.src}
              ref={(el) => {
                cards.current[i] = el;
              }}
              className={styles.reel}
              aria-hidden
            >
              <Image
                src={`/images/landing/${reel.src}.jpg`}
                alt=""
                fill
                sizes="150px"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
