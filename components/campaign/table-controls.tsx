import {
  movePartyMemberAction,
  removePartyMemberAction,
  setCampaignPausedAction,
} from "@/lib/game/party-actions";
import { SubmitButton } from "@/components/submit-button";

export type TableMember = {
  characterId: string;
  name: string;
  race: string;
  archetype: string;
  playedBy: string;
  yours: boolean;
};

/**
 * What the household running the adventure can change once it is under way.
 *
 * The party editor only ever handled the owner's own adventurers, and only
 * before the first scene — which was the right shape when an adventure was one
 * household at one screen. With other people in the party there has to be
 * somewhere to fix the ordinary things that go wrong: a cousin who joined the
 * wrong adventure, a turn order that puts the youngest last every time, and a
 * month away where nobody wants a half-answered round sitting open.
 *
 * Plain forms, no JavaScript: three of these are one press each, and the one
 * that is not — removing somebody — destroys nothing. The adventurer keeps
 * their level, their things and their ties, and the join code brings them back.
 */
export function TableControls({
  campaignId,
  members,
  status,
}: {
  campaignId: string;
  members: TableMember[];
  status: string;
}) {
  const paused = status === "PAUSED";
  const canPause = status === "ACTIVE" || paused;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {members.map((member, index) => (
          <div
            key={member.characterId}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-hearth-800/60 p-3"
          >
            <span className="text-hearth-500">{index + 1}.</span>

            <span className="min-w-0 flex-1">
              <span className="block text-hearth-100">
                {member.name}
                <span className="ml-2 text-sm text-hearth-400">
                  {member.race} {member.archetype}
                </span>
              </span>
              <span className="block text-sm text-hearth-500">
                {member.yours ? "yours" : member.playedBy}
              </span>
            </span>

            <form action={movePartyMemberAction}>
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="characterId" value={member.characterId} />
              <input type="hidden" name="direction" value="up" />
              <button
                type="submit"
                disabled={index === 0}
                aria-label={`Move ${member.name} earlier in the turn order`}
                className="rounded-lg border border-hearth-700 px-3 py-1.5 text-hearth-200 hover:bg-hearth-800/50 disabled:opacity-30"
              >
                ↑
              </button>
            </form>

            <form action={movePartyMemberAction}>
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="characterId" value={member.characterId} />
              <input type="hidden" name="direction" value="down" />
              <button
                type="submit"
                disabled={index === members.length - 1}
                aria-label={`Move ${member.name} later in the turn order`}
                className="rounded-lg border border-hearth-700 px-3 py-1.5 text-hearth-200 hover:bg-hearth-800/50 disabled:opacity-30"
              >
                ↓
              </button>
            </form>

            {members.length > 1 ? (
              <form action={removePartyMemberAction}>
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="characterId" value={member.characterId} />
                {/* Labelled with the name it acts on. Three buttons on this page
                    say "Remove" and one of them deletes the whole adventure, so
                    "which Remove?" must be answerable without counting rows —
                    by a screen reader, and by anything else that has to find
                    this button without looking at it. */}
                <button
                  type="submit"
                  aria-label={`Remove ${member.name} from the party`}
                  className="rounded-lg border border-hearth-700 px-4 py-2 font-medium text-hearth-200 transition-colors hover:bg-hearth-800/50"
                >
                  Remove
                </button>
              </form>
            ) : null}
          </div>
        ))}
      </div>

      <p className="text-sm text-hearth-400">
        The numbers are the order the storyteller hears everyone in. Removing somebody takes them
        out of this adventure only — they keep everything they have earned, and the join code brings
        them back.
      </p>

      {canPause ? (
        <div className="border-t border-hearth-800/50 pt-5">
          <h3 className="mb-1 text-sm font-medium text-hearth-200">
            {paused ? "This adventure is paused" : "Put it down for a while"}
          </h3>
          <p className="mb-3 text-sm text-hearth-400">
            {paused
              ? "Nobody can take a turn until you pick it up again. Everything is exactly where you left it."
              : "Stops turns being taken until you pick it up again, and puts away any round the party is part-way through answering."}
          </p>
          <form action={setCampaignPausedAction}>
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="paused" value={paused ? "false" : "true"} />
            <SubmitButton variant="secondary" pendingLabel={paused ? "Picking it up…" : "Pausing…"}>
              {paused ? "Pick it back up" : "Pause this adventure"}
            </SubmitButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}
