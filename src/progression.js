// Progression: applies one legal level-up step at a time.
// M0 scaffolding only. V2 implements advanceOneLevel following the SRD sequence
// (tier achievements, two advancements, threshold increase, domain card) and
// records each step in character.advancementHistory using the entry shape below.
//
// Advancement history entry (planned):
// {
//   level: 2,
//   tierAchievements: { experienceId, proficiency: 1, clearedMarkedTraits: false },
//   advancements: [{ id, cost, choice, reason }],
//   domainCard: { cardId, location: 'loadout' | 'vault' },
//   gains: { proficiency: 1, hpSlots: 0, stressSlots: 0, evasion: 0 }
// }

import { tierForLevel } from './catalog.js';
import { RULES } from './rules.js';

export { tierForLevel };
export const TIER_ACHIEVEMENT_LEVELS = Object.freeze([2, 5, 8]);
export const MAX_LEVEL = 10;

/** Proficiency from the base value plus gains recorded in the advancement history. */
export function proficiencyFromHistory(history = []) {
  return history.reduce((total, entry) => total + (entry.gains?.proficiency ?? 0), RULES.BASE_PROFICIENCY);
}

export function advanceOneLevel(/* character, catalog, rng */) {
  throw new Error('advanceOneLevel is not implemented yet: level progression arrives in V2 (Milestone M2).');
}
