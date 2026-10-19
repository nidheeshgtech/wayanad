export type ActId =
  | "churam" | "kalpetta" | "soochipara" | "kuruva" | "edakkal"
  | "forest" | "border" | "stay" | "night" | "plan";

export interface ActContent {
  id: ActId;
  eyebrow: string;
  scene: string;
  title: string;
  body?: string;
  /** scroll length in viewport heights while pinned */
  length: number;
  /** seconds the visuals take to catch up with the scroll (ScrollTrigger scrub); default 0.6 */
  scrub?: number;
  status?: string;
}

/** Geographic order: Adivaram → churam → Kalpetta hub → south → north → east → forest → border. */
export const ACTS: ActContent[] = [
  { id: "churam", eyebrow: "Act 1 · Thamarassery Churam", scene: "Thamarassery Churam", title: "Nine bends to the top.", body: "Fourteen kilometres from Adivaram to Lakkidi. The British needed a Paniya guide to find this road. His name was Karinthandan.", length: 12, scrub: 1.2, status: "Ghat open today" },
  { id: "kalpetta", eyebrow: "Act 2 · Lakkidi to Kalpetta", scene: "Lakkidi → Kalpetta", title: "Everything is under an hour from here.", body: "The Chain Tree, Vythiri's tree houses, Pookode, then the hub.", length: 1.5 },
  { id: "soochipara", eyebrow: "Act 3 · Soochipara Falls", scene: "Soochipara Falls", title: "You hear it long before you see it.", body: "Thirteen km from Meppadi, then 1.2 km on foot. Two hundred metres of water in three tiers. Swim when the flow is low.", length: 2 },
  { id: "kuruva", eyebrow: "Act 4 · Kuruva Island", scene: "Kuruva Island", title: "The Kabini splits into a hundred and fifty islands.", body: "Nobody lives on them. The only way in is a bamboo raft, and fewer than five hundred people a day are allowed.", length: 2, status: "Kuruva open · Oct–May" },
  { id: "edakkal", eyebrow: "Act 5 · Edakkal Caves", scene: "Edakkal Caves", title: "Someone carved these six thousand years ago.", body: "A kilometre of steps, a stone wedged between two stones, and a wall nobody can fully read. Closed Mondays.", length: 1.6 },
  { id: "forest", eyebrow: "Act 7 · The forest road", scene: "Forest road · NH766", title: "From here the road belongs to the forest.", body: "Twenty km of protected teak and bamboo. Night traffic banned since 2009. Ninety-three animals died here in the five years before.", length: 2.2, status: "Night ban 9 pm – 6 am" },
  { id: "border", eyebrow: "Act 8 · Muthanga and the border", scene: "Muthanga · the border", title: "Kerala ends here.", body: "The road goes on to Bandipur and Mysore, but Wayanad stops at this barrier. Ninety kilometres from Adivaram.", length: 2.4, status: "Moolehole checkpost" },
  { id: "stay", eyebrow: "Act 9 · Stay", scene: "Stay", title: "Sleep in the trees.", length: 1.4 },
  { id: "night", eyebrow: "Act 10 · Night", scene: "Night", title: "Nothing to do after nine.", body: "That is the point.", length: 2, status: "Fireflies · Apr–May" },
  { id: "plan", eyebrow: "Act 11 · Plan your trip", scene: "Plan your trip", title: "Now come.", length: 1 },
];

/** `grade`: a colour multiplied over the whole page (the prototype's #grade layer), or null for none. */
export const PALETTE: Record<ActId, { sky: number; fog: number; ground: number; light: number; fogDensity: number; mist: number; flies: number; grade: string | null }> = {
  churam:     { sky: 0xc9d5cf, fog: 0xc9d5cf, ground: 0x1f4a2c, light: 0xfff4dc, fogDensity: 0.02, mist: 0.12, flies: 0, grade: null },
  kalpetta:   { sky: 0xd9c9a8, fog: 0xd9c9a8, ground: 0x2e4a3a, light: 0xffe6b8, fogDensity: 0.012, mist: 0.08, flies: 0, grade: null },
  soochipara: { sky: 0x8ea1a8, fog: 0xb9c7cc, ground: 0x24413a, light: 0xe8f0ff, fogDensity: 0.02, mist: 0.35, flies: 0, grade: "#c9d5dc" },
  kuruva:     { sky: 0xa9bdb6, fog: 0xa9bdb6, ground: 0x1b332c, light: 0xfff8e6, fogDensity: 0.015, mist: 0.12, flies: 0, grade: null },
  edakkal:    { sky: 0x5b4a3a, fog: 0x3f3127, ground: 0x2b241c, light: 0xffc98a, fogDensity: 0.03, mist: 0.05, flies: 0, grade: "#b89a78" },
  forest:     { sky: 0x24402f, fog: 0x1d3326, ground: 0x17291f, light: 0xdcffd0, fogDensity: 0.028, mist: 0.1, flies: 0, grade: "#9fbf98" },
  border:     { sky: 0xd48a4a, fog: 0x9c5a30, ground: 0x2a2318, light: 0xffb070, fogDensity: 0.018, mist: 0.08, flies: 0, grade: "#e0a070" },
  stay:       { sky: 0x8a4a3a, fog: 0x4a2a26, ground: 0x1b1a18, light: 0xffb08a, fogDensity: 0.02, mist: 0.06, flies: 0.3, grade: "#d08a70" },
  night:      { sky: 0x0a1420, fog: 0x0a1420, ground: 0x0b1410, light: 0x6e86b8, fogDensity: 0.03, mist: 0.02, flies: 0.9, grade: "#4a5c80" },
  plan:       { sky: 0x0e1f1a, fog: 0x0e1f1a, ground: 0x0e1f1a, light: 0x6e86b8, fogDensity: 0.06, mist: 0, flies: 0, grade: null },
};
