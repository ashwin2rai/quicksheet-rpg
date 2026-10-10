// Progression: applies one legal level-up step at a time, following the SRD 2.0
// "Leveling Up" sequence, and records every choice in character.advancementHistory.
//
// Advancement history entry:
// {
//   level, tier,
//   tierAchievement: { experienceId, proficiency: 1, clearedMarkedTraits, companionExperience } | null,
//   advancements: [{ option, slotTier, cost, traits?, experienceIds?, cardId?, subclassTier? }],
//   domainCardId,                       // step four
//   grantedCardIds: [],                 // from features acquired this level (e.g. "Accomplished")
//   companion: [{ option, detail?, experience? }],
//   stanceId,                           // Martial Artist only: the stance learned this level
// }
//
// Besides PROGRESSION.OPTIONS, a class feature can add its own advancement option
// (Brawler "Combo Strike": increase the Combo Die once per tier).

import { TRAITS, tierForLevel } from './catalog.js';
import { RULES, PROGRESSION } from './rules.js';
import { RESOLVERS } from './resolvers.js';

export { tierForLevel };
export const TIER_ACHIEVEMENT_LEVELS = PROGRESSION.TIER_ACHIEVEMENT_LEVELS;
export const MAX_LEVEL = PROGRESSION.MAX_LEVEL;

const optionById = Object.fromEntries(PROGRESSION.OPTIONS.map((o) => [o.id, o]));
const allAdvancements = (history = []) => history.flatMap((h) => h.advancements ?? []);

/** Proficiency: base 1, +1 per tier achievement, +1 per Proficiency advancement. */
export function proficiencyFromHistory(history = []) {
  return RULES.BASE_PROFICIENCY
    + history.filter((h) => h.tierAchievement).length
    + allAdvancements(history).filter((a) => a.option === 'proficiency').length;
}

/** Totals granted by advancements (not by features or gear). */
export function advancementTotals(history = []) {
  const totals = { hpSlots: 0, stressSlots: 0, evasion: 0, traits: Object.fromEntries(TRAITS.map((t) => [t, 0])), experiences: {} };
  for (const a of allAdvancements(history)) {
    if (a.option === 'hp') totals.hpSlots += 1;
    if (a.option === 'stress') totals.stressSlots += 1;
    if (a.option === 'evasion') totals.evasion += 1;
    if (a.option === 'traits') for (const t of a.traits) totals.traits[t] += 1;
    if (a.option === 'experiences') for (const id of a.experienceIds) totals.experiences[id] = (totals.experiences[id] ?? 0) + 1;
  }
  return totals;
}

/** Base traits plus trait advancements (before equipment or feature modifiers). */
export function trainedTraits(character) {
  const adv = advancementTotals(character.advancementHistory).traits;
  return Object.fromEntries(TRAITS.map((t) => [t, character.traits[t] + adv[t]]));
}

/** Traits marked since the last clear (tier achievements at levels 5 and 8 clear marks). */
export function markedTraits(history = []) {
  const marked = new Set();
  for (const h of history) {
    if (h.tierAchievement?.clearedMarkedTraits) marked.clear();
    for (const a of h.advancements ?? []) if (a.option === 'traits') a.traits.forEach((t) => marked.add(t));
  }
  return marked;
}

/** How many times an advancement option was taken (e.g. Combo Die increases). */
export function advancementCount(history = [], optionId) {
  return allAdvancements(history).filter((a) => a.option === optionId).length;
}

/** Advancement options this character can take: the SRD list plus any from class features. */
export function advancementOptions(character, catalog) {
  const fromFeatures = catalog.get(character.selections.classId).featureIds
    .map((id) => catalog.get(id).mechanics.advancement)
    .filter(Boolean);
  return [...PROGRESSION.OPTIONS, ...fromFeatures];
}

/** Martial stances known: the starting choice, then one per level-up, with the level learned. */
export function knownStances(character, stanceFeatureId) {
  const start = (character.featureChoices[stanceFeatureId]?.stanceIds ?? []).map((stanceId) => ({ stanceId, level: 1 }));
  return [...start, ...character.advancementHistory.filter((h) => h.stanceId).map((h) => ({ stanceId: h.stanceId, level: h.level }))];
}

