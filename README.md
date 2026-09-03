# Hearthlight

A wholesome, AI-guided fantasy tabletop adventure for families. One shared
screen — or one screen each — a party of characters you build together, and a
Game Master that never gets tired and never says no to a silly idea.

Conflicts resolve through kindness, cleverness and courage. Nobody dies.

---

## Status: Milestone 10 — A table nobody has to own

The table no longer has to be one table, the story no longer has to be read to
be followed, and the library is no longer fixed: every player can answer from
their own device, the storyteller reads aloud and illustrates, and a family can
write their own adventures without touching the code.

And an adventure no longer has to be assembled out of characters one account
owns. You can ask another player's adventurer along, and the story waits for
them to say yes. What the party is trying to do is now a board they can look at
— and finishing a quest costs them the thing it took, which is what makes
carrying it mean anything.

| | |
|---|---|
| ✅ | **M0** Next.js 16 (App Router) + TypeScript, standalone output |
| ✅ | **M0** Postgres via Prisma 7 with the `@prisma/adapter-pg` driver adapter |
| ✅ | **M0** Migrations + idempotent storyline seed on container start |
| ✅ | **M0** `/api/health` reporting real database connectivity |
| ✅ | **M0** Dockerfile + compose, ready for Coolify |
| ✅ | **M1** Invite-only registration, password sign-in, server-side sessions |
| ✅ | **M1** Admin invite management, profile and table preferences |
| ✅ | **M2** Character builder — stats, skills, race and calling |
| ✅ | **M2** Family ties and the Bond mechanic |
| ✅ | **M3** Campaign setup — storyline, party, tone and reading level |
| ✅ | **M4** Four-stage turn pipeline, memory pyramid, safety guard, CLI harness |
| ✅ | **M5** The table — streaming turn progress, dice reveals, transcript |
| ✅ | **M6** Skill growth, inventory, milestone announcements, Family Moves |
| ✅ | **M6** Adventures now end — the final act closes the story rather than looping |
| ✅ | **M7** Take back the last turn — the whole turn, not just the words |
| ✅ | **M7** "The storyteller got that wrong" — retell a turn with a correction |
| ✅ | **M7** Talk-to-each-other turns — no dice, no consequences, one model call |
| ✅ | **M7** "I don't know what to do" — three ideas grounded in the scene |
| ✅ | **M7** Stopping points, so next week can pick up the thread |
| ✅ | **M7** How long an adventure runs — one evening, a few sessions, or unhurried |
| ✅ | **M8** One screen each — every player answers for their own adventurer |
| ✅ | **M8** Join codes, so other households can bring an adventurer along |
| ✅ | **M8** Handing an adventurer to another account, with everything they earned |
| ✅ | **M8** Everybody's character sheet visible to everybody |
| ✅ | **M8** "It's your turn" — a nudge that finds the player, not just the page |
| ✅ | **M8** The journal — the whole story, laid out to be read back or printed |
| ✅ | **M8** Running the table — turn order, taking somebody out, pausing |
| ✅ | **M9** A storyteller that reads out loud, on every device, free |
| ✅ | **M9** A picture of each chapter — optional, and off until you pay for it |
| ✅ | **M9** A spooky register, and three adventures written for it |
| ✅ | **M9** What you have found — one page, and who is carrying it |
| ✅ | **M9** Character portraits — uploaded, not generated |
| ✅ | **M9** Write your own adventures, without a redeployment |
| ✅ | **M9** What the storyteller has used, and what it cost |
| ✅ | **M10** Invite another player's adventurer, and wait for them to say yes |
| ✅ | **M10** Quests — chapters and side quests, tracked, finished and paid for |
| ✅ | **M10** Spending what a quest took, and keeping it as a keepsake |
| ✅ | **M10** Handing an item to somebody else in the party |
| ✅ | **M10** An aim of her own each chapter, private until she finishes it |
| ✅ | **M10** The shelf — everything an adventurer has given up, across every story |
| ✅ | **M10** Where they went — the route a family walked, drawn in the journal |
| ✅ | **M10** What are you bringing? — packing before you set out |
| ✅ | **M10** Stats that grow — one point every ten experience, hers to place |
| ✅ | **M10** Skills learned from what she actually kept trying |
| ✅ | **M10** One thing each calling alone can do |
| ✅ | **M10** Things found that she has not grown into yet |
| ✅ | **M10** Knacks — what reaching a level finally buys |
| ✅ | **M10** People the family already knows, who turn up again |
| ✅ | **M10** How it went — what each of them got when the story ended |
| ✅ | **M10** A skill rank is something you can do, not just a number |
| ✅ | **M10** The television: `/screen`, paired with a code, no sign-in on the TV |
| ✅ | **M10** Art prompts for every chapter, sharing the app's own style |
| ✅ | **M10** Something to find in all thirty chapters, keepsake included |
| ✅ | **M11** Once-a-scene and once-a-chapter moves that are actually limited |
| ✅ | **M11** A front page that leads with whose turn it is |
| ✅ | **M11** Starting an adventurer again, administrator-only |
| ✅ | **M12** Seven stats — Grace, Luck and Grit — on a derived budget |
| ✅ | **M12** 56 skills, and a new one to choose at every level after the second |
| ✅ | **M12** A second signature move for every calling, at level 5 |
| ✅ | **M12** Luck that bends the dice on every roll, not just its own checks |
| ✅ | **M12** An act clock, so going in circles costs something and being stuck does not |
| ✅ | **M12** Bonds from working together and from listening, not only from being looked after |
| ✅ | **M12** The family's own dice: the story stops and asks, and they type in what they got |
| ✅ | **M12** Encounters — something standing in front of them, settled with words rather than weapons |

Ten starter adventures are seeded, each with a three-act spine the AI
improvises inside of.

### Getting around

Two links a family uses — **Adventures** (the stories) and **Characters** (the
people) — each with an icon, and the section you are in marked rather than left
to be inferred. They differ by two letters and used to sit side by side in the
same weight, which meant reading carefully every time.

Everything about your account sits behind the avatar on the right: your profile,
**Settings** for an administrator, and signing out at the bottom. Those were four
separate doors in the bar competing with the two anybody actually uses, and
signing out was given the same weight as the game. Signed out, the bar offers one
thing, and it looks like a button.

### Creating the first account

Registration is invite-only, so the first account needs a code that nobody has
yet. While the database has no users, every container start prints one to the
logs:

```
══════════════════════════════════════════════════════════
  No accounts exist yet. Register the first one at /register
  using this invite code:   HEARTH-XXXX-XXXX   <- yours will differ
  That account becomes the administrator.
══════════════════════════════════════════════════════════
```

Open the **Logs** tab in Coolify, copy the code, and register at `/register`.
That account becomes the administrator and can issue invites from `/invites`.
Once anyone has registered, bootstrap codes stop being generated.

### Characters and the family twist

Build everyone at `/characters` — you choose who actually travels when an
adventure begins, so it is fine to add the whole household.

**Seven stats, and they add up to twelve.** Might, Wits, Heart, **Spark**,
Grace, Luck and Grit. A newly built adventurer's seven numbers total **12** — so
she is genuinely good at one or two things and ordinary-to-poor at the rest,
with somewhere to grow into.

Twelve is the *sum*, not an allowance on top of a floor. That distinction is
the whole reason this number moved. It used to mean "one in everything, and
twelve more to place", which totalled nineteen — arithmetically consistent
everywhere, and still wrong, because the screen said "12 points to spend" over
seven boxes adding up to 19. Nobody adds up a character sheet by subtracting a
floor first.

**Her numbers match her level.** Twelve is the level-one total; every 40
experience adds one more, so a level-four adventurer's seven numbers add up to
14 and a level-eight one's to around 22. The same rule drives the builder, her
own growth screen, and the administrator's re-lay form, so the three cannot
disagree.

Worth knowing before the first evening: with a total of 12 across seven stats
she starts at 1 in most of them, which is −2 on those rolls. That is deliberate
— it leaves room to climb, and she passes yesterday's strength around level
five — but it does make the opening chapter harder than the middle ones. If it
lands too hard for a nine-year-old, the **difficulty dial** on the adventure is
the control for it: `Gentle` lowers every target by two, which is almost exactly
what the lower starting numbers cost.

The builder used to open with 3 already in every stat, which made the only
interesting move *taking points away* from things and handed a child somebody
already competent at all seven before she had done anything. `Heart` is a
first-class stat, not a throwaway — comforting someone is as valid a way through
a scene as lifting a gate. Luck is the odd one out and has its own section
below: it bends every roll, not only the ones the storyteller aims at it. The
budget is enforced server-side, not just in the builder.

**Race and calling are free text.** The lists are suggestions with a stat
affinity attached; a child who wants to be a Cloud Baker can be one, and the
Game Master will take it seriously.

**Names can be rolled.** "Surprise me" suggests a name shaped by both the race
and the calling — a Dwarf Guardian tends to come out a Thrain Ironhollow, a
Fox-folk Trickster a Vix Winkwood. It is a pure function rather than an AI
call: this button gets pressed ten times in a row while a child decides whether
they are a Pip or a Poppy, so it has to be instant and has to keep working when
the model server is asleep. Given names are mixed rather than split by gender,
so any name suits anyone, and a race the generator has never heard of still
gets something sensible.

**A portrait is uploaded, not generated.** A picture on the sheet, chosen from
the character's own page and shown wherever they appear — the party sheets, the
journal. Uploaded rather than drawn by a model on purpose: the case that
actually comes up is a child who has drawn their character in felt-tip and wants
*that* on the sheet, and a photograph of it beats anything a model would invent.
It also costs nothing, needs no provider configured, works when the internet
does not, and never sends a likeness of a real family through an API.

The browser squares it off and shrinks it to 512px before it is sent, so a phone
photograph is fine and what arrives is a portrait rather than four megabytes of
kitchen. The server sniffs the first bytes rather than believing the file's own
claim about what it is, and only the household that owns the adventurer can
change it.

**Adventurers can change hands.** Almost every family builds the whole party
from one account, because one adult was holding the keyboard — and then wants
everyone on their own sign-in later. Rebuilding a character for the new account
would hand a child a level 1 stranger, so instead the adventurer *moves*: open
their page, press **Hand … to another player**, and read out the
`HAND-K3M9-PQ7T` code. The other account types it at `/characters/claim` and
takes them on.

Everything comes along, because everything is stored against the character
rather than against the account: experience and level, skill ranks, what they
are carrying, family ties and the bond levels earned in them, and their place in
every adventure they are travelling in — including one already in progress. The
code is single-use, spent the moment it is claimed, and can be withdrawn before
then. What changes is one column: who answers for them.

**Removing an adventurer is the only thing here that destroys progress**, so it
lives in one place — the character's own page — and takes three deliberate acts
to reach: asking for it, reading what specifically would be lost (this level,
these skills, these things carried, these ties, these adventures), and typing
the character's name. The name is checked on the server as well as in the
browser, because a confirmation that only exists in the client is a suggestion.
The screen offers the handover first, since "somebody else plays them now" is
the reason most people arrive there.

**Family ties are mechanical, not decoration.** Declare that Pip is Mira's
parent and the game stores one row for the pair with a shared **Bond** counter.
Bonds rise when one of them genuinely helps the other, and unlock **Family
Moves** — see below. Storing one row rather than two directions is deliberate: two
counters for one relationship drift apart the moment anything writes to only
one of them. The pair is keyed on the smaller character id, and each side reads
the relationship from its own perspective.

A tie can be declared to one of your own adventurers, or to anyone yours has
actually travelled with — which is what keeps "Wren is Mira's daughter"
declarable once each child has their own sign-in. Those ties then lead the list
of people you can ask along on the next adventure.

A tie can be declared to an adventurer another account owns, so long as the two
are travelling together — which is what makes bonds keep working after a family
splits its characters across separate sign-ins. Either side can remove one.

### Setting up an adventure

At `/campaigns/new`: pick a storyline, choose who is coming, and decide how it
should be told. Tone and reading level are **copied onto the campaign**, not
referenced from your profile — changing your preferences later must not
silently rewrite a story already in progress.

The order you pick the party in is the order the game asks "what do you do?"
around the table. Party size is checked against the storyline's range. Once the
adventure leaves `SETUP` the party stops being something a form rewrites — the
household running it can still take somebody out or change the turn order from
**Run the table**, but nobody else can, and nothing does it by accident.

Setup also asks **where everyone is sitting**, and it can be changed at any
point from the campaign's settings:

| | |
|---|---|
| **One shared screen** | Everyone round one device. The storyteller asks each adventurer in turn and one person types. This is the original flow, unchanged. |
| **Everyone on their own device** | Each player answers on their own phone or laptop, at the same time. The turn is taken once everybody has answered. |

### Playing from separate devices

The story stays single-threaded; only the typing moves apart. One transcript,
one turn at a time, everybody looking at the same thing.

**Getting everyone in, two ways.** A join code is for the person standing next
to you. An invitation is for the person upstairs.

Every adventure has a join code shaped like `PARTY-K3M9-PQ7T`, shown on its page
with a link you can send. Anyone with their own sign-in types it at
`/campaigns/join`, picks one of their own adventurers, and joins the party.
Joining *is* membership — there is nothing to accept, because somebody who typed
the code has already said yes. Registration is still invite-only, so a stranger
who somehow gets the code cannot make an account to use it.

**Invitations** run the other way. Setting up an adventure lists everybody
else's adventurers as well as your own — family ties first, labelled with the
tie ("child of Mira") and with who plays them, then everyone else. Pick one and
they are *asked*: an invitation goes to whoever answers for that adventurer, and
it shows up on their own adventures page with a yes and a no.

This exists because without it a household where every player has their own
sign-in and one character each could not start anything. A storyline needing two
adventurers was unreachable when the party picker only ever offered your own —
the only ways through were to build a second character and play both, or to
gather everyone round one screen and type for them. Neither is what a family
with four accounts wants.

An invited adventurer is not in the party, and that distinction is load-bearing:
they do not appear in the storyteller's context, on the party sheets, or in the
list of people a round is waiting for. They count toward the storyline's minimum
at setup, so the adventure can be arranged in one sitting — but **it will not
begin until they answer**. The opening scene names everyone present, and starting
without them would mean either a short party or somebody arriving into a scene
that has already described who is there. Until then the owner sees who is being
waited on, and can take an invitation back. A no is kept rather than deleted, so
it reads as answered rather than vanished, and can be asked again.

