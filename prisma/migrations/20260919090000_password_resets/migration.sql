-- Emailed password resets, for the accounts that have somewhere to send to.
--
-- Hearthlight now holds two kinds of account and they need two different
-- answers to "I have forgotten my password".
--
--   A **child** signs in with a username and holds no email address — that is
--   the point of her account. There is nowhere to send a link, so the grown-up
--   next to her sets a new password directly.
--
--   A **grown-up** holds an address, which is what makes the account ordinary.
--   They get the link.
--
-- ## Only the hash is stored
--
-- Exactly as `AuthSession` stores only the hash of a session token. A database
-- that leaks should not hand over live password-reset links along with
-- everything else, and there is never a reason to read a token back — the only
-- question ever asked of it is "does this one somebody just presented match?".
--
-- ## `usedAt` rather than deleting the row
--
-- A spent link is kept so a second click can say "that link has already been
-- used" instead of the blank "not recognised" that a missing row would give.
-- Somebody who clicks twice, or whose mail client prefetches the link, should
-- be told what happened rather than left wondering whether they mistyped.
--
-- Nothing is back-filled: no reset has ever been requested.

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
-- Expiry is indexed so sweeping old rows stays cheap, the same as AuthSession.
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CASCADE: a reset link for an account that no longer exists is not history
-- worth keeping, it is a row that would redeem into nothing.
ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
