# Rules decisions and open questions

Rules interpretations QuickSheet makes, with the source each relies on. Add a numbered entry whenever data or generation logic depends on a judgment call. "Old Gus" means Old Gus' edited SRD at the commit pinned in `data/srd-sources.lock.json`.

## Sources and verification

**RD-001: Source precedence and verification status (M0).**
Game data is imported from Old Gus (`scripts/og-dhsrd-features.js`) by `tools/import-og-dhsrd.mjs`. When Old Gus and the official SRD disagree, the official SRD wins. 

**RD-002: Errata.** Old Gus marks errata-updated entries (for example the Tier 1 Longsword, Spear and Glowing Rings, and the Whirlwind card) with an `Errata` page tag. QuickSheet imports the errata version and records `source.errata: true`.

## Character creation numbers

**RD-003: Starting values** (SRD Character Creation, step 4–5): Level 1; Evasion and HP from the class; 6 Stress slots; 2 Hope, maximum 6; Proficiency 1. Damage thresholds are the armor's base thresholds plus the character's level, plus permanent bonuses. Armor Score is the armor's base score plus permanent bonuses, up to a maximum of 12 (Old Gus, Armor). The level is added once, in `derive.js`. The validator recomputes it on its own.

**RD-004: Weapon damage.** Proficiency sets how many damage dice are rolled. It does not change the flat modifier: Proficiency 1 with d8+1 gives `1d8+1`. The secondary weapon's *Paired* bonus is shown as a conditional alternative on the primary weapon (for example `1d8+2` against targets within Melee range). It is not folded into the base damage.

## Equipment

**RD-005: Combat wheelchairs** (Light-, Heavy- and Arcane-Frame) are legal Tier 1 primary weapons and are kept in the data. The random generator does not choose them, because choosing one decides something about the character's body that the player should decide. **Planned:** add an explicit opt-in or a fixed-weapon option in V1.

**RD-006: Campaign-frame and setting-specific equipment.** Old Gus flags some Tier 1 weapons as GM- or setting-dependent (the dagger marker; for example the Sickle, Revolver and Repeating Crossbow from Core pp. 152, 275–276 and 317). These are excluded from the core generation pool. Hope & Fear equipment (`DH HF` pages) is excluded from the core profile.

**RD-007: Starting loadout shape.** Following SRD step 5, a character has either one two-handed primary weapon, or one one-handed primary weapon plus one one-handed secondary weapon. The validator rejects a one-handed primary without a secondary.

**RD-008: Magic weapons need a Spellcast trait.** "If your subclass didn't assign you a Spellcast trait, you can't use magic weapons" (Old Gus, Weapons). Neither Guardian subclass grants a Spellcast trait, so Guardians never get magic weapons. Both Bard subclasses use Presence.

**RD-009: Starting items.** Every character gets a torch, 50 feet of rope, basic supplies, one handful of gold, one Minor Health Potion *or* one Minor Stamina Potion (chosen at random), and one of the two class items (chosen at random). The SRD adds "whichever class-specific item you selected to carry your spells, if applicable". The Bard and Guardian class item options are not spell carriers, so neither class needs one. **V1:** check this for every class.

**RD-010: Bare Bones (Valor 1).** QuickSheet always equips armor, so the card's unarmored alternative does not apply. The card text is shown in full. The alternative statistics are not calculated.

## Features and choices

**RD-011: Mechanics classification.** Every imported feature has a curated `mechanics.kind` in `tools/curation/core.json`:
- `modifiers`: fully represented as numbers.
- `resolver`: a named, tested function in `src/resolvers.js`.
- `resource`: a class die by level.
- `grant`: adds items.
- `reference`: situational, resolved at the table.
- `deferred`: needs V2 progression.

The validator rejects any character that acquires a `deferred` feature. A rules effect is never assumed to work just because its text appears on the sheet.

**RD-012: Galapa Shell** adds the *current* Proficiency to both thresholds. It is recomputed from Proficiency rather than stored, so V2 level-ups update it automatically.

**RD-013: Clank Purposeful Design.** The mandatory mechanical choice (+1 to one Experience) is made at random between the two starting Experiences and recorded in `featureChoices`. "Decide who made you and for what purpose" is narrative, so it stays a prompt for the player.

**RD-014: Wanderborne Nomadic Pack** adds a *Nomadic Pack* item to the inventory, as the feature text instructs.

**RD-015: Class dice.** The Rally Die (Bard: d6, d8 at level 5) and the Unstoppable Die (Guardian: d4, d6 at level 5) are stored as level-indexed resources. Wordsmith's Epic Poetry (Rally Die d10) is a Mastery feature and marked `deferred`.

**RD-016: Stalwart threshold bonuses.** Unwavering (+1) is applied at Level 1. Unrelenting (+2) and Undaunted (+3) are `deferred`. **Open for V2:** confirm from the official text that these bonuses stack (a total of +6 at Mastery).

**RD-017: Inspirational Words** (Grace 1) places tokens equal to Presence after a long rest. This is tracked at the table and not computed.

## Domain cards, Experiences and flavor

**RD-018: Domain cards.** Two distinct Level 1 cards are drawn uniformly from the class's two domains; both may come from the same domain (SRD step 8). Both go in the active loadout.

**RD-019: Experiences** come from QuickSheet's own original table (`data/flavor/experiences.json`). Each is a narrow descriptor at +2 and grants no mechanics. Selection is weighted toward the class's style tags but never restricted to them.

**RD-020: SRD-sourced flavor prompts.** The class guide's clothing and attitude suggestions, background questions and connection questions are used as written. They are tagged as SRD material in `character.flavor.provenance`. Names, pronouns, concept line, personality, motivation and the backstory hook are original QuickSheet content. Nothing in the flavor tables is keyed to ancestry, so heritage never dictates personality.

## Upstream data notes

**RD-021: Old Gus card number duplication.** The Highborne community lists feature card `DH Core 073/270`, the same number as the Simiah ancestry card. This is probably an upstream typo. Card numbers are kept for provenance only and are never used mechanically. Report it upstream after checking against the official SRD.

**RD-022: Domain order.** Old Gus lists the Bard's domains as Grace, Codex. The specification lists them as Codex + Grace. They are the same set, and QuickSheet treats domains as unordered.
