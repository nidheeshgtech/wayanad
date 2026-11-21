import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE } from "@/data/site";
import doc from "../privacy/privacy.module.scss";
import styles from "./drive.module.scss";

export const metadata: Metadata = {
  title: "Wayanad drive game — the Thamarassery Churam in 3D | Drive Wayanad",
  description: "Take a virtual Wayanad drive in your browser: a free 3D game up the nine hairpins of the Thamarassery Churam, through the Lakkidi gate, Vythiri and on to Kalpetta. Rain, mist, monsoon traffic and Wayanad's animals by the road.",
  alternates: { canonical: `${SITE}/wayanad-drive` },
  openGraph: { title: "A Wayanad drive in your browser", description: "Nine hairpins of the Thamarassery Churam, the Lakkidi gate, Vythiri and Kalpetta. Free, no download.", type: "website", siteName: "Drive Wayanad" },
};

/* The road in the game, from OpenStreetMap's NH766 (public/terrain/churam-road.json): kilometres from Adivaram. */
const ROUTE: [string, string, string][] = [
  ["0 km", "Adivaram", "the foot of the ghat, where the climb starts"],
  ["1.8–10.7 km", "The nine hairpins", "the Thamarassery Churam: stacked bends, stone walls, monkeys on the barriers"],
  ["12.2 km", "Lakkidi gate", "the WELCOME TO WAYANAD arch at the top of the ghat"],
  ["14.8 km", "Pookode Lake", "on the plateau, tea estates either side"],
  ["18.2 km", "Vythiri", "the first town, its real buildings from the map"],
  ["22 km", "Chundale", "a small junction town"],
  ["28 km", "Kalpetta", "Wayanad's district headquarters, the end of the road for now"],
];
const FAQ: [string, string][] = [
  ["Is Drive Wayanad free?", "Yes. It's free to play in your browser, with no ads and no account."],
  ["Does it work on a phone?", "Yes, on Android and iPhone in Chrome or Safari, with on-screen steering, brake and accelerator. On a computer use the arrow keys."],
  ["Do I need to download anything?", "No. Open drivewayanad.com and press Start. Android and iPhone apps are on the way."],
  ["Can I play with friends?", "Yes. Make a room and share its link, or drive on the open road with everyone who is playing."],
  ["Is the road real?", "The road follows NH766 from OpenStreetMap, with the nine hairpins where they really are. Vythiri's buildings come from the map; the other towns are built in their style."],
  ["What else is there to do?", "Collect coins on the hairpins, stop for tea below Lakkidi, give a monkey a ride, drive in rain and at night, and fill the animal sticker book: honk when you spot a langur, a giant squirrel, a peacock or a hornbill."],
];

const json = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
};

/** A reading page for search and for anyone who wants to know what the game is before playing: what a "Wayanad
 * drive" is in the game, the route, how to play, questions. Server-rendered, no canvas; the play button opens the game. */
export default function WayanadDrive() {
  return (
    <main className={doc.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />
      <article className={doc.doc}>
        <p className={doc.kicker}><Link href="/">Drive Wayanad</Link></p>
        <h1>A Wayanad drive, in your browser</h1>
        <p className={doc.lead}>
          Drive Wayanad is a free 3D driving game of the road into Wayanad, Kerala: up the nine hairpins of the
          Thamarassery Churam from Adivaram, through the Lakkidi gate and across the plateau to Kalpetta. Monsoon traffic,
          KSRTC buses, rain, mist and night drives. No download.
        </p>
        <p><Link className={styles.play} href="/">Play the Wayanad drive →</Link></p>

        <h2>The route</h2>
        <ol className={styles.route}>
          {ROUTE.map(([km, place, what]) => <li key={place}><span>{km}</span><b>{place}</b><small>{what}</small></li>)}
        </ol>

        <h2>How to play</h2>
        <ul>
          <li><b>Phone:</b> steer with the arrows bottom-left, brake and accelerator bottom-right, the horn in the middle.</li>
          <li><b>Computer:</b> arrow keys or W A S D to drive, H for the horn, C to change the camera, Space to pause.</li>
          <li>Pick a car in the garage: a supercar, an SUV, a hatchback, a 4×4 or a bike.</li>
          <li>Reach the Lakkidi gate for the climb's time and score, then keep driving to Kalpetta.</li>
        </ul>

        <h2>Questions</h2>
        {FAQ.map(([q, a]) => (
          <section key={q} className={styles.qa}><h3>{q}</h3><p>{a}</p></section>
        ))}

        <p><Link className={styles.play} href="/">Start driving →</Link></p>
        <p>Questions or ideas: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
      </article>
    </main>
  );
}