**A round.** Anyone can start one. Everybody sees the same board: who has
answered, what they said, and who is still thinking. You answer only for the
adventurers you built — the household that started the adventure may answer for
anyone, which is how a five-year-old without an account of their own still gets
a say. "Waits and watches" counts as an answer.

**The turn starts itself.** When the last answer lands, the story moves — nobody
also has to be the one who presses send. Every browser tries at that moment and
the server hands the turn to exactly one of them, so a turn is never taken
twice however many devices noticed at once. If the browser that got it is closed
mid-turn, the claim goes stale and another can pick it up.

**If a turn fails**, nothing anybody typed is thrown away: the round goes back
to collecting with the reason attached, and the table presses again.

**Taking a turn back** works the same as on one screen, and anybody at the table
can do it. Apart, the retelling opens as a round with everyone's words already
in it — so it waits to be sent rather than starting itself, which gives the
table time to change something and say what the storyteller got wrong.

**Everybody's sheet is open to everybody**, on the play screen: stats, skills,
what each adventurer is carrying, and the bonds between them. On one screen
this was a lean across the table; apart, a child who cannot see that their
sister is the one with Might 5 has no way to suggest that she try the door.

**Being told it is your turn.** Answering from your own device only works if you
find out there is something to answer, so three signals escalate in the order of
how much they interrupt: a line on the play screen and a badge on the adventures
list; the tab's title, which turns into `● Your turn — …`; and a browser
notification, which is asked for by a button rather than by a prompt on page
load and only fires when the tab is in the background. Each is about *your*
adventurers specifically — a nudge that fires when somebody else's answer is
missing is a nudge people learn to ignore.

The honest limit: the page has to be open somewhere, even in a background tab.
Reaching a closed browser means push subscriptions and a service worker, which is
a great deal of machinery for a family who are mostly in the same house.

**Running the table.** The household that started an adventure can change the
turn order (which is the order the storyteller hears everybody in, and left
alone means the youngest is always reacting to everybody else), take somebody
out of the party without touching the adventurer themselves, and pause the whole
thing — which refuses turns rather than merely looking different, and puts away
any round the party is part-way through.

Screens that are not taking the turn poll a small state endpoint every few
seconds and refetch the page when something has actually changed. That is a
deliberate choice over a second long-lived stream per watcher: it passes through
proxies and tunnels unchanged, and a family's table changes every minute or two,
not every frame.

### Playing

`/campaigns/[id]/play` is the table, whether that is one screen or four.

**Beginning.** The storyteller narrates the opening from the storyline's hook,
names each character so everyone knows they are present, and leaves the party
facing a situation.

**A turn, on one screen.** The game asks each character in turn — "Mira, what
do you do?" — in the order the party was picked. Anything can be typed; nothing is refused.
"Waits and watches" is always an option. A review step shows all the declared
actions before they are sent, so a child who typed something by accident can
change it.

**While the storyteller thinks.** A turn is three model calls and can take a
minute on a local model. Rather than a spinner, each stage is announced as it
starts, and **the dice go out as soon as they are rolled** — which is the part
everyone wants to see anyway. The roll tumbles briefly before settling.

**Narration is not streamed token by token, deliberately.** It is checked
against the safety guard before any of it is shown, and a guard that runs after
the children have already read the text is not a guard. The client types it out
on arrival instead, which reads as live without the risk.

**If the model is unreachable** the table gets a plain explanation and a "Try
again" button. Nothing is lost — the adventure sits exactly where it was.

The transcript, the dice and every player's own words persist, so the game can
be closed mid-scene and picked up next week. Closed chapters collapse into a
"story so far" recap.

### Three tones, and the floor under all of them

| | |
|---|---|
| **Cozy** | Setbacks are inconveniences — a dropped basket, a sulking goat. Nothing lurks. |
| **Adventurous** | Real tension, genuinely uncertain. Something can be behind the door; it never wants to hurt them. |
| **Spooky** | Meant to frighten. Dread, being watched, being copied, not being believed, and the ordinary going subtly wrong. |

**Spooky is written to actually work**, because a table that asks for
frightening and gets "slightly odd" stops asking. The storyteller is told to
build fear out of the specific and the ordinary — a door open one inch more than
it was, a reflection a beat behind, a voice that knows their names — to let a
frightening moment land without undercutting it with a joke in the same breath,
and that the grown-ups do not believe them yet.

The floor does not move. Whatever the tone: nobody dies, nobody is hurt, nothing
is cruel, and problems are solved by kindness, cleverness and courage. In the
spooky register that becomes a set of promises the storyteller has to keep —
nothing catches them, nobody is taken, a chase ends in a hiding place or a
slammed door, whatever it is turns out to *want* something (which is what makes
it possible to talk to, trick, feed, free or forgive), and no scene ends with a
character alone in the dark. Under all of it, the safety guard still reads every
line before anybody sees it and regenerates rather than lets it through.

Three of the seeded adventures are written for that register — a radio picking
up a house that is running a few seconds behind, a figure that is one row nearer
in every photograph, and a drowned village that has not finished its last
evening. Each ends by turning the thing that frightened them into something that
can be talked to.

### Are the stories written, or made up?

Both, and the split is the point.

A **storyline** is a written template: a premise, an opening hook, and a
three-act spine where each act carries a goal, a handful of optional beats, and
sometimes a list of things the party should be able to find. Fourteen of them
ship seeded, and they are the same for everyone.

A **campaign** is one family's run through one of those, and almost none of it
is written down in advance. Every word narrated is generated fresh from what
your party actually did, what the storyteller remembers of it, and the tone,
reading level and pacing copied onto that campaign at setup. Two families
playing *The Dragon Who Lost Her Name* end up with two different stories, and
the same family playing it twice would too. The beats are waypoints the
storyteller is explicitly told to abandon if the party goes elsewhere — which
they do, constantly, and it follows them.

So: not a story that is re-rolled from nothing each time, and not a script being
read out either. A spine, improvised over.

**Writing your own** happens at Settings → Adventures, with no redeployment and
no TypeScript: a title, a premise, an opening, and as many chapters as you want,
each with a goal, some optional beats and a list of things to find. The labels
say what each part does to the game, because otherwise there is no way to know
why "goal" and "beats" are different boxes.

Anything written or edited there is marked as **yours**, and that flag is the
whole safety mechanism. The seed re-runs on every container start and replaces
the chapters of every adventure it recognises — right for the ones it ships, and
catastrophic for one somebody wrote on a Sunday evening. Once an adventure is
yours the seed skips it entirely, which also means editing a shipped one opts it
out of future improvements: to try something without that, **make a copy**.

Nothing is ever deleted. A campaign points at its storyline for the premise and
the chapter it is in, so removing one would take the spine out of a story
half-told and leave a finished family's journal about nothing. The most that can
be done is to stop offering it to new games.

Adding one to `prisma/seed.ts` still works and is the right way to ship an
adventure to somebody else's deployment.

### The quest board

`/campaigns/[id]/finds` is what the party set out to do, what they are carrying,
and what it cost to finish. Later chapters are not listed, because what a later
chapter wants is a spoiler.

**A chapter opens its own quest** as the party reaches it, with an objective for
each thing the chapter names. **A find resolves itself**: an objective asking for
the brass key is met the moment somebody is carrying something that looks like a
brass key — no model call, nothing for the storyteller to forget. **A deed** is
the other kind, for objectives that are about doing rather than holding, and only
the storyteller can say one is done; it is asked which of the *listed* deeds just
happened, so it can report one but never invent one.

**The storyteller can open side quests** — a neighbour's missing cat, a promise
made — capped at two a turn and five open, because a model asked "did you start
anything?" every turn will happily say yes every turn.

**Everybody gets an aim of their own.** As each chapter opens, the storyteller is
asked for one small thing per character — grounded in her calling rather than the
plot, so that an aim which would make just as much sense handed to somebody else
is the wrong aim. Four players following one quest is one player with four
mouths; a thread of her own is what makes the same evening different for each of
them.

These are hers to see. A personal quest stays off everybody else's board until
she finishes it, and then the whole table is told whose it was. Visibility
follows who owns the adventurer rather than who is hosting, which gets both kinds
of table right without a special case: on one shared screen the parent owns every
character and sees everything, which is what running the table needs; on four
phones each girl sees only her own. Finishing one pays her alone — it was the one
thing on the board that was hers, and splitting it four ways would take that back.

The storyteller is the only one who sees all of them at once, and is told to
leave each character an opening rather than announce anything.

**Finishing spends what it took.** When the last thing a quest was waiting for
turns up, the quest completes: the table is told which item finished it and who
handed it over, everybody travelling gains experience, and the item leaves that
character's pack. A key that stays in your pocket after it has opened the door
was never really the price of anything. But it does not simply vanish — it
arrives on their sheet as a **keepsake** naming what it bought, because an item
that disappeared off a child's sheet reads as a punishment for having found it.

**Anything can be handed to somebody else.** Until now whoever picked a thing up
was stuck with it, which is a strange rule for a game about a family helping each
other — and a real problem when the chapter wants the key and the key is in the
pocket of the child who has gone to bed. You move your own adventurer's things;
whoever is running the table can move anybody's.

Taking a turn back un-finishes any quest it finished, puts the spent item back in
the pack and removes the keepsake, so the whole moment is reversible rather than
half of it.

Items were always being collected: the storyteller decides when somebody picks
something up, and it is kept on whoever took it and stays with them after the
adventure ends. What was missing was somewhere to see all of it at once —
spread across four sheets on four phones, "do we have the key?" was a question
the table could not answer without asking each other.

What a chapter asks for comes from the storyline rather than the model: an
act names what it wants the party to come away holding, and the storyteller is
told to make those findable — put where a search, a question or a kindness would
turn them up — but never to force them into anybody's hands, and to let a party
that solves the act another way carry on. Matching what was asked for against
what is carried is deliberately forgiving, because the storyline says "the brass
key" and the storyteller writes "a small brass key, green at the teeth". The
storyteller is also told what the party already has, which is what stops it
offering the same key every chapter.

### How it went

Finishing an adventure used to write one line and stop. Everything the evening
had produced was real, recorded and scattered — quests on one page, keepsakes on
another, experience folded silently into a number, and the private aim nobody
else had seen revealed in a transcript that had already scrolled past.

`/campaigns/[id]/summary` gathers it: what the party did between them, then each
girl in turn. What the dice earned her and what finishing things earned her, said
separately. Her private aim, revealed whether or not she managed it — hiding a
failed one would make the reveal a reward rather than a story. What she gave up,
what she came home with, who will remember her, and whether there is a point or a
knack waiting on her sheet.

Every figure is derived rather than stored. Her experience is cumulative across
every story she has been in, so what she earned *here* is reconstructed from the
rolls still sitting in the transcript with their outcomes on them. Nothing to
write at the ending, nothing to drift, and it stays true if a turn is taken back
afterwards.

### What a rank lets you do

A skill rank used to do exactly one thing: add itself to a roll. So "Climbing
rank 3" was a number that made a die slightly friendlier, and a girl who had
worked her way up to it had nothing she could point at and *do*.

Each rank past the first now unlocks a named ability — **Steady Hand** at 2 (once
a chapter, do it without rolling), **Show Someone How** at 3 (talk another
through it, and their next try goes as well as yours would), **Second Nature** at
4 (it never goes badly wrong for you any more). Written to fit any skill,
including ones learned in play: the catalogue could not name an ability for
"Humming" because nobody knew Humming would exist, so the ability is the shape
and the skill is the subject.

And a thing she cannot use yet is now a rule rather than a label. The storyteller
is told what she is carrying and cannot use, and told not to let her — a
requirement nobody enforces is worse than no requirement, because it promises a
goal and then quietly gives it away.

### People the family already knows

NPC memories have always been recorded, and have always died with the campaign
that made them. A family could spend four evenings winning over a frightened
beekeeper, finish the story, and begin the next one in a world where nobody had
ever met him — which is the one thing a game about a family building a life
together really should not do. The reward for being kind to somebody ought to be
that they are still there.

Finishing an adventure now brings home the people who mattered. **Not everybody
graduates**: a story remembers a dozen names, most of them walk-ons, and if all
of them followed the party home the list would be noise within two adventures
and the storyteller would bring back the stallholder instead of the beekeeper.
Only the ones the story treated as mattering come along, four at most.

They hang off the **character** rather than the account, so they survive an
adventurer being handed to a child's own sign-in, and so a reunion can be
personal — the beekeeper remembers *Mira*, not "the party". Meeting somebody
again on a later adventure raises a count rather than making a second stranger,
and the storyteller is told which it is: a third meeting reads differently from a
first.

The next adventure's storyteller is shown who this party knows and **invited** to
use one if there is a natural place for them — at most one per chapter, and never
at the expense of the story that is actually happening. A chapter bent around an
old acquaintance because the prompt insisted is worse than one that never
mentions them. On a family's first adventure the block is empty and costs
nothing, which is most adventures.

Everyone she knows is listed on her own page, with what they are like and which
story they met on.

### Knacks

What reaching a level finally buys. Levelling was announced and then read by
nothing at all — the number went up, the table was told, and not one thing about
the character changed. Now a level offers **three, and she takes one**.

Two rules shape all of it.

**The three are earned, not browsed.** They are drawn from what this character
actually did — the stats she keeps rolling, the things she keeps trying — so a
girl who has been climbing is offered *Sure-footed* and one who has been talking
her way past people is offered *A Warm Word*. Two girls who levelled on the same
evening see different lists, and nobody has to read a wiki to find the good
build. Two of the three are the best matches; the third is a wildcard, so nobody
gets funnelled into the same character every time.

**None of them is a trap.** Every knack is worth having and none is strictly
better than another, so a seven-year-old cannot make a choice here that she
regrets four sessions later.

The offer is a pure function of her own state, so it is the same three on every
page load. An offer that reshuffled on refresh would turn a decision into a slot
machine. The server recomputes it before granting anything, so a hand-posted form
naming something she was never offered gets nothing.