export function slotsUsed(history = []) {
  const used = {};
  for (const a of allAdvancements(history)) used[`${a.option}:${a.slotTier}`] = (used[`${a.option}:${a.slotTier}`] ?? 0) + 1;
  return used;
}

const DEFAULT_ADVANCEMENT_WEIGHTS = { traits: 3, hp: 2, stress: 2, experiences: 1, domainCard: 2, evasion: 1.5, subclass: 8, proficiency: 5 };
const TRAIT_PRIORITY_WEIGHT = { 2: 8, 1: 4, 0: 2, [-1]: 1 };
const COMPANION_WEIGHTS = { vicious: 3, resilient: 2, aware: 2, intelligent: 1.5 };
const DIE_STEPS = [4, 6, 8, 10, 12, 20];
const RANGE_STEPS = ['Melee', 'Very Close', 'Close', 'Far', 'Very Far'];

/** Companion stats after its level-up options: used by derive and by option availability. */
export function companionProgress(history = [], base) {
  let die = base.damageDie;
  let range = base.attackRange;
  const counts = {};
  const intelligent = {};
  const experiences = [];
  for (const h of history) {
    if (h.tierAchievement?.companionExperience) experiences.push(h.tierAchievement.companionExperience);
    for (const pick of h.companion ?? []) {
      counts[pick.option] = (counts[pick.option] ?? 0) + 1;
      if (pick.option === 'vicious' && pick.detail === 'die') die = DIE_STEPS[DIE_STEPS.indexOf(die) + 1];
      if (pick.option === 'vicious' && pick.detail === 'range') range = RANGE_STEPS[RANGE_STEPS.indexOf(range) + 1];
      if (pick.option === 'intelligent') intelligent[pick.experience] = (intelligent[pick.experience] ?? 0) + 1;
    }
  }
  return { die, range, counts, intelligent, experiences };
}

function ownedCardIds(character) {
  return new Set(character.domainCards.map((c) => c.cardId));
}

/** Adds a card (resolving any acquisition choice). Loadout placement happens in arrangeLoadout. */
export function acquireCard(character, card, level, source, { rng, catalog }) {
  character.domainCards.push({ cardId: card.id, acquiredAtLevel: level, location: 'vault', source });
  if (card.mechanics.resolver) {
    character.featureChoices[card.id] = RESOLVERS[card.mechanics.resolver].resolve({ character, rng, catalog, mechanics: card.mechanics });
  }
}

/** Domain cards the active loadout can hold: five, adjusted by equipped gear (Attuned armor: one fewer). */
export function loadoutLimit(character, catalog) {
  const { primaryWeaponId, secondaryWeaponId, armorId } = character.equipment;
  return [primaryWeaponId, secondaryWeaponId, armorId].filter(Boolean)
    .reduce((n, id) => n + (catalog.get(id).feature?.mechanics?.loadoutSlots ?? 0), RULES.MAX_LOADOUT);
}

/**
 * Instant-character loadout: cards placed in the vault permanently stay there; of the
 * rest, the highest-level cards (ties: most recently acquired) fill the loadout.
 */
export function arrangeLoadout(character, catalog) {
  const cards = character.domainCards.map((entry) => ({ entry, card: catalog.get(entry.cardId) }));
  const eligible = cards.filter(({ card }) => !card.mechanics.vaultOnAcquire);
  eligible.sort((a, b) => b.card.level - a.card.level || b.entry.acquiredAtLevel - a.entry.acquiredAtLevel || a.card.id.localeCompare(b.card.id));
  const active = new Set(eligible.slice(0, loadoutLimit(character, catalog)).map(({ entry }) => entry.cardId));
  for (const { entry } of cards) entry.location = active.has(entry.cardId) ? 'loadout' : 'vault';
}

/** Picks a new domain card at or below maxLevel from the class's domains. */
function pickCard(character, catalog, rng, maxLevel) {
  const owned = ownedCardIds(character);
  const options = catalog.domainCardsFor(character.selections.classId, maxLevel).filter((c) => !owned.has(c.id));
  if (!options.length) return null;
  return rng.weighted(options, (c) => c.level ** 1.5 + 1);
}

