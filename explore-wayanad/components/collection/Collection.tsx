"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CLASSES, COLLECTION, tierOf, type Entry, type VehicleClass } from "@/data/collection";
import styles from "./Collection.module.scss";

const ModelView = dynamic(() => import("./ModelView"), { ssr: false, loading: () => <span className={styles.spin} aria-hidden /> });

type Sort = "name" | "speed" | "pickup" | "handling" | "size";
const SORTS: { id: Sort; name: string }[] = [
  { id: "speed", name: "Fastest" }, { id: "pickup", name: "Quickest pickup" }, { id: "handling", name: "Best handling" },
  { id: "size", name: "Biggest" }, { id: "name", name: "Name (A–Z)" },
];
const PLAY: Record<Entry["play"], string> = { garage: "In your garage", traffic: "Take it from traffic", soon: "Coming soon" };
const MAX_SPEED = 110;

const Ico = ({ d }: { d: string }) => <svg className={styles.ico} viewBox="0 0 24 24" aria-hidden><path d={d} /></svg>;

function Bar({ label, value, of = 10, text }: { label: string; value: number; of?: number; text?: string }) {
  return (
    <div className={styles.bar}>
      <span>{label}</span>
      <i><u style={{ width: `${Math.min(100, (value / of) * 100)}%` }} /></i>
      <b>{text ?? value}</b>
    </div>
  );
}

/**
 * Every vehicle on the Drive Wayanad road (data/collection), as a garage of cards: filter by type, sort by stats,
 * open one to see it turning in 3D with its story, and put up to three side by side to compare.
 */
