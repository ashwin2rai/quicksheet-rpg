# Rules decisions and open questions

Rules interpretations QuickSheet makes, with the source each relies on. Add a numbered entry whenever data or generation logic depends on a judgment call. "Old Gus" means Old Gus' edited SRD at the commit pinned in `data/srd-sources.lock.json`.

## Sources and verification

**RD-001: Source precedence and verification status.**
Game data is imported from Old Gus (`scripts/og-dhsrd-features.js`) by `tools/import-og-dhsrd.mjs`. When Old Gus and the official SRD disagree, the official SRD wins.

In V1 the official SRD 2.0 PDF (`DH_SRD_2_2026_08_25.pdf`, pinned in `data/srd-sources.lock.json`) was downloaded and every imported Level 1 text was compared with it:
- Of 135 texts (class, ancestry, community and Foundation features, Level 1 domain cards, Tier 1 Beastform features), 127 match word-for-word.
- Four differ only because of PDF text-extraction artifacts or quotation marks.
- Four are real Old Gus differences, corrected as described in RD-025.

All class Evasion/HP values, class items, domain card recall costs, and Tier 1 weapon and armor statistics were also checked against the PDF.

**RD-002: Errata.** Old Gus marks errata-updated entries (for example the Tier 1 Longsword, Spear and Glowing Rings, and the Whirlwind card) with an `Errata` page tag. QuickSheet imports the errata version and records `source.errata: true`.

## Character creation numbers

**RD-003: Starting values** (SRD Character Creation, step 4–5): Level 1; Evasion and HP from the class; 6 Stress slots; 2 Hope, maximum 6; Proficiency 1. Damage thresholds are the armor's base thresholds plus the character's level, plus permanent bonuses. Armor Score is the armor's base score plus permanent bonuses, up to a maximum of 12 (Old Gus, Armor). The level is added once, in `derive.js`. The validator recomputes it on its own.

**RD-004: Weapon damage.** Proficiency sets how many damage dice are rolled. It does not change the flat modifier: Proficiency 1 with d8+1 gives `1d8+1`. The secondary weapon's *Paired* bonus is shown as a conditional alternative on the primary weapon (for example `1d8+2` against targets within Melee range). It is not folded into the base damage.

## Equipment

**RD-005: Combat wheelchairs** (Light-, Heavy- and Arcane-Frame; the SRD credits Mark Thompson for these rules) are legal Tier 1 primary weapons and are kept in the data. The random generator does not choose them, because choosing one decides something about the character's body that the player should decide. **Planned:** an explicit opt-in or a fixed-weapon option.

**RD-006: Campaign-frame and setting-specific equipment.** Old Gus flags some Tier 1 weapons as GM- or setting-dependent (the dagger marker; for example the Sickle, Revolver and Repeating Crossbow from Core pp. 152, 275–276 and 317). These are excluded from the core generation pool. Hope & Fear equipment (`DH HF` pages) is excluded from the core profile.

**RD-007: Starting loadout shape.** Following SRD step 5, a character has either one two-handed primary weapon, or one one-handed primary weapon plus one one-handed secondary weapon. The validator rejects a one-handed primary without a secondary. Warrior's *Combat Training* is the one exception (RD-026).

**RD-008: Magic weapons need a Spellcast trait.** "If your subclass didn't assign you a Spellcast trait, you can't use magic weapons" (Old Gus, Weapons). Guardians and Warriors have no Spellcast trait, so they never get magic weapons. Every other core subclass has one.

**RD-009: Starting items.** Every character gets a torch, 50 feet of rope, basic supplies, one handful of gold, one Minor Health Potion *or* one Minor Stamina Potion (chosen at random), and one of the two class items (chosen at random). The SRD adds "whichever class-specific item you selected to carry your spells, if applicable". In V1 all nine core class item lists were checked against the official SRD 2.0, and none includes a separate spell-carrying item. QuickSheet therefore adds no mandatory focus. If a future source adds one, it should be modeled as an item grant.

**RD-010: Bare Bones (Valor 1).** QuickSheet always equips armor, so the card's unarmored alternative does not apply. The card text is shown in full. The alternative statistics are not calculated.

## Features and choices

