# Explore Wayanad — Single-Page Scroll Storyboard

Oct 19, 2026 · @nidheesh

## Concept & structure

The whole page is one drive: up the Thamarassery Churam from Kozhikode, across the forest road, into the sanctuary, down to the river and the falls, ending at night. Scroll is the accelerator. Eight acts, each a pinned section driven by one master GSAP timeline; a persistent 3D canvas behind the DOM carries camera, fog and light between them.

**Audience:** Indian expats in Dubai planning a 3–7 day Kerala trip, mostly on iPhone, often first-time visitors to Wayanad. They fly Dubai → Kozhikode (CCJ) and drive up. The page should feel like a trailer for that drive.

**Tone:** quiet, cinematic, honest. Real facts (timings, closures, rules) stated plainly. No stock-travel superlatives. Respectful of the forest and the people who live there.

| # | Act | Beat | Scroll length |
| --- | --- | --- | --- |
| 0 | Pre-roll | Dubai → Kozhikode → Adivaram as three timestamps, not scroll-driven | — |
| 1 | Thamarassery Churam | Adivaram, nine hairpins, mist thickens, Lakkidi reveal | 25% |
| 2 | Lakkidi to Kalpetta | Chain Tree, Vythiri, Pookode, the hub and its three roads | 8% |
| 3 | Soochipara Falls | South detour: walk down, vertical reveal, sound | 10% |
| 4 | Kuruva Island | North detour via Pulpally: raft crossing on the Kabini, stillness | 10% |
| 5 | Edakkal Caves | East: the climb, 6,000-year-old carvings, quiet | 7% |
| 6 | Sulthan Bathery | Brief: the town, then the forest gate | 3% |
| 7 | Forest road | NH766 through teak and bamboo, elephant crossing | 8% |
| 8 | Muthanga sanctuary | Safari strip, species, then the Moolehole checkpost: Kerala ends here. The close. | 8% |
| 9 | Stay | Treehouses, homestays, resorts grid | 8% |
| 10 | Night | Fireflies, stars, campfire | 5% |
| 11 | Plan your trip | Flights, seasons, itineraries, enquiry | 8% |

Chembra Peak, Edakkal Caves, Banasura Sagar and Meenmutty go on inner `/destinations/[slug]` routes, not the one-pager. The one-pager is the brochure; the routes carry depth and SEO.

Order is geographic, in the sequence a visitor actually drives it from the airport. Chembra and Banasura stay on inner routes; Edakkal earns a short act because it lies on the road to Bathery and nearly everyone stops there.

## Act 1 — Thamarassery Churam

