import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { generateInviteCode } from "../lib/auth/invite-code.ts";
import { storylines } from "./storylines.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set — cannot seed.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Ensures there is a way to create the very first account.
 *
 * While the database has no users, an unredeemed bootstrap code is kept alive
 * and printed to the container logs on every boot — so the first admin can be
 * created by reading the Coolify logs, with no credentials baked into the image
 * and no default password to forget about. Once anyone has registered, this
 * stops running entirely.
 */
async function ensureBootstrapInvite() {
  if ((await db.user.count()) > 0) return;

  const existing = await db.inviteCode.findFirst({
    where: { isBootstrap: true, redeemedById: null },
  });

  const invite =
    existing ??
    (await db.inviteCode.create({
      data: {
        code: generateInviteCode(),
        isBootstrap: true,
        note: "First administrator account",
      },
    }));

  const banner = "═".repeat(58);
  console.log(`\n${banner}`);
  console.log("  No accounts exist yet. Register the first one at /register");
  console.log(`  using this invite code:   ${invite.code}`);
  console.log("  That account becomes the administrator.");
  console.log(`${banner}\n`);
}

async function main() {
  console.log("Seeding storylines…");

  for (const { acts, ...storyline } of storylines) {
    // An adventure somebody has written or edited in the app is theirs, and this
    // file is no longer the source of truth for it. Without this check, a
    // redeploy would silently restore the shipped text over a family's own —
    // and this seed runs on every container start.
    const existing = await db.storyline.findUnique({
      where: { slug: storyline.slug },
      select: { isCustom: true },
    });
    if (existing?.isCustom) {
      console.log(`  – ${storyline.title} (edited here; left alone)`);
      continue;
    }

    // Upsert so re-running the seed on an existing database is safe. Acts are
    // replaced wholesale rather than merged — the seed file is the source of truth.
    const record = await db.storyline.upsert({
      where: { slug: storyline.slug },
      create: storyline,
      update: storyline,
    });

    await db.storylineAct.deleteMany({ where: { storylineId: record.id } });
    await db.storylineAct.createMany({
      data: acts.map((act) => ({
        ...act,
        beats: [...act.beats],
        // Most acts ask for nothing in particular; the ones that do name it, so
        // that the table can be told what it is still missing.
        seeks: "seeks" in act && Array.isArray(act.seeks) ? [...(act.seeks as string[])] : [],
        storylineId: record.id,
      })),
    });

    console.log(`  ✓ ${record.title} (${acts.length} acts)`);
  }

  const total = await db.storyline.count();
  console.log(`Done. ${total} storylines available.`);

  await ensureBootstrapInvite();
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