export default function Collection() {
  const [cls, setCls] = useState<VehicleClass | "all">("all"), [sort, setSort] = useState<Sort>("speed"), [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [open, setOpen] = useState<Entry | null>(null), [compare, setCompare] = useState<string[]>([]), [comparing, setComparing] = useState(false);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = COLLECTION.filter((e) => (cls === "all" || e.cls === cls) && (!needle || `${e.name} ${e.type}`.toLowerCase().includes(needle)));
    const key: Record<Sort, (e: Entry) => number | string> = { name: (e) => e.name, speed: (e) => -e.topSpeed, pickup: (e) => -e.pickup, handling: (e) => -e.handling, size: (e) => -e.size };
    return out.sort((a, b) => { const x = key[sort](a), y = key[sort](b); return x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name); });
  }, [cls, sort, q]);
  const toggle = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? c : [...c, id]));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setComparing(false); } };
    addEventListener("keydown", esc); return () => removeEventListener("keydown", esc);
  }, []);
  const picked = compare.map((id) => COLLECTION.find((e) => e.id === id)!);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <Link href="/" className={styles.logo} aria-label="Drive Wayanad — play">Drive <em>Wayanad</em></Link>
        <div className={styles.title}>
          <h1>Vehicle collection</h1>
          <p>{COLLECTION.length} vehicles on the churam. Tap one to see it in 3D.</p>
        </div>
        <Link href="/" className={styles.play}>Play now ›</Link>
      </header>

      <nav className={styles.classes} aria-label="Vehicle type">
        <button type="button" aria-pressed={cls === "all"} onClick={() => setCls("all")}><span>⭐</span>All <small>{COLLECTION.length}</small></button>
        {CLASSES.map((c) => (
          <button key={c.id} type="button" aria-pressed={cls === c.id} onClick={() => setCls(c.id)}>
            <span>{c.icon}</span>{c.name} <small>{COLLECTION.filter((e) => e.cls === c.id).length}</small>
          </button>
        ))}
      </nav>

      <div className={styles.tools}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a vehicle…" aria-label="Search" />
        <label>Sort <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>{SORTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      </div>

      <section className={styles.grid} aria-live="polite">
        {list.map((e) => (
          <article key={e.id} className={styles.card} data-soon={e.play === "soon" || undefined} data-open={expanded === e.id || undefined}>
            <div className={styles.pic}>
              <img src={`/cars/${e.id}.webp`} alt="" loading="lazy" width={640} height={400} onClick={() => setOpen(e)} />
              <button type="button" className={styles.round} data-at="left" onClick={() => setOpen(e)} aria-label={`${e.name}: see it in 3D`}>
                <svg viewBox="0 0 24 24" aria-hidden><path d="M9 6.5v11l9-5.5z" /></svg>
              </button>
              <button type="button" className={styles.round} data-at="right" aria-pressed={compare.includes(e.id)} onClick={() => toggle(e.id)} aria-label={compare.includes(e.id) ? `Remove ${e.name} from compare` : `Compare ${e.name}`}>
                <svg viewBox="0 0 24 24" aria-hidden>{compare.includes(e.id) ? <path d="M4 7h11M4 12h9M4 17h7M15 14l5 5M20 14l-5 5" /> : <path d="M4 7h11M4 12h9M4 17h7M17.5 13v7M14 16.5h7" />}</svg>
              </button>
              {e.play === "soon" && <span className={styles.soon}>Coming soon</span>}
              <h3 className={styles.name}>{e.name}</h3>
            </div>
            <div className={styles.line}>
              <span><Ico d="M3 15V8h11v7M14 10h4l3 3v2M5.5 17.5a1.5 1.5 0 1 0 0-.01M17.5 17.5a1.5 1.5 0 1 0 0-.01M7 15h9" /><a onClick={() => setCls(e.cls)}>{e.type}</a></span>
              <em>·</em><span><Ico d="M4 15a8 8 0 1 1 16 0M12 15l4-4" />{e.topSpeed} km/h</span>
              <em>·</em><span><Ico d="M7 4v9a2 2 0 0 0 2 2h7v5M7 20h4" /><b className={styles.tierInline} data-tier={tierOf(e)}>{tierOf(e)}</b> class</span>
              <button type="button" className={styles.more} aria-expanded={expanded === e.id} onClick={() => setExpanded((x) => (x === e.id ? null : e.id))} aria-label="Stats">
                <svg viewBox="0 0 24 24" aria-hidden><path d="m7 10 5 5 5-5" /></svg>
              </button>
            </div>
            {expanded === e.id && (
              <div className={styles.stats}>
                <Bar label="Top speed" value={e.topSpeed} of={MAX_SPEED} text={`${e.topSpeed} km/h`} />
                <Bar label="Pickup" value={e.pickup} />
                <Bar label="Handling" value={e.handling} />
                <Bar label="Size" value={e.size} />
                <p className={styles.how} data-play={e.play}>{PLAY[e.play]}</p>
              </div>
            )}
          </article>
        ))}
        {!list.length && <p className={styles.none}>No vehicle matches. Try another type.</p>}
      </section>

      {picked.length > 0 && (
        <div className={styles.tray}>
          {picked.map((e) => <button key={e.id} type="button" onClick={() => toggle(e.id)} aria-label={`Remove ${e.name}`}><img src={`/cars/${e.id}.webp`} alt="" /><span>{e.name}</span><i>✕</i></button>)}
          <b>{picked.length}/3</b>
          <button type="button" className={styles.go} disabled={picked.length < 2} onClick={() => setComparing(true)}>Compare</button>
        </div>
      )}

      {open && (
        <div className={styles.veil} onClick={() => setOpen(null)}>
          <div className={styles.sheet} role="dialog" aria-label={open.name} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.close} onClick={() => setOpen(null)} aria-label="Close">✕</button>
            <div className={styles.stage}><ModelView entry={open} /><span className={styles.tier} data-tier={tierOf(open)}>{tierOf(open)}</span></div>
            <div className={styles.info}>
              <small>{CLASSES.find((c) => c.id === open.cls)?.icon} {open.type}</small>
              <h2>{open.name}</h2>
              <p>{open.fact}</p>
              <div className={styles.stats}>
                <Bar label="Top speed" value={open.topSpeed} of={MAX_SPEED} text={`${open.topSpeed} km/h`} />
                <Bar label="Pickup" value={open.pickup} />
                <Bar label="Handling" value={open.handling} />
                <Bar label="Size" value={open.size} />
              </div>
              <dl><div><dt>Seats</dt><dd>{open.seats}</dd></div><div><dt>Class</dt><dd>{tierOf(open)}</dd></div><div><dt>How to drive it</dt><dd>{PLAY[open.play]}</dd></div></dl>
              {open.play !== "soon" && <Link href="/" className={styles.drive}>Drive it now ›</Link>}
            </div>
          </div>
        </div>
      )}

      {comparing && picked.length > 1 && (
        <div className={styles.veil} onClick={() => setComparing(false)}>
          <div className={`${styles.sheet} ${styles.compare}`} role="dialog" aria-label="Compare" onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.close} onClick={() => setComparing(false)} aria-label="Close">✕</button>
            <h2>Head to head</h2>
            <div className={styles.cols} style={{ gridTemplateColumns: `repeat(${picked.length}, minmax(0, 1fr))` }}>
              {picked.map((e) => {
                // a trophy for the best at each, only where they differ
                const best = (k: keyof Entry) => { const v = picked.map((p) => p[k] as number); return Math.max(...v) > Math.min(...v) && Math.max(...v) === e[k]; };
                return (
                  <div key={e.id}>
                    <img src={`/cars/${e.id}.webp`} alt="" />
                    <b>{e.name}</b><small>{e.type}</small>
                    <div className={styles.stats}>
                      <Bar label={`Top speed${best("topSpeed") ? " 🏆" : ""}`} value={e.topSpeed} of={MAX_SPEED} text={`${e.topSpeed}`} />
                      <Bar label={`Pickup${best("pickup") ? " 🏆" : ""}`} value={e.pickup} />
                      <Bar label={`Handling${best("handling") ? " 🏆" : ""}`} value={e.handling} />
                      <Bar label={`Size${best("size") ? " 🏆" : ""}`} value={e.size} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
