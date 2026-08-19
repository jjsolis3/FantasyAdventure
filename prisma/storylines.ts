/**
 * Starter adventures.
 *
 * Each one is built so that cooperation, not combat, is the way through: every
 * act has at least one obstacle that a single character cannot solve alone.
 * `beats` are waypoints for the Game Master, never a script — players are free
 * to wander straight past them and the GM is expected to let them.
 *
 * Kept apart from the seeding procedure so it can be read without a database.
 * The seed imports it to write rows; the art-prompt sheet imports it to write
 * prompts. Two readers, one source, and no chance of a prompt sheet describing
 * an adventure that no longer exists.
 *
 * ## `seeks` — what a chapter asks the family to come away with
 *
 * Every act needs at least one, and `tests/storylines.test.ts` enforces it.
 * They are the hinge the rest of the game hangs off: each becomes a FIND
 * objective on the chapter's quest, which is what the tracker counts down, what
 * the packing screen is worth reading before setting out, and what leaves a
 * keepsake on the shelf afterwards. An act with none still opens a quest, but
 * it gets a bare "see it through" and the whole loop idles for a chapter.
 *
 * Two rules learned from filling in the twenty acts that had none:
 *
 *   - **Acts 1 and 2 seek what the chapter needs** — the ladder, the
 *     spectacles, the burnt page. Things that unlock the next thing.
 *   - **Act 3 seeks what the family comes away with.** A finale is about doing
 *     rather than fetching, which is why these were empty; but the stories were
 *     already ending on an object — the piece the star leaves behind, the note
 *     in fresh ink, the recipe finally written down — and that object is the
 *     keepsake. Naming it is what puts the last chapter on the shelf.
 *
 * Write them as things a ten-year-old could point at. "The lighthouse keeper's
 * missing spectacles" is findable; "proof of what happened" is not.
 */

