// SRD 2.0 numeric constants for character creation (Character Creation steps 3-8,
// Hope, Armor). Centralised so generator, derive and validator agree on facts
// while keeping their logic independent.
export const RULES = Object.freeze({
  TRAIT_ARRAY: Object.freeze([2, 1, 1, 0, 0, -1]),
  BASE_STRESS_SLOTS: 6,
  STARTING_HOPE: 2,
  MAX_HOPE: 6,
  BASE_PROFICIENCY: 1,
  MAX_ARMOR_SCORE: 12,
  EXPERIENCE_MODIFIER: 2,
  STARTING_EXPERIENCES: 2,
  STARTING_DOMAIN_CARDS: 2,
  MAX_LOADOUT: 5,
  STARTING_GOLD_HANDFULS: 1,
  STARTING_KIT: Object.freeze(['item.torch', 'item.rope', 'item.basic-supplies']),
  STARTING_POTIONS: Object.freeze(['item.minor-health-potion', 'item.minor-stamina-potion']),
});

// Leveling up (SRD 2.0 "Leveling Up"). Slot counts per tier come from the official
// character sheet's level-up section as transcribed by Old Gus; the SRD text gives the
// rules for each option. Multiclassing is a core option that QuickSheet deliberately
// does not generate (see docs/rules-decisions.md).
export const PROGRESSION = Object.freeze({
  MAX_LEVEL: 10,
  TIER_ACHIEVEMENT_LEVELS: Object.freeze([2, 5, 8]),
  CLEAR_MARKED_TRAITS_LEVELS: Object.freeze([5, 8]),
  TIER_MAX_LEVEL: Object.freeze({ 1: 1, 2: 4, 3: 7, 4: 10 }),
  ADVANCEMENTS_PER_LEVEL: 2,
  OPTIONS: Object.freeze([
    { id: 'traits', label: 'Gain a +1 bonus to two unmarked character traits and mark them', cost: 1, slots: { 2: 3, 3: 3, 4: 3 } },
    { id: 'hp', label: 'Permanently gain one Hit Point slot', cost: 1, slots: { 2: 2, 3: 2, 4: 2 } },
    { id: 'stress', label: 'Permanently gain one Stress slot', cost: 1, slots: { 2: 2, 3: 2, 4: 2 } },
    { id: 'experiences', label: 'Gain a +1 bonus to two Experiences', cost: 1, slots: { 2: 1, 3: 1, 4: 1 } },
    { id: 'domainCard', label: 'Choose an additional domain card', cost: 1, slots: { 2: 1, 3: 1, 4: 1 } },
    { id: 'evasion', label: 'Gain a +1 bonus to Evasion', cost: 1, slots: { 2: 1, 3: 1, 4: 1 } },
    { id: 'subclass', label: 'Take an upgraded subclass card', cost: 1, slots: { 3: 1, 4: 1 } },
    { id: 'proficiency', label: 'Increase Proficiency by +1', cost: 2, slots: { 3: 1, 4: 1 } },
  ].map(Object.freeze)),
  SUBCLASS_ORDER: Object.freeze(['foundation', 'specialization', 'mastery']),
});
