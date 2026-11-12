import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE } from "@/data/site";
import styles from "./privacy.module.scss";

export const metadata: Metadata = {
  title: "Privacy — Drive Wayanad",
  description: "What Drive Wayanad, the free 3D driving game and its Android app, does with your data: no accounts, no ads, nothing sold.",
  alternates: { canonical: `${SITE}/privacy` },
};

const UPDATED = "12 November 2026";

/** The privacy policy for the website and the Android app (Google Play needs a public link to it). Server-rendered,
 * no canvas. Written against what the code actually does: lib/net (rooms), lib/voice (peer-to-peer voice),
 * lib/stats + Vercel Analytics, and the localStorage keys. Update it when any of those change. */
export default function Privacy() {
  return (
    <main className={styles.page}>
      <article className={styles.doc}>
        <p className={styles.kicker}><Link href="/">Drive Wayanad</Link></p>
        <h1>Privacy</h1>
        <p className={styles.updated}>Last updated {UPDATED}</p>

        <p className={styles.lead}>
          Drive Wayanad is a free 3D driving game, played at drivewayanad.com and in the Drive Wayanad app for Android.
          There are no accounts and no ads, and nothing about you is sold. This page explains the little data the game uses and why.
        </p>

        <h2>What stays on your device</h2>
        <p>The game remembers a few things in your browser&apos;s storage so you don&apos;t have to set them again:</p>
        <ul>
          <li>the name you type for your number plate</li>
          <li>your settings: graphics quality, light or dark look, and how you last played</li>
          <li>whether you have already seen a tip</li>
          <li>a random code, kept only until you close the tab, so you can rejoin the same room if the connection drops</li>
        </ul>
        <p>These never leave your device on their own. Clearing the site&apos;s data in your browser, or uninstalling the app, removes them.</p>

        <h2>Playing with other people</h2>
        <p>
          When you choose Open road or Play with friends, the game connects to our room server so other drivers can see you.
          While you play it sends your display name, the car, colour and driver you picked, and your position on the road a few times a second.
          Other players in the same room see your name and car. Names are filtered for abuse before anyone sees them.
        </p>
        <p>
          The room server keeps this only while the room is open. It saves nothing about you; it only counts how many players each room has.
          To stop spam it looks at your internet (IP) address for up to a minute, in memory, and never writes it down.
          The room server runs on Cloudflare.
        </p>

        <h2>Voice chat</h2>
        <p>
          Voice chat works only in a private room you join with a friend&apos;s code, and only after you turn it on.
          Your browser asks for the microphone at that moment. Your voice goes directly from your phone to your friends&apos; phones;
          it does not pass through our servers and is not recorded. To help phones find each other, they briefly contact connection
          services run by Cloudflare and Google, which see your IP address.
        </p>

        <h2>Visitor counts</h2>
        <p>
          We count visits with Vercel Web Analytics: how many people open the site, how long the road takes to load and whether
          they wait for it, how many start a drive, keep driving for 1, 3, 5, 10, 20 or 30 minutes, get out and walk, and reach the
          Lakkidi gate. It uses no cookies, doesn&apos;t follow you to other sites, and shows us totals only, not who you are.
        </p>

        <h2>Sharing</h2>
        <p>
          When you tap share, the game makes a picture of your climb and hands it to the app you pick (WhatsApp, for example).
          Nothing is shared unless you tap.
        </p>

        <h2>Hosting</h2>
        <p>
          The website is served by Vercel and the room server by Cloudflare. Like any website, their servers process your IP address to
          send you the pages. Their own privacy policies cover that.
        </p>

        <h2>The Android app</h2>
        <p>
          The app opens this same website in Chrome, full screen, so everything above applies to it. Google Play and Chrome handle
          installs, updates and crash reports under Google&apos;s privacy policy.
        </p>

        <h2>Children</h2>
        <p>
          The game is meant for players aged 13 and over. We don&apos;t knowingly collect personal information from children.
          Voice chat is only possible in private rooms that need a code from a friend.
        </p>

        <h2>Your choices</h2>
        <p>
          You can play alone without connecting to anyone, leave voice chat off, and clear the stored settings at any time.
          Because we don&apos;t keep personal data linked to you, there is nothing for us to look up or delete, but you are welcome to ask.
        </p>

        <h2>Changes</h2>
        <p>If this changes, we&apos;ll update this page and the date at the top.</p>

        <h2>Contact</h2>
        <p>Questions about privacy: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>

        <p className={styles.back}><Link href="/">Back to the drive</Link></p>
      </article>
    </main>
  );
}