export const storylines = [
  {
    slug: "the-star-in-grandmas-garden",
    title: "The Star Thief",
    tagline: "The stars are going out one by one. One of them landed in the tomatoes, and it knows why.",
    premise:
      "A star crash-lands in the family's garden — not fallen, knocked down. Every night " +
      "since, more stars go out, in order, like somebody working through a list. The star " +
      "knows whose list, because before it ran, it picked the collector's pocket. Getting " +
      "it home means a market that only opens where moths gather, a bottled moonbeam, and " +
      "breaking into a museum where the exhibits are the sky.",
    hook:
      "The tomatoes are glowing again. In a dent in the soil sits a light the size of a " +
      "cat, breathing hard, and the first thing it says is: \"You didn't see me.\" Above " +
      "the garden its constellation is missing a piece — and while you watch, two streets " +
      "of sky further over, another star quietly goes out.",
    defaultTone: "ADVENTUROUS",
    readingLevel: "MIDDLE_GRADE",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 12,
    pressureName: "The stars going out",
    acts: [
      {
        index: 1,
        title: "Knocked Out of the Sky",
        goal: "Let the family get the truth out of a witness who lies. The star glows brighter when it fibs, and it fibs about nearly everything — it only cracks when two characters compare its stories out loud and catch the contradiction together.",
        beats: [
          "The star glows brighter when it lies, and it lies about almost everything at first",
          "A scorch-trail crosses the garden that the star's landing cannot explain — something swept through here, searching",
          "The truth at last: it picked the collector's pocket first, and what it took is buried under the runner beans",
        ],
        seeks: ["the collector's sky-map, creased and still warm"],
      },
      {
        index: 2,
        title: "The Night Market",
        goal: "Passage home is bought, not found. The market opens where moths gather, everything is bartered rather than sold, and the collector's agents are shopping too. Every stall wants something odd but personal, and no single character can afford the fare alone.",
        beats: [
          "The moth broker sells directions for secrets, and checks each one for freshness",
          "The collector's agents look almost right — it is their shadows that give them away, pointing the wrong direction",
          "The fare home is a bottled moonbeam, and the last one on any stall goes to auction at midnight",
        ],
        seeks: [
          "a bottled moonbeam, paid for fair and square",
          "the collector's name, written on the back of a receipt",
        ],
      },
      {
        index: 3,
        title: "The Museum of Lights",
        goal: "The collector is not a monster: an astronomer who started rescuing falling stars and stopped asking whether they wanted rescuing. The gallery must be undone rather than smashed — jars opened in the right order, the star's own theft returned, and every pair of hands needed at once when the sky takes its lights back.",
        beats: [
          "The jars are labelled in careful handwriting, in the order they were taken — and the next label is already written",
          "The star has to give back what it stole, in person, and would rather do anything else in the world",
          "The sky refills constellation by constellation, and the collector keeps one empty jar, as a telescope stand",
        ],
        seeks: [
          "the ring of keys to every jar in the gallery",
          "the collector's ledger of stolen stars",
        ],
      },
    ],
  },
  {
    slug: "the-bakers-missing-recipe",
    title: "The Case of the Stolen Recipe",
    tagline: "The festival is in three days. The recipe is gone, and everyone in the village is lying about something.",
    premise:
      "Every autumn the village bakes one enormous honey-cake from a recipe that lives " +
      "only in old Master Pim's memory. Three days before the festival, that memory is " +
      "gone — swapped clean out of his head at the Memory Fair and laundered through so " +
      "many trades that even the thief may have lost track of it. The family has three " +
      "days, five suspects, and a village where everybody remembers a slightly " +
      "different cake.",
    hook:
      "Master Pim stands in the middle of his bakery holding a bowl he cannot remember " +
      "picking up. \"It was in my head last night,\" he says, tapping his temple. \"This " +
      "morning there is a hole where it used to be. And whoever took it left this.\" On " +
      "the counter, pressed into spilled flour, is a footprint that fits nobody in the " +
      "village.",
    defaultTone: "ADVENTUROUS",
    readingLevel: "MIDDLE_GRADE",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 12,
    pressureName: "Days until the festival",
    acts: [
      {
        index: 1,
        title: "Everyone Is a Suspect",
        goal: "A proper interrogation. Five suspects, five alibis, and at least two true things in everything they say. No single interview cracks it — answers only become evidence when two characters compare what they were separately told and spot where the stories disagree.",
        beats: [
          "Pim's hole has edges: he remembers the smell of the cake perfectly, and the smell has one ingredient in it that nobody local sells",
          "The flour footprint is the wrong size for every suspect — but exactly right for somebody on a stilt",
          "The town gossip trades secrets two-for-one, and always shortchanges you",
        ],
        seeks: [
          "the flour footprint, traced onto baking paper",
          "the torn corner of a recipe card that should not exist",
        ],
      },
      {
        index: 2,
        title: "The Memory Fair",
        goal: "Follow the recipe through the fair where memories are traded openly. Three swaps stand between the theft and now, each trader drives a bargain, and looking inside a memory costs a small one of your own — make the table decide, out loud, what they are willing to give up.",
        beats: [
          "A memory viewed twice goes blurry, so every look has to count",
          "One trader deals only with children, and drives the hardest bargain at the fair",
          "The final swap in the ledger went to a name nobody in the village has ever had",
        ],
        seeks: [
          "the middle memory of the chain, bottled and fogging up",
          "the fair-master's ledger page for festival week",
        ],
      },
      {
        index: 3,
        title: "The Bake-Off",
        goal: "The thief is Pim's old apprentice, and her claim is half-just: half the recipe was hers before she left, and her name never made it onto the card. Judging day happens anyway, in front of the whole village. The ending belongs to the family — expose her, defend her, or bake both halves into one cake with two names on it.",
        beats: [
          "The two halves of the recipe fail separately and only work together",
          "Somebody tampers with the oven mid-bake, and it is not who anyone expects",
          "The judges are three grandmothers who, between them, have never once been fooled",
        ],
        seeks: ["the festival cake, with both names on the card at last"],
      },
    ],
  },
  {
    slug: "the-lantern-fox-family",
    title: "The Valley That Ate Its Lights",
    tagline: "The fog came early, the lamps are going out one by one, and the foxes are the only fire it cannot smother.",
    premise:
      "The lantern foxes carry the valley's fire in their tails, and tonight is the night " +
      "that matters: a fog has come down that eats light — street lamps first, then " +
      "windows, then anything left glowing. The fox family that lights the lamps was " +
      "scattered in the first hour. Finding them means splitting up in a fog where " +
      "voices carry to the wrong places, where the chalk arrows home have been redrawn " +
      "by something, and where all that missing light has to have gone somewhere.",
    hook:
      "The lamp outside the gate does not flicker out — it goes all at once, like a " +
      "mouthful, with a sound like a swallowed word. Somewhere in the fog a fox kit is " +
      "crying. Somewhere further out, something very large is being very quiet.",
    defaultTone: "ADVENTUROUS",
    readingLevel: "MIDDLE_GRADE",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 12,
    pressureName: "The fog",
    acts: [
      {
        index: 1,
        title: "The Fog Came Wrong",
        goal: "Split the party on purpose and let them feel it: characters can hear but not see each other, and have to describe where they are to move at all. Establish the rule of the night — this fog does not smother light, it eats it, and it is choosing what to eat.",
        beats: [
          "Voices carry to the wrong places, so the party's own words are the first puzzle",
          "The first kit is found within arm's reach and will not come until somebody trades it a secret, said out loud",
          "The chalk arrows the lamplighters leave have all been redrawn to point the same wrong way",
        ],
        seeks: ["a jar of lantern-fox light, freely given"],
      },
      {
        index: 2,
        title: "The Relay",
        goal: "Each recovered fox brightens the chain and makes the next one findable — and makes the party easier to see. Let the table work it out for themselves: they are not being hunted, they are being herded, and the arrows, the fog and the dying lamps all point the same direction.",
        beats: [
          "The mother fox is trapped exactly where the light is thinnest, and freeing her takes a boost, a reach, and somebody glowing on purpose as bait",
          "It will not cross running water — until, at the worst possible moment, it does",
          "The old lamplighter's map shows every lamp in the valley, and the dead ones make an arrow of their own",
        ],
        seeks: [
          "the old lamplighter's map, dead lamps crossed out in soot",
          "the mother fox's cracked lantern-glass",
        ],
      },
      {
        index: 3,
        title: "The Dark End of the Valley",
        goal: "What waits there is starving, not wicked: a shadow-thing burned by the town's new electric lamps, eating the only light that no longer hurts it, herding the brightest things in the valley toward itself because it is too weak to chase. The ending is a treaty, not a fight — and the foxes will only offer one if the family brokers the terms.",
        beats: [
          "It speaks in the party's own voices, borrowed from the fog, and gives every one of them back afterwards",
          "The foxes' offer: a tithe of light, freely given every night, in exchange for the fog going back to being weather",
          "The valley relights lamp by lamp, in order, from the dark end back to home",
        ],
        seeks: ["the treaty, written in soot and fox-light"],
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
    pressureName: "What the house is forgetting",
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
        seeks: ["the reply to Bramble's letter, written by the whole family"],
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
    pressureName: "How much of her is left",
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
        seeks: ["her whole name, written out and carried to the Flight"],
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
    pressureName: "How awake the house is",
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
        seeks: ["the cat's collar, with a name nobody in the family recognises"],
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
        seeks: [
          "the photograph with the gap in it",
          "the word the knocking spells, counted out and written down",
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
        seeks: ["the note left on the table in the morning, in fresh ink"],
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
    pressureName: "What is building itself tonight",
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
        seeks: ["the first thing you made, awake now and following you about"],
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
        seeks: [
          "whatever the builder left behind in exchange for what it borrowed",
          "the builder's closest attempt at a house, small enough to carry",
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
        seeks: ["a key to the finished house, cut for a friend"],
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
    pressureName: "How close the signal is",
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
        seeks: [
          "the end of the broadcast that was interrupted, written out",
          "the plug that was pulled thirty years ago",
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
    pressureName: "How near it has come",
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
        seeks: [
          "the photograph you take on purpose, with it in the middle",
          "a page of your own album, given up to make room",
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
    pressureName: "How high the water is",
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
        seeks: [
          "the bell-rope, long enough for two pairs of hands",
          "the list of names, read all the way to the end",
        ],
      },
    ],
  },
  {
    slug: "say-it-three-times",
    title: "Say It Three Times",
    tagline: "Everyone in the year knows the rhyme. Nobody can remember who taught it to them.",
    premise:
      "It went round the whole school in a week — a skipping rhyme with four verses and a dare at " +
      "the end of it. Say the last verse into a dark window three times and something answers. " +
      "Everybody has tried it and nothing happened. Then the small things in the first verse start " +
      "coming true, a week late, to whoever said it first — and the only person who knows all four " +
      "verses has not been in school since Tuesday.",
    hook:
      "The window in the changing rooms is the good one: black glass, nobody about, and the taps " +
      "drip in almost the right rhythm. You have said it twice. The second time, the reflection was " +
      "half a beat late putting its hands down. There is one more to go — and somewhere behind you, " +
      "very quietly, somebody else has already started counting.",
    defaultTone: "SPOOKY",
    readingLevel: "TEEN",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 12,
    pressureName: "How many times it has been said",
    acts: [
      {
        index: 1,
        title: "Two Down",
        goal: "Establish that the rhyme is real and running a verse behind. Everything that happens must have a completely reasonable explanation that is completely wrong. Nobody is hurt; things go wrong in small, deniable, extremely annoying ways.",
        beats: [
          "Something from the first verse comes true in a way you could argue was a coincidence",
          "A grown-up has a sensible explanation, is very sure of it, and is wrong",
          "Somewhere out of sight, another child says the third verse",
        ],
        seeks: ["the exercise book with all four verses copied out in three different hands"],
      },
      {
        index: 2,
        title: "The One Who Taught It",
        goal: "Track the rhyme back to whoever started it, through children and objects rather than through any adult explaining. Every answer should be one more person who learned it from somebody else.",
        beats: [
          "Every child they ask learned it from someone who learned it from someone",
          "A name in the back of the book has been rubbed out and written in again",
          "The empty place on Tuesday's register belongs to somebody nobody can quite picture",
        ],
        seeks: [
          "the school photograph from the year the rhyme starts",
          "the rubbed-out name, held up to the light until it reads",
        ],
      },
      {
        index: 3,
        title: "The Fourth Verse",
        goal: "The rhyme turns out to be a way of calling somebody in from a game that nobody ever ended. The fourth verse is a name. Finishing it properly needs more than one voice in the same room — and it ends warmly rather than in a bang.",
        beats: [
          "The last verse is a name, and it has been missing from the rhyme the whole time",
          "Saying it properly takes every voice at once, in one room, out loud",
          "The glass stops answering, and the changing rooms go back to being changing rooms",
        ],
        seeks: ["the last verse, written out in full for the first time"],
      },
    ],
  },
  {
    slug: "build-before-dark",
    title: "Build Before Dark",
    tagline: "A country where the ground comes up in tidy squares, and the sun is already low.",
    premise:
      "Nobody knows how the family got here and nobody local seems remotely surprised. It is a good " +
      "country: the earth comes away in neat cubes, timber stacks itself, and anything taken apart " +
      "goes back together if you work out the order. It has one rule, and everybody says it the " +
      "same way. When the light goes, the things that were taken apart come looking for their " +
      "pieces. They are not angry. They are extremely determined, and they can see in the dark.",
    hook:
      "The sun is four hands above the hills, which a woman carrying a door says means about an " +
      "hour. There is a spade nobody has claimed, a hillside that comes away in squares as clean as " +
      "cut cake, and a sheep that has not stopped watching you since you arrived. Down in the " +
      "valley one window is already lit, and whoever lit it has shut their door.",
    defaultTone: "ADVENTUROUS",
    readingLevel: "MIDDLE_GRADE",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 15,
    pressureName: "How low the sun is",
    acts: [
      {
        index: 1,
        title: "An Hour of Daylight",
        goal: "Shelter and light before dark. Let them build badly and let it matter — a bad shelter is survivable and a shared one is comfortable. Reward invention over caution, and let anything they make stay made.",
        beats: [
          "The hillside comes away in cubes, and the cubes stack any way at all",
          "Something follows one of them home and waits outside, politely, all night",
          "What one of them builds badly turns out to be exactly the right shape later",
        ],
        seeks: ["a lamp with enough oil in it for one whole night"],
      },
      {
        index: 2,
        title: "Down",
        goal: "Under the hill, for the stone that makes its own light. Depth is the danger rather than anything living — dark, distance, and a way back that has to be held open. Different characters should notice different things.",
        beats: [
          "Every layer down is a different colour and a different sound underfoot",
          "Something has been stacking cubes into the same shape down here, badly, for years",
          "A passage stays open only while somebody stands in it",
        ],
        seeks: [
          "a handful of the stone that keeps its own light",
          "the small stacked figure somebody down here has been making over and over",
        ],
      },
      {
        index: 3,
        title: "What the Dark Wants",
        goal: "The thing below follows light rather than people, and has never once seen the sky. The way through is showing it, not escaping it. End on the whole party on one rope and the country letting them keep everything they built.",
        beats: [
          "It follows the lamp rather than the people, and it stops when they stop",
          "The way up needs everybody on the rope and one of them at the top",
          "It sees the sky, and every cube anybody laid stays exactly where it was put",
        ],
        seeks: ["the first cube out of the hillside, carried all the way back up"],
      },
    ],
  },
  {
    slug: "come-out-come-out",
    title: "Come Out, Come Out",
    tagline: "A game of hide and seek started in this shop a very long time ago. Nobody called it off.",
    premise:
      "Hemmings & Son closed on a Tuesday twenty years ago and the lights never entirely went out. " +
      "Inside, a game is still running: somebody is still counting, several somebodies are still " +
      "hidden, and the rules have got very strict about how anybody wins. It is a proper chase and " +
      "it is properly frightening. It is also true that the seeker has been It for twenty years, " +
      "and what it actually wants is for somebody to find it, for once.",
    hook:
      "The service door was open, which it had no business being. Inside, the escalators are running " +
      "with nobody on them and the tannoy is counting somewhere above you, unhurried — 'forty-one… " +
      "forty-two…' On the floor by the till, in chalk gone furry with dust, somebody has written out " +
      "the rules of a game. There are four of them. You can only read three.",
    defaultTone: "SPOOKY",
    readingLevel: "MIDDLE_GRADE",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 15,
    pressureName: "How high the counting has got",
    acts: [
      {
        index: 1,
        title: "Forty-One, Forty-Two",
        goal: "Teach the game by playing it. Hiding works, splitting up works, and being found is never the end of anybody — it costs a light and the game carries on. Frighten them properly and never once catch anyone.",
        beats: [
          "The counting carries everywhere and gets louder in the wrong direction",
          "A good hiding place works exactly once, because the game remembers it",
          "Being found costs a light rather than a person",
        ],
        seeks: ["the fourth rule, chalked under the till where the dust lay thickest"],
      },
      {
        index: 2,
        title: "The Ones Still Hiding",
        goal: "Find the other players, who have been hidden for twenty years and are very good at it. They are bored rather than frightening, and they will come out if somebody does it properly. Each one called in brings a floor of lights back on.",
        beats: [
          "Somebody has been in the same place so long the shop has grown around them",
          "One will only come out if a person counts for them properly, eyes shut, no peeking",
          "The lights come back a floor at a time as each of them is called in",
        ],
        seeks: [
          "the staff badge belonging to the last person to leave",
          "the tally of everyone still hiding, kept on the back of a price card",
        ],
      },
      {
        index: 3,
        title: "All In, All In",
        goal: "End the game by finding the seeker, which nobody has ever done. Its hiding place is the place you count from, so nobody has ever looked there. The last move is kindness rather than escape, and afterwards it is only a shop.",
        beats: [
          "The one place nobody looks is the place the counting comes from",
          "Calling it in takes every voice at once, from wherever each of them is standing",
          "The tannoy stops in the middle of a number, and so do the escalators",
        ],
        seeks: ["the chalk, worn down to a stub, kept from the floor by the till"],
      },
    ],
  },
  {
    slug: "until-six",
    title: "Until Six",
    tagline: "The band stops playing at nine. Nobody has ever written down what they do until six.",
    premise:
      "Bumbleton's Pizza & Games has been shut for refurbishment since the spring, and somebody has " +
      "to mind it overnight. The job is three lines long: keep the lights on, keep the doors shut, " +
      "be gone by six. The band on the stage — a bear, a rabbit, a chicken and a fox, in waistcoats " +
      "— has stood in the same place since 1987 and is not supposed to move. It moves. What none of " +
      "the notes mention is that it is not hunting anybody. It is looking for four children who " +
      "were never found, it has been looking for a very long time, and it can no longer tell a lost " +
      "child from one who is only visiting.",
    hook:
      "The manager left before you arrived. Taped inside the office window is a laminated card of " +
      "rules in cheerful bubble letters, and somebody has gone over rule four in biro, three times: " +
      "KEEP THE STAGE LIT. Out in the dark of the main room four shapes stand under dead spotlights, " +
      "exactly where the poster says they should be. The clock above the ball pit says nine. Your " +
      "shift ends at six.",
    defaultTone: "SPOOKY",
    readingLevel: "MIDDLE_GRADE",
    minPlayers: 2,
    maxPlayers: 5,
    estimatedScenes: 15,
    pressureName: "How much power is left",
    acts: [
      {
        index: 1,
        title: "Nine to Twelve",
        goal: "Teach the building by night: the cameras, the doors, the power that runs out, and the fact that the band only moves when nobody is looking. Frighten them properly. Nothing ever touches anybody — a bad moment costs a light or a door, never a person — and the first real scare must resolve into something sad rather than something hostile.",
        beats: [
          "A camera shows the stage with one figure fewer than the poster promises",
          "One of them is standing in the party room holding a paper crown, waiting to be told the party has started",
          "The power is finite, and the party finds that out by spending too much of it",
        ],
        seeks: ["the paper crown from the party room, with a name written inside it"],
      },
      {
        index: 2,
        title: "The Ones Who Stayed Behind",
        goal: "Work out who the band is looking for, through objects and the building itself rather than any adult explaining. Every answer should be a thing somebody left behind. Let the band be near the party without ever cornering them, and let one of them be plainly, obviously careful not to touch anyone.",
        beats: [
          "The lost-property box holds four things nobody has claimed since 1987",
          "A birthday photograph has more children standing in it than the party list has names",
          "One of them follows a torch beam rather than a person, and stops dead when the beam does",
        ],
        seeks: [
          "the birthday photograph with one extra child in it",
          "the lost-property tag with a name nobody at that party had",
        ],
      },
      {
        index: 3,
        title: "Until Six",
        goal: "Finish the search the band cannot finish on its own. Nothing is defeated, switched off or escaped from — the last hour is spent putting four names somewhere they can be read, which is all any of this was ever for. At six the lights come up by themselves and it is a pizza restaurant again.",
        beats: [
          "The band will follow somebody who walks slowly, and will not follow anybody who runs",
          "The last name is only half-remembered, so it takes more than one voice to finish",
          "At six the spotlights come on, and the stage holds exactly what the poster says it holds",
        ],
        seeks: [
          "the birthday board from the party room, with four more names on it than it started with",
        ],
      },
    ],
  },
] as const;
