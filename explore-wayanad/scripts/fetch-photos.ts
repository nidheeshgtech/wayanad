/**
 * Fetches the real photos used until the drone shoot, from Wikimedia Commons.
 *
 *   npm run fetch:photos
 *
 * For each entry: two resized JPEGs from Commons' own thumbnailer (no local image tooling)
 *   public/photos/<id>-960.jpg, public/photos/<id>-1280.jpg
 * and data/photos.json with author, licence and source page for the on-screen credit.
 * Only free licences (CC BY, CC BY-SA, CC0, public domain) are accepted; anything else fails the run.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** id → Commons file title, and the place name shown in the credit. Chosen 2026-10-19 from a review of ~70 candidates. */
const PHOTOS: { id: string; title: string; place: string }[] = [
  { id: "churam-barrier", title: "Wayanad churam.JPG", place: "Thamarassery Churam" },
  { id: "churam-hairpins", title: "Wayanad Churam thamarasseri.jpg", place: "Thamarassery Churam" },
  { id: "churam-cliff", title: "View point of Thamarassery Churam.jpg", place: "Thamarassery Churam" },
  { id: "lakkidi-arch", title: "Lakkidi view point - vinnila2k24 (20).jpg", place: "Lakkidi" },
  { id: "lakkidi-valley", title: "Lakkidi view point - vinnila2k24 (1).jpg", place: "Lakkidi view point" },
  { id: "pookode", title: "Wayanad - Pookode Lake - 1.jpg", place: "Pookode Lake" },
  { id: "kalpetta", title: "Kalpetta - View from Olives Resort.jpg", place: "Kalpetta" },
  { id: "soochipara", title: "Soochipara Waterfalls.jpg", place: "Soochipara Falls" },
  { id: "kuruva", title: "Kuruva Island Wayanad.JPG", place: "Kuruva Island" },
  { id: "edakkal", title: "Edakkal Caves - Petroglyphs - 4.jpg", place: "Edakkal Caves" },
  { id: "muthanga-road", title: "Muthanga wildlife sanctuary wayanad.jpg", place: "Muthanga" },
  { id: "elephants", title: "Elephant Crossing at Bandipur.jpg", place: "NH766, Bandipur" },
  { id: "bathery-road", title: "Good Morning Sulthan Bathery (4649462239).jpg", place: "Sulthan Bathery" },
  { id: "vythiri-tea", title: "Tea plantation in Vythiri 3.jpg", place: "Vythiri" },
  { id: "churam-night", title: "Wayanad Churam - Night View.jpg", place: "Thamarassery Churam" },
];
const WIDTHS = [960, 1280]; // phones, desktop. Photos lazy-load per act, so only the next act's pair is ever in flight
const FREE = /^(CC BY(-SA)? [\d.]+|CC0|Public domain)$/i;
const ROOT = path.resolve(import.meta.dirname, "..");
const UA = { "User-Agent": "explore-wayanad-bake/0.1 (photo fetch script)" };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const strip = (html = "") => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function info(title: string, width: number) {
  const q = new URLSearchParams({
    action: "query", format: "json", titles: `File:${title}`, prop: "imageinfo",
    iiprop: "url|size|extmetadata", iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit", iiurlwidth: String(width),
  });
  let body = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    body = await (await fetch(`https://commons.wikimedia.org/w/api.php?${q}`, { headers: UA })).text();
    if (body.startsWith("{")) break;
    console.log(`  rate-limited, retrying in ${5 * (attempt + 1)} s`); // Commons answers "You are making too many requests" in plain text
    await pause(5000 * (attempt + 1));
  }
  const page = Object.values(JSON.parse(body).query.pages)[0] as { imageinfo?: { thumburl: string; descriptionurl: string; width: number; height: number; extmetadata: Record<string, { value: string }> }[] };
  if (!page.imageinfo) throw new Error(`not on Commons: ${title}`);
  return page.imageinfo[0];
}

await mkdir(path.join(ROOT, "public/photos"), { recursive: true });
const credits = [];
for (const p of PHOTOS) {
  let meta;
  for (const w of WIDTHS) {
    const i = await info(p.title, w);
    const license = strip(i.extmetadata.LicenseShortName?.value);
    if (!FREE.test(license)) throw new Error(`${p.title}: licence "${license}" is not on the allowed list`);
    const img = await fetch(i.thumburl, { headers: UA });
    if (!img.ok) throw new Error(`${p.title} @${w}: ${img.status}`);
    await writeFile(path.join(ROOT, `public/photos/${p.id}-${w}.jpg`), Buffer.from(await img.arrayBuffer()));
    meta = {
      id: p.id, place: p.place, title: p.title, aspect: +(i.width / i.height).toFixed(3),
      author: strip(i.extmetadata.Artist?.value) || "Unknown", license, licenseUrl: i.extmetadata.LicenseUrl?.value ?? null, source: i.descriptionurl,
    };
    await pause(1500);
  }
  credits.push(meta);
  console.log(`  ${p.id.padEnd(16)} ${meta!.license.padEnd(14)} ${meta!.author}`);
}
await writeFile(path.join(ROOT, "data/photos.json"), JSON.stringify(credits, null, 2) + "\n");
console.log(`wrote ${credits.length} photos × ${WIDTHS.length} sizes and data/photos.json`);
