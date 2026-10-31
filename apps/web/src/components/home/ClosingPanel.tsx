import AppStoreButton from "@/components/AppStoreButton";
import AndroidWaitlist from "./AndroidWaitlist";
import styles from "./Landing.module.css";

export default function ClosingPanel() {
  return (
    <section id="get" className={`${styles.wrap} ${styles.close}`}>
      <h2 className={styles.heading}>
        the next date is already in your saves.
      </h2>
      <div className={styles.ctaRow}>
        <AppStoreButton source="footer" />
      </div>
      <AndroidWaitlist tone="light" />
    </section>
  );
}
