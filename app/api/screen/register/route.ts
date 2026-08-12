import { registerScreen } from "@/lib/game/screen";

export const dynamic = "force-dynamic";

/**
 * A television announces itself and is given a code to display.
 *
 * The one route in the application with no sign-in, which is the whole design:
 * the device asking is a TV with a remote control, and putting an account on it
 * is exactly what this feature exists to avoid.
 *
 * It is safe to leave open because of what it hands back — a token bound to a
 * row with no campaign on it. Until somebody signed in types the displayed code
 * into their own adventure, the token opens nothing at all. The worst an
 * abusive caller achieves is rows that point nowhere, and those are swept.
 */
export async function POST() {
  const { code, token } = await registerScreen();

  return Response.json(
    { code, token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
