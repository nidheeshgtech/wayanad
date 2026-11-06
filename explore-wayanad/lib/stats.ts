/**
 * How far visitors get, counted on the free Vercel Web Analytics plan (custom events need Pro): each step is sent as
 * a made-up page view, so the dashboard's Pages list reads as a funnel —
 *   /              opened the site
 *   /play/loaded   the road finished loading (the title screen appeared)
 *   /play/started  pressed Start
 *   /play/finished reached the Lakkidi gate (a full climb, not one started part-way with ?at=)
 * Each step counts once per page load, so "Drive again" doesn't count twice.
 */
import { pageview } from "@vercel/analytics";

export type Step = "loaded" | "started" | "finished";
const sent = new Set<Step>();

export function mark(step: Step) {
  if (sent.has(step)) return;
  sent.add(step);
  const path = `/play/${step}`;
  try { pageview({ route: path, path }); } catch {}
}
