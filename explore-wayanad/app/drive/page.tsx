import { permanentRedirect } from "next/navigation";

/** The drive moved to the home page. */
export default function DrivePage() {
  permanentRedirect("/");
}