function acquireFeatureGrants(character, features, level, entry, ctx) {
  let companionPicks = 0;
  for (const f of features) {
    const m = f.mechanics;
    for (const itemId of m.grants?.items ?? []) character.inventory.push({ itemId, quantity: 1, source: f.id });
    for (let i = 0; i < (m.grants?.domainCards ?? 0); i++) {
      const card = pickCard(character, ctx.catalog, ctx.rng, level);
      if (card) {
        acquireCard(character, card, level, f.id, ctx);
        entry.grantedCardIds.push(card.id);
      }
    }
    companionPicks += m.grants?.companionAdvancements ?? 0;
    if (m.resolver && !character.featureChoices[f.id]) {
      character.featureChoices[f.id] = RESOLVERS[m.resolver].resolve({ character, rng: ctx.rng, catalog: ctx.catalog, mechanics: m });
    }
  }
  return companionPicks;
}

function companionFeature(character, catalog) {
  const subclass = catalog.get(character.selections.subclassId);
  return subclass.foundationFeatureIds.map((id) => catalog.get(id)).find((f) => f.mechanics.companion) ?? null;
}

function stanceFeature(character, catalog) {
  const subclass = catalog.get(character.selections.subclassId);
  return subclass.foundationFeatureIds.map((id) => catalog.get(id)).find((f) => f.mechanics.stances) ?? null;
}

function pickCompanionAdvancement(character, catalog, rng, base, history) {
  const progress = companionProgress(history, base);
  const choice = character.featureChoices[companionFeature(character, catalog).id];
  const available = base.advancements.filter((opt) => {
    if ((progress.counts[opt.id] ?? 0) >= opt.slots) return false;
    if (opt.id === 'vicious') return progress.die < base.maxDamageDie || progress.range !== 'Very Far';
    return true;
  });
  if (!available.length) return null;
  const opt = rng.weighted(available, (o) => COMPANION_WEIGHTS[o.id] ?? 1);
  const pick = { option: opt.id };
  if (opt.id === 'vicious') {
    const canDie = progress.die < base.maxDamageDie;
    const canRange = progress.range !== 'Very Far';
    pick.detail = canDie && (!canRange || rng.next() < 0.65) ? 'die' : 'range';
  }
  if (opt.id === 'intelligent') pick.experience = rng.pick([...choice.experiences, ...progress.experiences]);
  return pick;
}