A knack does one of four things, and wherever possible it is a thing the *player*
gets to do rather than a number that quietly goes up:

| | |
|---|---|
| **Sure-footed** | Might comes easier — a real +1 in the dice, not a description |
| **Good Listener** | Once a chapter, ask the storyteller one true thing about anybody in the scene. It has to answer |
| **Deep Pockets** | One more thing in the pack before every adventure |
| **Fast Learner** | Room on the sheet for two more of the things she has learned |
| **Friend to All** | Nothing that meets her starts out hostile. It might still be frightened |
| **Stubborn** | When something goes wrong for her, it goes a little less wrong than it might have |

The storyteller is told only about the ones the story itself has to honour. A
knack that is purely a number has already been applied by the dice, and repeating
it in the prompt would just crowd it.

### Growing up

A character used to be finished the moment she was built. Twelve points spent
once, and those four numbers were identical at level 9 — nothing on the sheet
moved except a skill rank, so a girl could play six adventures and her adventurer
would be the same adventurer. Levelling up was announced and then consulted by
nothing at all.

**Stats grow now.** One point every ten experience, and she chooses where it
goes. The sheet fills from twenty at the outset to forty-eight at the far end of
a long career. Points are one-way — refunds would turn a sheet into a puzzle to
optimise between chapters — and what she has spent is read off the stats
themselves rather than stored, so there is no counter to drift out of step.

The modifier curve flattens above five: two points buy one. Left as a straight
line a maxed stat would be +9 and a HARD check would land on a roll of 6, at
which point the storyteller may as well not ask. With the curve she is +6 and
still needs a 10, so the moment before the die stops is still a moment. Nothing
below six changes, so no adventurer who already exists is worth less than she was.

**Skills are learned from what she keeps trying.** Skill experience used to be
awarded only when a check happened to name a skill she already had — so a girl
who said *"I climb the drainpipe"*, with nothing on her sheet about climbing,
rolled, earned experience toward her level, and got nothing whatsoever that would
make climbing easier next time. The attempt was forgotten the moment the dice
landed.

Every check is now filed under the *kind* of thing it was, which the storyteller
names in a word, and four tries at the same kind of thing makes it a real skill.
Counted whether or not she succeeded: a child who has failed to pick a lock four
times has learned a great deal about locks.

**Each calling can do one thing nobody else can.** Archetype used to be
decoration — it suggested three skills in the builder and granted nothing, so two
Guardians and a Trickster played identically once the dice were rolling. A
Guardian can *Step In* and take a roll somebody else just failed; a Scholar can
ask the storyteller one true thing about anything in the scene, and it must
answer. The storyteller is told about them, so a Trickster's "there is always
another way" only means something if the scene has one.

**Some things found are beyond her for now.** A silver flute she cannot play, a
book she cannot read — it sits in her pack, named, saying exactly what would
change that. This is the alternative to a gear shop: a far better reason to want
to grow than a price tag, costing nothing and taking nothing from anybody else.

### What are you bringing?

The ritual before setting out, and the thing every child who has played anything
on a screen already knows: you pick your kit, and then the game starts. Until
now an adventure simply began with everybody's pockets empty.

Two things each, chosen on the campaign page while it is still being prepared,
and changeable right up until the story begins. The list is composed rather than
fixed — a couple of things her calling suggests, a couple the story's mood
suggests, and the staples anybody would take. A Beastfriend is offered a bag of
seeds; a spooky story offers a candle that will not blow out and a bell on a
string. An unrecognised calling still gets the staples, so the Cloud Baker packs
a rope and a lantern like everybody else.

Deliberately a list and not a shop. **There is no wrong answer**: everything here
is useful somewhere, nothing is better than anything else, and nothing is scarce.
A shop would need an economy, a balance pass and a currency, and would quietly
turn a cooperative game into a comparison — one girl with the good sword and one
without. Two is the number because it makes a real decision: taking the mirror
means not taking the bell.

The payoff needed no new machinery. A packed item is an ordinary inventory row
tagged to that adventure, so **the quest board reads it exactly like something
found in the story** — bringing the rope from home is a perfectly good way to
have a rope, and "we brought the rope!" finishes a quest. Only the journal tells
the two apart, because *set out with* and *came home with* are different kinds of
good.

Packing closes when the story opens. Reaching back into the cupboard mid-chapter
would make every "do we have one?" answerable with yes, and the whole point is
that you decided beforehand.

### Where they went, and what they gave up

**The route.** Every scene has always recorded a location and nothing ever
showed it back, so a family who spent four evenings crossing a valley had no way
to see they had crossed anything. The journal now draws the places in the order
they were found: consecutive scenes in one place are a single stop, coming back
somewhere later is a new stop marked *back again*, and a scene the storyteller
never named a place for stays wherever the party already was — they did not
teleport. Matching is forgiving about the storyteller's own inconsistency, since
the same field returns as "the barley field", "The Barley Field" and "barley
field" across three scenes.

Deliberately a route rather than a map. There are no coordinates anywhere in the
data, and inventing some would produce a confident little cartography that
contradicts the story — a village drawn east of a river the narration put it west
of. A line of places claims only what is actually known.

**The shelf.** An adventurer's own page gathers everything she has ever given up
to finish a quest, grouped by the adventure it happened on, across every story
she has been in. Keepsakes outlive the adventure that made them: delete the
campaign and they gather under "an adventure since forgotten" rather than
vanishing, because the thing still happened to her.

### Hearing it, and seeing it

**A storyteller that reads out loud.** Press *Read the story aloud* and every
narration is spoken as it arrives — on whichever devices asked for it, so one
person can listen while another reads. Any passage can be heard again from the
transcript. The text never goes anywhere: this reads along with the page rather
than replacing it, which is what a five-year-old who cannot read yet and an
eleven-year-old who can both need out of the same screen.

It uses the voice already in the browser rather than a cloud one, and that is a
choice rather than a stopgap. It starts the instant the words land, it costs
nothing per paragraph, it works when the internet does not, and it sends the
story nowhere. Each device picks its own voice and speed, and modern phones and
laptops ship good ones. A sentence at a time, because Chrome abandons utterances
longer than about fifteen seconds — a bug old enough to vote — and because
stopping is then instant.

**A picture of each chapter.** Off by default, and the only thing in this app
that costs money every time it is used, so it says so plainly at the switch:
roughly a penny or two per chapter. Turn it on at Settings → Storyteller with a
drawing service of its own — Claude does not draw, so this is usually a
different provider from the storyteller.

One picture per scene rather than per turn: a scene is somewhere the party stays
for a while, so the picture stays true, and drawing on every turn would be a
bill for pictures nobody had finished looking at. It is drawn when somebody first
opens the chapter — never during a turn, so a slow or broken drawing service can
never be why a turn hangs — and only ever once, however many devices open it at
the same moment, because the unique constraint on the scene settles that rather
than whoever's request arrived first.

**The prompt is built, not passed through.** What the storyteller wrote is prose
for children, but it is still model output, and handing it verbatim to a second
model as an instruction is how one loose sentence becomes a picture nobody
wanted. So dialogue is dropped, the reader stops being addressed, the text is
trimmed to its scene-setting, and the whole thing is wrapped in a style and a
subject this game is willing to put in front of a seven-year-old.

The bytes live in Postgres rather than on disk, because the container is
replaced on every deployment and a picture of the night the dragon learned her
name should outlive a redeploy. They are served behind the same sign-in as the
story.

### The journal

`/campaigns/[id]/journal` is the same events as the play screen, laid out to be
kept rather than played: the whole adventure in order, chapter by chapter, with
the narration, everybody's own words, the milestones, and who each adventurer
turned out to be by the end. Dice become a single line — "and it worked" — since
a year later nobody wants the arithmetic, but "and it worked" is still part of
the story.

It prints. The screen is candlelight on near-black, which a printer renders as a
solid block of ink, so printing switches to black on white, drops the navigation
and the buttons, and breaks pages between chapters. Which is most of the point of
a family playing at all: nobody remembers the dice, and everybody remembers that
a seven-year-old decided to hum to the dragon.

### Growing — what play changes

**Experience.** Every roll earns some, even a failed one: a child who rolled
badly should not also be punished with nothing. Levels are always derived from
experience, never set directly.

**Skills improve by being used**, whatever the dice said. A skill the Game
Master picked up on ("Speak with Animals to calm her") earns a point, and ranks
add straight to future rolls.

**Family Moves.** Bonds now unlock something. Each move needs two characters,
so none can be used alone — that is the entire point — and each is spendable
once per scene, which keeps it a moment rather than a routine.

| Move | Bond | Effect |
|---|---|---|
| Lend a Hand | 1 | +2 to what they are trying to do |
| Stand Together | 2 | Roll twice, keep the better |
| Never Alone | 3 | If it goes wrong, try once more |
| Two as One | 4 | A near miss becomes a success |
| Hearthlight | 5 | It simply works |

Effects are applied in `lib/engine/dice.ts`, not in the narration. A move that
only changed the wording would make bonds decoration, and the children would
work that out within two sessions. The move is offered at the review step —
after everyone has spoken — because a move belongs to a pair, not a person.

Bond 1 takes three helpful moments, so helping each other has to become a habit
before it unlocks anything.

**Things you find.** The Game Master can hand out items, which are recorded per
character and shown at the table and on the character sheet. Picking up a
second of something raises the count rather than duplicating the row.

**Growth is announced, not just recorded.** Levelling up, a skill reaching a new
rank, a Family Move unlocking, something picked up — each writes a line into the
transcript. A number quietly ticking up in a database is not a reward; being
told "Mira reached level 2" is.

### How the Game Master works

One party turn runs four stages:

```
1. ADJUDICATE  JSON call  → which declared actions need a dice check
2. ROLL        server     → the model has no say in outcomes
3. NARRATE     prose call → told exactly what the dice decided
4. EXTRACT     JSON call  → what changed, pulled back out of the narration
```

**The server rolls, never the model.** If the AI decides outcomes, character
stats become decoration and it stops being a game. The Game Master proposes
checks; `lib/engine/dice.ts` decides how they land; the Game Master narrates
the result it is handed.

**Narration and JSON are separate calls.** Asking one response to be both good
prose and valid JSON is where small local models fall apart — they either write
stilted prose to protect the JSON, or produce lovely prose with unusable JSON
stapled on. Two calls cost more and work far better.

**Nothing crashes the table.** Adjudication failing means a turn with no dice,
not an error screen. Extraction failing means nothing is remembered from that
turn, but the story still happened and is still recorded. Every stage has a
defined fallback.

**Set `AI_NARRATION_MODEL`** to use one model for prose and another for JSON —
qwen2.5 is more reliable at structured output while llama3.1 and gemma tend to
narrate better. Leave it unset to use one model for both.

### Memory — how it remembers across sessions

A local model cannot be handed twenty sessions of transcript, so context is a
pyramid, trimmed from the bottom when it exceeds `AI_MAX_CONTEXT_TOKENS`:

| Layer | Dropped when short of room? |
|---|---|
| Campaign premise and current act | Never |
| Party sheet, stats, bonds | Never |
| Location and current scene summary | Never |
| Long-term memories, ranked | Capped at a third of what remains |
| Earlier scene summaries | Capped at a quarter of what remains |
| Recent turns, verbatim | Oldest dropped first |

Memories rank by **importance before recency**, so a central plot thread from
ten turns ago still outranks incidental scenery from last turn. When a scene
closes it is summarised and its turns stop costing context entirely — which is
what makes a long campaign fit in a 7B model's window.

### Trying it against your model

`npm run gm:harness` runs one complete turn — a real scene, two characters,
two declared actions — against your model server and prints every stage: the
assembled context, the adjudication JSON, the dice, the narration, the
extraction, per-call latency, and a verdict calling out anything that went
wrong.

```bash
AI_BASE_URL=http://192.168.1.50:11434/v1 AI_MODEL=qwen2.5:latest npm run gm:harness
```

It needs no database and no running app, so it is the fastest way to compare
models on identical input:

```bash
AI_MODEL=phi3:latest     npm run gm:harness
AI_MODEL=qwen2.5:latest  npm run gm:harness
AI_MODEL=llama3.1:latest npm run gm:harness
```

Watch for `adjudicationFellBack` or `extractionFellBack` in the diagnostics —
those mean the model could not produce usable JSON at all, and dice or memory
were skipped. Repairs above zero mean it needed a second attempt.

`/api/health?ai=1` performs a live probe from inside the container, which is
the quickest way to confirm the app can actually reach your model over the LAN.
Plain `/api/health` only reports whether the model is configured — a live probe
on every Coolify poll would hammer your GPU, and the app is deliberately still
"healthy" with the model down.

### Settings, and switching to a cloud model

`/settings/storyteller` (admin only) configures the storyteller from the
browser, so the model can be changed **without a redeploy**. Presets are
included for Ollama, Anthropic, OpenAI, OpenRouter and Groq.

Settings are stored in the database and take over from the environment
variables once saved. The environment remains the fallback, so a fresh
deployment works before anyone opens the page.

**Two tests, and the second is the one that matters.** A quick check says
whether the model answers at all. *Run a practice turn* drives the real
four-step pipeline against a synthetic scene and reports what would break:
whether it could produce usable JSON for the dice, whether anything would ever
be remembered, how many retries it needed, and how many words it wrote. A model
can pass the quick check and still be unable to run the game.

**API keys are encrypted at rest.** The encryption key lives in
`SETTINGS_SECRET` in the environment, never in the database, so a database dump
or a stray backup does not hand over a working key. Without that variable set,
the page refuses to store a key rather than saving it in the clear — local
models need no key, so everything else still works. The key is never sent back
to the browser; the page shows only a hint like `sk-ant…4f2a`.

Anthropic speaks a different wire format from everything else (`/v1/messages`,
its own auth header, system prompt as a separate field), so it has its own
adapter rather than being bent into the OpenAI shape.

**There is no chat thread.** A cloud model reached over its API has no memory
between requests and no conversation anywhere — nothing appears in the Claude,
ChatGPT or Gemini apps, and there is no thread to scroll back through. Every
call is a fresh, complete request: the app sends the system prompt, the
storyline, the party, the recent transcript and the selected memories each time,
and the model replies once and forgets everything.

