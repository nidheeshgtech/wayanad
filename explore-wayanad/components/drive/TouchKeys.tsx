/**
 * The touch driving controls' icons (DriveHud), drawn on the bevelled game keys (Drive.module.scss `bevel`):
 * - Steer: a bold chevron each way, on a round key ringed in gold.
 * - Gas: a double chevron (go); Brake: a brake disc with its caliper; Nitro: a lightning bolt (DriveHud's ICON).
 * Plain SVG in the text colour: no images to load, crisp at any size.
 */
export function SteerArt({ side }: { side: "left" | "right" }) {
  // a double chevron (the leading one gold), centred, drawn pointing left and mirrored
  return (
    <svg viewBox="0 0 24 24" aria-hidden strokeLinecap="round" strokeLinejoin="round" style={side === "right" ? { transform: "scaleX(-1)" } : undefined}>
      <path className="lead" d="M12.25 5 5.75 12 12.25 19" />
      <path d="M18.25 5 11.75 12 18.25 19" />
    </svg>
  );
}

export function PedalArt({ kind }: { kind: "gas" | "brake" }) {
  if (kind === "gas") return (
    <svg viewBox="0 0 24 24" aria-hidden strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 12.5 12 6l6.5 6.5" /><path d="M5.5 19 12 12.5l6.5 6.5" />
    </svg>
  );
  // a ventilated disc: the rim, the hub with its bolts, the cooling holes, and the caliper gripping it at the top right
  const holes = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return [12 + Math.cos(a) * 5.4, 12 + Math.sin(a) * 5.4]; });
  return (
    <svg viewBox="0 0 24 24" aria-hidden strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="2.6" />
      {holes.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.7" fill="currentColor" stroke="none" />)}
      <path d="M16.2 3.2a10.2 10.2 0 0 1 4.6 4.6" strokeWidth="3.6" />
    </svg>
  );
}
