/**
 * "Buy Me a Chaya": players can chip in for the game's development on Buy Me a Coffee. It's an outside page, opened in
 * a new tab; the game itself never takes payments or payment details, and stays free to play. Every support button
 * (components/ui/SupportButton) links here, so this is the one place to set the page.
 */
export const SUPPORT_URL = "https://buymeacoffee.com/nitheeshwo1";

/** Pay by UPI, beside Buy Me a Chaya (components/ui/SupportButton UpiButton): opens the player's own UPI app (Google
 * Pay, PhonePe, Paytm, BHIM) with this ID filled in; the game never sees the payment. The ID is public on the site.
 * `qr`: the bank app's own QR for this ID, for computers (public/…), or "" until there is one. Not in the iPhone app. */
export const UPI = { id: "nidheesh617@federal", name: "Drive Wayanad", note: "Chaya for Drive Wayanad", amounts: [20, 50, 100], qr: "" };
export const upiLink = (amount?: number) =>
  `upi://pay?pa=${UPI.id}&pn=${encodeURIComponent(UPI.name)}${amount ? `&am=${amount}` : ""}&cu=INR&tn=${encodeURIComponent(UPI.note)}`;
