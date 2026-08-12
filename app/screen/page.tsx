import type { Metadata } from "next";
import { ScreenDisplay } from "@/components/screen/display";

export const metadata: Metadata = {
  title: "Hearthlight on the big screen",
  description: "Shows one adventure, for everyone at the table to see.",
};

/**
 * The television.
 *
 * Reachable by typing the address into a smart TV's browser once, and then
 * never touched again — so it takes no parameters, needs no sign-in, and has
 * nothing to navigate to. Whether it shows a pairing code or an adventure is
 * decided entirely by whether anybody has adopted it, which is a question only
 * the client can answer because only the client has the token.
 */
export default function ScreenPage() {
  return <ScreenDisplay />;
}
