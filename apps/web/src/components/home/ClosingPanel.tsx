import MapCta from "@/components/MapCta";
import AndroidWaitlist from "./AndroidWaitlist";
import styles from "./Landing.module.css";

export default function ClosingPanel() {
  return (
    <section id="get" className={`${styles.wrap} ${styles.close}`}>
      <h2 className={styles.heading}>
        the next date is already in your saves.
      </h2>
      <div className={styles.ctaRow}>
        <MapCta source="footer" />
        <span className={styles.ctaNote}>On the App Store, for iPhone.</span>
      </div>
      <AndroidWaitlist tone="light" />
    </section>
  );
}