That is why the memory pyramid below exists at all. Continuity is the app's job,
not the model's — it is assembled out of the database on every call, which is
also what makes it cheap to run (only a few thousand tokens travel per stage,
not the whole campaign) and what makes swapping models mid-adventure harmless.
The nearest thing to a conversation log is the `AiCall` table, which keeps the
prompt and reply of every call so "the storyteller went weird" is something you
can read back rather than guess at.

### What it has used

Every call the storyteller makes has been recorded since the pipeline was built
— stage, model, latency, tokens, repairs, and a slice of what went in and came
back. Settings → What it has used is where that finally gets read: totals, a
breakdown by stage, by adventure and by model, and the last forty calls with
their prompt and reply.

Two questions it answers that nothing else can. **"What did last night cost?"** —
once you have entered what your provider charges, which is asked for rather than
built in, because prices change monthly and differ per provider and a rate in
the code would be a confident lie a month later. Without prices it counts rather
than costs, and says so, instead of reporting a reassuring `$0.00` to a table
that has spent forty dollars.

And **"why did it say that?"** — which no amount of staring at the transcript
resolves, because the transcript is the output and the question is about the
input.

### Choosing a model

**[docs/ollama.md](docs/ollama.md) is the step-by-step runbook** — verifying the
server, making it reachable from the container, the context-window setting that
quietly breaks the pipeline, and the exact `ollama pull` commands per VRAM tier.
Start there if the storyteller cannot be reached or the practice turn is
reporting JSON failures.

The model matters more than anything else in this repo. The pipeline assumes it
can hold a scene in its head and return schema-valid JSON on request.

**Small instruct models (≈3–4B, such as `phi3:mini`) will struggle here.** Not
because they are bad, but because this is close to the hardest thing you can
ask of a local model: long context, consistent characterisation across many
turns, a tone contract, and structured output. Expect flat prose, forgotten
details and frequent JSON repairs.

For a table reading Harry Potter and Wings of Fire, the narration has to clear a
real bar. Recommended, in rough order of preference given a single consumer GPU:

| Model | Notes |
|---|---|
| `qwen2.5:14b-instruct` | Best structured-output reliability in this size class |
| `mistral-nemo:12b` | Strong long-context prose, 128k window |
| `gemma2:9b` | Good narration; watch its shorter context window |
| `llama3.1:8b` | The safe floor — competent, widely tested |

Whatever you run, check the **context window** Ollama is actually using — this
is the single most common cause of a model looking worse than it is. Ollama caps
`num_ctx` at 2048–4096 regardless of what the model supports, and truncates from
the front of the prompt, which is where the rules and JSON instructions live.
`ollama show <model>` reports it; [docs/ollama.md](docs/ollama.md) has the fix.

Because the provider is just an OpenAI-compatible base URL, a hosted model can
be dropped in by changing `AI_BASE_URL` and `AI_API_KEY` — useful for comparing
what "good" looks like before deciding how hard to tune the local one.

### How sign-in works

- Passwords are hashed with **scrypt** (`N=2^15`), using Node's built-in
  implementation. argon2id is the better algorithm on paper, but every Node
  binding for it is a native module, and this image is Alpine/musl — the exact
  packaging surface that already broke one deploy. The cost parameters are
  stored inside each hash, so they can be raised later without invalidating
  existing passwords.
- Sessions are **server-side and revocable**. The cookie holds an opaque random
  token; only its SHA-256 hash is stored, so a database dump cannot be replayed
  as a login. Changing a password ends every other session.
- Sign-in failures are **deliberately vague** ("Email or password is incorrect")
  and take the same time whether or not the account exists, so the form cannot
  be used to discover who has an account. Eight failures lock an account for
  15 minutes.
- The session cookie's `Secure` flag follows the proxy's `X-Forwarded-Proto`
  rather than `NODE_ENV`. A fresh Coolify deployment is served over plain http
  on an sslip.io domain, and a `Secure` cookie is silently dropped over http —
  sign-in would appear to work and then bounce straight back to the login page.
  Set `COOKIE_SECURE=true` to force it on.

---

## Architecture

```
Browser ──HTTPS──> Coolify / Traefik ──> Next.js container ──> Postgres
                                                │
                                                └──LAN──> your local AI (Ollama, vLLM, …)
```

Two design rules already baked into the schema and worth stating up front:

**The server rolls the dice, not the AI.** When the model decides outcomes,
character stats become decoration and it stops being a game.

**Narration and structured state are separate AI calls.** Asking one response
to be both good prose and valid JSON is where local models fall apart.

### Starting an adventurer again

Everything on a sheet is earned one point at a time, and growth is deliberately
one-way — stats never go back down, because refunds turn a character into a
puzzle to be optimised between chapters. A reset is the single exception, and it
lives at `/settings/adventurers`, behind the administrator check, rather than on
the sheet itself. A button that undoes an evening's play does not belong next to
the buttons a nine-year-old presses; asking a grown-up is the feature, not an
obstacle.

The line it draws is between what she **earned** and who she **is**:

| Cleared | Kept |
|---|---|
| experience, level, skills, practice | name, people, calling, pronouns, age |
| knacks, pockets, keepsakes | description and portrait |
| people met, spent once-a-scene moves | the household she belongs to |

Two decisions inside that are worth knowing about.

**Bonds are turned down, not deleted.** A relationship row holds two things —
that these two are sisters, which somebody chose, and how close they have grown,
which is earned. The row stays; the level goes back to nothing.

**Her four numbers are given, not guessed.** Stats are built once from twelve
points and afterwards only rise, and nothing in the game can edit them again. So
the engine knows exactly how many points growth added and has no record of which
stats they went into — a wrong guess would be unfixable short of deleting her.
The form asks, pre-filled with a proportional scale-down that keeps her shape
(8/5/4/3 suggests 5/3/2/2, not 3/3/3/3), and validated by the builder's own rule.

Confirmation is the character's name typed in full. Not an "are you sure?" —
those get clicked through — but the one confirmation that cannot be given by
accident, and that makes resetting the wrong adventurer of two very hard to do.

### What picture a chapter gets

Four possible answers, in a strict order, decided in one place
(`lib/game/scene-picture.ts`) because four callers need the same one — the table,
the route that serves the bytes, the television, and the code that decides
whether to ask a drawing service at all.

1. **A drawing this family made**, from the adventure's own picture page.
2. **Chapter art uploaded here**, in Settings → Adventures. Every family who
   plays that adventure sees it.
3. **A file shipped with the game**, at
   `public/adventures/<slug>/act-<n>.webp` — see the README in that folder.
4. **A generated picture**, from the drawing service.
5. Nothing, which is the only case where a drawing service is asked at all.

That last point is the one that matters: a chapter with art never reaches a
model, so there is no wait, no cost, and no chance of a machine's guess landing
on top of a child's felt-tip.

Chapter art is keyed by **storyline slug and chapter number**, not by act id.
The seed deletes and recreates every act row on container start, so art hung off
an id would be destroyed by the next redeploy — which is exactly when somebody
would have just finished adding it.

### Pictures the family made

Scene art has always been *generated* — asked for from whatever drawing model
the household configured, which most have not, and which in any case produces
one interpretation of a chapter rather than the family's own.

`/campaigns/<id>/pictures` is the other half. Everybody the storyteller has
bothered to remember gets a frame with their name under it — people met, places
been, chapters played — and anyone at the table can put a drawing in one. A
ten-year-old draws the beekeeper in felt-tip on a Tuesday and he is on the
television that evening, with his own face, for the rest of the adventure.

Four decisions worth knowing:

- **Any player, not just the host.** The person most likely to have drawn the
  beekeeper is the child who met him, and making her ask a grown-up to upload
  her own drawing would take the best thing about this and file it under admin.
- **A drawing beats a generated picture everywhere.** The preference lives in
  the routes that serve bytes, so it holds at the table, on the television, and
  anywhere a chapter picture is added later.
- **Faces appear when their person is in the scene**, matched by name against
  the narration. Rough on purpose: an exact answer would need the storyteller to
  tag who is present, and it does not. A false positive shows a friendly face a
  beat early; a false negative shows what the game showed yesterday.
- **Shrunk in the browser**, faces squared and places cropped wide, so a
  four-megabyte photograph of a kitchen table never leaves the phone.

One picture per thing — redrawing replaces rather than piling up, and the
version rises so every device that cached the old one asks again.

### Seven stats, and a skill every level

Four stats and two skills made a builder you could finish in thirty seconds, and
then the sheet was done. For players who spend their afternoons in Roblox and
Minecraft that is not a character, it is a form.

**Seven stats now**: Might, Wits, Heart, Spark, **Grace**, **Luck**, **Grit**.
Might was narrowed to pure force — its blurb used to end "holding on, standing
firm", which is exactly what Grit is for, and two stats the storyteller cannot
tell apart are worse than one stat too few.

Going to seven stats raised `STAT_BUDGET` to `STATS.length × NEUTRAL_STAT` = 21,
which made the migration exact: the new columns default to 3, so a character on
twelve points across four landed on twenty-one across seven — precisely the new
budget, with nothing to reallocate. A part-grown character was equally safe,
because unspent points are measured as `total − budget` and both sides rose by
nine.

It has since gone back down to a flat 12 — see **Twelve means twelve** below,
which explains why, and why that move cost nobody a point either.

**A skill at every level after the second.** Level 3 gives a third skill, level 4
a fourth. Three suggestions drawn from what she has actually been doing, plus the
whole catalogue — grown from 24 to 56 — behind *show me everything*, because a
girl who has decided her adventurer talks to animals should not have to wait for
the game to guess.

Skill room grows with her and keeps two spare slots above what she may pick, so a
skill she *chose* and a skill she *earned by doing it four times* never compete.
`CharacterSkill.chosenAtLevel` tells the two apart — null means she practised her
way into it.

**A second signature at level 5.** A calling used to be finished the moment it was
picked: a Guardian had Step In and always would, so the most characterful line on
the sheet was the only one that never changed. Each of the eight now gains a
second move — Hold the Line, Never Where You Looked, The One About Us — and the
sheet names it before she has it, because a thing you are working towards is
worth more than a thing that appears without warning.

The adjudication prompt lists the stats one per line with a *pick this when*
for each. Seven options is harder for a small local model than four, and Luck
and Grit are the least obvious of them.

### Encounters

The one D&D shape the game was missing, and it fits because the engine already
refuses violence. Everything else here answers a question the players asked; an
encounter is the world asking one back. She opens a door, and somebody behind it
is already cross.

**Nothing has hit points.** An encounter is a person or a predicament with a
**want**, and the whole of it is working out what that want is and what to do
about it: admit it, ask what happened, offer something, be funny, tell the truth
when a lie would be easier. Or leave — **every encounter has a way out**, always
filled in, always costing something. A child who is frightened must be able to
go, and going is a decision rather than a defeat.

**One track, two directions.** Deliberately the act clock at a smaller scale,
because the girls have already learned to read one:

```
  it turns  ◄──────────●──────────►  they're through
              −3       0       +3
```

Their successes push right, its own roll pushes left. Both ends are an ending
and **neither is a loss** — the left one means the situation *turns* and the
story carries on from somewhere worse.

**The world's own roll.** Each round, after the girls', the server rolls for the
encounter. Not an attack, a reaction: does the customer get angrier, does the
trap tighten? Kept server-side even when the family throws their own dice —
their die is theirs and this one is nobody's — but **shown**, because a visible
roll landing against them is the whole drama of an opposed check with nothing
being attacked.

Net movement is their successes minus what it pressed, which is meant to be
sayable out loud: *we got two, it took one, we're one up.* A critical is worth
two — the only place in this game where a natural 20 does arithmetic rather than
narrative, and it earns it.

**It cannot go on forever.** Found by driving one end to end: with the party
gaining about a success a round and the encounter pressing about as often, the
track sat between −1 and +1 for nine rounds with no sign of stopping. After five
rounds it settles toward whoever is ahead, ties going to the party.

### Alone, or asking for help

The decision the whole feature is built around, and it has to be a real fork
rather than a right answer with a decoy beside it.

| | Experience | Bond | Odds |
|---|---|---|---|
| **"I've got this"** | double, to her | none | worse — no shared-plan +1 |
| **Together** | split between everybody who was in it | one per pair | better |

**Independence is a short-term gain; teamwork is a long-term one.** Bonds compound
into Family Moves; experience is just experience. The girl who always goes it
alone levels faster and has a thinner sheet at level 8. The one who always calls
for help levels slower and unlocks *Since We Were Small*. Neither is wrong, both
are visibly good, and the game never once says which to be.

Two rules keep it honest. She declares it **on her own answer, before the roll**
— worked out afterwards it would hand the bigger prize to whoever answered
quickest. And **acting alone is not the same as saying you would**: a girl who
simply happened to be the only one who spoke gets the ordinary share.

Everybody who did *anything* that round counts as helping, not only those who
rolled. Found the same way: a brother wrote "I stand beside her and back her up",
the adjudicator quite rightly wanted no dice for it, and he was paid nothing —
which is exactly backwards for a game that just spent a feature learning to
reward listening.

### The family's own dice

The girls each own a set, and the app was rolling for them. Now the storyteller
stops and asks: **"Mira, roll your d20."** Somebody picks it up, the whole table
watches it land, and the number gets typed in.

**What the app keeps is the arithmetic.** She rolls a 14 and types 14; the game
adds her stat, her skill, her knacks, whatever a shared plan is worth, and then
asks Luck. That is the right division of labour for a nine-year-old — she gets
the part with the clatter, and nobody adds up seven modifiers while everyone
waits.

**Every roll in the game becomes theirs.** There are no storyteller-side rolls
to keep back: no monster attacks, no saving throws, no initiative. Every roll
this game has ever made came from something a player chose to try. The one
exception is **Luck's nudge**, which stays hidden — it asks whether the *world*
happened to oblige, and a girl rolling to find out whether she got lucky would
know she got lucky.

**The trade, stated plainly.** *"The server rolls, never the model"* is the
oldest rule in this codebase and it exists so the fiction cannot cheat. Typed
dice hand that to the players, who can. That is the correct trade for a family
at one table: a physical die is a social contract enforced by everybody who can
see it, which is a stronger guarantee than software has ever managed. So the
number is entered in the open, shown to the table, and put on the television —
exactly as it would be at any other game night. There is no timer, no "are you
sure", and no clever guard against a number that looks too good.

