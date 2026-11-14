/**
 * The touch driving controls' artwork (DriveHud): drawn like the real things, in the page's colours.
 * - Steer: half a leather steering wheel each side (stitched rim, a spoke to the hub) with the way it turns; pressed,
 *   the half-wheel turns that way and an amber ring lights (Drive.module.scss).
 * - Pedals: the accelerator tall and narrow, the brake wide and short, as in a car: dark metal pads with rubber ribs,
 *   an amber edge on the accelerator and a red one on the brake; pressed, the pad tips down under your foot.
 * Plain SVG: no images to load, crisp at any size.
 */
export function SteerArt({ side }: { side: "left" | "right" }) {
  const flip = side === "right" ? "translate(48 0) scale(-1 1)" : undefined;
  return (
    <svg viewBox="0 0 48 48" aria-hidden data-art="steer">
      <g transform={flip}>
        {/* the rim: dark leather with a lighter edge and stitches along it */}
        <path d="M25 5.5A18.5 18.5 0 0 0 25 42.5" fill="none" stroke="#0b1512" strokeWidth="8" strokeLinecap="round" />
        <path d="M25 5.5A18.5 18.5 0 0 0 25 42.5" fill="none" stroke="#2c3a35" strokeWidth="6" strokeLinecap="round" />
        <path d="M25 7.4A16.6 16.6 0 0 0 25 40.6" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1" strokeLinecap="round" />
        <path d="M25 5.5A18.5 18.5 0 0 0 25 42.5" fill="none" stroke="#D9A441" strokeOpacity=".75" strokeWidth=".9" strokeDasharray="1.6 2.2" />
        {/* the spoke to the hub */}
        <path d="M8.5 26.5 Q16 25 21 25" fill="none" stroke="#0b1512" strokeWidth="5" strokeLinecap="round" />
        <path d="M8.5 26.5 Q16 25 21 25" fill="none" stroke="#33433d" strokeWidth="3" strokeLinecap="round" />
        <path d="M25 18.5a5.5 5.5 0 0 0 0 11" fill="#1d2925" stroke="#0b1512" strokeWidth="1.2" />
        {/* which way */}
        <path d="M37.5 17 30.5 24l7 7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

const ribs = (from: number, to: number, step: number, x0: (y: number) => number, x1: (y: number) => number) => {
  const out: React.ReactNode[] = [];
  for (let y = from; y <= to; y += step) out.push(
    <g key={y}>
      <line x1={x0(y)} y1={y} x2={x1(y)} y2={y} stroke="#070b0a" strokeWidth="2.6" strokeLinecap="round" />
      <line x1={x0(y + 1.6)} y1={y + 1.6} x2={x1(y + 1.6)} y2={y + 1.6} stroke="rgba(255,255,255,.1)" strokeWidth="1" strokeLinecap="round" />
    </g>,
  );
  return out;
};

export function PedalArt({ kind }: { kind: "gas" | "brake" }) {
  const gas = kind === "gas", edge = gas ? "#D9A441" : "#E0604C", id = `pedal-${kind}`;
  // the accelerator: a tall pad, a little narrower at the top (seen from the seat); the brake: wide and squat
  const pad = gas
    ? "M20 8H44Q49.5 8 50 13.5L54.5 82Q55 90 47 90H17Q9 90 9.5 82L14 13.5Q14.5 8 20 8Z"
    : "M14 34H50Q57 34 57.5 41L59 82Q59.5 90 51.5 90H12.5Q4.5 90 5 82L6.5 41Q7 34 14 34Z";
  const x0 = gas ? (y: number) => 14 - (y - 8) * 0.055 + 3 : () => 10;
  const x1 = gas ? (y: number) => 50 + (y - 8) * 0.055 - 3 : () => 54;
  return (
    <svg viewBox="0 0 64 100" aria-hidden data-art="pedal">
      <defs>
        <linearGradient id={`${id}-m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a5753" />
          <stop offset=".45" stopColor="#25302d" />
          <stop offset="1" stopColor="#121816" />
        </linearGradient>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".18" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="94" rx={gas ? 22 : 27} ry="4" fill="rgba(0,0,0,.45)" />
      <path d={pad} fill="#060a09" transform="translate(0 2.5)" />
      <path d={pad} fill={`url(#${id}-m)`} stroke={edge} strokeWidth="2.2" />
      {gas ? ribs(18, 80, 7, x0, x1) : ribs(44, 82, 6.5, x0, x1)}
      <path d={gas ? "M20 11H44" : "M15 37H49"} stroke={`url(#${id}-g)`} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
