/**
 * Plan your trip (Act 11): how to get there, when to go, day plans, and the WhatsApp enquiry.
 * Facts change. Everything marked `verify: true` must be checked against a current source before launch
 * (distances and drive times are typical, not timetabled). The WhatsApp number comes from the environment
 * (NEXT_PUBLIC_WHATSAPP_NUMBER, digits with country code); without it the button says enquiries open soon.
 */
export type Fact = { label: string; title: string; detail: string; verify: boolean };

export const ARRIVE: Fact[] = [
  { label: "Air", title: "Kozhikode (CCJ)", detail: "The nearest airport. About 90 km to Kalpetta, roughly 3 hours by road up the Thamarassery Churam.", verify: true },
  { label: "Air", title: "Kannur (CNN)", detail: "About 3½ hours to Kalpetta through Mananthavady.", verify: true },
  { label: "Air", title: "Bengaluru (BLR)", detail: "About 6–7 hours by road through Mysuru and the Muthanga forest. The forest road is closed to traffic from 9 pm to 6 am.", verify: true },
  { label: "Rail", title: "Kozhikode station", detail: "The nearest main-line station, about 85 km from Kalpetta. Buses and taxis go up the churam.", verify: true },
  { label: "Road", title: "KSRTC buses", detail: "Regular buses from Kozhikode, Kannur, Mysuru and Bengaluru to Kalpetta and Sulthan Bathery.", verify: true },
];

export const SEASONS: (Fact & { months: string })[] = [
  { months: "Oct – Feb", label: "Best", title: "Cool and clear", detail: "Mild days, cold mornings and the clearest views from the churam. Peak season: book stays early.", verify: true },
  { months: "Mar – May", label: "Warm", title: "Dry and warm", detail: "Hotter afternoons. Fireflies in April and May. Good for the caves and the plantations.", verify: true },
  { months: "Jun – Sep", label: "Monsoon", title: "Mist and rain", detail: "Heavy rain and full waterfalls. Kuruva Island and some trails close; landslides can slow the churam.", verify: true },
];

const SHORT = [
  "Up the churam, the Lakkidi viewpoint, Pookode lake, Kalpetta",
  "Edakkal Caves (closed Mondays), Sulthan Bathery, an afternoon safari at Muthanga",
  "Soochipara Falls, the Meppadi tea estates, back down the churam",
];
const MIDDLE = [...SHORT.slice(0, 2), "Soochipara Falls and the Meppadi tea estates", "Kuruva Island by bamboo raft (October to May), Mananthavady", "Banasura Sagar dam, Thirunelli temple on the way out"];
export const ITINERARIES: { days: number; title: string; stops: string[]; verify: boolean }[] = [
  { days: 3, title: "The short loop", stops: SHORT, verify: true },
  { days: 5, title: "North and south", stops: MIDDLE, verify: true },
  { days: 7, title: "With a peak", stops: [...MIDDLE, "Chembra Peak trek (forest permit; start early)", "Meenmutty Falls, then a slow day at a plantation stay"], verify: true },
];

export const WHATSAPP = {
  number: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, ""),
  message: "Hi, I'd like help planning a trip to Wayanad.",
};