**How it works.** The pipeline is one long run — adjudicate, roll, narrate,
extract — and real dice cut it in half. `adjudicateOnly` runs the first stage,
the ask is persisted as a `PendingRoll`, and the rest of the turn happens when
the numbers arrive, with `rollerFrom` feeding them through the pipeline's
existing injectable roller. That last part is why this needed **no change at all
to how a check resolves**: the dice do not care where a number came from.

The ask lives on the server rather than in a browser, so a locked phone, a
reload, or a second device joining halfway all see the same question. And a
stopped turn **has not happened** — no experience, no bonds, no clock, nothing in
the transcript — so a table that puts their phones down and goes to bed loses one
model call, not an evening.

On the television it is the biggest thing on the wall: **WAITING ON A ROLL —
Mira**, so the room looks up instead of down at four phones.

Set per adventure in its settings, and switchable mid-story. `SERVER` is the
default and stays the behaviour when the dice are in another room.

### What a real evening found

The first full session — three players, ten turns, a spooky farmhouse — came
back with three complaints, and reading the transcript against the prompts
turned every one of them into a particular line.

**"It felt like three separate stories."** `narrationPrompt` said *"Cover every
character's action"* and `CORE_CONTRACT` said *"Give every character something to
do or notice."* Ten passages out of ten came back as Orin-paragraph,
Twinkle-paragraph, Ember-paragraph — three people in one kitchen never sharing a
sentence.

The consequence nobody would have predicted from reading the code: **every bond
was still zero after ten turns.** One girl crocheted a hat *for* another; one
asked another to pass the album. `bondMoments` are extracted from the narration,
and the narration had put each of them alone in their own paragraph, so there was
nothing for extraction to find. The format structurally prevented the game's
central mechanic from ever firing.

There is now a `ONE STORY, NOT THREE` block, and `together` detection was taught
the pattern it kept missing — *one asks another for something and gets it*, which
is the commonest form of cooperation at a real table and reads on paper as two
unrelated sentences. `bondMoments` was widened to match: making somebody a hat is
a bond moment.

**"The recaps were generic — just repeating the passage."** That one was
self-inflicted, from the previous round. The rule *"Every passage must leave at
least THREE specific things a player could act on"* went into `CORE_CONTRACT`,
which is the narration system prompt as well as extraction — so the model
appended a literal stock check to every passage: *"A grandfather clock ticks
twice, a loose floorboard creaks by the pantry door, and the tiny brass key rests
upon the cedar box."* Restating the paragraph above it. The requirement now lives
in extraction only, where `onTheTable` renders as chips; the prose is explicitly
forbidden from ending in a list.

**"No direction, and we didn't know how we finished things."** The storyteller
was handing over the answers. Every good roll produced a present:

> …as a marvelous bonus, the bottom of the pot reveals a hidden compartment…
> As a bonus, tucked inside its leather cover is a pristine, unopened roll of
> antique camera film…

Three separate jars of coffee beans turned up for one personal aim that asked for
one. `narrationPrompt` said *"a CRITICAL must go better than expected"* and
nothing bounded it, so the nearest thing to hand was always something off the
quest board. `WHAT A GOOD ROLL IS ALLOWED TO GIVE` now says what "better" means —
further, quieter, faster, something to know, a better place to stand — and
forbids handing over anything the party is currently looking for. Finding out
where it is, is a gift; picking it up is a turn somebody has to take.

#### A chapter ends when its work is done

The same evening finished both of chapter one's objectives, watched the chapter
quest close, and then played six more turns in the same kitchen. Ten turns, one
location, "Chapter 1" throughout.

Advancing the act listened only to the storyteller volunteering `actComplete`,
and it never did. So `chapterWillBeDone` in `lib/game/quests.ts` now answers the
hard question — will every objective of this chapter be ticked off once this turn
lands? — and the story moves on either way, the model's opinion or the fact.

It has to be asked *before* the transaction, because the next chapter's personal
aims need a model call and model calls cannot happen inside one. It calls the
same `resolveFinds` and `resolveDeeds` that do the ticking a moment later, so the
prediction and the commit cannot disagree.

Finishing the last chapter's work now ends the adventure too, for the same
reason.

### Six things the same evening asked for

The transcript above fixed the storyteller. Reading the same evening again for
what the *game* did — rather than what it said — turned up six more, and all six
are about the table rather than the prose.

**"I'll help her with that."** `resolvePlans` found shared plans by reading all
the actions at once and noticing two that served one idea. Elegant, and in ten
turns of three children constantly asking each other for things it found
**nothing**. A rule a 7B model reliably misses is not a rule, so a player can now
tap *I'm helping with that* against somebody else's answer
(`RoundAnswer.helpingCharacterId`). `declaredPlans` turns those taps into plans
and `mergePlans` folds them in with whatever the adjudicator spotted. It is not
free: she still has to write an action of her own, and it still has to make sense
next to theirs — the storyteller narrates the pair as one thing, and a
declaration attached to something unrelated reads as nonsense to everybody at the
table, which is a better check than any validator.

**Goals on the play screen, not behind a tab.** The family spent an hour chasing
a goal they had invented — *find the faceless demon creature* — while *the old
family album* and *a camera that still takes film* sat one tap away on the quest
tab. A goal you have to open something to see is a goal that does not exist
mid-turn. `neededObjectives` now renders under the passage, beside what is in
reach. Shared quests only; a personal aim is hers until she says it.

**The game asks them to talk it over.** *Talk to each other* was the smaller,
greyer, second button, and everything about the screen said it was the lesser
option. It was pressed once in an evening. Now `talkNudge` (`lib/game/talk.ts`)
puts one line beside it at the moments a table would naturally confer — something
standing in front of them, a clock nearly out, a scene just opened, four quiet
passages — on the phones and on the television, and never more than one at a
time. It points at the button, never at the answer.

And it now says what talking was **worth**. Two bugs, both silent: a bond that
deepened without crossing a Family Move threshold printed nothing at all, which
is four deepenings in five; and `talkTurn` collected its milestones and dropped
them on the floor, so even a conversation that *did* unlock a move announced
nothing. The one round hardest to justify to a nine-year-old — *nothing is
rolled, the story does not move* — was also the only one that never showed a
result.

**The adjudicator may not invent difficulty.** It was being handed the freedom to
restate a player's action as an "intent", and it used it: *"I go back to the
table to check the album"* came back as *doing it quietly*, which is a harder
check than the one she asked for. `intent` is now defined as a restatement of her
own words and nothing else.

**Encounters that fire when the tone asks for them.** A family chose SPOOKY and
got a quiet farmhouse, because the rule for opening an encounter was written once
and conservatively. `encounterAppetite` now varies it: cozy stays cautious, spooky
and adventurous get hungry after four quiet turns, and a standing encounter still
hard-blocks a second.

**The check, before the dice.** A `checking` progress event now names who is
rolling, against what, and how hard, in the pause between the storyteller
deciding and the dice landing. The most tense moment in the game used to be a
spinner.

### The dressing room

Four stats, two skills and a text box was the whole of an adventurer's identity.
Everything added since made those numbers *deeper*; none of it made her look
like anybody. The girls are nine and ten and they play Dress to Impress — they
do not want to *describe* an adventurer, they want to browse.

So a look is now six chosen slots — hair, what they wear, what goes over the
top, armour, a colour, and one thing somebody would remember them by — each with
a dozen concrete options and a free-text box underneath, because a child who
wants a coat made of bees should get one. `lib/game/wardrobe.ts` holds the
catalogue; `/characters/[id]/look` is the screen, and the sentence at the top
rewrites itself on every tap.

**And it fixed the story.** A family reported that whatever they wrote in the
description box took over every passage. That was not the model being greedy —
`renderParty` appended `description` to the party line *unlabelled*, next to the
stats, so the most distinctive sentence in the prompt was also the only one with
no stated purpose. Handed that, a storyteller quite reasonably treats it as what
the character is about. Now there are two lines with two jobs:

```
- Mira (she/her), child Human Trickster, level 1. Might 3, Wits 3, …
  Who they are: Names every animal she meets, and will not be hurried.
  Looks like: with two braids, under a hooded travelling cloak, in moss green,
    and always a whistle on a cord. Scenery, not plot — mention it only when
    somebody would actually see it, and never build a scene around it.
```

The prompt gained a matching block: *a cloak is a cloak; it is not a mystery, an
heirloom, or the reason anything happens.* Personality it may lean on as hard as
it likes — a stubborn character should behave stubbornly. The hair is not
character.

#### A wardrobe that grows

`earnedWearables` reads the party's pockets and offers back anything that could
go on a body — cloaks, helms, bracers, amulets — marked with which adventure it
came from. A cloak chosen from a list is a preference; a cloak taken off a
scarecrow in chapter three and worn ever since is a story, and the game already
knew where every item came from.

#### The portrait ladder

Same shape as `scenePicture`, and the bottom rung is why it was worth building:

1. **A drawing somebody made**, photographed. Nothing beats it and nothing
   overwrites it.
2. **A portrait drawn from the wardrobe** — only when a drawing service is
   configured, only when a child taps *Draw them*, and it says so when the
   outfit has changed since. Stored in its own table so a machine's guess can
   never land on top of a felt-tip drawing.
3. **A crest.** Two colours from the palette she chose and the first letter of
   her name, drawn as inline SVG.

Most households will never configure a drawing model, and a dressing room that
produced nothing visible is one nobody opens twice. A crest costs no bytes, no
request and no provider, and it changes colour when she does.

### Knowing what you are doing

*"Still somewhat confusing as to what is needed to accomplish said quests."*
Three causes, and every fix is a fact the game already held and had never said.

**What would count.** `looksLikeTheSameThing` has always been generous — *the
brass key* is satisfied by *a small brass key, green at the teeth* — and the
screen has always shown the storyline's exact words, which read like a riddle
with one answer. `whatWouldCount` now says which words the matcher is looking
for. That is not making the quest easier; it is telling a child the rules of the
game she is playing. (It also caught a genuinely funny bug: the matcher's crude
singulariser turns "brass" into "bras", which is right for comparing and very
wrong to print under *things to look for*.)

**Somewhere to try.** The game had machinery for the storyteller to *open* an
encounter and none at all for it to *place a lead*, so a party told to find a
sky-map was left with a village and no reason to walk into any particular door.
`leads` is now extracted per turn — *the bell-ringer keeps the old charts* — and
gathered across the scene, de-duplicated, three at most. It is the next door,
never what is behind it; the prompt says so twice, and says `[]` is the right
answer on most turns.

**What you have already tried.** Three girls searching the same barn twice is
most of what aimless actually looks like. Every attempt anybody has typed has
been a row since the first evening and had never been shown as a list. It is
folded away next to *what you know*, because it is a checklist rather than part
of the story.

### A recap of what changed, not what was said

*"The recaps were generic — just repeating what was said in the passage."*
Structural rather than a matter of wording: `summaryPrompt` was handed a
transcript and asked to summarise it, and a model handed prose returns shorter
prose. It had no way to know which two sentences of eight hundred words mattered.

The game did know. Every milestone — *Mira is now carrying the brass key*, *Mira
and Rowan grew closer* — is a `SYSTEM` turn event on the scene it happened in.
So `lib/game/recap.ts` reads the rows: the ledger goes on screen under each
chapter's prose, **and** into the summariser, which now gets told what happened
rather than asked to guess.

#### The end of a chapter

A chapter used to end silently, mid-scroll — the act index changed, the header
said "Chapter 2", and nothing marked it. For a family playing on a school night
that is the most useful thing the game can put on a screen. `chapterCard` shows
what they did, how the dice went, what they carry into the next one, and — the
actual point — that this is a good place to stop. It stays up for the whole of
the new chapter's first scene, so nobody loses it by refreshing.

#### And what a bond is for

They earn bonds every evening and the moves those bonds unlock were only ever
visible inside a picker, mid-turn, to whoever happened to be typing. The party
sheet now says what a pair can do together and what one more moment would open:
*one more moment together unlocks Shove Over*. "Two more" means nothing on its
own; "two more and you can Stand Together" is a reason to go and be kind to your
sister.

### Four more on the shelf

The library was ten cosy-to-spooky adventures in one register. These four were
asked for by name, and each is written toward something the girls already play
or have just watched:

| | | |
|---|---|---|
| **Say It Three Times** | SPOOKY · TEEN | A skipping rhyme with four verses and a dare at the end. Things start coming true a verse late, to whoever said it first. |
| **Build Before Dark** | ADVENTUROUS · MIDDLE_GRADE | A country where the ground comes up in tidy cubes and anything taken apart goes back together. When the light goes, the things that were taken apart come looking for their pieces. |
| **Come Out, Come Out** | SPOOKY · MIDDLE_GRADE | A game of hide and seek started in a closed-down department store twenty years ago. Somebody is still counting. |
| **Until Six** | SPOOKY · MIDDLE_GRADE | A night shift at a shut-up pizza-and-arcade place. The band on the stage has stood there since 1987 and is not supposed to move. |

They are written in the *genre* rather than in anybody's world — no borrowed
names, characters or branding — which keeps this repository the family's own and
happens to make them better stories, because the endings have to be invented
rather than remembered.

Each of them lands on the floor `CORE_CONTRACT` sets, and the two frightening
ones land on it hardest. *Come Out, Come Out* is a proper chase in which nobody
is ever caught, and the last move is finding the seeker — who has been It for
twenty years and would very much like to stop. *Until Six* keeps every part of
the night-shift horror the girls know from the films: the cameras, the doors,
the power running down, the thing that only moves when nobody is looking. What
it does not have is a monster. The band is looking for four children who were
never found, it has been looking since 1987, and it can no longer tell a lost
child from one who is only visiting — so the last hour of the shift is spent
putting four names somewhere they can be read.

That is not the contract being worked around. It is the contract turning out to
describe the thing the girls already loved: a place built for children's
birthdays, and something inside it that is frightening because it is sad.

#### What a new adventure now has to survive

Two guards went into `tests/storylines.test.ts` with these, both earned the hard
way earlier in the same week:

