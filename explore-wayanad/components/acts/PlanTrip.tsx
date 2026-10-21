import { ARRIVE, ITINERARIES, SEASONS, WHATSAPP } from "@/data/plan";
import styles from "./PlanTrip.module.scss";

/**
 * Act 11's content: getting here, when to go, day plans and the WhatsApp enquiry. Plain markup, all of it in the
 * server-rendered page for search engines (no tabs hiding content), on a solid background with no canvas behind it.
 * Facts live in data/plan.ts. Structured data (schema.org TouristDestination) goes with it.
 */
export default function PlanTrip() {
  const wa = WHATSAPP.number ? `https://wa.me/${WHATSAPP.number}?text=${encodeURIComponent(WHATSAPP.message)}` : null;
  return (
    <div className={styles.plan}>
      <section aria-labelledby="plan-arrive">
        <h3 id="plan-arrive" className={styles.heading}>Getting here</h3>
        <div className={styles.arrive}>
          {ARRIVE.map((a) => (
            <article key={a.title} className={styles.card}>
              <span className={styles.chip}>{a.label}</span>
              <h4>{a.title}</h4>
              <p>{a.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="plan-when">
        <h3 id="plan-when" className={styles.heading}>When to go</h3>
        <div className={styles.seasons}>
          {SEASONS.map((s) => (
            <article key={s.months} className={styles.season}>
              <div className={styles.months}>{s.months}</div>
              <h4>{s.title}</h4>
              <p>{s.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="plan-days">
        <h3 id="plan-days" className={styles.heading}>Itineraries</h3>
        <div className={styles.days}>
          {ITINERARIES.map((it) => (
            <article key={it.days} className={styles.card}>
              <div className={styles.count}>{it.days}<span> days</span></div>
              <h4>{it.title}</h4>
              <ol>{it.stops.map((s, i) => <li key={i}><b>Day {i + 1}</b>{s}</li>)}</ol>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.cta} aria-labelledby="plan-ask">
        <div>
          <h3 id="plan-ask">Plan it with us</h3>
          <p>Tell us your dates and how you like to travel. We reply on WhatsApp with stays, a route and current road and weather news.</p>
        </div>
        {wa
          ? <a className={styles.whatsapp} href={wa} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>
          : <span className={styles.soon}>WhatsApp enquiries open soon</span>}
      </section>

      <p className={styles.note}>Timings, closures and prices change. Check them before you travel.</p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "TouristDestination", name: "Wayanad",
        description: "A district on the Western Ghats plateau in Kerala, reached from the coast by the Thamarassery Churam.",
        geo: { "@type": "GeoCoordinates", latitude: 11.6854, longitude: 76.132 },
        containedInPlace: { "@type": "State", name: "Kerala" },
      }) }} />
    </div>
  );
}
