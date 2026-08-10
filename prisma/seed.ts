import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { generateInviteCode } from "../lib/auth/invite-code.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set — cannot seed.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Starter adventures.
 *
 * Each one is built so that cooperation, not combat, is the way through: every
 * act has at least one obstacle that a single character cannot solve alone.
 * `beats` are waypoints for the Game Master, never a script — players are free
 * to wander straight past them and the GM is expected to let them.
 */
const storylines = [
  {
    slug: "the-star-in-grandmas-garden",
    title: "The Star in Grandma's Garden",
    tagline: "Something fell out of the sky, and it is frightened.",
    premise:
      "A small star has fallen into the family's vegetable patch and cannot get home. " +
      "It is not hurt, but it is homesick, and it hums when it is scared. Getting it " +
      "back to the sky means asking help from neighbours the family has never quite " +
      "gotten around to visiting.",
    hook:
      "It is just past bedtime when the tomatoes start glowing. In the middle of the " +
      "garden, sitting in a shallow dent in the soil, is a light about the size of a " +
      "cat — and it is humming a worried little tune.",
    defaultTone: "COZY",
    readingLevel: "EARLY_READER",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 10,
    acts: [
      {
        index: 1,
        title: "The Glow in the Greens",
        goal: "Let the family meet the star and earn its trust. Nobody should be able to calm it alone — it settles only when two characters comfort it together.",
        beats: [
          "The star hides under the runner beans and has to be coaxed, not grabbed",
          "It copies the first kind sound anyone makes at it",
          "It will not travel unless someone promises out loud to bring it home",
        ],
      },
      {
        index: 2,
        title: "Asking the Neighbours",
        goal: "Send the family to three neighbours for help. Each neighbour wants something small and human in return — company, an apology, a favour long forgotten.",
        beats: [
          "The beekeeper knows which way is up but is afraid of the dark",
          "The bridge troll is lonely rather than fierce and mostly wants someone to eat dinner with",
          "The old lighthouse keeper has the lens they need but has misplaced her glasses",
        ],
      },
      {
        index: 3,
        title: "The Long Way Up",
        goal: "Get the star home from the lighthouse. The final push needs every character contributing something different at the same moment.",
        beats: [
          "The lens must be aimed, steadied, and lit by three different hands",
          "The star tries to stay because it has become fond of the family",
          "It leaves a small piece of itself behind as a keepsake",
        ],
      },
    ],
  },
  {
    slug: "the-bakers-missing-recipe",
    title: "The Baker's Missing Recipe",
    tagline: "The festival is in three days and the honey-cake recipe has walked off.",
    premise:
      "Every autumn the village bakes one enormous honey-cake from a recipe nobody has " +
      "ever written down — it lives in old Master Pim's memory, and this year Pim's " +
      "memory has gone foggy. The family must reassemble the recipe from the people who " +
      "each remember one piece of it.",
    hook:
      "Master Pim is sitting on the bakery step with flour on his elbows and a very " +
      "worried face. 'I know it starts with something golden,' he says. 'And I know " +
      "your grandmother laughed when I put it in. That is all I have got.'",
    defaultTone: "COZY",
    readingLevel: "MIDDLE_GRADE",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 12,
    acts: [
      {
        index: 1,
        title: "What Pim Remembers",
        goal: "Establish the shape of the problem and let the family interview Pim gently. Rushing him makes him more confused, not less.",
        beats: [
          "Pim remembers smells far better than words",
          "A burnt page in the oven gives one ingredient and destroys another",
          "Someone in the family recognises the smell from their own childhood",
        ],
      },
      {
        index: 2,
        title: "Six People, Six Pieces",
        goal: "Scatter the remaining ingredients across the village. Each holder trades their piece for help with something they cannot manage alone.",
        beats: [
          "The goatherd's memory is tied to a song only children remember the words to",
          "The river-miller will only talk while his wheel is turning, and it is stuck",
          "One ingredient turns out to be a mistake Pim made forty years ago and never corrected",
        ],
      },
      {
        index: 3,
        title: "Festival Morning",
        goal: "Bake the cake in front of the whole village. Let the family's choices during the hunt visibly change how it turns out.",
        beats: [
          "The oven is too big for one person to manage",
          "Something goes wrong that only improvisation fixes",
          "Pim tastes it and remembers everything, all at once",
        ],
      },
    ],
  },
  {
    slug: "the-lantern-fox-family",
    title: "The Lantern Fox Family",
    tagline: "A fox family got separated in the fog. Ours is going to fix that.",
    premise:
      "The lantern foxes carry their light in their tails and navigate by each other's " +
      "glow. A thick autumn fog has split a family of five across the whole valley, and " +
      "the kits are too dim to find their way back. Reuniting them means the family " +
      "splitting up too — and discovering how much they rely on each other.",
    hook:
      "The fog came in so fast that the road disappeared between one step and the next. " +
      "Somewhere in it, something small is crying — and every so often, a faint orange " +
      "light blinks on and off, as though it is running out.",
    defaultTone: "ADVENTUROUS",
    readingLevel: "FAMILY_MIXED",
    minPlayers: 3,
    maxPlayers: 5,
    estimatedScenes: 14,
    acts: [
      {
        index: 1,
        title: "Into the Fog",
        goal: "Separate the party deliberately and let them feel it. Characters can hear but not see each other, and must describe their surroundings to navigate.",
        beats: [
          "The first kit is found within reach but will not come to a stranger",
          "Voices carry strangely — the fog moves sound to the wrong place",
          "Someone realises the foxes answer to humming, not calling",
        ],
      },
      {
        index: 2,
        title: "Following the Blinks",
        goal: "Turn the search into a relay. Each recovered fox brightens the chain and makes the next one findable.",
        beats: [
          "Two kits are found together and refuse to be separated again",
          "The mother fox is trapped somewhere that needs a boost and a reach",
          "The fog thickens right when the party is most spread out",
        ],
      },
      {
        index: 3,
        title: "The Whole Bright Line",
        goal: "Bring every fox and every family member back together. The reunion should mirror whatever the party learned about staying in contact.",
        beats: [
          "One fox is missing until someone thinks to look behind them",
          "The full family of foxes lights the road home",
          "The foxes follow the party for a little while before turning back",
        ],
      },
    ],
  },
  {
    slug: "the-house-that-remembered",
    title: "The House That Remembered",
    tagline: "Great-Aunt Bramble left the family a house. The house has opinions.",
    premise:
      "The inherited house rearranges itself according to what it remembers, and it " +
      "remembers a great deal. Rooms appear that have not existed for fifty years. To " +
      "settle it down, the family has to work out what the house is trying to tell them " +
      "— and finish something Great-Aunt Bramble left undone.",
    hook:
      "The key turns before anyone puts it in the lock. Inside, the hallway is far " +
      "longer than the house is wide, and there is a fresh cup of tea on the table, " +
      "still steaming, next to a note in handwriting nobody recognises: 'Took you long enough.'",
    defaultTone: "ADVENTUROUS",
    readingLevel: "TEEN",
    minPlayers: 2,
    maxPlayers: 4,
    estimatedScenes: 16,
    acts: [
      {
        index: 1,
        title: "Rooms That Should Not Fit",
        goal: "Let the family explore and establish that the house responds to feeling rather than logic. It opens up for curiosity and closes for suspicion.",
        beats: [
          "A room appears that one character recognises from a story they were told",
          "The house hides a door when someone gets angry at it",
          "Bramble's handwriting keeps appearing in useful places",
        ],
        seeks: ["the key to the room that keeps moving"],
      },
      {
        index: 2,
        title: "What Bramble Left Undone",
        goal: "Reveal the unfinished business through the house's memories. Each memory needs a different character's perspective to interpret correctly.",
        beats: [
          "A quarrel replays in the dining room with the ending missing",
          "The garden shows two versions of itself, before and after",
          "Someone finds a letter that was written but never sent",
        ],
        seeks: ["the letter that was never sent"],
      },
      {
        index: 3,
        title: "Finishing the Sentence",
        goal: "Give the family a way to resolve Bramble's regret. The solution should require them to do the thing Bramble could not — talk to each other honestly.",
        beats: [
          "The house offers a shortcut that would skip the hard conversation",
          "The final room only opens to the whole family at once",
          "The house settles into an ordinary shape, and stays warm",
        ],
      },
    ],
  },
  {
    slug: "the-dragon-who-lost-her-name",
    title: "The Dragon Who Lost Her Name",
    tagline: "A young dragon can't remember her name, and without it she can't go home.",
    premise:
      "Dragons of the Cloudreach keep their names the way other creatures keep their hearts — " +
      "lose it and you belong nowhere. A half-grown dragon has crash-landed in the valley with " +
      "no memory of hers, and her clan's Naming Flight is in four days. The family must help " +
      "her piece it back together from the few dragons who still remember her, most of whom " +
      "would rather not talk about it.",
    hook:
      "The sound is enormous and then, suddenly, very small. In the wreck of the barley field " +
      "sits a dragon the size of a pony, wings folded wrong, looking up with an expression that " +
      "says she was hoping nobody saw that. 'Don't,' she says, when someone opens their mouth. " +
      "'Don't ask me what I'm called.'",
    defaultTone: "ADVENTUROUS",
    readingLevel: "MIDDLE_GRADE",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 14,
    acts: [
      {
        index: 1,
        title: "The Dragon in the Barley",
        goal: "Earn the dragon's trust. She is proud, frightened, and certain the family will hand her over to her clan. She should refuse help until someone admits to a failure of their own.",
        beats: [
          "She can breathe fire but flinches when she does, and will not say why",
          "Her scales change colour with her mood and she hates that everyone can tell",
          "She remembers a lullaby but not who sang it",
        ],
        seeks: ["a scale she shed when she landed"],
      },
      {
        index: 2,
        title: "Three Dragons Who Remember",
        goal: "Send the party to three dragons who each hold a fragment of her name. Each will trade only for something that costs the family real effort — never coin.",
        beats: [
          "The archivist dragon has the first syllable but has sworn not to speak it aloud",
          "A rival her own age remembers it perfectly and is furious about being asked",
          "The eldest of the clan is going deaf and will only answer a question asked kindly, twice",
        ],
        seeks: ["the first syllable of her name, written down"],
      },
      {
        index: 3,
        title: "The Naming Flight",
        goal: "The family stands with her at the Flight. The clan expects her to arrive alone; arriving with a family is itself the answer nobody expected.",
        beats: [
          "The clan's law says only dragons may attend, and the law turns out to be younger than it claims",
          "She has to say her name out loud in front of everyone who watched her lose it",
          "She offers to carry the family home, and this time the landing is perfect",
        ],
      },
    ],
  },
  {
    slug: "the-sleepover-at-marrow-house",
    title: "The Sleepover at Marrow House",
    tagline: "Two nights minding an old house. It creaks. It is definitely just creaking.",
    premise:
      "The family has agreed to look after Marrow House while its owner is away — feed the cat, " +
      "water the ferns, don't mind the noises. The noises are considerable. Every spooky thing " +
      "in the house turns out to have a lonely explanation and something that needs doing, and " +
      "by the second night the house is on their side.",
    hook:
      "The note on the kitchen table is in careful, spidery handwriting. 'Cat eats at six. Ferns " +
      "on Tuesdays. The knocking in the west hall is nothing to worry about — it stops if you " +
      "knock back.' Underneath, in different ink, someone has added: 'Please do knock back.'",
    defaultTone: "ADVENTUROUS",
    readingLevel: "MIDDLE_GRADE",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 12,
    acts: [
      {
        index: 1,
        title: "First Night",
        goal: "Build atmosphere and let the party be properly spooked — then have the first scare resolve into something harmless and a bit sad. Establish that nothing here wants to hurt them.",
        beats: [
          "Something knocks in the west hall in a rhythm, waiting to be answered",
          "The cat stares at a doorway that is not there in the morning",
          "A cold patch on the stairs turns out to be standing exactly where someone used to wait",
        ],
      },
      {
        index: 2,
        title: "What the House Is Missing",
        goal: "The house is trying to finish something. Reveal it through objects rather than explanation, and require different characters to notice different pieces.",
        beats: [
          "A cupboard refuses to open for anyone who has not apologised for something that day",
          "A photograph has a person missing from it, and the gap is the shape of the cat",
          "The knocking spells out a word if someone thinks to count it",
        ],
      },
      {
        index: 3,
        title: "Second Night",
        goal: "The family does the thing the house cannot do for itself. The resolution should be warm, not triumphant — nothing is defeated, something is finished.",
        beats: [
          "Every room the party was kind in stays lit; the ones they rushed stay dark",
          "The last door needs everyone knocking at once",
          "In the morning the house is quiet, and the note on the table is in fresh ink: 'Thank you.'",
        ],
      },
    ],
  },
  {
    slug: "the-village-that-built-itself",
    title: "The Village That Built Itself",
    tagline: "Whatever you build in Thistlewick comes alive by morning. Something has been building at night.",
    premise:
      "In Thistlewick, anything you make with your hands wakes up overnight — a crooked birdhouse " +
      "becomes a crooked bird, a stone wall learns to shuffle aside for friends. It is a lovely " +
      "way to live until the village wakes to find structures nobody remembers making, growing " +
      "a little larger each night. Someone is building in the dark, and they are not finished.",
    hook:
      "The gate you built yesterday says good morning. That part is normal. What is not normal " +
      "is the staircase in the village square — forty steps of pale stone, going up, ending in " +
      "nothing at all. Nobody built it. It was six steps shorter yesterday.",
    defaultTone: "ADVENTUROUS",
    readingLevel: "MIDDLE_GRADE",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 15,
    acts: [
      {
        index: 1,
        title: "What You Make, Wakes",
        goal: "Let the party build things and discover what the village does with them. Everything they make should come back later. Reward invention over caution.",
        beats: [
          "The first thing a character builds develops a personality that matches its maker",
          "Something built badly on purpose turns out to be exactly what is needed later",
          "The staircase grows again overnight, and it is now clearly waiting for something",
        ],
      },
      {
        index: 2,
        title: "The Night Builder",
        goal: "Track the builder through what it makes rather than through clues. Its structures are unfinished versions of something it half-remembers.",
        beats: [
          "Each new structure is an attempt at a house, and each attempt is closer",
          "It borrows materials, and always leaves something in exchange",
          "A character who builds something *for* it gets the first real response",
        ],
      },
      {
        index: 3,
        title: "Building Together",
        goal: "The builder cannot finish alone — it has never seen a finished home. The party must build one with it, using things they made in Act 1.",
        beats: [
          "The plan needs more hands than the party has, so the things they built help",
          "Someone has to decide what makes a house a home, out loud",
          "The staircase finally leads somewhere, and it is the front door",
        ],
      },
    ],
  },

  // ---- Frightening on purpose ---------------------------------------------
  //
  // For the table that reads Goosebumps and watches Stranger Things from behind
  // a cushion. The floor is exactly where it is everywhere else — nobody dies,
  // nobody is caught, nothing is cruel — and everything above it is dread:
  // being watched, being copied, not being believed, and the ordinary going
  // subtly wrong. Each one ends by turning the thing that frightened them into
  // something that can be talked to, and each act names what it wants the party
  // to come away holding.
  {
    slug: "the-radio-that-answers-back",
    title: "The Radio That Answers Back",
    tagline: "The old set in the attic picks up a station that knows your names.",
    premise:
      "A shortwave radio nobody has plugged in for thirty years starts up on its own, and the " +
      "voice on it describes the house — accurately, except for the details that are wrong. A " +
      "door where there is no door. A fourth child at the table. Somewhere close by there is a " +
      "copy of this house, running slightly behind, and something in it has been waiting a long " +
      "time to be let out. It is not the thing that should frighten them. What it is hiding from " +
      "is.",
    hook:
      "The radio is warm. Nothing is plugged in and the radio is warm, and through the hiss a " +
      "calm voice is reading a list: the colour of the front door, the name of the dog that died " +
      "before any of you were born, and then — quite clearly, and one at a time — each of your " +
      "names, as if checking you are all still here.",
    defaultTone: "SPOOKY",
    readingLevel: "MIDDLE_GRADE",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 14,
    acts: [
      {
        index: 1,
        title: "The Station That Should Not Exist",
        goal: "Establish that the voice knows too much and is running a few seconds behind the house. Let the family test it and find it true. Nothing is threatening yet; everything is wrong.",
        beats: [
          "The voice describes what somebody is doing, a beat after they do it",
          "It describes a room the house does not have, in detail",
          "An adult hears only static, and says so kindly, and does not come upstairs again",
        ],
        seeks: ["the tuning key from the back of the radio", "Grandad's station logbook"],
      },
      {
        index: 2,
        title: "The House Behind the House",
        goal: "Let them find the way across — a door, a mirror, a cellar stair that has one step too many. The copy is their house left running too long: dust, stopped clocks, a fourth chair. Something moves in it and does not want to be seen.",
        beats: [
          "A thing in the copy imitates one of them badly, and gets a detail wrong",
          "Their own house can be seen from inside it, and someone is standing in the kitchen",
          "The logbook's last entry is in handwriting that has not been written yet",
        ],
        seeks: ["the stopped clock from the copied hallway", "a photograph with one face too many"],
      },
      {
        index: 3,
        title: "What Has Been Waiting",
        goal: "Reveal that the thing in the copy is frightened, not hunting — it has been alone in a house that never changes since the night the radio was switched off. Give the family a way to end its wait: finish the broadcast that was interrupted.",
        beats: [
          "It runs from them, which is worse than being chased",
          "The radio will only transmit when more than one of them speaks at once",
          "Whatever they broadcast is heard in both houses, and one of them goes quiet at last",
        ],
      },
    ],
  },
  {
    slug: "every-photograph-is-wrong",
    title: "Every Photograph Is Wrong",
    tagline: "In every picture taken this week, there is someone standing behind you.",
    premise:
      "The school photographs came back with a figure at the edge of the frame. So did the ones " +
      "on the phone, and the ones from last summer that nobody has touched since. In each new " +
      "picture it is closer, and it is patient. It is not coming for them — it is trying to be " +
      "remembered, because it is being forgotten out of existence, and it has picked the family " +
      "that still has the albums.",
    hook:
      "The envelope of school photographs is on the kitchen table and everyone is laughing at " +
      "their own faces until somebody stops laughing. At the back of the hall, half behind the " +
      "curtain, there is a person. Nobody remembers them. In the photograph taken four minutes " +
      "later, they are one row nearer, and their head is turned.",
    defaultTone: "SPOOKY",
    readingLevel: "TEEN",
    minPlayers: 2,
    maxPlayers: 4,
    estimatedScenes: 12,
    acts: [
      {
        index: 1,
        title: "One Row Nearer",
        goal: "Build the rule and let them prove it: it only moves in pictures, and only when nobody is looking at the picture. Photographing it deliberately is the obvious idea and should work, and should be frightening.",
        beats: [
          "A picture taken as a test comes out with it much closer than a week of drift would explain",
          "A grown-up looks straight at it and says 'that's just the curtain'",
          "Somebody finds it in an album from before they were born",
        ],
        seeks: ["the old family album from the loft", "a camera that still takes film"],
      },
      {
        index: 2,
        title: "Who It Used To Be",
        goal: "Turn dread into pity. The albums, the school register and an elderly neighbour together give it a name and a story — somebody nobody kept. The house grows colder as they get closer to remembering.",
        beats: [
          "The register has a name with no photograph beside it",
          "A neighbour remembers the name and then, mid-sentence, does not",
          "Reflections start doing it too, which is much worse than photographs",
        ],
        seeks: ["the school register for that year", "the name written down somewhere permanent"],
      },
      {
        index: 3,
        title: "Kept",
        goal: "Let them decide how to remember it, and make that the whole ending — not a trap, not a banishment. Whatever they choose has to cost them something small and real: a page of their own album, a place at the table, a story told properly.",
        beats: [
          "It comes as close as the doorway and stops, waiting to be invited",
          "The last photograph is one they take on purpose, with it in the middle",
          "Afterwards the pictures are ordinary, and one of them has an extra person in it who belongs",
        ],
      },
    ],
  },
  {
    slug: "the-lights-in-the-reservoir",
    title: "The Lights in the Reservoir",
    tagline: "The drowned village is still keeping its lights on, and it is coming back up.",
    premise:
      "The reservoir is low after a dry summer, and the church spire of the village underneath has " +
      "broken the surface for the first time in sixty years. At night there are lights down there, " +
      "moving between the drowned streets in an orderly way, as if somebody is still doing the " +
      "rounds. The village never finished its last evening, and until it does the water will keep " +
      "dropping — taking the reservoir, and then the town that drinks from it.",
    hook:
      "Torchlight on black water, and the spire standing up out of it like a finger. Then, forty " +
      "feet down and quite unhurried, a lamp comes on in a window. Then another, further along a " +
      "street that has not been walked on since your grandparents were children, moving away from " +
      "you, as though somebody heard you arrive and has gone to tell the others.",
    defaultTone: "SPOOKY",
    readingLevel: "FAMILY_MIXED",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 14,
    acts: [
      {
        index: 1,
        title: "The Spire Comes Up",
        goal: "Establish the drowned village as somewhere that is still going, on its own time. Nothing threatens them; everything invites them. The wrongness is that it is all perfectly normal, forty feet under.",
        beats: [
          "Something is left on the shore that is dry, and sixty years old",
          "The lights go out one by one when a torch is pointed at them",
          "The bell rings underwater, on the hour, and is four minutes slow",
        ],
        seeks: ["the ferryman's brass whistle", "a key that opens something long since drowned"],
      },
      {
        index: 2,
        title: "The Last Evening",
        goal: "Let them piece together the night the valley was flooded and what was left unfinished — somebody was not fetched home. The village replays fragments of that evening, and the party can walk through them but not change them yet.",
        beats: [
          "A door in the village opens for one of them and not the others",
          "The same five minutes happen twice, differently",
          "Whatever they take from down there is dry when they surface",
        ],
        seeks: ["the ledger from the drowned schoolhouse", "the shoe that was never collected"],
      },
      {
        index: 3,
        title: "Calling Them In",
        goal: "The village is waiting to be told the evening is over. Give the family a way to say so — ringing the bell right, reading the names, walking the last child home — and let the water come back up gently once it is done.",
        beats: [
          "The bell can only be rung on time by two people working together",
          "The names have to be read aloud, and one of them is a name they now know",
          "The lights go out in order, the way a village goes to bed",
        ],
      },
    ],
  },
] as const;

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