**RD-011: Mechanics classification.** Every imported feature, Level 1 domain card and gear feature has a curated `mechanics.kind` in `tools/curation/core.json`:
- `effects`: implemented by one or more effect properties:
  - `modifiers`: plain numbers, or the expressions `proficiency`, `level` or `halfUp:<trait>`.
  - `resource`: a die by level, or a count from tier, level, Proficiency or a trait.
  - `attack`: an innate attack.
  - `flags`: for example `ignore-burden`.
  - `grants`: items or extra domain cards.
  - `resolver`: a named, tested function in `src/resolvers.js`.
  - `companion` and `display: beastforms`.
- `reference`: situational, resolved at the table.
- `deferred`: needs V2 progression.

Subclass Specialization and Mastery features default to `deferred` until V2 classifies them. The validator rejects any character that acquires a `deferred` feature. A rules effect is never assumed to work just because its text appears on the sheet.

**RD-012: Galapa Shell** adds the *current* Proficiency to both thresholds. It is recomputed from Proficiency rather than stored, so V2 level-ups update it automatically.

**RD-013: Clank Purposeful Design.** The mandatory mechanical choice (+1 to one Experience) is made at random between the two starting Experiences and recorded in `featureChoices`. "Decide who made you and for what purpose" is narrative, so it stays a prompt for the player.

**RD-014: Wanderborne Nomadic Pack** adds a *Nomadic Pack* item to the inventory, as the feature text instructs.

**RD-015: Class dice.** The Rally Die (Bard: d6, d8 at level 5) and the Unstoppable Die (Guardian: d4, d6 at level 5) are stored as level-indexed resources. Wordsmith's Epic Poetry (Rally Die d10) is a Mastery feature and marked `deferred`. Counted resources are covered in RD-027.

**RD-016: Stalwart threshold bonuses.** Unwavering (+1), Unrelenting (+2) and Undaunted (+3) are each worded as a separate "permanent bonus to your damage thresholds", so they stack: a total of +6 once Mastery is acquired.

**RD-017: Card tokens.** Inspirational Words (tokens equal to Presence), Unleash Chaos and Uncanny Disguise (tokens equal to the Spellcast trait) show their token count on the sheet. Tokens are spent and tracked at the table.

## Domain cards, Experiences and flavor

**RD-018: Domain cards.** Two distinct Level 1 cards are drawn uniformly from the class's two domains; both may come from the same domain (SRD step 8). School of Knowledge's *Prepared* adds a third (RD-030). All starting cards go in the active loadout. Card mechanics, such as Untouchable, apply only while a card is in the loadout.

**RD-019: Experiences** come from QuickSheet's own original table (`data/flavor/experiences.json`). Each is a narrow descriptor at +2 and grants no mechanics. Selection is weighted toward the class's style tags but never restricted to them.

**RD-020: SRD-sourced flavor prompts.** The class guide's clothing and attitude suggestions, background questions and connection questions are used as written. They are tagged as SRD material in `character.flavor.provenance`. Names, pronouns, concept line, personality, motivation and the backstory hook are original QuickSheet content. Nothing in the flavor tables is keyed to ancestry, so heritage never dictates personality.

## Upstream data notes

**RD-021: Old Gus card number duplication.** The Highborne community lists feature card `DH Core 073/270`, the same number as the Simiah ancestry card. This is probably an upstream typo. Card numbers are kept for provenance only and are never used mechanically. The official SRD PDF does not print card numbers in its text, so this could not be resolved. It could be reported upstream.

**RD-022: Domain order.** Old Gus lists the Bard's domains as Grace, Codex. The specification lists them as Codex + Grace. They are the same set, and QuickSheet treats domains as unordered.

## V1 additions

**RD-023: Mixed Ancestry** is opt-in through `options.mixedAncestry` (the "Mixed Ancestry" checkbox), or implied by choosing a `secondAncestryId` ("Second Ancestry" selector).
- The first ancestry (chosen or random) provides its top (first-listed) feature. The second ancestry (chosen or random) provides its bottom feature, as SRD step 2 describes.
- The two ancestries must differ; choosing the same one is rejected with an error.
- Both choices stay fixed across rerolls, and the sheet labels each feature with the ancestry it came from.

**RD-024: Beastforms.** Druid sheets list the Beastform options of the character's tier or lower, with numbers already derived:
- Evasion is the current Evasion plus the form's bonus.
- The attack uses the current trait for the form's attack trait, plus the form's trait bonus when they match.
- Damage dice equal Proficiency.

Armor stays part of the body, so armor effects persist. The *Evolution* Hope feature's temporary +1 is not pre-applied. Tier 3–4 Legendary/Mythic Beast and Hybrid forms are built from other forms (`variant: 'composite'`). They are listed with their rules text below the table, because their numbers depend on which base form the player picks.

