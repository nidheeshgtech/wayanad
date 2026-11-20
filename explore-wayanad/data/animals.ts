/**
 * The animal sticker book: the animals you can spot from the road, each a sticker once you've honked at it in view
 * (components/scene/Animals; lib/stickers). Real Wayanad animals, where they're really seen. Pictures: public/animals
 * (generated side views, not photos of real individuals); the elephant shares the forest road's cut-out.
 * `size`: height in metres as drawn (a little larger than life for the small ones, so children can find them).
 */
export type AnimalId = "macaque" | "langur" | "squirrel" | "peacock" | "hornbill" | "boar" | "deer" | "gaur" | "elephant";
export type Animal = { id: AnimalId; name: string; ml: string; img: string; size: number; where: string; fact: string; soon?: boolean };

export const ANIMALS: Animal[] = [
  { id: "macaque", name: "Bonnet macaque", ml: "ബോണറ്റ് കുരങ്ങ്", img: "/animals/macaque.webp", size: 0.6, where: "On the walls at the hairpins", fact: "Named for the cap of hair on its head. Troops sit on the churam's walls watching the traffic." },
  { id: "langur", name: "Nilgiri langur", ml: "കരിങ്കുരങ്ങ്", img: "/animals/langur.webp", size: 1.3, where: "On the forest bank between the hairpins", fact: "A black monkey with a golden-brown head. It lives only in the Western Ghats." },
  { id: "squirrel", name: "Malabar giant squirrel", ml: "മലയണ്ണാൻ", img: "/animals/squirrel.webp", size: 1.1, where: "In the trees around Lakkidi", fact: "Its bushy tail is longer than its body. It leaps from tree to tree." },
  { id: "peacock", name: "Indian peafowl", ml: "മയിൽ", img: "/animals/peacock.webp", size: 1.4, where: "On the plateau road, Pookode to Chundale", fact: "India's national bird. Only the male has the long green train." },
  { id: "hornbill", name: "Great hornbill", ml: "മലമുഴക്കി വേഴാമ്പൽ", img: "/animals/hornbill.webp", size: 1.3, where: "High in a dead tree near Pookode Lake", fact: "Kerala's state bird. You can hear its wingbeats from far away." },
  { id: "boar", name: "Wild boar", ml: "കാട്ടുപന്നി", img: "/animals/boar.webp", size: 0.95, where: "On the plateau road, only at night 🌙", fact: "It comes out after dark and digs for roots with its snout." },
  { id: "deer", name: "Spotted deer", ml: "പുള്ളിമാൻ", img: "/animals/deer.webp", size: 1.3, where: "Muthanga forest road (coming soon)", fact: "It keeps its white spots all its life.", soon: true },
  { id: "gaur", name: "Gaur", ml: "കാട്ടുപോത്ത്", img: "/animals/gaur.webp", size: 1.9, where: "Muthanga forest road (coming soon)", fact: "The biggest wild cattle in the world, with white 'socks' on its legs.", soon: true },
  { id: "elephant", name: "Asian elephant", ml: "ആന", img: "/vegetation/elephant.webp", size: 2.9, where: "Muthanga forest road (coming soon)", fact: "Kerala's state animal. Herds cross the road at Muthanga.", soon: true },
];
export const animal = (id: AnimalId) => ANIMALS.find((a) => a.id === id)!;
