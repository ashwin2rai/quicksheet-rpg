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
