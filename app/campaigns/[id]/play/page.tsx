import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PlayClient } from "@/components/play/play-client";
import type { TranscriptEntry, DiceDetail } from "@/components/play/transcript";
import { STATS, STAT_INFO } from "@/lib/game/rules";
import { LevelPip } from "@/components/character/level-badge";

export const dynamic = "force-dynamic";

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const campaign = await db.campaign.findFirst({
    where: { id, ownerId: user.id },
    include: {
      storyline: { include: { acts: { orderBy: { index: "asc" } } } },
      party: { orderBy: { position: "asc" }, include: { character: true } },
      scenes: { orderBy: { index: "asc" } },
    },
  });
  if (!campaign) notFound();

  const openScene = campaign.scenes.find((scene) => scene.status === "OPEN");

  // Only the current scene is replayed in full. Earlier scenes are summarised
  // and shown as a recap, which is also exactly how the Game Master sees them.
  const turns = openScene
    ? await db.turnEvent.findMany({ where: { sceneId: openScene.id }, orderBy: { ordinal: "asc" } })
    : [];

  const namesById = new Map(campaign.party.map((member) => [member.characterId, member.character.name]));

  const entries: TranscriptEntry[] = turns.map((turn) => ({
    id: turn.id,
    type: turn.type,
    actorName: turn.actorCharacterId ? namesById.get(turn.actorCharacterId) : null,
    content: turn.content,
    dice: turn.type === "DICE_ROLL" ? ((turn.metadata as unknown as DiceDetail) ?? null) : null,
  }));

  // The metadata blob does not carry the character name; fill it from the party.
  for (const entry of entries) {
    if (entry.dice && entry.actorName) entry.dice.characterName = entry.actorName;
  }

  const recap = campaign.scenes.filter((scene) => scene.status === "CLOSED" && scene.summary);
  const act = campaign.storyline.acts.find((entry) => entry.index === campaign.currentActIndex);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Link href={`/campaigns/${campaign.id}`} className="text-sm text-hearth-300 underline hover:text-hearth-200">
          ← {campaign.title}
        </Link>
        {act ? (
          <p className="mt-2 text-sm tracking-[0.15em] text-hearth-400 uppercase">
            Chapter {act.index} · {act.title}
          </p>
        ) : null}
      </header>

      {/* Party status bar — sticky so a ten-year-old can always see their stats. */}
      <div className="sticky top-0 z-10 -mx-6 mb-8 border-b border-hearth-800/60 bg-hearth-950/90 px-6 py-3 backdrop-blur">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {campaign.party.map((member) => (
            <li key={member.id} className="text-sm">
              <span className="text-hearth-100">{member.character.name}</span>
              <span className="ml-2 align-middle">
                <LevelPip xp={member.character.xp} />
              </span>
              <span className="ml-2 text-hearth-400">
                {STATS.map((stat) => `${STAT_INFO[stat].label[0]}${member.character[stat]}`).join(" ")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {recap.length > 0 ? (
        <details className="mb-8 rounded-xl border border-hearth-800/60 bg-hearth-900/30 p-4">
          <summary className="cursor-pointer text-sm text-hearth-300">
            The story so far ({recap.length} {recap.length === 1 ? "chapter" : "chapters"})
          </summary>
          <div className="mt-3 space-y-3">
            {recap.map((scene) => (
              <div key={scene.id}>
                <p className="text-sm font-medium text-hearth-300">{scene.title}</p>
                <p className="text-sm leading-relaxed text-hearth-200/70">{scene.summary}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <PlayClient
        campaignId={campaign.id}
        campaignTitle={campaign.title}
        status={campaign.status}
        party={campaign.party.map((member) => ({
          id: member.characterId,
          name: member.character.name,
          race: member.character.race,
          archetype: member.character.archetype,
          level: member.character.level,
          pronouns: member.character.pronouns,
        }))}
        initialEntries={entries}
      />
    </main>
  );
}
