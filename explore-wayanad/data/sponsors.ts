/**
 * Advertising in the drive: who appears where. Everything unsold shows a quiet "Advertise here" (or nothing, for the
 * screen slots), so the game never looks empty.
 *
 * Artwork goes in public/sponsors/; keep text big and simple — most of it is read at driving speed.
 *  - BOARDS: roadside hoardings (components/scene/Billboards.tsx). Artwork 2:1, e.g. 1200 × 600.
 *      `bend`: after which hairpin (1–9), `after` units (10 m) past its apex; `between`: halfway between two hairpins;
 *      `gate`: before the Lakkidi gateway. They stand on the valley side, behind the barrier, facing the climb.
 *  - BUS_SIDES: panels on both sides of the buses in traffic (components/scene/Traffic.tsx), handed out in turn, so each
 *      sponsor rides on several buses. Artwork 7:1, e.g. 1400 × 200.
 *  - PRESENTED_BY: one name on the start screen and the pause menu ("Presented by …"), the premium slot.
 *  - STAY: one partner on the end-of-drive card ("Where to stay tonight"), for a resort or homestay.
 * Every sponsor with a url is also listed, with links, in the pause menu.
 */
export type Sponsor = { name: string; image: string | null; url: string | null };
export type Board = { id: string; bend?: number; between?: [number, number]; gate?: boolean; after: number; sponsor: Sponsor | null };

export const BOARDS: Board[] = [
  { id: "hairpin-1", bend: 1, after: 6, sponsor: null },
  { id: "hairpin-2", bend: 2, after: 6, sponsor: null },
  { id: "hairpins-2-3", between: [2, 3], after: 0, sponsor: null },
  { id: "hairpin-3", bend: 3, after: 6, sponsor: null },
  { id: "hairpin-4", bend: 4, after: 6, sponsor: null },
  { id: "hairpin-5", bend: 5, after: 6, sponsor: null },
  { id: "hairpin-6", bend: 6, after: 6, sponsor: null },
  { id: "hairpins-6-7", between: [6, 7], after: 0, sponsor: null },
  { id: "hairpin-7", bend: 7, after: 6, sponsor: null },
  { id: "hairpin-8", bend: 8, after: 6, sponsor: null },
  { id: "hairpins-8-9", between: [8, 9], after: 0, sponsor: null },
  { id: "hairpin-9", bend: 9, after: 6, sponsor: null },
  { id: "lakkidi", gate: true, after: -14, sponsor: null },
];

/** Bus side panels, handed out over the buses in turn (null: "Advertise on this bus"). */
export const BUS_SIDES: (Sponsor | null)[] = [null];

/** "Presented by" on the start screen and in the pause menu. */
export const PRESENTED_BY: Sponsor | null = null;

/** The stay partner on the end-of-drive card. `offer`: one short line ("10% off for drivers", "Tree houses in Vythiri"). */
export const STAY: (Sponsor & { offer: string }) | null = null;

/** What unsold space says. */
export const ADVERTISE = { title: "Advertise here", line: "Your brand on the Thamarassery Churam", bus: "Advertise on this bus", contact: "Explore Wayanad" };

/** Every sponsor with a link, once each (for the pause menu). */
export const linkedSponsors = (): Sponsor[] => {
  const all = [PRESENTED_BY, STAY, ...BUS_SIDES, ...BOARDS.map((b) => b.sponsor)].filter((s): s is Sponsor => !!s?.url);
  return all.filter((s, i) => all.findIndex((o) => o.name === s.name) === i);
};