- **No sought thing is secretly two things.** `splitObjective` takes "craft the
  mug and take the first sip" apart, so a shipped seek that trips it would
  arrive as two objectives nobody wrote. Every seek in the library is checked
  against it.
- **What would count has to read like words a child would hunt for.** The
  outstanding-FIND line now prints those words on screen, so a seek made of
  filler would put *"that, will, with"* under the heading *anything with these
  in its name counts*.

Plus the ordinary ones: chapters numbered from one, every tone and reading level
real, no two adventures sharing a clock, a slug or a title.

### The evening that got stuck in chapter one

Sixteen turns, one chapter, two players, and a family reporting three things:
they could not finish a quest, they were levelling absurdly fast, and completing
things was still confusing. Reading the journal against the code turned all
three into exact lines.

#### An objective nobody could ever tick

`prisma/storylines.ts` gives chapter one of *The Village That Built Itself* a
single thing to come away with:

```ts
seeks: ["the first thing you made, awake now and following you about"]
```

`seeks` becomes a **FIND**, and `resolveFinds` satisfies a FIND by looking in
the party's pockets. In play that thing turned out to be a wooden owl called
Woody who rides on a child's shoulder. A companion is not an `InventoryItem` and
should never become one, so the chapter's only objective was **unsatisfiable by
construction**. Nothing anybody typed for sixteen turns could have moved it.

Fixing that one line would have fixed one storyline. What was actually wrong is
that the pockets were the *only* answer, so `resolveDeeds` now matches any
outstanding objective rather than DEEDs only, and the extraction is handed
everything on the board rather than the deeds alone. The pockets are still the
first answer and still the better one for an ordinary object — they need no
model call and cannot be talked into anything. This is the second answer, for
the things that are true in a story and could never be true in an inventory.

It stays honest because the model does not get to invent one: it is handed the
list and may only report that one of *those* happened.

#### One line, one thing

A personal aim read *"Craft the oversized wooden coffee mug and successfully
take the first morning sip from it"* — two conditions, one ○, and no way to see
that the crafting was done and the sip was not. So the evening contains a turn
where a father drinks from a mug and nothing happens.

`splitObjective` splits them, and both prompts now ask for one thing per
objective. The splitter is deliberately timid: `and then`, `and successfully`
and their kin always split, a bare `and` splits only when what follows reads as
an instruction, and *a needle and thread* survives untouched. A wrong split
would invent an objective nobody can finish, which is the failure this whole
round exists to fix.

#### Being stuck is now something the game can see

The act clock notices a party going nowhere *in general*. Nothing noticed a
party going nowhere *at one particular thing* — and that is what sixteen turns
in one chapter actually looked like: busy, inventive, and no closer.

`stuckObjectives` watches for a quest with nothing ticked after six turns.
The storyteller is told to put the thing back within reach — and told twice, in
capitals, not to hand it over — and the play screen says *"you have been after
this for 16 turns"*, because a family who has been in one room all evening
already knows, and the game pretending otherwise is what makes it feel like
their fault.

### A ladder that lasts a library

The same journal: **level 4 in sixteen turns.** Both players. The old thresholds
were `[0, 0, 10, 25, 45, 70, …]` and a roll pays 1–3 experience, so an evening
earned about 45 each — a level every five to eight turns, three skills and three
knacks a session, and a finished character long before the story library ran
out. Exactly what the family said: *"we have not completed a full quest, but I
was able to increase my stats by points, add 3 new skills and multiple knacks."*

| | Was | Now |
|---|---|---|
| Level 2 | 10 xp | **40** |
| Level 3 | 25 | **100** |
| Level 4 | 45 | **180** |
| Level 13 (cap) | 590 | **2080** |
| xp per stat point | 10 | **40** |
| A new skill | every level after 2 | **every third level** |
| A new knack | every level | every level *(unchanged)* |

An evening is now worth roughly one level early on and rather less later;
reaching thirteen is a couple of years of weekly play. The two numbers stay tied
together on purpose: the seven stats hold 49 points of growth, which at forty
apiece is 1960 — just under the 2080 the ladder ends at, so the sheet fills up
at about the moment the levels run out.

**Nothing is taken away, and that is the whole difficulty.** Orin is level 4 on
45 experience; the new ladder says 45 is level 2. So `levelReached` makes the
stored level a high-water mark: it rises when the curve says so and never falls.
Every writer of `Character.level` goes through it. An adventurer ahead of the
new curve simply stays where she is until it catches up — levelling goes quiet
for a while, which is precisely what was asked for.

The same rule covers skills. Four chosen skills at level 4 is one over the new
entitlement of three; `skillPicksUnspent` clamps at zero, so she keeps all four
and has nothing waiting until level 10. And because "nothing waiting" is now the
normal state, her sheet says when the next one arrives rather than going silent.

Every level still hands over a knack, so a level-up is never empty; every third
one hands over two things, which is what makes those worth waiting for.

### The long road

Every adventurer has a room at `/characters/[id]/story` holding everything she
has ever done. Per character rather than per account, deliberately: a household
holds several adventurers over the years — one handed on, one started again —
and the trophies belong to whoever earned them.

The interesting part is how little of it is new. The game had been recording
nearly all of this since the first evening and showing it nowhere:

| Already recorded | Read again, before this |
|---|---|
| Who found what (`QuestObjective.foundByCharacterId`) | never |
| How an encounter ended, and who took it on alone | never, once resolved |
| How often two adventurers actually spent a Family Move (`FamilyMoveUse`) | never |
| Times one took up the other's idea (`ListeningBond`) | never |
| Every roll she has thrown | the transcript, then gone |
| How one adventure went | `/campaigns/[id]/summary` — that one only |

So `lib/game/chronicle.ts` is a reading problem, not a collecting one, and it
**calls** `lib/game/summary.ts` rather than reimplementing it — a trophy room
and an ending can never disagree about what an evening was worth.

The room has: four big numbers, the adventures newest first with their own
figures, **what she found**, **what she stood up to**, **who she has**, the
people she knows, what it cost, and pictures. Written as sentences —
*"the brass key, green at the teeth"* — because the audience is nine and
`objectives_completed: 4` is not a thing to be proud of.

Two rules carry over unchanged: a personal aim stays hers until she finishes it,
and a tie counts only once the other household has agreed to it.

#### Who she has

The part nobody could see before. Per other adventurer: the tie, the bond, which
moves it unlocked, **how many times they have actually spent one**, adventures
shared, and how often one took up the other's idea. Every number there had been
counted for months and shown to nobody.

#### One thing is stored, and only one

Everything above is derived, which is the right default — it cannot drift, and
it stays true if a turn is taken back. But deleting an adventure cascades, and a
trophy room that forgets five evenings because somebody tidied up is worse than
none.

So `RoadEntry` writes one row per adventurer when an adventure **completes** —
title, storyline, date, and the counts — with `ON DELETE SET NULL` rather than
cascade. That is the whole point of the table: the adventure can go and the fact
that she finished it stays, with the title kept as text beside the id. Exactly
what `Acquaintance` already does, and for the same reason.

Written at completion because that is the only moment the numbers have stopped
moving, which is what makes a snapshot safe here and nowhere else. A live
adventure is never read from that table. On her road, an adventure whose
campaign has gone is still listed and still counted — it just has no journal
left to link to, and says so.

### Saying who is who

A tie — *"Orin is the parent of Wren"*, *"Mira is the sibling of Bramble"* — is
declared by the family, never invented by the storyteller, and it is the thing
everything else in this section hangs off. `deepen` in `lib/engine/play.ts` only
ever raises a bond on a tie somebody declared, so **two adventurers with nothing
said about them earn nothing all evening**, however kind they are to each other.

That made a scoping bug expensive. Reach used to be "somebody this *character*
has already shared a campaign with", which is a chicken-and-egg: a newly made
adventurer has shared nothing, so the dropdown came back empty at exactly the
moment a family wants to say who he is. The case that found it — a father handed
his old character to his daughters, made a new one, and could not say he was
their father. Reach is now the **table**: your own adventurers, plus anybody in
an adventure you own or are travelling in (`lib/game/ties.ts`). Not one step
wider; this must never become a way to browse the whole app.

The kinds have always included `FRIEND` and `PET` alongside the family ones, so
best friends need nothing added — they needed somebody reachable to apply them
to.

**One end of a tie is always an adventurer you answer for.** That single
invariant is what stops anybody arranging other people's families, and it is
checked in the action rather than only in the form.

#### Ties that touch another household

One-sided declaration was fine while every character in the house belonged to
one account. It stops being fine the moment somebody outside the house joins a
party, because *"your child is my character's sister"* is a claim about somebody
else's adventurer and it pays out in bond levels and Family Moves.

So: a tie between two adventurers that already answer to you is confirmed on the
spot — asking a household to agree with itself is ceremony for nobody. Anything
else is **stored waiting**. It shows on both sheets, says plainly that nothing
is being earned, and appears on the other household's list as *"1 tie to agree
to"*, because nobody would ever go looking for it. Until somebody says yes it
earns no bond, unlocks no moves, and is not mentioned to the storyteller.

Either side may agree, and either side may remove — but the household that
proposed cannot answer for the one being asked, or the whole thing would be two
clicks by the same person.

Every tie that existed before this was stamped confirmed by the migration. A
family mid-adventure must not come back after a deploy to find their sisters
unrelated.

#### Asked at the moment it is obvious

The character sheet has always had the editor and nobody found it — you go there
to look at an adventurer, not to think about the party. So the campaign setup
page now names any pair in the party with nothing declared and offers the
sentence right there, along with the reason: bonds only grow between adventurers
who have said how they are related.

Where *neither* adventurer is yours — two children on two sign-ins — the pair is
named but not offered, because one end of a tie must be somebody you answer for.
Whoever is running the evening can say it out loud, which at a kitchen table is
faster than any button.

### Bonds that count more than kindness

Bonds only ever rose from one thing: a `bondMoment`, which the storyteller is
told to report *"only when one genuinely helped, protected, encouraged or
comforted the other."* One-directional care — standing between her and the
noise. Lovely, and about half of what actually happens at a table.

The other half was invisible. **Talking it over earned nothing at all** — the
conversation turn made one model call, wrote a paragraph, and touched no state
whatsoever, so the single most cooperative thing an evening produces was worth
exactly zero. And **two girls executing one plan looked like two unrelated
things** that happened in the same room, because adjudication read every action
on its own.

Three changes, and a fourth so the game suggests what it rewards.

**Together.** The adjudicator now reports when two or more actions serve one
plan — *"I boost her up"* and *"I reach for the latch"*. Everyone in it rolls at
**+1**, every pair in it earns a bond, and both the dice card and the storyteller
are told, so one plan is narrated as one thing two people did rather than two
things that happened near each other.

It cannot be claimed, only done. There is no button: two children have to write
two actions that genuinely serve one plan. If they end up doing that every turn,
that is not an exploit, it is the entire point.

The bonus is deliberately **smaller than Lend a Hand's +2**. That is a Family
Move — earned through a bond, spent once a scene. This is free, repeatable and
available on the first evening, and if it paid the same then the moves a family
works up to would be worth less than the thing anybody can do for nothing.

**Listening.** After a conversation, a small second call asks who genuinely took
up whose idea — built on it, agreed to it, changed their mind because of it.
Those pairs earn a bond, **capped at one per pair per scene**. Without the cap
the fastest route up the ladder would be typing "hi" at each other eleven times,
which is the exact opposite of the point.

This also pairs with the act clock: the clock only moves on action turns, so
**talking is the untaxed way to get unstuck**. Being stuck costs you; conferring
does not.

**Moves that know whose they are.** The seven relationship kinds had been stored,
labelled and then used for nothing — sisters, a father and a daughter, and two
best friends all unlocked the identical five moves with the identical five
names. They now fall into three flavours, same mechanics, different words:

| | Siblings | A grown-up and a child | Friends |
|---|---|---|---|
| `lend_a_hand` | Shove Over | Here, Let Me | Boost |
| `stand_together` | Both of Us or Neither | On My Shoulders | On Three |
| `never_alone` | You Are Not Doing That Alone | Go On. I Am Right Here. | Not Without You |
| `two_as_one` | You Always Do That | I Knew You Would | Same Idea |
| `hearthlight` | Since We Were Small | Everything I Know | Best in the World |

Everything still resolves through `move.key`, so a family that renames nothing
plays exactly the same game. Named from the *helper's* side, so the two
directions of one move can read differently — a daughter helping her father is
not the same sentence as a father helping his daughter.

**And the hints point at each other.** The three ideas offered to a stuck player
were solo-only; the prompt did not even mention who else was in the party. When
somebody else is there, one of the three is now an idea that needs them, by
name. You cannot reward teamwork the girls were never shown.

### The act clock

Nothing was ever refused. An action with nothing to do with the story got
narrated as warmly as one that cracked it open, and the game's only response to
a table going in circles was more pleasant prose. Two things followed, and the
second is the dangerous one:

1. An evening could be spent going nowhere with no signal it was happening.
   Pacing counts *scenes*, and a scene only ends when the party moves — so ten
   turns in one kitchen is still scene one.
2. When an act overran, the storyteller was told to *"look for an honest way to
   finish it soon"*. Handed a stuck party, the cheapest honest-looking way out is
   to hand them the answer. Children work that pattern out in about two
   evenings, and once they have there is no reason left to think about anything.

**The rule is the one the game already believed, extended one step.** A failed
roll never stops the story, it complicates it — and now an unfocused *idea* is
treated the same way. It is never refused. It **costs**.

Each act carries a clock named in the story's own words: *The fog*, *The stars
going out*, *Days until the festival*. It fills on a turn where the party got
nowhere, and the girls can see it move.

**The fairness line is the whole design:**

| | |
|---|---|
| She tried the right thing and the dice said no | **nothing moves** |
| She did something that was not really anything | **the clock moves** |

Charging her twice for one bad roll is how a game teaches a child not to try.

**A wasted turn is computed, not judged.** The pipeline already reports
`deedsDone`, `itemsGained`, `questsOpened`, the outcome of every check, and
whether a scene or act closed — so a turn that produced none of those and had no
successful roll is definitionally one where nothing moved. On top of that the
extraction now answers `movedForward`, which exists to catch the one kind of
turn the hard signals cannot see: asking an innkeeper who else was at the fair
finishes no objective and fills no pocket, and is exactly the thinking this
feature is meant to protect. **Both must agree** before anything ticks, and the
field defaults to `true` — an unfair tick is felt at once by a nine-year-old and
a missed one is invisible.

