/**
 * Churam Jobs: small errands from people along the road past the Lakkidi gate (lib/jobs runs them). Positions are road
 * units (10 m) from Adivaram, the same as game.s; the places are on public/terrain/churam-road.json (Pookode Lake
 * 14.83 km, Vythiri 18.22, Chundale 21.96, Kalpetta 28.09; the drive ends just short of Kalpetta's point, at ≈ 27.97).
 * Lines are Manglish, as the owner asked. Times come from the distance (lib/jobs) unless `pace` says otherwise.
 *
 *   deliver    get there before the clock runs out (with `crashes`: and with no more hits than that, e.g. a cake)
 *   passenger  get them there with no more than `crashes` hits (and before the clock, a generous one)
 */
export type JobKind = "deliver" | "passenger";
export type Job = {
  id: string;
  who: string; role: string; initials: string; tint: string;
  kind: JobKind;
  pick: number; drop: number; dropName: string;
  cargo: string;          // what you carry: on the objective line
  pay: number;            // ₹
  pace: number;           // metres a second the clock allows for
  crashes?: number;       // passenger: hits allowed
  offer: string; done: string; fail: string; crashed?: string;
};

export const JOBS: Job[] = [
  {
    id: "ammini", who: "Ammini chechi", role: "Meen kachavadam · Lakkidi", initials: "AC", tint: "#d9a441",
    kind: "deliver", pick: 1262, drop: 1816, dropName: "Vythiri chantha", cargo: "Meen kotta", pay: 250, pace: 17,
    offer: "Mone, ee meen kotta Vythiri chanthayil ethikkamo? Pettannu venam, alle ice okke urugum!",
    done: "Ente ponnu mone! Meen fresh aayi ethi. Ithaa ₹250, oru chaya kudicho.",
    fail: "Ayyo, meen okke cheenju! Ini aarum vangilla…",
  },
  {
    id: "kunjappan", who: "Kunjappan", role: "KSRTC conductor · Pookode", initials: "KP", tint: "#c8502e",
    kind: "passenger", pick: 1494, drop: 2188, dropName: "Chundale junction", cargo: "Ammachi", pay: 300, pace: 13, crashes: 1,
    offer: "Bus-inte tyre poyi, mone. Ee ammachiye Chundale vare onnu kondu vidamo? Pathukke odikkanam, ketto!",
    done: "Ammachi safe aayi ethi! Nee nalla payyan aanu. ₹300 ithaa.",
    fail: "Samayam kazhinju. Ammachi aduthu vanna bus-il kayari poyi.",
    crashed: "Ammachi pedichu irangi! Ingane aano vandi odikkunnathu?",
  },
  {
    id: "varghese", who: "Varghese saar", role: "Forest guard · Vythiri", initials: "VS", tint: "#5e8a4a",
    kind: "deliver", pick: 1836, drop: 2752, dropName: "Kalpetta forest office", cargo: "File", pay: 350, pace: 19,
    offer: "Kalpetta office-il ee file ethikkanam. DFO saar kaathirikkunnu, late aayal ente pani pokum!",
    done: "Kruthyam samayathu! Ithaa ₹350 eduthho. Joli bakki undu, pinne kaanam.",
    fail: "Samayam kazhinju… DFO saar ippo enne vilikkum. Pokkoo.",
  },
  {
    id: "shibu", who: "Shibu", role: "Photographer · Chundale", initials: "SH", tint: "#6f8fb7",
    kind: "passenger", pick: 2206, drop: 2770, dropName: "Kalpetta kalyana mandapam", cargo: "Shibu + camera", pay: 400, pace: 18, crashes: 1,
    offer: "Kalyanam shoot-inu late aayi! Kalpetta vare pettannu, pakshe camera pottaruthu, lakshangal aanu!",
    done: "Muhurtham miss aayilla! Ninte photo-yum album-il idaam. ₹400 ithaa.",
    fail: "Kettu kazhinju, njan ethiyilla… ini enikku joli kittilla.",
    crashed: "Ente camera! Ithu ini aaru nannakkum? Irangikko, njan nadannu pokaam.",
  },
  {
    id: "tourists", who: "Tourist family", role: "From Bengaluru · Lakkidi viewpoint", initials: "TF", tint: "#b7607a",
    kind: "passenger", pick: 1300, drop: 1478, dropName: "Pookode Lake gate", cargo: "Tourist family", pay: 200, pace: 12, crashes: 2,
    offer: "Chetta, Pookode Lake vare onnu kondu pokamo? Taxi vannilla. Pillerokke urangunnu, pathukke ketto!",
    done: "Super view! Thank you chetta. Ithaa ₹200, kuttikalkku ice cream vangikko ennu parayanda!",
    fail: "Late aayi… boating time kazhinju. Next time nokkaam.",
    crashed: "Pillerellaam unarnnu karayunnu! Njangal ivide irangikkolaam.",
  },
  {
    id: "babu", who: "Babu chettan", role: "Chaya kada · Vythiri", initials: "BC", tint: "#a0522d",
    kind: "deliver", pick: 1790, drop: 2180, dropName: "Chundale bus stop", cargo: "Chaya flask", pay: 200, pace: 20,
    offer: "Chundale bus stop-il driver-mar chaya kaathu nikkunnu. Choodu pokunnathinu munne ethikkanam, mone!",
    done: "Nalla choodu chaya, kruthya samayathu! Ithaa ₹200.",
    fail: "Chaya thanuthu poyi… ini aarum kudikkilla.",
  },
  {
    id: "suhara", who: "Suhara itha", role: "Bakery · Vythiri", initials: "SI", tint: "#d77fa1",
    kind: "deliver", pick: 1868, drop: 2725, dropName: "Kalpetta birthday veedu", cargo: "Birthday cake", pay: 450, pace: 16, crashes: 0,
    offer: "Mole-de birthday cake aanu, Kalpetta-yil ethikkanam. Oru idi polum paadilla, cake veenaal theernnu!",
    done: "Cake perfect! Kuttikal ellaam happy. Ithaa ₹450 eduthho.",
    fail: "Party kazhinju… ini cake aarkku venam?",
    crashed: "Ayyo, cake mosham aayi! Ini enthu cheyyum…",
  },
  {
    id: "rafeeq", who: "Rafeeq", role: "Auto driver · Chundale", initials: "RF", tint: "#e0b43a",
    kind: "passenger", pick: 2160, drop: 2766, dropName: "Kalpetta bus stand", cargo: "Rafeeq-inte passenger", pay: 350, pace: 17, crashes: 1,
    offer: "Ente auto-de axle poyi! Ee saar-inu Kalpetta stand-il ninnu Bangalore bus pidikkanam. Onnu ethikkamo?",
    done: "Bus kitti! Saar happy, njanum happy. Ithaa ₹350.",
    fail: "Bangalore bus poyi… saar ini naale pokum.",
    crashed: "Saar pedichu irangi! Ithu auto alla, rocket aano?",
  },
];
