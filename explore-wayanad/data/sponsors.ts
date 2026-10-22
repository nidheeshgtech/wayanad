/**
 * Sponsored roadside boards in the drive (components/scene/Billboards.tsx): which board shows whom.
 *
 * To sell a board: put the artwork in public/sponsors/ (2:1, e.g. 1200 × 600 JPG or WebP, big simple text — it is read
 * at driving speed) and fill in the board's sponsor: name, image ("/sponsors/your-file.webp") and url (their site or a
 * WhatsApp link). A board with no image shows "Advertise here". Sponsors with a url are also listed, with links, in the
 * drive's pause menu.
 *
 * `bend`: after which hairpin (1–9) the board stands, `after` units (10 m) past its apex; `gate`: before the Lakkidi
 * gateway instead. Boards stand on the valley side, behind the barrier, facing the climb.
 */
export type Sponsor = { name: string; image: string | null; url: string | null };
export type Board = { id: string; bend?: number; gate?: boolean; after: number; sponsor: Sponsor | null };

export const BOARDS: Board[] = [
  { id: "hairpin-1", bend: 1, after: 6, sponsor: null },
  { id: "hairpin-3", bend: 3, after: 6, sponsor: null },
  { id: "hairpin-5", bend: 5, after: 6, sponsor: null },
  { id: "hairpin-7", bend: 7, after: 6, sponsor: null },
  { id: "hairpin-9", bend: 9, after: 6, sponsor: null },
  { id: "lakkidi", gate: true, after: -14, sponsor: null },
];

/** What an unsold board says. */
export const ADVERTISE = { title: "Advertise here", line: "Your brand on the Thamarassery Churam", contact: "Explore Wayanad" };
