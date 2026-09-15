/**
 * Closing a household for good.
 *
 * The other half of taking money for something children write in. COPPA's
 * consent has to be revocable, and "revocable" means a button, not an email
 * address somebody answers when they get round to it — so this exists whether
 * or not anybody ever presses it.
 *
 * It is also the most destructive thing in the application by a wide margin, so
 * the rule about who may press it and what they have to type is a plain
 * function here rather than four lines inside the action. The refusals are the
 * part worth testing, and a refusal that can only be reached by actually
 * deleting a family in a browser is a refusal nobody tests twice.
 */

export type CloseVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Whether this person may close this household, having typed what they typed.
 *
 *   - **The `OWNER` alone.** A `PARENT` may invite, reset a child's password
 *     and put a sheet right; none of those is reversible-in-principle the way
 *     this is not. Whoever answers for the family answers for this.
 *
 *   - **Not a platform administrator from the family's own screen.** They can
 *     already do far more from `/admin`, and an operator who wanders onto a
 *     family's settings while supporting them should not find a working button
 *     that ends the family. This is the one place `everywhere` makes somebody
 *     *less* able to act, and that is deliberate.
 *
 *   - **The household's name, typed out.** The same idiom as resetting an
 *     adventurer, and for the same reason: a confirmation somebody can click
 *     through without reading is not a confirmation. Typing the name means
 *     having read which family this is, which is the actual failure mode —
 *     an administrator with two tabs open, not a person who did not mean it.
 */
export function mayCloseHousehold(input: {
  actor: { householdRole: string | null; everywhere: boolean };
  householdName: string;
  typed: string;
}): CloseVerdict {
  const { actor, householdName, typed } = input;

  if (actor.everywhere) {
    return {
      ok: false,
      reason:
        "You run this installation, so this is not the screen for it — a household is closed by " +
        "whoever answers for it, or from the administration screens.",
    };
  }

  if (actor.householdRole !== "OWNER") {
    return {
      ok: false,
      reason: "Only whoever answers for this family can close it.",
    };
  }

  // Trimmed and case-folded. Somebody who has typed the name has read the name;
  // insisting they also match its capitals is a puzzle rather than a safeguard.
  if (typed.trim().toLocaleLowerCase() !== householdName.trim().toLocaleLowerCase()) {
    return {
      ok: false,
      reason: `Type the family's name exactly — ${householdName} — to confirm.`,
    };
  }

  return { ok: true };
}

/**
 * What closing takes with it, in the words a person needs before pressing it.
 *
 * Kept beside the rule so the screen and the consequence cannot drift apart:
 * this list is what the action actually does, and if one changes the other has
 * to be edited in the same file.
 */
export const WHAT_GOES = [
  "every adventurer this family has built, and everything they earned",
  "every adventure, including the whole of each story as it was told",
  "the adventures this family wrote, unless they were shared with everybody",
  "every sign-in in this family, including the children's",
  "the subscription, which is cancelled at the payment processor separately",
];

/**
 * What survives, which matters as much and is easier to get wrong.
 *
 * A family agreeing to adventure with another one does not get to delete the
 * other family's evening. An adventure *this* household started is theirs and
 * goes; one another household started, which one of these adventurers merely
 * travelled in, is not theirs to end — that story stays, missing a member of
 * its party, which is the honest outcome.
 */
export const WHAT_STAYS = [
  "adventures another family started, which yours joined — those are theirs",
  "any adventure of yours that was shared with every family on this server",
];