**RD-025: Upstream corrections.** These are recorded in `tools/curation/core.json` (`officialOverrides`, `nameCorrections`) and applied by the importer:
- **Rogue *Cloaked*.** Old Gus appends "Otherwise, this bonus lasts until your next rest.", which belongs to *Rogue's Dodge*. Official text used.
- **Beastbound *Companion*.** Old Gus paraphrases the second sentence. Official text used.
- **Wizard class item.** Changed to "a tiny, harmless elemental pet" (Old Gus omits "pet").
- **Warrior class item.** Changed to "the drawing of a lover".
- **Nightwalker.** Old Gus merges each tier's two features into one string. The importer splits them.
- **Nightwalker "Fleting Shadow".** Corrected to "Fleeting Shadow".
- **Notorious (Grace 10).** Old Gus appends "This card doesn't count against your loadout's domain card maximum of 5 and can't be placed in your vault." That sentence is not in SRD 2.0, so it is removed and the card is treated as an ordinary card.
- **Mythic Beast *Evolved*.** Old Gus omits the "+3 bonus to Evasion" line. Restored.
- **Mass Disguise.** "Presences Roll" corrected to "Presence Rolls".
- **Tier 2–4 weapons.** Official statistics used: Knuckle Blades, Swinging Ropeblade and Legendary Glowing Rings are Two-Handed; Hand Sling's range is Very Far.
- **Companion *Aware*.** The official text gives +2 Evasion (Old Gus says +1).
- **Metric conversions.** Old Gus adds conversions such as "50 feet (15 m)". These are stripped on import.
- **Composite Beastform examples.** Upstream HTML links in these fields are converted to plain text.

**RD-026: Warrior *Combat Training*.**
- "You ignore burden when equipping weapons": a Warrior may equip a secondary weapon alongside a two-handed primary. The generator does this about 40% of the time, and the validator allows it only for characters with the `ignore-burden` flag.
- "When you deal physical damage, you gain a bonus to your damage roll equal to your level": the bonus is added to every physical damage roll shown (weapons, and innate physical attacks such as Ribbet *Long Tongue*), with a note on the sheet.

**RD-027: Counted resources.**
- Seraph *Prayer Dice*: d4s equal to the Spellcast trait, minimum 0.
- Rogue *Sneak Attack*: d6s equal to tier.
- Call of the Slayer *Slayer Dice*: maximum stored equal to Proficiency.
- Seaborne *Know the Tide*: maximum tokens equal to level.

A Seraph with a Spellcast trait of 0 or less would have no Prayer Dice. That is legal but makes a poor instant character, so the generator treats a zero class resource as a quality issue and rerolls that candidate. The legality rules are never bent.

**RD-028: Untouchable (Bone 1)** adds half the effective Agility to Evasion. It is rounded up per the SRD rule "Round up to the nearest whole number. Resolve any ambiguity in favor of the PCs", and never goes below 0.

**RD-029: Mandatory choices and their sources.**
- **Sorcerer *Elementalist*.** One of the SRD's five elements.
- **Drakona *Elemental Breath*.** Limited to the SRD's examples (electricity, fire, ice).
- **Wizard *Strange Patterns*.** A random number from 1 to 12, changeable on a long rest.
- **Orderborne *Dedicated*.** Three original QuickSheet sayings.
- **Beastbound companion.**
  - The animal type and name are original QuickSheet suggestions, labeled on the sheet as things to settle with the GM.
  - Damage type is physical or magic, weighted 3:1 toward physical.
  - The two +2 Experiences come from the SRD's example list.
  - Evasion 10 and the Melee d6 attack come from the SRD 2.0 "Ranger Companion" section.
  - The starting Stress slots (3) appear on the official Ranger Companion sheet, as transcribed by Old Gus, but are not stated in the SRD 2.0 text. **Open:** confirm against the official companion sheet.

**RD-030: School of Knowledge *Prepared*** ("Take an additional domain card of your level or lower from a domain you have access to") gives a third Level 1 card from the Wizard's domains at creation.

**RD-031: Warden of the Elements *Elemental Incarnation*.** The element is chosen each time the feature is used, so no choice is made at creation. Earth's threshold bonus applies only while channeling and is not added to the sheet's thresholds.

**RD-032: Syndicate *Well-Connected*** contacts are created on arrival somewhere, not at character creation, so no contact is generated.

