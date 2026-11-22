"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GARAGE_CLASSES, NEW_RIDES, type GarageClass, type NewRide } from "@/data/newGarage";
import type { View } from "./ShowroomView";
import type { Wheel } from "@/lib/autoWheels";
import styles from "./Showroom.module.scss";

const ShowroomView = dynamic(() => import("./ShowroomView"), { ssr: false, loading: () => <span className={styles.spin} aria-hidden /> });

const KEY = "wayanad-garage-picks";
const VIEWS: { id: View; name: string }[] = [{ id: "outside", name: "360°" }, { id: "inside", name: "Inside" }, { id: "wheel", name: "Wheel" }];

function Bar({ label, value, of = 10, text }: { label: string; value: number; of?: number; text?: string }) {
  return <div className={styles.bar}><span>{label}</span><i><u style={{ width: `${Math.min(100, (value / of) * 100)}%` }} /></i><b>{text ?? value}</b></div>;
}

/**
 * The new garage, in preview (app/cars/new): every ride that could come to the game next, as a showroom. Tap one to
 * see it turning in 3D under studio lights, sit inside it, watch its wheels roll, rev it and see its smoke colour.
 * Heart the ones you want; the list copies to send back. `?qc`: the wheels found are tinted (checking); `?still`: no
 * turning (the card pictures are shot so: public/cars/new).
 */
export default function Showroom() {
  const [cls, setCls] = useState<GarageClass | "all">("all");
  const [open, setOpen] = useState<NewRide | null>(null), [view, setView] = useState<View>("outside"), [rev, setRev] = useState(0);
  const [picks, setPicks] = useState<string[]>([]), [copied, setCopied] = useState(false), [qc, setQc] = useState(false);
  const [wheels, setWheels] = useState<Wheel[] | null>(null), [still, setStill] = useState(false);
  useEffect(() => {
    try { setPicks(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch {}
    const q = new URLSearchParams(location.search); setQc(q.has("qc")); setStill(q.has("still"));
    const id = q.get("id"); if (id) setOpen(NEW_RIDES.find((r) => r.id === id) ?? null);
    const v = q.get("view") as View | null; if (v) setView(v);
  }, []);
  const save = (p: string[]) => { setPicks(p); try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} };
  const toggle = (id: string) => save(picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id]);
  const list = useMemo(() => NEW_RIDES.filter((r) => cls === "all" || r.cls === cls), [cls]);
  const onInfo = useCallback((w: Wheel[]) => setWheels(w), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    addEventListener("keydown", esc); return () => removeEventListener("keydown", esc);
  }, []);
  const show = (r: NewRide) => { setOpen(r); setView("outside"); setWheels(null); };
  const copy = async () => {
    const text = picks.map((id) => NEW_RIDES.find((r) => r.id === id)).filter(Boolean).map((r) => `${r!.name} (${r!.type})`).join("\n");
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  const cars = NEW_RIDES.filter((r) => r.cls !== "bike").length, bikes = NEW_RIDES.length - cars;

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <Link href="/cars" className={styles.back}>‹ Collection</Link>
        <p className={styles.kicker}>Preview · not in the game yet</p>
        <h1>The new garage</h1>
        <p className={styles.sub}>{cars} cars and {bikes} bikes. Tap one to see it in 3D, sit inside, rev it. Tap ♥ on the ones you want in the game.</p>
      </header>

      <nav className={styles.chips} aria-label="Type">
        <button type="button" aria-pressed={cls === "all"} onClick={() => setCls("all")}>All <small>{NEW_RIDES.length}</small></button>
        {GARAGE_CLASSES.map((c) => (
          <button key={c.id} type="button" aria-pressed={cls === c.id} onClick={() => setCls(c.id)}>{c.name} <small>{NEW_RIDES.filter((r) => r.cls === c.id).length}</small></button>
        ))}
      </nav>

      <section className={styles.grid}>
        {list.map((r) => (
          <article key={r.id} className={styles.card} data-picked={picks.includes(r.id) || undefined}>
            <button type="button" className={styles.pic} onClick={() => show(r)} aria-label={`${r.name}: see it in 3D`}>
              <img src={`/cars/new/${r.id}.webp`} alt="" loading="lazy" width={800} height={500} />
            </button>
            <button type="button" className={styles.heart} aria-pressed={picks.includes(r.id)} onClick={() => toggle(r.id)} aria-label={picks.includes(r.id) ? `Remove ${r.name}` : `Want ${r.name}`}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
            </button>
            <div className={styles.meta}>
              <h3>{r.name}</h3>
              <p>{r.type}</p>
              <div className={styles.row}><span>{r.topSpeed} km/h</span><span className={styles.smoke}><i style={{ background: r.smoke }} />smoke</span></div>
            </div>
          </article>
        ))}
      </section>

      {picks.length > 0 && (
        <div className={styles.tray}>
          <b>♥ {picks.length} picked</b>
          <button type="button" onClick={copy}>{copied ? "Copied ✓" : "Copy my list"}</button>
          <button type="button" className={styles.clear} onClick={() => save([])}>Clear</button>
        </div>
      )}

      {open && (
        <div className={styles.veil} onClick={() => setOpen(null)}>
          <div className={styles.sheet} role="dialog" aria-label={open.name} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.close} onClick={() => setOpen(null)} aria-label="Close">✕</button>
            <div className={styles.stage}>
              <ShowroomView ride={open} view={view} rev={rev} qc={qc} still={still} onInfo={onInfo} />
              <div className={styles.views} role="group" aria-label="View">
                {VIEWS.map((v) => <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.name}</button>)}
              </div>
              <button type="button" className={styles.rev} style={{ ["--smoke" as string]: open.smoke }} onClick={() => setRev((n) => n + 1)}>Rev it</button>
              {qc && wheels && <p className={styles.qc}>{wheels.length} wheels · sides {wheels.map((w) => w.sides).join("/")}</p>}
            </div>
            <div className={styles.info}>
              <small>{GARAGE_CLASSES.find((c) => c.id === open.cls)?.name} · {open.type}</small>
              <h2>{open.name}</h2>
              <Bar label="Top speed" value={open.topSpeed} of={150} text={`${open.topSpeed} km/h`} />
              <Bar label="Pickup" value={open.pickup} />
              <Bar label="Handling" value={open.handling} />
              <p className={styles.smokeLine}><i style={{ background: open.smoke }} />Exhaust smoke in its own colour</p>
              <button type="button" className={styles.want} aria-pressed={picks.includes(open.id)} onClick={() => toggle(open.id)}>{picks.includes(open.id) ? "♥ In my list" : "♡ I want this one"}</button>
              <p className={styles.credit}>3D model by {open.by} · CC BY</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