The spine of the page. Scroll climbs the 14 km ghat from Adivaram to Lakkidi View Point through nine numbered hairpins on NH766, rising to roughly 1,000 m ([Wikipedia](https://en.wikipedia.org/wiki/Thamarassery_Churam), [Kerala Tourism](https://keralatourism.org/destination/thamarassery-churam-unique/715)).

**Facts to use**

- 14 km, nine hairpins, Adivaram (Kozhikode side) to Lakkidi (Wayanad side). Normal climb 40–45 min; two hours on holiday weekends ([Onmanorama](https://onmanorama.com/travel/travel-news/2024/04/13/thamarassery-ghat-road-heavy-traffic-holiday-travellers.html)).
- The pass was opened in the 1700s with the help of Karinthandan, a Paniya tribal guide. The Chain Tree at Lakkidi, 1 km from the viewpoint, carries his legend.
- Lakkidi is the gateway to Wayanad and one of the wettest places in India; expect fog for much of June–September.
- Monsoon landslips do close the road; in August 2025 it shut indefinitely after slips near the ninth bend. The site should show a live status chip, not promise the road is open.

**Storyboard**

*Pre-roll (about 5 s, not scroll-driven):* black screen, three timestamps fade in one after another — “Dubai 06:40 · Kozhikode 12:05 · Adivaram 13:30” — then the sound of a car door closing. It frames the page as the visitor's own journey and covers the 3D scene's load. The first scroll starts the climb at Adivaram: ground level, the road sign, hairpin 1 ahead, warm light.

| Beat | Frame | Copy | Motion & atmosphere |
| --- | --- | --- | --- |
| Hairpin 1–3 | Low, warm, dense green. Road sign “1/9”. | “Four hours from Dubai to Kozhikode. Then the mountain.” | Camera on the road spline, slow steady climb. Clear air, long shadows. Hairpin counter ticks. |
| Hairpin 4–6 | Rock face, roadside waterfalls, first mist. | “The British needed a Paniya guide to find this road. His name was Karinthandan.” | Fog density ramps 0 → 0.5. Godrays through canopy. Monsoon mode: waterfalls on the cut face. |
| Hairpin 7–8 | Fog at full density, headlights, guard rail only. | “Lakkidi gets more rain than almost anywhere in India. You will not see the top until you are there.” | Fog 0.5 → 0.9, scene nearly white. Audio: engine, rain. Scroll scrub slows (longer pin). |
| Hairpin 9 → Lakkidi | Mist breaks. The valley opens behind, the plateau ahead. Title. | “Welcome to Wayanad.” | Fog 0.9 → 0.1 in one long ease. Camera lifts off the road into a drone shot. Title reveal with Shaders LightLeak. Chain Tree card appears. |

**Shaders components:** Fog (cursor-reactive on desktop), Godrays, FilmGrain, LightLeak, Vignette. VideoTexture for the mobile tier.

**Assets:** real terrain mesh from SRTM/Copernicus 30 m data, road spline traced from OpenStreetMap, 3–4 cut-out tree planes per hairpin, one hero drone clip of the hairpins at dawn and one in monsoon mist. The Lakkidi reveal shot is the single most important asset on the site.

**Mobile tier:** the same scroll story scrubbed over a pre-rendered drive video; counter, copy and title stay live in the DOM.

## Act 2 — Lakkidi to Kalpetta

The breath after the climb. Fifteen kilometres of flat plateau road from Lakkidi through Vythiri to Kalpetta, the district headquarters and the hub most visitors base themselves in. This act teaches the map without showing one.

**Storyboard**

| Beat | Frame | Copy | Motion & atmosphere |
| --- | --- | --- | --- |
| Chain Tree | The ficus with the iron chain, 1 km past the view point. | “Karinthandan showed the British the way up. They killed him so he couldn't show anyone else. The chain holds his ghost to the tree.” | Camera slows, a short hold. Light mist, FilmGrain. One beat of stillness after the reveal. |
| Vythiri | Tree houses in the canopy, resort signs, the road under tall trees. | “Vythiri is where the tree houses are. Book one night here, not all of them.” | Steady drive, dappled Godrays. |
| Pookode Lake | A glimpse of the lake through trees, pedal boats. | “Pookode: a lake shaped like India, if you squint. Good for an hour.” | Quick side glance, the road keeps moving. |
| Kalpetta hub | The road flattens into town. Three signposts fan out. | “Kalpetta. Everything is under an hour from here.” Then three cards: South — tea, peaks, falls · East — caves, Bathery, the forest · North — the dam, the island, the temples. | Camera rises to a low aerial. The three cards animate out along their real compass directions. Audio: town, horns, a bus. |

**Shaders components:** Godrays, FilmGrain, light Fog on the Chain Tree beat.

**Assets:** Chain Tree stills, a short drive clip under the Vythiri canopy, a Kalpetta aerial at dusk.

**Why it's here:** without this beat the page jumps between places and the visitor never learns that Wayanad is a hub with three roads. With it, the rest of the page reads as a route.

## Act 3 — Soochipara Falls

Sound and energy return. Soochipara (Sentinel Rock Waterfalls) is a three-tier fall of about 200 m in the Vellarimala range, 13 km from Meppadi and 23 km from Kalpetta, reached by a 1.2 km walk down from the ticket gate ([Wikipedia](https://en.wikipedia.org/wiki/Soochipara_Falls), [The Woods](https://thewoodsresorts.com/blogs/all-about-soochipara-waterfalls-wayanad)).

**Facts to use**

| Item | Detail | Source |
| --- | --- | --- |
| Height | About 200 m, three tiers; the name means “needle rock” | Wikipedia |
| Walk | 1.2 km down from the gate, 10–15 min; the climb back is the hard part. Carry water. | Wikipedia |
| Hours | 9 am to 4:30–5 pm; sources vary. Verify at build time. | [TravelTriangle](https://traveltriangle.com/blog/soochipara-waterfalls/) |
| Entry | ₹80 per person, ₹50 camera fee (2025–26 figures) | TravelTriangle |
| Swimming | Allowed in the plunge pool in low-flow months; often suspended in July–August and whenever the district bans entry to water bodies | [StayVista](https://www.stayvista.com/blog/7-wayanad-waterfalls-soochipara-meenmutty-more/) |
| Closures | Shut during monsoon alerts; reopened 2 Aug 2025 after landslide-risk curbs, with a standing order against entering water near the falls | [Onmanorama](https://www.onmanorama.com/news/kerala/2025/08/02/wayanad-lifts-ban-on-tourism-centres.amp.html) |
| Nearby | Kanthanpara (8 km from Meppadi, short walk, free); Meenmutty (2 km forest trek, ₹40 + guide) | StayVista |

**Storyboard**

| Beat | Frame | Copy | Motion & atmosphere |
| --- | --- | --- | --- |
| The walk | Tea estate path, then forest steps going down. You hear it before you see it. | “Thirteen kilometres from Meppadi. Then 1.2 km on foot, downhill. You hear it long before you see it.” | Forward motion down the path. Audio volume ramps 0 → 0.7 with scroll. ProgressiveBlur ahead. |
| The reveal | Full three-tier fall, vertical frame. | No copy. | Vertical scroll for a vertical subject: camera tilts up from the plunge pool to the top, then back down with the water. Water shader on the pool, fine mist particles, LightLeak when the sun hits the spray. |
| The pool | Boulders, people swimming at a distance, low flow. | “Swim when the flow is low. The district closes the water during alerts, and it means it.” | Hold. Ripples. Audio at full. |
| Monsoon toggle | Same frame, white water, brown pool. | “In monsoon the pool is off limits and the walk is leeches and rain. Come anyway.” | Grade swap, Water shader turbulence up, spray particles doubled. |
| Back up | Steps going up. | “The climb back is the real trek.” Kanthanpara and Meenmutty cards. | Slow upward drift, audio fades to 0.2. |

**Shaders components:** Water, Ripples, FloatingParticles (spray), LightLeak, ProgressiveBlur, FilmGrain.

**Assets:** path-level walk-in clip, one locked-off vertical shot of the full fall in dry and monsoon flow, plunge-pool drone orbit, ambient audio recorded on site.

**Mobile tier:** vertical video scrubbed by scroll, which is a natural fit for the phone. Keep audio opt-in.

## Act 4 — Kuruva Island

The page goes quiet. Kuruvadweep is a cluster of about 150 small islets over 950 acres in the Kabini river near Pulpally, uninhabited, dense evergreen, reached only by bamboo raft ([Kerala Tourism](https://www.keralatourism.org/malabar/kuruva-island/205), [Onmanorama](https://onmanorama.com/travel/celebrity-travel/2019/12/30/tovino-thomas-enjoys-zipline-kuruva-siland-wayanad.html)).

**Facts to use**

| Item | Detail | Source |
| --- | --- | --- |
| Season | Open roughly October–May. Closed every monsoon (June–September) when the Kabini rises; reopened 11 Sept 2025 | [Onmanorama, Sept 2025](https://www.onmanorama.com/travel/travel-news/2025/09/11/kuruva-islands-reopens.html) |
| Hours | 9 am entry; last entry varies by source (1 pm to 4:30 pm). Mondays closed per Kerala Tourism. Verify at build time. | Kerala Tourism |
| Daily cap | About 490 visitors: 244 via Pakkam, 245 via Palvelicham | [Onmanorama, 15 Sept 2025](https://www.onmanorama.com/news/kerala/2025/09/15/kuruva-islands-reopens-for-tourists.amp.html) |
| Entry (2025) | ₹247 per head; longer bamboo-raft ride extra | Onmanorama |
| Managed by | Forest Department's Vana Samrakshana Samithi with the DTPC | Onmanorama |
| Rules | No plastic, no food inside, stay on marked paths. Wild elephants use the islands in monsoon, which is why it closes. | Onmanorama |

Two entrances, Pakkam and Palvelicham, each with its own cap. Tell the visitor which one is nearer their stay.

**Storyboard**

| Beat | Frame | Copy | Motion & atmosphere |
| --- | --- | --- | --- |
| From above | Slow pull-back over the braided river, islets, a raft mid-crossing. | “The Kabini splits into a hundred and fifty islands. Nobody lives on them.” | Drone-style camera descent. Shaders Water with canopy reflections. Everything slow. Audio drops to water and birds. |
| The crossing | Raft level. Bamboo creaks, poles push off, the island approaches. | “The only way in is a bamboo raft. Fewer than five hundred people a day are allowed.” | Scroll pulls the raft across. Ripples trail behind. Camera fixed on the raft, island grows. |
| On the island | Dense green, filtered light, a bamboo path. | “Closed every monsoon. That's when the elephants come to swim.” | Godrays, light mist. Horizontal drift. |
| Rules | Simple card. | “No plastic. No food. Stay on the path. Mondays closed.” | Static DOM card. Season status chip (open / closed for monsoon). |

**Shaders components:** Water, Ripples, Godrays, FilmGrain. ProgressiveBlur at the frame edges to soften the canopy.

**Assets:** drone pull-back over the islets at dawn, raft-level crossing clip, bamboo path stills, one reflection shot of the canopy in still water.

**Mobile tier:** the two video clips scrubbed in sequence; the Water shader replaced by the real footage.

## Acts 5–6 — Edakkal Caves and Sulthan Bathery

East from Kalpetta, 28 km to Edakkal, then 14 km on to Sulthan Bathery and the forest gate. Edakkal is two natural rock chambers on Ambukuthi Mala at about 1,200 m, with petroglyphs from the Neolithic era, some dated to roughly 6000 BCE, plus later Tamil-Brahmi inscriptions ([Indian Holiday](https://www.indianholiday.com/kerala/wayanad/edakkal-caves.html), [Trawell](https://www.trawell.in/itineraries/kozhikode/5-day-trip/wayanad-nagarhole-coorg)).

**Facts to use**

| Item | Detail | Source |
| --- | --- | --- |
| Hours | 9 am to 4 pm. Closed Mondays and public holidays. Entry regulated at peak times. | Trawell, [Chalbanjare](https://chalbanjare.com/kerala/tourist-attraction/edakkal-caves) |
| Trek | About 1 km uphill from the car park, 380–400 steps, then narrow iron stairs between the two chambers. Allow 2–3 hours. | [PickYourTrail](https://pickyourtrail.com/blog/edakkal-cave) |
| Entry | ₹30–50 per adult reported; verify at build time | Chalbanjare |
| Chambers | Lower about 18 ft long; upper about 95 ft long and 18 ft high, where the carvings are | Trawell |
| Rules | No plastic bags or bottles inside; a deposit scheme exists at the gate | [Avadale](https://avadale.in/?p=13728) |
| Monsoon | Often closed in heavy rain; the path is slippery and the cave humid | Indian Holiday |
| Nearby | Wayanad Heritage Museum at Ambalavayal, 6 km, for context before or after | Trawell |

**Storyboard — Act 5, Edakkal**

| Beat | Frame | Copy | Motion & atmosphere |
| --- | --- | --- | --- |
| The climb | Steps cut into rock, people pausing, views opening behind. | “A kilometre of steps. Everyone complains at the halfway point. Everyone is glad at the top.” | Camera climbs in short pushes, pausing with the breath. Audio: footsteps, wind. |
| The slot | Light through the gap between two boulders. | “A stone wedged between two stones. That's what Edakkal means.” | Silhouette frame, Godrays through the slot. |
| The wall | The carvings, lit from the side. | “Someone carved these six thousand years ago. Nobody knows what they were saying.” | Engraving or Chalkboard shader over a photo of the wall, slowly resolving to the real image. Figures highlight one by one on scroll. |
| Rules card | — | “Closed Mondays. No plastic. Go early; they cap the crowd.” | Static DOM card. |

**Storyboard — Act 6, Sulthan Bathery (brief)**

Back on NH766, the road runs into Bathery: the Jain temple Tipu used as a battery, a busy market street, then the town thins and a forest checkpost appears. Copy: “Bathery is the last town. After this, the forest.” Two beats, 3% of scroll, a palate cleanser before the forest road. Audio shifts from town to cicadas.

**Shaders components:** Godrays, Engraving (or Chalkboard), FilmGrain, Vignette.

**Assets:** step-climb clip, the slot-of-light frame, a well-lit still of the petroglyph wall, Bathery street and Jain temple stills.

## Act 7 — The forest road

The transition from mist to canopy. NH766 runs east from Sulthan Bathery through the Muthanga range of Wayanad Wildlife Sanctuary and on into Bandipur in Karnataka; the protected forest stretch is about 20 km ([Wikipedia](<https://en.wikipedia.org/wiki/National_Highway_766_(India)>), [Trekgo](https://trekgo.in/blog/bangalore-to-wayanad-road-trip-via-bandipur)).

**Facts to use**

- Night traffic ban on the Bandipur–Muthanga forest stretch: 9 pm to 6 am, in force since 2009 and upheld by the Supreme Court in August 2019. Night detour is via Mananthavady–Kutta–Gonikoppal–Hunsur ([Onmanorama](https://www.onmanorama.com/news/kerala/2019/10/05/why-is-there-a-night-traffic-on-nh-766-bandipur-reserve-forest.amp.html), [Deccan Herald](https://www.deccanherald.com/india/bandipur-night-traffic-ban-key-to-saving-wildlife-688239.html)).
- Before the ban, 93 wild animal road deaths were recorded on the stretch between 2004 and 2009. This is the reason the road goes quiet at night; say so.
- Elephants, gaur, deer and langur cross the highway in daylight. Vehicles must not stop, feed or step out.
- The forest is teak, bamboo and moist deciduous; in summer it browns and opens up, in monsoon it closes over.

**Storyboard**

| Beat | Frame | Copy | Motion & atmosphere |
| --- | --- | --- | --- |
| Entering | Camera drops from the Lakkidi drone shot to road level. Trees close in on both sides, the road vanishes ahead. | “From here the road belongs to the forest.” | Three to four cut-out tree planes per side scrolling in parallax. Godrays through canopy. Fog resets to 0.1. |
| The straight | Long empty stretch, light shafts, dust in the air. | “Twenty kilometres of protected forest. Night traffic has been banned here since 2009. Ninety-three animals died on this road in the five years before.” | Steady forward motion. FloatingParticles for dust. Audio: cicadas, tyre on tarmac, one distant hornbill. |
| The crossing | An elephant steps onto the road ahead. | No copy. Then: “You are a guest here. Stay in the car.” | Scroll scrub eases to a halt over \~1.5 s regardless of scroll input, holds, then releases. The one moment on the page that takes control from the user. |
| Exit | Road opens, sanctuary gate ahead. | “Muthanga.” | Grade warms, trees thin, horizon returns. |

**Shaders components:** Godrays, FloatingParticles, FilmGrain, Vignette, ProgressiveBlur on the far road.

**Assets:** dashcam-style forward footage of the Muthanga stretch at golden hour, one clean elephant-crossing clip (licensed if not shot), tree cut-outs from stills.

**Mobile tier:** forward video scrubbed by scroll; the elephant pause is a timeline hold, so it works identically.

## Act 8 — Muthanga Wildlife Sanctuary and the border

From road to jeep. Wayanad Wildlife Sanctuary (344 km², established 1973, a Project Elephant site since 1991–92) is Kerala's second-largest sanctuary and links Bandipur, Nagarhole and Mudumalai in the Nilgiri Biosphere Reserve. Muthanga is its main ecotourism gate, 14–16 km east of Sulthan Bathery ([Kerala Tourism](https://www.keralatourism.org/ecotourism/trekking-programs/muthanga-jeep-safari/28)).

**Facts to use**

| Item | Detail | Source |
| --- | --- | --- |
| Safari slots | Morning 7–10 am (40 vehicles), afternoon 3–5 pm (20 vehicles) | [Kerala Tourism](https://www.keralatourism.org/ecotourism/trekking-programs/muthanga-jeep-safari/28) |
| Duration | About two hours, 15–16 km loop, forest guide on board | Kerala Tourism |
| Booking | Online via the Wayanad Wildlife Sanctuary website since Oct 2024; counter tickets also sold | [Onmanorama, Oct 2024](https://onmanorama.com/travel/kerala/2024/10/04/wayanad-tourism-muthanga-tholpetti-eco-tourism.html) |
| Entry (2024) | ₹300 adult, ₹150 child; jeep hire extra. Bus safari also runs. Verify at build time. | Onmanorama |
| Closures | Activities were suspended Feb–Oct 2024 by the High Court after a fatal elephant encounter at Kuruva, then resumed with restrictions. Expect occasional closures. | Onmanorama |
| Sightings | Elephant, gaur, spotted deer, sambar, langur, peacock common. Tiger and leopard rare. | Kerala Tourism |
| Contact | Muthanga +91 4936 271015 / +91 99472 71015; Tholpetty +91 79075 43321 | Kerala Tourism, Onmanorama |

Tholpetty, in the north near Mananthavady, is the sanctuary's second gate with the same slots. Mention it for guests staying that side.

**Storyboard**

| Beat | Frame | Copy | Motion & atmosphere |
| --- | --- | --- | --- |
| The gate | Jeep at the checkpost, early light, mist on grass. | “Two safaris a day. Forty jeeps in the morning, twenty in the afternoon. Book the first slot.” | Grade shifts warm and dry. Dust particle layer. Slow dolly in. |
| The strip | Wide panorama, grassland and teak. | A horizontal strip of sighting cards: elephant, gaur, deer, langur, peacock, with one card reading “Tiger — rare. Don't come for the tiger.” | Horizontal scroll pinned section. Cards parallax at different depths. FilmGrain. |
| Honest note | Back in the jeep, looking out. | “Sightings are luck. The forest does not perform.” | Hold, then a slow pull back. |
| Booking | Card with slots, prices and the official booking link. | “Book directly with the Forest Department. We don't take a cut.” | Static DOM card over the canvas. |

**The border — final frame of the journey**

| Beat | Frame | Copy | Motion & atmosphere |
| --- | --- | --- | --- |
| The checkpost | Back on NH766 after the safari. The Moolehole interstate checkpost, a barrier, a forest board: Karnataka ahead, Bandipur beyond. | “Kerala ends here. The road goes on to Bandipur and Mysore, but Wayanad stops at this barrier.” | Camera slows to a halt at the barrier. Fog thin, late light. Audio drops to wind and one bird. |
| Turn around | The camera pivots 180° to face back west: the whole road you came up, the Ghats on the horizon. | “Ninety kilometres from Adivaram. You have crossed Wayanad.” A small hairpin counter reads 9/9 and a route line draws itself across the screen, Adivaram to Muthanga. | One long easing rotation. The route line is the only time a map appears on the page. |
| Exit | The barrier stays closed. Dusk begins. | “Now stay a while.” | Grade warms toward the Stay act. NoiseDissolve into dusk. |

Ending at the border is deliberate: it closes the drive as a complete crossing, reminds the visitor the forest belongs to the animals (the night ban begins here), and hands off naturally to Stay and Night.

**Shaders components:** FloatingParticles (dust), FilmGrain, Vignette, TiltShift on the panorama.

**Assets:** one wide dawn panorama of the Muthanga grassland, five to six clean wildlife stills (own or licensed), jeep interior clip.

**Design rule:** no close-ups of people near elephants, no feeding, no off-road shots. The site should model the behaviour the Forest Department asks for.

## Acts 9–11 — Stay, Night, Plan your trip

The falls are the last set piece. The page now settles the visitor and converts.

**Act 9 — Stay (8%)**

| Beat | Frame | Copy | Motion |
| --- | --- | --- | --- |
| Dusk | Camera rises from the Soochipara valley over tea estates at golden hour, lights coming on in a treehouse. | “Sleep in the trees, in a planter's bungalow, or in someone's home.” | Slow drone rise, grade shifts to amber. Lights twinkle on (Sparkle). |
| Grid | Three categories: treehouses, plantation stays and resorts, homestays. Six to nine cards. | Each card: name, area (Vythiri / Meppadi / Sulthan Bathery / Mananthavady), what it's for, price band, link. | Hover reveal with image displacement; tap on mobile. Cards from Supabase. |
| Honest note | — | “We list places we'd send our own family. Book direct where you can.” | — |

Monetisation decision pending: affiliate links, your own curated packages, or lead-gen to operators. The card layout works for all three.

**Act 10 — Night (5%)**

The emotional close. Camera settles at a campfire outside a treehouse; the sky fills with stars, fireflies drift at the forest edge, a distant elephant trumpet. Copy: “Nothing to do after nine. That is the point.” FloatingParticles for fireflies, Nebula or a star-field for the sky, Vignette heavy. Audio: crickets, fire. Scroll is slow and nearly still. Fireflies peak around April–May in Wayanad; note it in the seasons table.

**Act 11 — Plan your trip (8%)**

Static, server-rendered, SEO-friendly. No canvas behind it.

*Getting there from Dubai*

| Leg | Detail | Source |
| --- | --- | --- |
| Flight | DXB (T2) → CCJ Kozhikode, non-stop, about 3 h 55 min. flydubai flies three times a week; Air India Express and IndiGo also serve the route (verify schedules at build time). | [flydubai](https://flydubai.com/en-in/flights-from-dubai-to-kozhikode) |
| Drive | CCJ → Kalpetta roughly 100 km, 3 hours via Thamarassery and the churam; 4–5 hours on holiday weekends. Pre-book a taxi; night driving on the ghat in monsoon is not advised. | approximate |
| Alternative | Kannur (CNN) has Gulf flights and reaches Mananthavady in about 2.5 h without the churam. Useful when the ghat is closed. | approximate |

*Seasons*

| Months | What you get | What's closed |
| --- | --- | --- |
| Oct–Feb | Cool, clear, best wildlife and views. Peak season. | Nothing; book early. |
| Mar–May | Hot, dry, fireflies, low waterfalls, easy swimming. | Chembra trek sometimes closed for fire risk. |
| Jun–Sep | Monsoon. Mist, full waterfalls, empty roads, cheap stays. | Kuruva closed; waterfalls and treks closed during alerts; ghat may close after slips. |

*Itineraries (cards linking to `/itineraries/[slug]`)*

- 3 days: churam, Lakkidi, Pookode, Soochipara, Edakkal, Muthanga morning safari.
- 5 days: add Kuruva, Banasura Sagar, Chembra, a plantation stay.
- 7 days: add Tholpetty, Thirunelli, Pakshipathalam, a slow day.

*Enquiry*

WhatsApp button (UAE number), a short form (dates, group size, interests) to Supabase, and a “best time for me” picker that reads the seasons table. No chatbot.

## Technical architecture

&#91;embedded content: architecture · scroll drives three render layers over one data stack\]

Scroll is the single source of truth. Lenis smooths it, one GSAP ScrollTrigger timeline turns it into a 0–1 progress per act, and the DOM, the 3D canvas and the shader layers all read that value. The tier switch decides how much of the visual stack renders; the DOM and copy never change, so SEO and content are identical on a weak phone.

**Stack**

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15, TypeScript, SCSS modules | Already in the project; App Router for SSR inner routes |
| Scroll | Lenis + GSAP ScrollTrigger + `useGSAP` | Scrub, pin, and proper cleanup in React |
| 3D | React Three Fiber + Drei, Theatre.js for the camera path | One persistent `<Canvas>`; camera keyed to scroll |
| Shaders | `shaders` npm package (WebGPU) | Fog, Water, Godrays, FilmGrain, transitions as React components; MCP and skill for Claude Code |
| Patterns | Animmaster Lib snippets | Reference for scroll choreography, text reveals, nav, page transitions; port, don't paste |
| Terrain | SRTM / Copernicus 30 m DEM → Blender → Draco GLB | Real churam geometry at low poly |
| Road | OpenStreetMap trace → Catmull-Rom spline | Camera path and hairpin counter |
| Content | Supabase | Destinations, stays, itineraries, enquiries, status chips |
| Media | Cloudinary | Video with poster frames, responsive images; KTX2 textures self-hosted |
| Hosting | Vercel | ISR for inner routes, edge for status chips |
| Audio | Howler.js, opt-in, muted by default | Ambient per act, volume keyed to scroll |

**Rules**

- Capability check at load: `navigator.gpu`, device memory, a 1-second frame-rate probe. Not `window.innerWidth`.
- Mobile tier = the same acts over scroll-scrubbed video. Render each act's drive once from the desktop scene, or use real footage.
- `prefers-reduced-motion` gets static frames and fades.
- Budget: initial JS under 300 KB gzipped, hero LCP under 2.5 s on 4G, 60 fps scrub on a mid-range Android, total page under 3 MB before video.
- Inner routes (`/destinations/[slug]`, `/itineraries/[slug]`, `/stays/[slug]`) are plain SSR pages with light motion. The one-pager links down into them.
- Live status chips (ghat open, Kuruva open, alerts) read a small Supabase table you update by hand or from a feed; never hard-code “open”.

## Asset shot list & sources

Five shoots carry the whole site. Everything else can be licensed or built. The Lakkidi reveal is the one shot that cannot be substituted.

**Priority shoot list (own drone + camera)**

| # | Shot | Act | Notes |
| --- | --- | --- | --- |
| 1 | Churam hairpins from above, dawn, following the road up to Lakkidi, mist breaking at the top | 1 | 4K, 30 fps, slow. Shoot twice: dry season and monsoon. Drone permissions required near the forest; check with the local station. |
| 2 | Dashcam forward drive through the Muthanga forest stretch, golden hour | 2 | Gimbal on the dash, no cuts, 10 minutes raw. |
| 3 | Muthanga grassland panorama at dawn from the jeep | 3 | Wide, locked off. Plus 5–6 wildlife stills with a long lens. |
| 4 | Kuruva drone pull-back over the islets, raft-level crossing | 4 | Needs DTPC/VSS permission for drone over the river. |
| 5 | Soochipara locked-off vertical of the full fall, plunge-pool orbit, walk-in clip, ambient audio | 5 | Vertical 9:16 for the mobile tier. Record 5 minutes of clean audio. |
| 6 | Treehouse at dusk, lights on; campfire and sky at night | 6–7 | Needs a host's permission. Long exposure for stars. |

**Licensed or stock (fallback)**

- Elephant crossing on the highway: license from a Kerala wildlife filmmaker rather than stage it.
- Monsoon churam footage if the monsoon shoot slips.
- Wildlife stills from a Wayanad photographer with credit.

**Built from data**

| Asset | Source | Pipeline |
| --- | --- | --- |
| Churam terrain | SRTM 30 m or Copernicus GLO-30 DEM, tile around 11.50°N 76.02°E | QGIS clip → heightmap PNG → Blender displace → decimate → Draco GLB under 2 MB |
| Road spline | OpenStreetMap, NH766 way between Adivaram and Lakkidi | Overpass export → GeoJSON → simplify → Catmull-Rom in R3F |
| Hairpin markers | Hand-placed on the spline at the nine bends | JSON of t-values 0–1 |
| Tree planes | Cut-outs from your own stills | PNG with alpha, 3–4 depth layers per side |
| Skybox | HDRI shot on site or a licensed overcast Western Ghats HDRI | KTX2 compressed |

**Audio**

Record on site at each location: engine and rain on the churam, cicadas and hornbill on the forest road, water at Kuruva and Soochipara, crickets and fire at night. Stock ambience sounds wrong next to real footage.

**Rights**

Keep a sheet of every clip, who shot it, licence, and where it's used. Credit photographers on an `/about` page.

## Build plan

&#91;embedded content: build plan · 5 phases, 3 gates, about 12 weekends\]

Roughly three months of weekends from late October 2026, which lands a soft launch around late January, inside the Oct–Feb peak season. The churam is the only real risk; everything after it is known patterns.

**Phase detail**

| Phase | Output | Done when |
| --- | --- | --- |
| 0 Story | This doc signed off, shot list agreed, drone permissions requested | You can describe every act in one sentence |
| 1 Skeleton | Next.js repo with Lenis + ScrollTrigger, eight pinned sections in flat colour, capability check stub | Scrolling the empty page already feels like the drive |
| 2 Churam | Terrain GLB, road spline, camera, fog, hairpin counter, Lakkidi reveal | 60 fps scrub on a mid-range Android, or the video tier is in place |
| 3 Other acts | Forest road, Muthanga, Kuruva, Soochipara, Stay, Night, each with its Shaders layers | Each act works on both tiers |
| 4 Ship | Supabase content, inner routes, enquiry flow, audio, reduced-motion, Lighthouse, analytics | Lighthouse ≥ 90 mobile, LCP < 2.5 s, no console errors |

**Risks**

- WebGPU coverage on iPhones in Dubai. Mitigation: the video tier is first-class, not a fallback.
- Drone permissions near the sanctuary and the river. Mitigation: ask early; license footage if refused.
- Scope creep in Act 3. Mitigation: one act per weekend, no new acts until Ship.
- Stale facts (prices, timings, closures). Mitigation: every number in this doc is marked “verify at build time” and lives in Supabase, not in code.

**Open decisions**

- [ ] Photography: own shoot over the December holidays, or license first and reshoot later?
- [ ] Monetisation: affiliate stay links, own packages, or lead-gen to operators?
- [ ] Language: English only at launch, Malayalam toggle later? Arabic is not needed for this audience.
- [ ] Domain and brand name: keep “Explore Wayanad” or pick something ownable?
- [ ] Analytics: Vercel Analytics only, or add PostHog for scroll-depth per act?

**Sources**

[Wikipedia — Thamarassery Churam](https://en.wikipedia.org/wiki/Thamarassery_Churam) · [Kerala Tourism — Churam](https://keralatourism.org/destination/thamarassery-churam-unique/715) · [Onmanorama — ghat traffic](https://onmanorama.com/travel/travel-news/2024/04/13/thamarassery-ghat-road-heavy-traffic-holiday-travellers.html) · [Wikipedia — NH766](<https://en.wikipedia.org/wiki/National_Highway_766_(India)>) · [Onmanorama — night ban](https://www.onmanorama.com/news/kerala/2019/10/05/why-is-there-a-night-traffic-on-nh-766-bandipur-reserve-forest.amp.html) · [Kerala Tourism — Muthanga safari](https://www.keralatourism.org/ecotourism/trekking-programs/muthanga-jeep-safari/28) · [Onmanorama — safari resumes 2024](https://onmanorama.com/travel/kerala/2024/10/04/wayanad-tourism-muthanga-tholpetti-eco-tourism.html) · [Kerala Tourism — Kuruva](https://www.keralatourism.org/malabar/kuruva-island/205) · [Onmanorama — Kuruva reopens 2025](https://www.onmanorama.com/news/kerala/2025/09/15/kuruva-islands-reopens-for-tourists.amp.html) · [Wikipedia — Soochipara](https://en.wikipedia.org/wiki/Soochipara_Falls) · [Onmanorama — tourism curbs lifted Aug 2025](https://www.onmanorama.com/news/kerala/2025/08/02/wayanad-lifts-ban-on-tourism-centres.amp.html) · [flydubai — DXB to CCJ](https://flydubai.com/en-in/flights-from-dubai-to-kozhikode)