**Nobody rolled anything** is the third condition. A roll means somebody
committed to an attempt the game thought could fail, and that is engagement
whatever the die said.

**A full clock is a debt, not an event.** A passage is written before it can be
read, so the turn that fills the clock cannot also show the consequence — the
next one collects. And what it collects is never a loss: what the party was
trying to prevent partly happens, the story carries on from a worse position,
and the storyteller is told in as many words that nobody is hurt, the adventure
is not over, and it must not scold anybody.

The limit is `scenesPerAct + 2`, so it means the same thing in a brisk act as in
a leisurely one — four notches for *one evening*, nine for *take our time*.

Two prompt changes back it up. The core contract now carries **never hand the
players the answer because they are stuck — give them a new way to look, never
the thing itself**, on every single call rather than only when the clock is
running. And the pacing overrun line was rewritten from "finish it soon" to
*raise the pressure rather than the curtain*.

### What Luck actually does

Luck shipped as a plain stat, and a plain stat is the one thing Luck cannot be.
The other six answer *how good are you at this?* — a question the storyteller
asks by picking one of them. Luck answers *did it happen to go your way?*, and
something that only counts when it is chosen is not luck, it is a talent for
rummaging.

So Luck now bends every check, whichever stat was rolled. On a result that was
going to disappoint, fortune sometimes steps in and lifts it one step:
a complication becomes a partial, a near miss becomes a success.

**Never a flat bonus.** Luck helps with everything and the other six help with
one thing each, so a bonus would make it strictly the best stat on the sheet —
and a nine-year-old works that out in one evening, after which every adventurer
in the house is a Luck adventurer. A chance to lift a roll that already failed
cannot be aimed, cannot be counted on, and never turns a good roll into a better
one.

The chance is `max(0, statModifier(luck)) × 8` percent, derived from the same
curve every other stat rolls on rather than given one of its own. Three
consequences fall out of that for free: neutral Luck does nothing, low Luck is
never punished, and the nudge flattens exactly where rolls flatten, so the far
end of a long career cannot become a character who never really fails.

| Luck | Chance | Lifted, of all checks | Succeeds |
|---|---|---|---|
| 3 (neutral) | 0% | 0% | 44.9% |
| 5 (build cap) | 16% | 8.1% | 46.6% |
| 12 (ceiling) | 48% | 24.0% | 49.7% |

Measured over 200,000 rolls at NORMAL. The success column is the point: most
lifts turn a complication into a partial, which is *not* a success — so Luck at
the build cap moves how often things work by under two points, while visibly
happening about once a chapter. It softens the evening without deciding it.

Three rules the dice keep. A natural 1 is never lifted — *nothing saves a 1* is
a rule a table learns in one evening and enjoys. Luck never hands out a
critical; that word belongs to the die. And it applies last, after Family Moves
and spent abilities, so a girl who has been saving her signature move all
evening is never told afterwards that she got lucky instead.

The storyteller is told when it happened and instructed to narrate the *world*
turning out kindly rather than the girl being clever — the branch held, the
guard looked the other way. The dice card says so too, because the numbers on it
still show a miss.

### Once a scene, once a chapter

Three different systems promised a limit and none of them counted.

Archetype signatures said "spendable once a scene" in their own doc comment.
Steady Hand, earned by practising a skill to rank 2, said "once a chapter" in
the sentence a child reads. So did two knacks. All four were honour-system rules
in a game whose first design principle is that **the server rolls the dice** so
the fiction cannot cheat — and the prompt made it worse, telling the storyteller
the signature was something the character *"can always"* do. The one participant
who could still have enforced the rule was told the opposite of it.

`AbilityUse` counts them now, modelled on `FamilyMoveUse` — which was for a long
time the only limit in the game that a limit actually was. One table for all
three kinds, because the question asked of it is always the same: has she used
this one, in this window, yet.

- **Scope** is a single `windowKey` string, `scene:<id>` or `act:<index>`, under
  one unique constraint. Two nullable columns with a conditional index would
  leave half the rows uncovered, which is how a "once a chapter" ability quietly
  becomes unlimited.
- **Signatures got a machine-readable effect.** Most are `NARRATIVE` — a
  storyteller told plainly that it must answer is a stronger guarantee than a
  modifier. The two that are numbers were already written as numbers in the
  blurb, so those are the numbers the engine uses.
- **Spending happens on her own answer**, not at the review step where Family
  Moves live. A move belongs to a pair, so somebody chooses for both; a
  signature belongs to one girl, and on her own phone she should be the one who
  decides.
- **Recorded only once the turn commits**, and returned by undo. A model that
  times out must not cost her the one thing she gets this chapter.

`lib/game/abilities.ts` is the single catalogue the picker and the prompt both
read, so the buttons at the table and the rules the storyteller is given cannot
drift apart.

### The television

The story can be put on a screen in the room, at `/screen`. The television has
no account and never gets one — it shows a six-character code, and somebody
already holding the adventure on their phone types that code in.

Signing a TV into the household was the obvious alternative and is the worse
one: it would put a session that can delete adventures on the least supervised
device in the house, kept alive by a browser nobody signs out of, and it would
have to be typed with a remote control. Pairing moves the typing to the device
that has a keyboard and the credential to the device that cannot be reached from
the sofa.

Three limits define what a paired screen is, and all three live in
`lib/game/screen.ts`:

- **It can only read.** The token travels in an `Authorization` header rather
  than a cookie, so it is only ever attached where the display attaches it — no
  write route can receive one even by accident.
- **It reads one adventure.** The campaign is set once, by an account that could
  already see it, and changes only by unpairing.
- **It sees less than a player does.** Personal aims are filtered out, and the
  party's join code is never sent. A television in a room full of people is the
  least private surface in the house.

Unpairing takes effect on the next poll, a few seconds later, and deleting an
adventure releases every screen showing it.

#### What is actually on it

It began as one very large paragraph and the quest list underneath, and that had
the two faults a wall display can have: the passage was often taller than the
screen — and a television cannot be scrolled — and everything the game already
knew was on a phone or nowhere. It is now a dashboard.

Down the left: **the passage**, fitted to its box rather than allowed to run off
it; **the question** it left them with; and **the things it put within reach**.
Down the right: the chapter's picture, **what we need** (the open objectives, in
the players' own words), **what we know** (the facts extraction has been
collecting all along), and **the last rolls** — the most public thing that
happens in an evening, and until now the most privately displayed. The party runs
along the bottom, with whoever the story is waiting on lit up. A roll to be
thrown, or something standing in front of them, takes the top of the left column
while it is happening, because in those moments that is the only thing the room
is looking at.

The fitting is worth a word, because it is the part that had to be got right.
The passage is measured against its box and the type sized by ratio — down when
it is too tall, back up when a paragraph has been dropped and given its space
away. Only when it is still too tall at the smallest readable size does it start
dropping paragraphs, oldest first, and it says `…earlier in this scene` when it
does. Shrinking a little beats hiding anything, and hiding the beginning beats
hiding the end, because the end is what they are answering. There is a hard pass
budget behind it all: the first version stepped down two pixels at a time and
tripped React's update-depth limit, which on a television means a blank screen.

### What the table is told

Two complaints, one cause. The girls were shouting out guesses rather than
deciding — a door that was never mentioned, a person who was not there — and
*I don't know what to do* had become the way out of that, which is a clue used
while the escape room is still running.

The storyteller was only half the problem. Every turn the game extracts
memories, opens objectives and rolls dice, and then showed the players a passage
and a text box. So the fix is in two halves.

**The storyteller says what is there.** `CORE_CONTRACT` in `lib/ai/prompts.ts`
now opens with it, because it was the most misunderstood rule in the file: be
*generous* with information and stingy only about what to **do** about it. A
player confused about the situation is a failure of the telling; a player unsure
what to try is the game working. The never-hand-them-the-answer rule is about
the solution and nothing else, and is never a reason to be vague.

Extraction is asked for `onTheTable` alongside the closing question: up to three
things the passage put within reach, written as things and never as advice —
"the shutter, nailed shut", "Bram, who will not look at you". A local model will
write "you could try the shutter" however plainly the prompt forbids it, so
`cleanTable` in `lib/engine/play.ts` trims the opener and drops anything still
addressing the players. They are shown as chips under the question, on the phone
and on the television.

**What they already know is now on screen.** `lib/game/briefing.ts` collects it:
the question and the things in reach, the facts the party has collected, the
outstanding objectives, and the last few rolls. Shared quests only — a personal
aim is hers until she says it.

Nothing here is a hint. Every field is something they were already told. Telling
a nine-year-old what she already learned is not giving her the answer.

#### The stuck button, in two rungs

*I don't know what to do* used to fetch three ready-made first-person actions and
drop the chosen one straight into the box. Now:

1. **Here is where you are** — free, instant, no model call. The things in reach
   and the facts, restated. Most of the time being stuck is only having lost the
   thread of a long passage, and this is the whole cure.
2. **Still stuck — give me a nudge** — three things somebody noticed, and
   nothing more. "The lamp in the upstairs window has not moved all evening."
   Never an action, never in the first person, never a verb aimed at her.

And the nudges are text, not buttons. Nothing fills the box for her any more.

### Twelve means twelve

A household hit the same wall twice, from two directions. Resetting a character
to start fresh, the screen offered nineteen points; and "even if I remove and set
up to 12 stat points, I will still have the ability to use up 12 points." Both
times the answer was a paragraph explaining that twelve was an allowance *on top
of* a floor of one in all seven, so the boxes correctly added up to nineteen.

A rule that needs a paragraph is the wrong rule. `STAT_BUDGET` is now the total
on the sheet: add up the seven boxes and you get the number at the top of the
screen. `POINTS_TO_SPEND` is gone, and with it the two-numbers-one-meaning
problem that produced "all 12 spent" over a spread of 19.

**And the total is hers, not everybody's.** `allowedTotal(xp, builtWith)` is
twelve plus one point per 40 experience, and it is the single rule behind the
builder, the growth screen and the administrator's re-lay form. A level-one
adventurer lays out 12; one with 200 experience lays out 17. The re-lay form
recomputes it live from the experience field, so changing the experience changes
the ceiling in front of you.

**Nobody already playing lost a point.** `Character.buildBudget` records what
each adventurer actually started with, and every growth calculation measures
from that column rather than from the constant. This is the third time this
budget has moved — 12 across four stats, 21 across seven, 19, and now 12 — and
that column is why none of those moves cost a child anything.

**Starting again really does start again.** Two tables added the same week were
missing from the wipe, so an adventurer began her new life still carrying the
dream and the companion of her old one. Both are cleared now, and
`tests/reset.e2e.mts` seeds one of each and asserts they are gone — against real
rows, because "nothing was left behind" is not a claim a pure function can make.

**Deleting an adventure no longer leaves ids pointing at nothing.** Dream echoes,
rival meetings and where a companion was found all stored a campaign id with no
constraint behind it. Each now has `ON DELETE SET NULL`; the campaign *title*
stays on the row, because the thing still happened and the history should read
correctly afterwards.

What deleting an adventure does **not** take is anything the character earned in
it — her items, keepsakes, the people she met, her dream and her companion are
hers, not the adventure's, and they stay on her sheet. Clearing those is what
the reset screen is for.

### The mark

Saved to a Windows desktop, Hearthlight used to arrive as the generic
torn-page glyph; added to an Android home screen, as a grey circle with a **7**
in it — the first character of the domain, which is what Chrome draws when a
site gives it nothing. Neither was a rendering bug. The app simply had no icon
of any kind.

It has one now: a hearth mouth with a fire in it, gold on warm black.

**One file is the master.** `app/icon.svg` is both the source and the icon
modern browsers load from the tab. `npm run brand:icons` rasterises everything
else from it — edit the SVG, run the script, and the whole set moves together.

| File | Who reads it |
|---|---|
| `app/icon.svg` | Browsers, in the tab |
| `app/favicon.ico` | **Windows** — Chrome builds a desktop shortcut from this, and shows the generic page glyph without one. Four sizes: 16 tab, 32 taskbar, 48 shortcut, 64 for displays at 125–150% |
| `app/apple-icon.png` | iOS and iPadOS home screens |
| `public/icon-192.png`, `public/icon-512.png` | **Android**, via `app/manifest.ts` — this is what replaces the "7" |

Three constraints shaped the drawing, and each one threw something away:

- **Sixteen pixels.** A lantern was drawn first and discarded — at tab size its
  frame turned to mush. What survives that small is one bold dark shape on one
  bold light one.
- **A dark phone.** The tile is gold rather than the app's near-black, because
  a dark icon on a dark wallpaper is a hole. Gold reads on either.
- **A circular crop.** Android masks home-screen icons to whatever shape the
  launcher likes and guarantees only the middle 80%. The arch's furthest corner
  sits 189 units from the centre of a 512 grid, inside the 204.8 that allows —
  which is what lets the same file be declared `maskable` instead of needing a
  second, padded one. Redraw the arch wider and that has to be re-earned.

### A note on exposing your AI

Do **not** port-forward Ollama to the internet, and do not leave it listening on
a public address. It ships with **no authentication of any kind** — anyone who
reaches port 11434 gets unlimited use of your GPU, can list your models, and can
delete them. Port 11434 is on every scanner's default list; exposed instances get
found in hours. There is no TLS either, so prompts — which here contain your
family's characters and story — travel in plaintext.

