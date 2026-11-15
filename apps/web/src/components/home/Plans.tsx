import Image from "next/image";
import styles from "./Landing.module.css";

const modes = [
  {
    name: "Plan a date",
    body: "One evening, two stops a short walk apart, built around your saves. Send it to your date.",
  },
  {
    name: "Plan a trip",
    body: "One area a day, morning to evening: your saves, plus suggested spots nearby.",
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
            Open a city and Shelvr plans it around what you saved.
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
