/**
 * Display names, as the room server cleans them (a copy of multiplayer/src/names.ts — keep the two the same): up to 16
 * letters, digits, spaces and a few marks; no links; obvious abuse replaced. Run in the browser before joining, so a
 * player sees the name others will see.
 */
// matched as whole words (so "Nandini" or "Ashita" pass), except the few that can't be part of an innocent name
const WORDS = [
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "slut", "whore", "bastard", "rape", "porn", "sex",
  "myre", "myr", "poori", "kunna", "pooru", "punda", "oombi", "andi", "koothi", "kundi",
  "chut", "gandu", "randi", "lund", "bc", "mc",
];
const ANYWHERE = ["fuck", "nigg", "thayoli", "madarchod", "behenchod", "bhosdi", "chutiya", "chutia", "oombi", "koothi"];

export function cleanName(raw: string): string {
  let name = raw.normalize("NFKC").replace(/[^\p{L}\p{M}\p{N} ._'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 16);
  if (/https?|www\.|\.com|\.in\b/i.test(name)) name = "";
  const flat = name.toLowerCase().replace(/[^a-z]/g, ""), words = name.toLowerCase().split(/[^a-z]+/);
  if (ANYWHERE.some((w) => flat.includes(w)) || words.some((w) => WORDS.includes(w))) name = "";
  return name || `Driver ${100 + Math.floor(Math.random() * 900)}`;
}
