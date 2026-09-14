/**
 * Sets an account's password from the server, for the one case the app cannot.
 *
 * Everybody in Hearthlight has somebody who can help them back in: a child has
 * her parent, a parent has whoever runs the installation. Whoever runs the
 * installation has nobody — and deliberately so, because an account that a
 * household owner could reset would be a route to the storyteller's API key.
 *
 * So the escape hatch is where the trust already is: a shell on the machine
 * that holds the database. Somebody who can run this can read the database
 * anyway, which is exactly why it is safe to let them do this and not safe to
 * put it on a screen.
 *
 * This is also the answer to "why not email a reset link?". Sending mail means
 * a provider, credentials, a domain with SPF and DKIM, a token table and two
 * more pages — for a handful of people, of whom the children have no address to
 * send anything to. If Hearthlight ever has families in it who are not yours to
 * telephone, that calculation changes. Today it does not.
 *
 * Usage, from the app's own directory:
 *
 *   DATABASE_URL=… npx tsx scripts/set-password.mts you@example.com 'a long new password'
 *
 * On Coolify: open a terminal on the running container and run it there, where
 * DATABASE_URL is already set.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { hashPassword } from "../lib/auth/password.ts";
import { normaliseHandle } from "../lib/auth/handle.ts";

const [rawHandle, password] = process.argv.slice(2);

if (!rawHandle || !password) {
  console.error("Usage: npx tsx scripts/set-password.mts <email-or-username> <new password>");
  process.exit(2);
}

if (password.length < 10) {
  console.error("Use at least 10 characters — the app asks for that too.");
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(2);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const handle = normaliseHandle(rawHandle);
  // Either kind, because this is the one place nobody is standing in front of a
  // form that already said which.
  const user = await db.user.findFirst({
    where: { OR: [{ email: handle }, { username: handle }] },
    select: { id: true, displayName: true, email: true, username: true },
  });

  if (!user) {
    console.error(`No account signs in as ${handle}.`);
    process.exit(1);
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await tx.authSession.deleteMany({ where: { userId: user.id } });
  });

  console.log(`Set. ${user.displayName} signs in as ${user.email ?? user.username} and every`);
  console.log("existing session has been ended.");
} finally {
  await db.$disconnect();
}