## V2: Levels 1–10

**RD-033: Level-up sequence.** Characters above Level 1 are never built as a stat block. The generator creates a legal Level 1 character and applies `advanceOneLevel` once per level, following SRD 2.0 "Leveling Up":
1. Tier achievements at levels 2, 5 and 8: a new +2 Experience and +1 Proficiency. At 5 and 8, marked traits are cleared.
2. Two advancements with an unmarked slot from the current tier or below. Proficiency costs both.
3. Damage thresholds +1. This is computed as armor base + level and never stored, so it cannot be counted twice.
4. One new domain card at or below the new level.

Every choice is recorded in `advancementHistory`, shown on the sheet, and replayed by the validator, which checks each step against the rules at the level it happened. The per-tier slot counts come from the official character sheet's level-up section as transcribed by Old Gus:
- Tiers 2–4 each have: traits ×3, HP ×2, Stress ×2, Experiences ×1, domain card ×1, Evasion ×1.
- Tiers 3–4 also have: upgraded subclass ×1 and Proficiency ×1 (costs both advancements).

The SRD text describes the options but does not print the table. The table is consistent with the SRD's Proficiency benchmarks (Tier 2: 2, Tier 3: 3–4, Tier 4: 4–6). When a lower-tier slot is still unmarked, the generator uses the current tier's slot first.

**RD-034: Instant-character gear assumption.** The SRD does not say what equipment a hypothetical high-level hero has collected.
- Above Level 1, weapons and armor are re-chosen from the final tier's tables in the same trait-weighted way as at creation: mostly the character's own tier, sometimes one tier below.
- Inventory, potion, class item and gold stay as at creation.
- No loot, magic items or extra gold are invented.

The sheet states this assumption.

**RD-035: Content outside the official SRD.** Ten Tier 3–4 magic weapons in Old Gus come from the Core Rulebook and are not in the SRD 2.0 PDF: Axe of Fortunis, Blessed Anlace, Firestaff, Ghostblade, Gilded Bow, Ilmari's Rifle, Mage Orb, Runes of Ruination, Widogast Pendant, Sword of Light and Flame. They are excluded on import (`officialOverrides.excludeNotInSrd`). Every remaining weapon and armor row, and every card header, was matched against the official PDF.

**RD-036: Multiclassing** is an optional core rule that QuickSheet does not generate. The advancement is absent from the option table, and the validator rejects it. The data model leaves room to add it later.

**RD-037: Advancement weighting.** Choices are weighted, never restricted, toward what suits the class:
- Default weights are in `src/progression.js`; per-class adjustments are `advancementWeights` in `data/flavor/class-styles.json` (for example Guardians favor HP and Stress, Rogues Evasion, Wizards domain cards).
- Upgraded subclass is weighted highly, so most high-level characters reach Mastery.
- Trait advancements favor the class's suggested priorities and its Spellcast trait.
- Domain cards favor higher-level cards.

**RD-038: Loadout and vault.** After each level the loadout holds the five highest-level cards (ties: most recently acquired). The rest go to the vault.
- Cards that say "place this card in your vault permanently" (Vitality, Master of the Craft) stay in the vault, and their chosen benefit still applies.
- Recall costs are not paid when building an instant character.
- The optional step-four exchange of a previously acquired card is not used.
- Card bonuses that need 4+ cards of a domain in the loadout ("-Touched" cards) are evaluated on the final loadout.

**RD-039: Companion progression.**
- A Beastbound companion takes one level-up option per level. *Expert Training* (+1) and *Advanced Training* (+2) add one-time extra picks at the level they are acquired.
- *Vicious* improves the damage die (up to d12) or the range (up to Very Far).
- The companion gains a new Experience, from the SRD's examples, whenever the character gains one from a tier achievement.
- Option slot counts come from the official companion sheet as transcribed by Old Gus.

**RD-040: Stat-based card and gear bonuses.**
- "Bonus equal to your Strength/Agility" effects (Body Basher, Sharpening) use the effective trait, never below 0.
- Fortified Armor and Armorer apply because QuickSheet characters always wear armor.
- Situational bonuses stay at-the-table rules and are not added to the sheet's numbers. Examples: Shadowhunter in darkness, Conjure Shield with 2+ Hope, and Transcendence while transformed.

**RD-041: Gear restrictions.** *Pompous* weapons ("You must have a Presence of 0 or lower") are only chosen when the character's Presence allows it. The validator checks the final Presence after all modifiers.
