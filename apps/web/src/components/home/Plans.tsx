import Image from "next/image";
import styles from "./Landing.module.css";

const modes = [
  {
    name: "Plan a date",
    body: "One evening, a few of your places close together. Send it to them and let them vote.",
  },
  {
    name: "Plan a trip",
    body: "One area a day, morning to evening, every stop from your saves.",
  },
];

export default function Plans() {
  return (
    <div className={styles.wrap}>
      <section className={styles.plans}>
        <figure>
          <Image
            src="/images/landing/app-plan.jpg"
            alt="A day in Lisbon planned from saved places: Miradouro da Graça, Time Out Market, LX Factory, Pastéis de Belém"
            width={520}
            height={978}
            sizes="360px"
          />
        </figure>
        <div>
          <h2 className={styles.heading}>when you’re going, ask for a plan.</h2>
          <p className={`${styles.text} ${styles.intro}`}>
            Open a city and Shelvr plans it from what you saved. It never adds a
            place you didn’t.
          </p>
          <dl className={styles.modes}>
            {modes.map((mode) => (
              <div key={mode.name}>
                <dt>{mode.name}</dt>
                <dd className={styles.text}>{mode.body}</dd>
              </div>
            ))}
          </dl>
          <p className={`${styles.text} ${styles.aside}`}>
            Been somewhere? Mark it, and the next plan picks something new.
          </p>
        </div>
      </section>
    </div>
  );
}
