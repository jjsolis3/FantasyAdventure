-- Signing in without an email address.
--
-- Registration required a unique email, which a nine-year-old has not got. The
-- workarounds a family reaches for are all bad in the same way: a parent
-- invents `mum+mira@gmail.com`, or hands over an address the child cannot read,
-- or everybody shares one login and the whole point of separate sheets goes
-- away. None of those is a child having an account.
--
-- So an account is identified by an address **or** a username.
--
-- ## Why the CHECK constraint is here rather than in the application
--
-- An account with neither would be a row nobody could ever sign in to, and
-- nothing in the application would notice it had happened — no screen lists
-- accounts by how they authenticate, so it would sit there until somebody tried
-- to log in months later. That is exactly the kind of rule that belongs in the
-- database: cheap, total, and impossible to forget at one of the call sites.
--
-- It is NOT VALID-free deliberately: every existing row has an email, so the
-- constraint validates immediately against the table as it stands.
--
-- ## What happens to the accounts already here
--
-- Nothing. Every one of them has an address, keeps it, and signs in exactly as
-- before. `username` starts null for everybody, and a null is not a duplicate
-- of another null as far as a unique index is concerned — so every account can
-- have no username at once without colliding.

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

ALTER TABLE "User"
  ADD CONSTRAINT "User_has_a_handle"
  CHECK ("email" IS NOT NULL OR "username" IS NOT NULL);