/** Applies exactly one level-up to a copy of `character` and returns it. */
export function advanceOneLevel(character, catalog, rng) {
  const c = structuredClone(character);
  const level = c.level + 1;
  if (level > PROGRESSION.MAX_LEVEL) throw new RangeError(`Cannot advance beyond level ${PROGRESSION.MAX_LEVEL}`);
  const tier = tierForLevel(level);
  const cls = catalog.get(c.selections.classId);
  const subclass = catalog.get(c.selections.subclassId);
  const style = catalog.classStyle(cls.id);
  const ctx = { rng, catalog };
  const entry = { level, tier, tierAchievement: null, advancements: [], domainCardId: null, grantedCardIds: [], companion: [] };
  const priorHistory = c.advancementHistory;
  const compFeature = companionFeature(c, catalog);
  const compBase = compFeature?.mechanics.companion ?? null;

  // Step one: tier achievements.
  if (PROGRESSION.TIER_ACHIEVEMENT_LEVELS.includes(level)) {
    const owned = new Set(c.experiences.map((e) => e.name.toLowerCase()));
    const exp = rng.weighted(
      catalog.flavor.experiences.filter((e) => !owned.has(e.name.toLowerCase())),
      (e) => (e.tags.some((t) => style.experienceTags.includes(t)) ? 3 : 1),
    );
    c.experiences.push({ id: exp.id, name: exp.name, modifier: RULES.EXPERIENCE_MODIFIER, source: 'tier-achievement', acquiredAtLevel: level });
    entry.tierAchievement = { experienceId: exp.id, proficiency: 1, clearedMarkedTraits: PROGRESSION.CLEAR_MARKED_TRAITS_LEVELS.includes(level) };
    if (compBase) {
      const choice = c.featureChoices[compFeature.id];
      const have = new Set([...choice.experiences, ...companionProgress(priorHistory, compBase).experiences]);
      entry.tierAchievement.companionExperience = rng.pick(compBase.exampleExperiences.filter((x) => !have.has(x)));
    }
  }

  // Step two: two advancements from this tier or below.
  const weights = { ...DEFAULT_ADVANCEMENT_WEIGHTS, ...(style.advancementWeights ?? {}) };
  const options = advancementOptions(c, catalog);
  let picksLeft = PROGRESSION.ADVANCEMENTS_PER_LEVEL;
  let companionPicks = compBase ? 1 : 0;
  while (picksLeft > 0) {
    const history = [...priorHistory, entry];
    const used = slotsUsed(history);
    const marked = markedTraits(history);
    const unmarked = TRAITS.filter((t) => !marked.has(t));
    const nextSubclass = PROGRESSION.SUBCLASS_ORDER[c.subclassTiers.length];
    const candidates = [];
    for (const opt of options) {
      if (opt.cost > picksLeft) continue;
      if (opt.id === 'traits' && unmarked.length < 2) continue;
      if (opt.id === 'subclass' && !nextSubclass) continue;
      // "Once per tier" options (Combo Die) can only use the current tier's slot.
      const tiers = opt.sameTierOnly ? [tier] : [tier, tier - 1, tier - 2];
      const slotTier = tiers.find((t) => t >= 2 && (opt.slots[t] ?? 0) > (used[`${opt.id}:${t}`] ?? 0));
      if (!slotTier) continue;
      if (opt.id === 'domainCard' && !pickableCardExists(c, catalog, Math.min(level, PROGRESSION.TIER_MAX_LEVEL[slotTier]))) continue;
      candidates.push({ opt, slotTier });
    }
    if (!candidates.length) throw new Error(`No legal advancement available at level ${level}`);
    const { opt, slotTier } = rng.weighted(candidates, ({ opt: o }) => weights[o.id] ?? 1);
    const adv = { option: opt.id, slotTier, cost: opt.cost };
    if (opt.id === 'traits') {
      const current = trainedTraits({ ...c, advancementHistory: history });
      adv.traits = rng.weightedSample(unmarked, 2, (t) =>
        TRAIT_PRIORITY_WEIGHT[cls.suggested.traits[t]] * (subclass.spellcastTrait === t ? 2 : 1) * (1 + Math.max(0, current[t]) / 2));
    } else if (opt.id === 'experiences') {
      adv.experienceIds = rng.weightedSample(c.experiences, 2).map((e) => e.id);
    } else if (opt.id === 'domainCard') {
      const card = pickCard(c, catalog, rng, Math.min(level, PROGRESSION.TIER_MAX_LEVEL[slotTier]));
      acquireCard(c, card, level, 'advancement', ctx);
      adv.cardId = card.id;
    } else if (opt.id === 'subclass') {
      adv.subclassTier = nextSubclass;
      c.subclassTiers.push(nextSubclass);
      const newFeatures = subclass[`${nextSubclass}FeatureIds`].map((id) => catalog.get(id));
      entry.advancements.push(adv);
      picksLeft -= opt.cost;
      companionPicks += acquireFeatureGrants(c, newFeatures, level, entry, ctx);
      continue;
    }
    entry.advancements.push(adv);
    picksLeft -= opt.cost;
  }

  // Step three (damage thresholds +1) is level-based and computed in derive.js.
  // Step four: a new domain card at or below the new level.
  const card = pickCard(c, catalog, rng, level);
  if (card) {
    acquireCard(c, card, level, 'level-up', ctx);
    entry.domainCardId = card.id;
  }

  // Companion: one level-up option per level, plus any granted by subclass features.
  for (let i = 0; i < companionPicks; i++) {
    const pick = pickCompanionAdvancement(c, catalog, rng, compBase, [...priorHistory, entry]);
    if (pick) entry.companion.push(pick);
  }

  // Martial Artist "Stance Fighter": "Each time you level up your character, choose an
  // additional stance from your tier or lower."
  const stances = stanceFeature(c, catalog);
  if (stances) {
    const known = new Set(knownStances(c, stances.id).map((x) => x.stanceId));
    const choices = catalog.martialStances.filter((x) => x.tier <= tier && !known.has(x.id));
    if (choices.length) entry.stanceId = rng.weighted(choices, (x) => (x.tier === tier ? 2 : 1)).id;
  }

  c.level = level;
  c.advancementHistory = [...priorHistory, entry];
  arrangeLoadout(c, catalog);
  return c;
}

function pickableCardExists(character, catalog, maxLevel) {
  const owned = ownedCardIds(character);
  return catalog.domainCardsFor(character.selections.classId, maxLevel).some((card) => !owned.has(card.id));
}
