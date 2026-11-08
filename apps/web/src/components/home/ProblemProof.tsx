import { BookmarkIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import type { CSSProperties } from "react";

import { SAMPLE_CITY } from "@/lib/sampleCity";
import styles from "./Landing.module.css";
import { SampleCityMap } from "./SampleCity";

const savedReels = [
  { src: "lisbon-arch", style: { "--r": "-8deg", left: "16%", top: "12%" } },
  { src: "lisbon-tram", style: { "--r": "0deg", left: "35%", top: "6%" } },
  { src: "lisbon-street", style: { "--r": "7deg", left: "54%", top: "14%" } },
] satisfies { src: string; style: CSSProperties & { "--r": string } }[];

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 28"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${styles.proofArrow} stroke-ember-deep`}
    >
      <path d="M5 14h17M16 8l6 6-6 6" />
    </svg>
  );
}

export default function ProblemProof() {
  return (
    <div className={styles.wrap}>
      <section className={styles.proof}>
        <h2 className={styles.heading}>from the saved tab to friday night.</h2>
        <ol className={styles.proofSteps}>
          <li className={styles.proofStep}>
            <div aria-hidden="true" className={styles.proofArt}>
              {savedReels.map((reel) => (
                <div
                  key={reel.src}
                  className={styles.proofReel}
                  style={reel.style}
                >
                  <Image
                    src={`/images/landing/${reel.src}.jpg`}
                    alt=""
                    fill
                    sizes="120px"
                  />
                </div>
              ))}
              <span className={styles.proofChip}>
                <BookmarkIcon aria-hidden="true" />
                Saved
              </span>
            </div>
            <h3>Saves you never open</h3>
            <p className={`${styles.text} ${styles.proofBody}`}>
              Reels pile up in your saved tab, and the good spots get lost in
              them.
            </p>
            <Arrow />
          </li>
          <li className={styles.proofStep}>
            <div className={styles.proofArt}>
              <svg
                aria-hidden="true"
                viewBox="142 224 178 133.5"
                preserveAspectRatio="xMidYMid slice"
                className={styles.proofMap}
              >
                <SampleCityMap animate={false} />
              </svg>
            </div>
            <h3>Places on a map</h3>
            <p className={`${styles.text} ${styles.proofBody}`}>
              Shelvr reads each one and pins the places under their city.
            </p>
            <Arrow />
          </li>
          <li className={styles.proofStep}>
            <div className={styles.proofArt}>
              <div className={styles.proofPlan}>
                <p className={styles.proofPlanTitle}>
                  {`Your evening in ${SAMPLE_CITY.name}`}
                </p>
                <ol>
                  {SAMPLE_CITY.evening.stops.map((stop, i) => (
                    <li key={stop.name}>
                      <span
                        aria-hidden="true"
                        className={styles.proofPlanNumber}
                      >
                        {i + 1}
                      </span>
                      <span className={styles.proofPlanSlot}>{stop.slot}</span>
                      <span className={styles.proofPlanName}>{stop.name}</span>
                      <span className={styles.proofPlanBadge}>Yours</span>
                      {i === 0 ? (
                        <span className={styles.proofPlanWalk}>
                          {`About ${SAMPLE_CITY.evening.walkMinutes} min on foot`}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <h3>A plan for Friday</h3>
            <p className={`${styles.text} ${styles.proofBody}`}>
              Open the city and ask for a date night, built around the places
              you saved.
            </p>
          </li>
        </ol>
      </section>
    </div>
  );
}
