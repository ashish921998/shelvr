"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import AppStoreButton from "@/components/AppStoreButton";
import styles from "./page.module.css";

const previews = [
  { label: "Collect", title: "Everything you love, in one place.", copy: "Send a link, photo, or thought to Shelvr. It is saved instantly and understood automatically.", image: "/images/app/home.webp" },
  { label: "Organize", title: "A place for everything. Automatically.", copy: "Shelvr quietly sorts each save into a Space, so your collection stays calm without folder upkeep.", image: "/images/app/spaces.webp" },
  { label: "Rediscover", title: "Find the thing you almost forgot.", copy: "Search by what you remember—not where you put it—and return to the ideas that matter.", image: "/images/app/search.webp" },
] as const;

export default function AppleConceptPage() {
  const [active, setActive] = useState(0);
  const preview = previews[active];

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Main navigation">
        <Link href="/" className={styles.brand} aria-label="Shelvr home">
          <Image src="/shelvr-mark.svg" alt="" width={28} height={28} />
          <span>Shelvr</span>
        </Link>
        <div className={styles.navLinks}>
          <a href="#experience">Experience</a>
          <a href="#privacy">Privacy</a>
        </div>
        <AppStoreButton source="header" compact />
      </nav>

      <section className={styles.hero} aria-labelledby="apple-hero-title">
        <div className={styles.aura} aria-hidden="true" />
        <p className={styles.eyebrow}>Your personal corner of the internet</p>
        <h1 id="apple-hero-title">Save what moves you.<br /><span>Find it when it matters.</span></h1>
        <p className={styles.lede}>Shelvr brings links, photos, and passing thoughts together—beautifully organized and always within reach.</p>
        <div className={styles.heroActions}>
          <AppStoreButton source="hero" />
          <a className={styles.textLink} href="#experience">See how it works <span aria-hidden="true">↓</span></a>
        </div>

        <div className={styles.stage} aria-label="Shelvr app preview">
          <div className={`${styles.floatCard} ${styles.cardOne}`}><span>Weekend in Kyoto</span><small>Trips</small></div>
          <div className={`${styles.floatCard} ${styles.cardTwo}`}><span>Perfect reading light</span><small>Home</small></div>
          <div className={styles.phone}>
            <div className={styles.phoneTop} aria-hidden="true" />
            <Image src="/images/app/home.webp" alt="Shelvr app showing a visual collection of saved ideas" width={700} height={1467} priority />
          </div>
          <div className={styles.saveToast}><span className={styles.check}>✓</span><div><strong>Saved to Shelvr</strong><small>Filed in Recipes</small></div></div>
        </div>
      </section>

      <section className={styles.experience} id="experience" aria-labelledby="experience-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Quietly capable</p>
          <h2 id="experience-title">Less organizing.<br />More remembering.</h2>
        </div>
        <div className={styles.showcase}>
          <div className={styles.copyPanel}>
            <div className={styles.segmented} role="tablist" aria-label="Shelvr features">
              {previews.map((item, index) => (
                <button key={item.label} role="tab" aria-selected={active === index} onClick={() => setActive(index)}>{item.label}</button>
              ))}
            </div>
            <div className={styles.previewCopy} key={preview.label}>
              <h3>{preview.title}</h3>
              <p>{preview.copy}</p>
            </div>
            <p className={styles.microcopy}>No tags to maintain. No system to learn.</p>
          </div>
          <div className={styles.previewWell}>
            <div className={styles.previewPhone} key={preview.image}>
              <Image src={preview.image} alt={`${preview.label} screen in Shelvr`} width={700} height={1467} />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.privacy} id="privacy">
        <div className={styles.privacyIcon} aria-hidden="true">✦</div>
        <p className={styles.eyebrow}>Private by design</p>
        <h2>Your saved world is yours.</h2>
        <p>Shelvr is built to help you remember—not to turn your interests into an ad profile.</p>
      </section>

      <footer className={styles.footer}>
        <div><Image src="/shelvr-mark.svg" alt="" width={32} height={32} /><strong>Shelvr</strong></div>
        <p>Keep the good internet.</p>
        <div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
      </footer>
    </main>
  );
}
