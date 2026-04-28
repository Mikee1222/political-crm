import { redirect } from "next/navigation";

/** Old URL — canonical map lives at `/map`. */
export default function HeatmapRedirectPage() {
  redirect("/map");
}