Only the web app needs a public URL. If the model lives on a different machine,
connect the two with [Tailscale](https://tailscale.com), or put an
authenticating reverse proxy in front of Ollama. The app already sends
`Authorization: Bearer <key>` when an API key is set, so a token-checking proxy
needs no code changes. [docs/ollama.md § 2b](docs/ollama.md#2b-when-ollama-is-on-a-different-network)
has both, with the exact commands.

---

## Local development

> **Not a deployment step.** This section is for running the app on your own
> laptop while writing code. Do **not** run these commands over SSH on the
> Coolify server — Coolify builds the image, applies migrations and seeds the
> database by itself when you click Deploy. If you only want the game running
> on the server, skip straight to [Deploying on Coolify](#deploying-on-coolify).

Requires Node 22+ and Docker.

```bash
cp .env.example .env          # defaults match the compose Postgres
docker compose up -d db       # Postgres on localhost:5432
npm install
npx prisma migrate deploy     # or `npm run prisma:migrate` to author new ones
npm run seed
npm run dev                   # http://localhost:3000
```

Or run the whole stack the way production does:

```bash
docker compose up --build
```

| Script | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | `prisma generate` then `next build` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run prisma:migrate` | Create + apply a migration from schema changes |
| `npm run prisma:studio` | Browse the database |
| `npm run seed` | Re-seed storylines (idempotent) |
| `npm test` | Unit tests — hashing, rules, dice, prompts, provider |
| `npm run gm:harness` | Run one Game Master turn against your model — see below |
| `npm run mock:model` | A fake Ollama on :11499, so the play tests need no GPU |
| `npm run test:e2e` | Browser-driven auth, characters and campaigns — see below |

### Tests

`npm test` runs standalone unit tests and needs nothing else.

`npm run test:e2e` drives a real browser through registration, sign-in, invite
handling, lockout, session revocation, the character builder, family ties,
campaign setup and a complete played turn. The play suite talks to
`npm run mock:model` rather than a real model, so it needs no GPU — start that
on :11499 and point the app at `AI_BASE_URL=http://127.0.0.1:11499/v1`. It needs a running app **and a database with no accounts in
it**, so it is destructive — point it at a scratch database, never your real
one. Each suite assumes it starts from an empty accounts table, so reset
between runs:

```bash
npm run build && npm start        # app on :3000
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

Playwright's browsers are not downloaded during `npm ci` (the Dockerfile sets
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, since the image never runs them). To run
the E2E tests locally, install one with `npx playwright install chromium`, or
point `CHROMIUM_PATH` at an existing Chromium binary.

---

## Deploying on Coolify

### 1. Create the Postgres resource

**+ New → Database → PostgreSQL.** Save the generated credentials. Coolify shows
an internal connection URL — that is what the app will use; the database never
needs a public port.

### 2. Create the application

**+ New → Application → Public/Private Repository**, pointed at this repo and
the branch you want to deploy.

> **Set Build Pack to `Dockerfile`.** Coolify defaults to Nixpacks, which will
> not produce the right image here.

### 3. Set environment variables

In the application's **Environment Variables** tab:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The Postgres resource's **internal** URL, e.g. `postgresql://postgres:PASSWORD@postgresql-abc123:5432/postgres` |
| `AI_BASE_URL` | Your AI server's OpenAI-compatible endpoint, e.g. `http://192.168.1.50:11434/v1` |
| `AI_MODEL` | e.g. `qwen2.5:latest` — also used for JSON stages |
| `AI_NARRATION_MODEL` | Optional. A second model for prose only |
| `AI_API_KEY` | Usually blank for local servers |
| `AI_MAX_CONTEXT_TOKENS` | Default 3000. Lower it if your model's window is small |
| `AI_TIMEOUT_MS` | Default 120000. Raise for a large model on modest hardware |
| `APP_VERSION` | Optional; surfaces on `/api/health` so you can tell which build is live |
| `SEED_ON_START` | `true` (set `false` once you manage storylines by hand) |
| `COOKIE_SECURE` | Optional. Leave unset — it follows `X-Forwarded-Proto` automatically. Set `true` to force secure cookies once you are on https. |

### 4. Health check and domain

Set the health check path to `/api/health`. Add your domain in **Domains** and
Coolify issues a Let's Encrypt certificate automatically.

### 5. Deploy

Migrations run automatically on container start, so no manual step is needed.

### If the build fails with no error

A deployment that ends like this:

```
#16 [builder 5/5] RUN npx prisma generate && npm run build
#16 2.591   Creating an optimized production build ...
========================================
Deployment failed: Command execution failed (exit code 255)
```

— stopping mid-sentence, with no error from the build itself — **ran out of
memory**. The kernel killed the compiler, so there is nothing for it to report.
Turbopack is fast because it holds a great deal in memory, and a small server
running Coolify, Postgres and the previous version of the app at the same time
may not have a spare gigabyte to give it.

Three things to try, cheapest first. All are set in Coolify under
**Configuration → Build → Build Arguments**:

| Build argument | Default | Effect |
|---|---|---|
| `NEXT_BUILD_WORKERS` | `1` | How many workers collect page data. Each is another copy of the app in memory. Already at the safe value; raise it only on a large server. |
| `NEXT_BUILD_MEMORY_MB` | `1536` | Cap on the JavaScript heap. Lower it — to `1024` or `768` — on a very small server so Node collects garbage instead of growing. |
| `NEXT_BUILD_BUNDLER` | `turbopack` | Set to `webpack` to build the slower, lighter way. This is the one that usually settles it. |

The real fix on a 1–2GB VPS is **swap**, which costs nothing and helps every
build on the machine:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

The build does **not** need `DATABASE_URL`. The database client connects on
first use rather than on import, precisely so that a build in an image builder —
which has no database and no reason to have one — cannot fail over a variable
that is set perfectly well at runtime.

### If the app cannot reach the database

Coolify sometimes places databases on a separate Docker network. Attach the
application to the database's network in the resource's **Connect To
Predefined Network** setting, and make sure you used the *internal* hostname —
containers cannot reach each other over `localhost`.

---

## Project layout

```
app/
  api/health/       Health endpoint — reports real DB connectivity
  login/ register/  Sign-in and invite-gated sign-up
  profile/          Display name, reading level, tone, password change
  invites/          Admin-only invite management
  characters/       Party list, builder, and per-character editing
  characters/claim/ Taking on an adventurer somebody else built
  campaigns/        Adventure list, setup flow, campaign page, and the table
  campaigns/join/   Joining somebody else's adventure with a code
  campaigns/[id]/journal/  The whole story, laid out to be read back or printed
  campaigns/[id]/finds/    The quest board: what they set out to do, and carry
  screen/           The television: one adventure, read-only, no sign-in
  settings/         Administrator hub: storyteller, adventures, usage, invites
  settings/adventures/     Writing and editing storylines in the app
  settings/usage/          What every call used, and what it cost
  api/campaigns/[id]/turn/   SSE endpoint that runs and streams a turn
  api/campaigns/[id]/round/  Answering, and changing an answer, in a round
  api/campaigns/[id]/state/  The small poll every other screen watches
  api/scenes/[id]/image/     A chapter's picture, behind the same sign-in
  api/screen/register/       A television asks for a code (the one open route)
  api/screen/state/          What a paired television should be showing
  api/campaigns/[id]/screens/  Pairing and unpairing, from the host's phone
  page.tsx          Landing page; lists seeded storylines
lib/
  db.ts             Prisma singleton (adapter-based, connects on first use)
  settings/
    secret-box.ts   AES-256-GCM for keys stored in the database
  auth/
    password.ts     scrypt hashing, parameters embedded per hash
    session.ts      Server-side sessions, requireUser / requireAdmin
    invites.ts      Code validation and redemption
    invite-code.ts  Pure generator — import-free so the seed can use it
    actions.ts      Server actions for every auth form
  ai/
    provider.ts     OpenAI-compatible and Anthropic clients
    images.ts       The drawing request, and the prompt it is safe to send
    usage.ts        Adding up calls, tokens and cost from what was recorded
    settings.ts     Resolves config: database first, environment as fallback
    prompts.ts      The tone contract and every stage's prompt
    context.ts      The memory pyramid and token budgeting
    schemas.ts      Zod contracts the model must satisfy
    json.ts         Forgiving extraction plus the repair loop
    safety.ts       Last-line content guard
  engine/
    scene-art.ts    Drawing a chapter once, outside the turn
    dice.ts         Checks and outcomes — the server rolls, not the model
    gm.ts           The four-stage pipeline, no database or HTTP
    play.ts         Wires the pipeline to the database
  game/
    rules.ts        Stat budget, bonds, levels, skills, Family Moves
    names.ts        Name suggestions shaped by race and calling
    character-options.ts  Races, callings and skills offered by the builder
    actions.ts      Server actions for characters and family ties
    campaign-actions.ts  Server actions for campaigns and party
    finds.ts        Matching what a chapter asked for against what is carried
    quests.ts       Quests, ticking them off, and spending what it took
    journey.ts      Folding scene locations into the route the party walked
    loadout.ts      What each adventurer is offered to pack, and how much
    practice.ts     Getting good at what you keep doing, and what you cannot use yet
    knacks.ts       What a level buys, and how the three offered are chosen
    acquaintances.ts  Who comes home from an adventure, and how they are offered back
    summary.ts      Reading an evening back: what it earned, and what was finished
    pronouns.ts     Talking about a character the way their player asked us to
    storyline-actions.ts  Writing adventures, and keeping the seed off them
    party-actions.ts     Joining, leaving, and re-issuing a join code
    handover-actions.ts  Moving an adventurer to another account, intact
    access.ts       Who may open an adventure, and answer for whom
    rounds.ts       Collecting a round's answers from several devices
    briefing.ts     What the table already knows, and what the board still wants
    talk.ts         When the game asks them to confer, and what conferring earned
    wardrobe.ts     What she looks like, chosen rather than typed
    character-picture.ts  Drawing, generated portrait, or a crest — in that order
    recap.ts        What actually changed in a chapter, read off its own rows
    invites.ts      Who can be asked along, and what you have been asked to
components/         Shared UI, site header, character builder
scripts/
  gm-harness.ts     Drive one turn against a real model server
tests/
  password.test.ts  Unit tests — hashing
  rules.test.ts     Unit tests — stats, bonds, relationships
  names.test.ts     Unit tests — the name generator
  engine.test.ts    Unit tests — dice, JSON repair, context, safety
  gm.test.ts        Unit tests — the pipeline, with a stubbed model
  provider.test.ts  Unit tests — wire format, against a mock server
  narrator.test.ts  Unit tests — how a passage is broken up to be spoken
  images.test.ts    Unit tests — the prompt a picture is asked for with
  finds.test.ts     Unit tests — is the thing in your pocket the thing asked for
  quests.test.ts    Unit tests — resolving objectives, and what finishing says
  journey.test.ts   Unit tests — one stop per place, and going back again
  loadout.test.ts   Unit tests — what is offered, and what may be packed
  growth.test.ts    Unit tests — the curve, the ledger, and locked things
  knacks.test.ts    Unit tests — the offer is stable, earned, and really rolls
  acquaintances.test.ts  Unit tests — who graduates, and recognising them again
  usage.test.ts     Unit tests — counting and costing, and refusing to guess
  invites.test.ts   Unit tests — who is offered along, and in what order
  auth.e2e.mts      Browser-driven auth flow
  characters.e2e.mts  Browser-driven character builder
  campaigns.e2e.mts   Browser-driven campaign setup
  play.e2e.mts        Browser-driven play, against the mock model
  rounds.e2e.mts      Two households, two browsers, one turn between them
  invites.e2e.mts     Asking somebody else's adventurer, and waiting for yes
  quests.e2e.mts      Finishing a quest, spending the item, handing things over
  loadout.e2e.mts     Packing, unpacking, and a brought thing finishing a quest
  growth.e2e.mts      Spending a point, learning a skill, and undoing both
  knacks.e2e.mts      Three offered, one taken, and one refused for being unearned
  acquaintances.e2e.mts  Two adventures, and somebody who remembers you in the second
  personal-quests.e2e.mts  Two households, two different boards, one reveal
  admin.e2e.mts       Writing an adventure, reading the usage, uploading a portrait
  progression.e2e.mts Browser-driven skills, items, milestones, Family Moves
  settings.e2e.mts    Browser-driven storyteller settings and connection test
  settings.test.ts    Unit tests — key encryption and the Anthropic adapter
  briefing.test.ts    What the table is told, and the nudges that are not scripts
  briefing.e2e.mts    The same through the pipeline, onto the phone and the wall
  ties.test.ts        Who you can be related to, and who has to agree
  ties.e2e.mts        Two households, a tie waiting, and the bond it unlocks
  chronicle.test.ts   The dice over a lifetime, and what a finished adventure was worth
  chronicle.e2e.mts   An adventure finished, then deleted — and still on her road
  storyteller.test.ts The prompt rules a real evening's transcript found wanting
  chapters.e2e.mts    A chapter that ends when its own work is done
  talk.test.ts        When the game asks them to confer, and what it says it earned
  talk.e2e.mts        A conversation through the real pipeline, onto the transcript
  wardrobe.test.ts    The look, the sentence three surfaces read, and the portrait ladder
  guidance.test.ts    What would count, where to try next, and what already changed
  wardrobe.e2e.mts    A dressed adventurer through a real turn, and the prompt she reaches
  objectives.test.ts  Splitting two-in-one aims, and noticing a chapter nobody can finish
  rebalance.e2e.mts   The stuck chapter finishing, and nobody losing a level or a skill
  mock-model-server.mts  Fake Ollama for the play tests
prisma/
  schema.prisma     Accounts, characters, relationships, campaigns, storylines
  seed.ts           Starter adventures + bootstrap invite
  migrations/
Dockerfile          Multi-stage; standalone runtime
docker-entrypoint.sh  Waits for Postgres, migrates, seeds, starts
docker-compose.yml  Local stack
```

### Prisma 7 notes

Three things changed in v7 that trip up older tutorials:

- The connection string is **not** in `schema.prisma`. The CLI reads it from
  `prisma.config.ts`; the runtime client gets it via the driver adapter.
- There is no bundled query engine — `@prisma/adapter-pg` is required, and the
  generated client is emitted as TypeScript source into `generated/` (gitignored,
  regenerated on every build).
- **Do not prune `@prisma/studio-core` or `@prisma/dev` from a production
  image.** They look development-only and are large, but `prisma/build/cli.js`
  requires studio-core eagerly at module load — removing it breaks
  `migrate deploy` with `MODULE_NOT_FOUND` before it ever contacts the database.

The runtime stage installs `@prisma/client` and `@prisma/adapter-pg` explicitly
rather than relying on Next's standalone output. Next inlines the adapter into
the server bundle and only traces what the server imports, so the seed script —
which runs under `tsx`, outside that bundle — cannot resolve them otherwise.
