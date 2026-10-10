// Validation: an authoritative, independent check of a finished character.
// It deliberately does not reuse the generator's selection logic, derive.js or
// progression.js: it replays the advancement history itself, checking that every
// level-up was legal at the time, then recomputes all derived numbers.

import { TRAITS, tierForLevel } from './catalog.js';
import { RULES, PROGRESSION } from './rules.js';
import { RESOLVERS } from './resolvers.js';
import { GENERATOR_VERSION, SRD_VERSION, SUPPORTED_LEVELS } from './version.js';

/** @returns {{ valid: boolean, errors: string[] }} */
export function validateCharacter(character, catalog) {
  const errors = [];
  const err = (message) => errors.push(message);
  try {
    runChecks(character, catalog, err);
  } catch (e) {
    err(`Validator could not complete: ${e.message}`);
  }
  return { valid: errors.length === 0, errors };
}

const DIE_STEPS = [4, 6, 8, 10, 12, 20];
const RANGE_STEPS = ['Melee', 'Very Close', 'Close', 'Far', 'Very Far'];
// "A trait of your choice" is shown with the highest effective trait; ties go to SRD order.
const highestTrait = (traits) => {
  let best = TRAITS[0];
  for (const t of TRAITS) if (traits[t] > traits[best]) best = t;
  return best;
};

function runChecks(c, catalog, err) {
  // ---- versions and provenance
  if (c.generatorVersion !== GENERATOR_VERSION) err(`generatorVersion is ${c.generatorVersion}, expected ${GENERATOR_VERSION}`);
  if (c.srdVersion !== SRD_VERSION) err(`srdVersion is ${c.srdVersion}, expected ${SRD_VERSION}`);
  if (c.dataVersion !== catalog.dataVersion) err(`dataVersion is ${c.dataVersion}, expected ${catalog.dataVersion}`);
  if (c.contentProfile !== catalog.contentProfile) err(`contentProfile ${c.contentProfile} does not match catalog ${catalog.contentProfile}`);
  if (typeof c.seed !== 'string' || !c.seed) err('seed is missing');
  if (!SUPPORTED_LEVELS.includes(c.level)) { err(`level ${c.level} is not supported`); return; }
  const history = c.advancementHistory ?? [];
  if (history.length !== c.level - 1) err(`a Level ${c.level} character needs ${c.level - 1} advancement history entries (has ${history.length})`);

  const inProfile = (id, prefix) => {
    if (typeof id !== 'string' || !id.startsWith(prefix)) return null;
    const record = catalog.find(id);
    if (!record) return null;
    return catalog.sourceSets.includes(record.source?.sourceSet) ? record : null;
  };

  // ---- heritage, class, subclass
  const sel = c.selections ?? {};
  const ancestry = inProfile(sel.ancestryId, 'ancestry.');
  const secondAncestry = sel.secondAncestryId ? inProfile(sel.secondAncestryId, 'ancestry.') : null;
  const community = inProfile(sel.communityId, 'community.');
  const cls = inProfile(sel.classId, 'class.');
  const subclass = inProfile(sel.subclassId, 'subclass.');
  const transformation = sel.transformationId ? inProfile(sel.transformationId, 'transformation.') : null;
  if (sel.transformationId && !transformation) { err(`invalid transformation ${sel.transformationId}`); return; }
  if (Boolean(c.options?.transformation) !== Boolean(transformation)) err('Transformation option and selections disagree');
  if (!ancestry) err(`invalid ancestry ${sel.ancestryId}`);
  if (sel.secondAncestryId && !secondAncestry) err(`invalid second ancestry ${sel.secondAncestryId}`);
  if (!community) err(`invalid community ${sel.communityId}`);
  if (!cls) err(`invalid class ${sel.classId}`);
  if (!subclass) err(`invalid subclass ${sel.subclassId}`);
  if (!ancestry || !community || !cls || !subclass || (sel.secondAncestryId && !secondAncestry)) return;
  if (secondAncestry && secondAncestry.id === ancestry.id) err('a Mixed Ancestry must combine two different ancestries');
  if (Boolean(c.options?.mixedAncestry) !== Boolean(secondAncestry)) err('Mixed Ancestry option and selections disagree');
  if (subclass.classId !== cls.id) err(`subclass ${subclass.name} does not belong to class ${cls.name}`);
  if (!cls.subclassIds.includes(subclass.id)) err(`class ${cls.name} does not list subclass ${subclass.name}`);
  for (const [key, value] of Object.entries(c.requested ?? {})) {
    if (value && sel[key] !== value) err(`fixed selection ${key}=${value} was not honoured (got ${sel[key]})`);
  }

  // ---- base traits
  const traitKeys = Object.keys(c.traits ?? {});
  if (traitKeys.length !== 6 || !TRAITS.every((t) => traitKeys.includes(t))) err('traits must contain exactly the six SRD traits');
  const values = TRAITS.map((t) => c.traits?.[t]).sort((a, b) => a - b).join(',');
  const expected = [...RULES.TRAIT_ARRAY].sort((a, b) => a - b).join(',');
  if (values !== expected) err(`base traits must be exactly +2, +1, +1, +0, +0, -1 (got ${values})`);

  // ---- replay the advancement history
  const replay = replayHistory(c, catalog, { cls, subclass }, err);

  // ---- features acquired (independent enumeration). Mixed Ancestry: top of the first, bottom of the second.
  const tiers = c.subclassTiers ?? [];
  if (tiers.join() !== replay.subclassTiers.join()) err(`subclass tiers [${tiers}] do not match the advancement history [${replay.subclassTiers}]`);
  // A transformation's features follow the subclass features. Shapeshifter "Only Skin Deep"
  // keeps just one of a single ancestry's two features.
  const transformationFeatureIds = transformation?.featureIds ?? [];
  const singleFeature = transformationFeatureIds.map((id) => catalog.find(id)).find((f) => f?.mechanics?.flags?.includes('single-ancestry-feature'));
  const keep = singleFeature ? c.featureChoices?.[singleFeature.id]?.keep : null;
  if (singleFeature && secondAncestry) err(`${transformation.name} cannot be combined with Mixed Ancestry`);
  const featureIds = [
    ...(keep === 'bottom' ? [] : [ancestry.topFeatureId]),
    ...(keep === 'top' ? [] : [(secondAncestry ?? ancestry).bottomFeatureId]),
    community.featureId, ...cls.featureIds, cls.hopeFeatureId,
  ];
  for (const t of replay.subclassTiers) featureIds.push(...subclass[`${t}FeatureIds`]);
  featureIds.push(...transformationFeatureIds);
  const features = [];
  for (const id of featureIds) {
    const f = catalog.find(id);
    if (!f) { err(`missing feature ${id}`); continue; }
    if (!f.mechanics) err(`feature ${id} has no mechanics classification`);
    else if (f.mechanics.kind === 'deferred') err(`feature ${f.name} requires support that is not implemented`);
    features.push(f);
  }
  const top = catalog.find(ancestry.topFeatureId);
  const bottom = catalog.find((secondAncestry ?? ancestry).bottomFeatureId);
  if (top?.position !== 'top' || bottom?.position !== 'bottom') err('ancestry features must be one top and one bottom feature');
  for (const f of features) if (f.category === 'transformation' && f.ownerId !== transformation?.id) err(`${f.name} belongs to another transformation`);

  // ---- domain cards: creation cards plus everything the history acquired
  const cards = c.domainCards ?? [];
  const cardIds = cards.map((x) => x.cardId);
  if (new Set(cardIds).size !== cardIds.length) err('domain cards must be distinct');
  const creationCards = cards.filter((x) => x.acquiredAtLevel === 1);
  const creationGrants = features
    .filter((f) => f.category === 'subclass-foundation' || !f.category.startsWith('subclass'))
    .reduce((n, f) => n + (f.mechanics?.grants?.domainCards ?? 0), 0);
  if (creationCards.length !== RULES.STARTING_DOMAIN_CARDS + creationGrants) err(`expected ${RULES.STARTING_DOMAIN_CARDS + creationGrants} domain cards from character creation (has ${creationCards.length})`);
  for (const [cardId, level] of replay.cardsAcquired) {
    const entry = cards.find((x) => x.cardId === cardId);
    if (!entry) err(`card ${cardId} acquired at level ${level} is missing from the character`);
    else if (entry.acquiredAtLevel !== level) err(`card ${cardId} records acquisition level ${entry.acquiredAtLevel}, history says ${level}`);
  }
  const historyCardIds = new Set(replay.cardsAcquired.map(([id]) => id));
  for (const entry of cards) {
    if (entry.acquiredAtLevel > 1 && !historyCardIds.has(entry.cardId)) err(`card ${entry.cardId} is not explained by the advancement history`);
  }
  const loadoutCards = [];
  const effectiveCards = [];
  for (const entry of cards) {
    const card = inProfile(entry.cardId, 'card.');
    if (!card) { err(`invalid domain card ${entry.cardId}`); continue; }
    if (!cls.domainIds.includes(card.domainId)) err(`${card.name} is from ${card.domainId}, outside ${cls.name}'s domains`);
    if (card.level > entry.acquiredAtLevel) err(`${card.name} (level ${card.level}) was acquired at level ${entry.acquiredAtLevel}`);
    if (entry.acquiredAtLevel < 1 || entry.acquiredAtLevel > c.level) err(`${card.name} has an impossible acquisition level ${entry.acquiredAtLevel}`);
    if (!['loadout', 'vault'].includes(entry.location)) err(`${card.name} has an invalid location ${entry.location}`);
    if (!card.mechanics || card.mechanics.kind === 'deferred') err(`${card.name} has no implemented mechanics classification`);
    if (card.mechanics?.vaultOnAcquire && entry.location !== 'vault') err(`${card.name} must stay in the vault permanently`);
    if (entry.location === 'loadout') loadoutCards.push(card);
    if (entry.location === 'loadout' || card.mechanics?.persistent) effectiveCards.push(card);
  }
  // Gear can shrink the loadout (Attuned: "reduced by one").
  const gearIds = [c.equipment?.primaryWeaponId, c.equipment?.secondaryWeaponId, c.equipment?.armorId].filter(Boolean);
  const maxLoadout = RULES.MAX_LOADOUT + gearIds.reduce((n, id) => n + (catalog.find(id)?.feature?.mechanics?.loadoutSlots ?? 0), 0);
  if (loadoutCards.length > maxLoadout) err(`more than ${maxLoadout} cards in the active loadout`);

  // ---- mandatory choices (features and acquired cards)
  const choices = c.featureChoices ?? {};
  const ownedCards = cards.map((x) => catalog.find(x.cardId)).filter(Boolean);
  const choosers = [...features, ...ownedCards].filter((x) => x.mechanics?.resolver);
  for (const x of choosers) {
    const resolver = RESOLVERS[x.mechanics.resolver];
    if (!resolver) { err(`no resolver named ${x.mechanics.resolver} for ${x.name}`); continue; }
    for (const message of resolver.validate(choices[x.id], c, x.mechanics, catalog)) err(`${x.name}: ${message}`);
  }
  for (const id of Object.keys(choices)) {
    if (!choosers.some((x) => x.id === id)) err(`choice recorded for ${id}, which the character does not have or which needs no choice`);
  }

  // ---- experiences: two from creation plus one per tier achievement
  const exps = c.experiences ?? [];
  const expectedExps = RULES.STARTING_EXPERIENCES + replay.tierAchievements.length;
  if (exps.length !== expectedExps) err(`expected ${expectedExps} Experiences (has ${exps.length})`);
  const names = exps.map((e) => String(e.name ?? '').trim().toLowerCase());
  if (names.some((n) => !n)) err('every Experience needs a name');
  if (new Set(names).size !== names.length || new Set(exps.map((e) => e.id)).size !== exps.length) err('Experiences must be distinct');
  for (const e of exps) if (e.modifier !== RULES.EXPERIENCE_MODIFIER) err(`Experience ${e.name} must start at +${RULES.EXPERIENCE_MODIFIER}`);
  for (const t of replay.tierAchievements) {
    const e = exps.find((x) => x.id === t.experienceId);
    if (!e || e.acquiredAtLevel !== t.level) err(`tier achievement Experience at level ${t.level} is missing or mis-dated`);
  }

  // ---- equipment (chosen for the final tier)
  const tier = tierForLevel(c.level);
  const ignoresBurden = features.some((f) => f.mechanics?.flags?.includes('ignore-burden'));
  const eq = c.equipment ?? {};
  const primary = inProfile(eq.primaryWeaponId, 'weapon.');
  const secondary = eq.secondaryWeaponId ? inProfile(eq.secondaryWeaponId, 'weapon.') : null;
  const armor = inProfile(eq.armorId, 'armor.');
  if (!primary) err(`invalid primary weapon ${eq.primaryWeaponId}`);
  if (eq.secondaryWeaponId && !secondary) err(`invalid secondary weapon ${eq.secondaryWeaponId}`);
  if (!armor) err(`invalid armor ${eq.armorId}`);
  if (!primary || !armor || (eq.secondaryWeaponId && !secondary)) return;
  if (primary.slot !== 'primary') err(`${primary.name} is not a primary weapon`);
  // Feature-granted weapons (Brawler's Strike) need the feature, and are used with no other weapons.
  const grantedWeapons = features.flatMap((f) => f.mechanics?.grants?.weapons ?? []);
  for (const w of [primary, secondary].filter(Boolean)) {
    if (w.tags.includes('feature-granted') && !grantedWeapons.includes(w.id)) err(`${w.name} requires a feature that grants it`);
  }
  if (primary.burden === 'unarmed' && secondary) err(`${primary.name} is only available while no other weapon is active`);
  if (primary.burden === 'two-handed' && secondary && !ignoresBurden) err(`${primary.name} is two-handed, so no secondary weapon can be equipped`);
  if (primary.burden === 'one-handed' && !secondary) err(`a one-handed primary weapon must be paired with a one-handed secondary weapon`);
  if (secondary && (secondary.slot !== 'secondary' || secondary.burden !== 'one-handed')) err(`${secondary.name} is not a one-handed secondary weapon`);
  for (const item of [primary, secondary, armor].filter(Boolean)) {
    if (item.tier > tier) err(`${item.name} is tier ${item.tier}, above character tier ${tier}`);
  }
  for (const w of [primary, secondary].filter(Boolean)) {
    if (w.magic && !subclass.spellcastTrait) err(`${w.name} is a magic weapon but ${subclass.name} grants no Spellcast trait`);
  }

  // ---- inventory
  const inventoryIds = (c.inventory ?? []).map((i) => i.itemId);
  for (const id of RULES.STARTING_KIT) if (!inventoryIds.includes(id)) err(`inventory is missing ${id}`);
  const potions = inventoryIds.filter((id) => RULES.STARTING_POTIONS.includes(id));
  if (potions.length !== 1) err(`inventory must hold exactly one of the two minor potions (has ${potions.length})`);
  for (const id of inventoryIds) if (!inProfile(id, 'item.')) err(`unknown inventory item ${id}`);
  const grantedIds = features.flatMap((f) => f.mechanics?.grants?.items ?? []);
  for (const id of grantedIds) if (!inventoryIds.includes(id)) err(`inventory is missing granted item ${id}`);
  for (const item of c.inventory ?? []) {
    if (item.source?.startsWith('feature.') && !grantedIds.includes(item.itemId)) err(`inventory item ${item.itemId} claims a grant the character does not have`);
  }
  if (!cls.classItems.includes(c.classItem)) err(`class item "${c.classItem}" is not one of the ${cls.name} options`);
  if (c.gold?.handfuls !== RULES.STARTING_GOLD_HANDFULS) err(`gold must be ${RULES.STARTING_GOLD_HANDFULS} handful (no loot is invented)`);

  // ---- flavor completeness
  const fl = c.flavor ?? {};
  for (const key of ['name', 'pronouns', 'concept', 'personality', 'motivation', 'hook', 'backgroundQuestion']) {
    if (typeof fl[key] !== 'string' || !fl[key].trim()) err(`flavor.${key} is missing`);
  }
  if (!Array.isArray(fl.connectionPrompts) || fl.connectionPrompts.length < 1 || fl.connectionPrompts.length > 2) err('flavor needs 1-2 connection prompts');
  if (transformation && !transformation.questions.includes(fl.transformationQuestion)) err('flavor needs one of the transformation questions');
  if (!transformation && fl.transformationQuestion !== undefined) err('transformation question without a transformation');

  // ---- derived statistics, recomputed independently
  checkDerived(c, catalog, { cls, subclass, features, loadoutCards, effectiveCards, primary, secondary, armor, choices, tier, replay }, err);
}

/** Replays history entries in order, checking each step against the SRD level-up rules. */
function replayHistory(c, catalog, { cls, subclass }, err) {
  const history = c.advancementHistory ?? [];
  const slotUse = {};
  let marked = new Set();
  const subclassTiers = ['foundation'];
  const owned = new Set((c.domainCards ?? []).filter((x) => x.acquiredAtLevel === 1).map((x) => x.cardId));
  const cardsAcquired = [];
  const tierAchievements = [];
  const totals = { hp: 0, stress: 0, evasion: 0, proficiency: 0, traits: Object.fromEntries(TRAITS.map((t) => [t, 0])), experiences: {} };
  const companionFeature = subclass.foundationFeatureIds.map((id) => catalog.find(id)).find((f) => f?.mechanics?.companion);
  const comp = companionFeature?.mechanics.companion;
  // Class features may add advancement options (Brawler Combo Die).
  const options = [...PROGRESSION.OPTIONS, ...cls.featureIds.map((id) => catalog.find(id)?.mechanics?.advancement).filter(Boolean)];
  const optionCounts = {};
  // Martial Artist stances: the starting choice is checked by its resolver; one more each level.
  const stanceFeature = subclass.foundationFeatureIds.map((id) => catalog.find(id)).find((f) => f?.mechanics?.stances);
  const stancesKnown = new Set(stanceFeature ? c.featureChoices?.[stanceFeature.id]?.stanceIds ?? [] : []);
  const companion = { die: comp?.damageDie, range: comp?.attackRange, counts: {}, intelligent: {}, experiences: [] };
  const expIdsKnown = new Set((c.experiences ?? []).filter((e) => (e.acquiredAtLevel ?? 1) === 1).map((e) => e.id));
  const acquire = (cardId, level, maxLevel, why) => {
    const card = catalog.find(cardId);
    if (!card) { err(`level ${level}: unknown card ${cardId} (${why})`); return; }
    if (!cls.domainIds.includes(card.domainId)) err(`level ${level}: ${card.name} is outside ${cls.name}'s domains (${why})`);
    if (card.level > maxLevel) err(`level ${level}: ${card.name} is level ${card.level}, above the allowed ${maxLevel} (${why})`);
    if (owned.has(cardId)) err(`level ${level}: ${card.name} was already owned (${why})`);
    owned.add(cardId);
    cardsAcquired.push([cardId, level]);
  };

  history.forEach((h, i) => {
    const level = i + 2;
    const tier = tierForLevel(level);
    if (h.level !== level || h.tier !== tier) err(`history entry ${i} should be level ${level} (tier ${tier}), got level ${h.level} tier ${h.tier}`);
    const achievesTier = PROGRESSION.TIER_ACHIEVEMENT_LEVELS.includes(level);
    if (achievesTier !== Boolean(h.tierAchievement)) err(`level ${level}: tier achievement ${achievesTier ? 'missing' : 'not allowed'}`);
    let grantedCompanionPicks = 0;
    if (h.tierAchievement) {
      if (h.tierAchievement.proficiency !== 1) err(`level ${level}: tier achievement must grant +1 Proficiency`);
      const clears = PROGRESSION.CLEAR_MARKED_TRAITS_LEVELS.includes(level);
      if (Boolean(h.tierAchievement.clearedMarkedTraits) !== clears) err(`level ${level}: marked traits ${clears ? 'must' : 'must not'} be cleared`);
      if (clears) marked = new Set();
      totals.proficiency += 1;
      tierAchievements.push({ level, experienceId: h.tierAchievement.experienceId });
      expIdsKnown.add(h.tierAchievement.experienceId);
      if (comp) {
        const x = h.tierAchievement.companionExperience;
        const have = [...(c.featureChoices?.[companionFeature.id]?.experiences ?? []), ...companion.experiences];
        if (!x || !comp.exampleExperiences.includes(x) || have.includes(x)) err(`level ${level}: the companion needs a new Experience at a tier achievement`);
        else companion.experiences.push(x);
      }
    }
    let cost = 0;
    for (const a of h.advancements ?? []) {
      const opt = options.find((o) => o.id === a.option);
      if (!opt) { err(`level ${level}: unknown or unsupported advancement "${a.option}"`); continue; }
      if (a.cost !== opt.cost) err(`level ${level}: ${opt.id} costs ${opt.cost}`);
      cost += opt.cost;
      optionCounts[opt.id] = (optionCounts[opt.id] ?? 0) + 1;
      if (!(a.slotTier >= 2 && a.slotTier <= tier)) err(`level ${level}: ${opt.id} uses a tier ${a.slotTier} slot, which is not at or below tier ${tier}`);
      if (opt.sameTierOnly && a.slotTier !== tier) err(`level ${level}: ${opt.label} can be taken only once per tier, from the current tier`);
      const key = `${opt.id}:${a.slotTier}`;
      slotUse[key] = (slotUse[key] ?? 0) + 1;
      if (slotUse[key] > (opt.slots[a.slotTier] ?? 0)) err(`level ${level}: no unmarked ${opt.id} slot left in tier ${a.slotTier}`);
      if (opt.id === 'traits') {
        const t = a.traits ?? [];
        if (t.length !== 2 || new Set(t).size !== 2 || !t.every((x) => TRAITS.includes(x))) err(`level ${level}: a trait advancement raises two different traits`);
        for (const x of t) {
          if (marked.has(x)) err(`level ${level}: ${x} is marked and cannot be raised until the next tier`);
          marked.add(x);
          totals.traits[x] = (totals.traits[x] ?? 0) + 1;
        }
      } else if (opt.id === 'hp') totals.hp += 1;
      else if (opt.id === 'stress') totals.stress += 1;
      else if (opt.id === 'evasion') totals.evasion += 1;
      else if (opt.id === 'proficiency') totals.proficiency += 1;
      else if (opt.id === 'experiences') {
        const ids = a.experienceIds ?? [];
        if (ids.length !== 2 || new Set(ids).size !== 2 || ids.some((id) => !expIdsKnown.has(id))) err(`level ${level}: an Experience advancement raises two different Experiences the character has`);
        for (const id of ids) totals.experiences[id] = (totals.experiences[id] ?? 0) + 1;
      } else if (opt.id === 'domainCard') {
        acquire(a.cardId, level, Math.min(level, PROGRESSION.TIER_MAX_LEVEL[a.slotTier]), 'domain card advancement');
      } else if (opt.id === 'subclass') {
        const next = PROGRESSION.SUBCLASS_ORDER[subclassTiers.length];
        if (!next || a.subclassTier !== next) err(`level ${level}: subclass upgrade must take the ${next ?? 'none'} tier`);
        else {
          subclassTiers.push(next);
          for (const f of subclass[`${next}FeatureIds`].map((id) => catalog.find(id))) grantedCompanionPicks += f?.mechanics?.grants?.companionAdvancements ?? 0;
        }
      }
    }
    if (cost !== PROGRESSION.ADVANCEMENTS_PER_LEVEL) err(`level ${level}: advancements must cost exactly ${PROGRESSION.ADVANCEMENTS_PER_LEVEL} (spent ${cost})`);
    const expectedGrantCards = (h.advancements ?? [])
      .filter((a) => a.option === 'subclass')
      .flatMap((a) => subclass[`${a.subclassTier}FeatureIds`] ?? [])
      .reduce((n, id) => n + (catalog.find(id)?.mechanics?.grants?.domainCards ?? 0), 0);
    if ((h.grantedCardIds ?? []).length !== expectedGrantCards) err(`level ${level}: expected ${expectedGrantCards} feature-granted cards`);
    for (const id of h.grantedCardIds ?? []) acquire(id, level, level, 'feature grant');
    if (!h.domainCardId) err(`level ${level}: step four requires a new domain card`);
    else acquire(h.domainCardId, level, level, 'level-up domain card');

    // Companion level-up options
    const picks = h.companion ?? [];
    if (comp) {
      if (picks.length !== 1 + grantedCompanionPicks) err(`level ${level}: the companion takes ${1 + grantedCompanionPicks} level-up option(s) (took ${picks.length})`);
      for (const p of picks) {
        const opt = comp.advancements.find((o) => o.id === p.option);
        if (!opt) { err(`level ${level}: unknown companion option ${p.option}`); continue; }
        companion.counts[p.option] = (companion.counts[p.option] ?? 0) + 1;
        if (companion.counts[p.option] > opt.slots) err(`level ${level}: companion option ${opt.label} has no slots left`);
        if (p.option === 'vicious') {
          if (p.detail === 'die') {
            companion.die = DIE_STEPS[DIE_STEPS.indexOf(companion.die) + 1];
            if (companion.die > comp.maxDamageDie) err(`level ${level}: companion damage die cannot exceed d${comp.maxDamageDie}`);
          } else if (p.detail === 'range') {
            const next = RANGE_STEPS[RANGE_STEPS.indexOf(companion.range) + 1];
            if (!next) err(`level ${level}: companion range cannot increase past Very Far`);
            else companion.range = next;
          } else err(`level ${level}: Vicious must improve the damage die or the range`);
        }
        if (p.option === 'intelligent') {
          const known = [...(c.featureChoices?.[companionFeature.id]?.experiences ?? []), ...companion.experiences];
          if (!known.includes(p.experience)) err(`level ${level}: Intelligent must improve an existing companion Experience`);
          else companion.intelligent[p.experience] = (companion.intelligent[p.experience] ?? 0) + 1;
        }
      }
    } else if (picks.length) err(`level ${level}: companion options recorded without a companion`);

    if (stanceFeature) {
      const stance = h.stanceId ? catalog.find(h.stanceId) : null;
      if (!stance || !h.stanceId.startsWith('stance.') || !catalog.sourceSets.includes(stance.source?.sourceSet)) err(`level ${level}: Stance Fighter requires a new martial stance`);
      else {
        if (stance.tier > tier) err(`level ${level}: ${stance.name} is a Tier ${stance.tier} stance, above tier ${tier}`);
        if (stancesKnown.has(stance.id)) err(`level ${level}: ${stance.name} is already known`);
        stancesKnown.add(stance.id);
      }
    } else if (h.stanceId !== undefined) err(`level ${level}: martial stance recorded without Stance Fighter`);
  });
  return { subclassTiers, cardsAcquired, tierAchievements, totals, companion, optionCounts, stancesKnown };
}

function checkDerived(c, catalog, { cls, subclass, features, loadoutCards, effectiveCards, primary, secondary, armor, choices, tier, replay }, err) {
  const d = c.derived;
  if (!d) { err('derived statistics are missing'); return; }
  const proficiency = RULES.BASE_PROFICIENCY + replay.totals.proficiency;
  const spell = subclass.spellcastTrait;
  const level = c.level;

  const loadoutDomains = {};
  for (const card of loadoutCards) loadoutDomains[card.domainId] = (loadoutDomains[card.domainId] ?? 0) + 1;
  const mods = [];
  for (const src of [...features, ...effectiveCards]) {
    const m = src.mechanics ?? {};
    for (const mod of m.modifiers ?? []) {
      if (mod.requires && (loadoutDomains[mod.requires.loadoutDomain] ?? 0) < mod.requires.min) continue;
      mods.push({ ...mod, from: src.id });
    }
    if (m.resolver && choices[src.id]) mods.push(...RESOLVERS[m.resolver].modifiers(choices[src.id], m).map((x) => ({ ...x, from: src.id })));
  }
  for (const item of [primary, secondary, armor]) {
    for (const mod of item?.feature?.mechanics?.modifiers ?? []) mods.push({ ...mod, from: item.id });
  }

  const traits = {};
  for (const t of TRAITS) {
    traits[t] = c.traits[t] + replay.totals.traits[t] + mods.filter((m) => m.target === `trait.${t}`).reduce((s, m) => s + m.value, 0);
  }
  const value = (v) => {
    if (typeof v === 'number') return v;
    if (v === 'proficiency') return proficiency;
    if (v === 'level') return level;
    if (v === 'tier') return tier;
    if (v === 'trait:spellcast') return spell ? Math.max(0, traits[spell]) : 0;
    if (typeof v === 'string' && v.startsWith('halfUp:')) return Math.max(0, Math.ceil(traits[v.slice(7)] / 2));
    if (typeof v === 'string' && v.startsWith('trait:')) return Math.max(0, traits[v.slice(6)]);
    throw new Error(`unknown modifier value ${v}`);
  };
  const add = (target) => mods.filter((m) => m.target === target).reduce((t, m) => t + value(m.value), 0);
  const dmg = (die, bonus, type, extra = 0, extraDie = null) => {
    const b = bonus + add('damageRolls') + (type === 'phy' ? add('physicalDamage') : 0) + extra;
    return `${proficiency}d${die}${extraDie ? `+${proficiency}d${extraDie}` : ''}${b ? `+${b}` : ''}`;
  };
  const actionBonus = add('actionRolls');
  const expect = (label, actual, wanted) => {
    if (actual !== wanted) err(`derived ${label} is ${actual}, expected ${wanted}`);
  };
  const evasion = cls.startingEvasion + replay.totals.evasion + add('evasion');

  // Gear restrictions use final traits (e.g. Pompous needs Presence 0 or lower).
  for (const item of [primary, secondary, armor].filter(Boolean)) {
    const r = item.feature?.mechanics?.restriction;
    if (r && traits[r.trait] > r.max) err(`${item.name} requires ${r.trait} ${r.max} or lower (character has ${traits[r.trait]})`);
  }

  expect('proficiency', d.proficiency, proficiency);
  expect('tier', d.tier, tier);
  expect('evasion', d.evasion, evasion);
  expect('hpSlots', d.hpSlots, cls.startingHp + replay.totals.hp + add('hpSlots'));
  expect('stressSlots', d.stressSlots, RULES.BASE_STRESS_SLOTS + replay.totals.stress + add('stressSlots'));
  expect('hope.starting', d.hope?.starting, RULES.STARTING_HOPE);
  expect('hope.max', d.hope?.max, RULES.MAX_HOPE);
  expect('armorScore', d.armorScore, Math.min(RULES.MAX_ARMOR_SCORE, armor.baseScore + add('armorScore')));
  expect('thresholds.major', d.thresholds?.major, armor.baseThresholds.major + level + add('thresholds'));
  expect('thresholds.severe', d.thresholds?.severe, armor.baseThresholds.severe + level + add('thresholds') + add('severeThreshold'));
  expect('spellcastTrait', d.spellcastTrait, spell);
  for (const t of TRAITS) expect(`traits.${t}`, d.traits?.[t], traits[t]);

  const weapons = [primary, secondary].filter(Boolean);
  expect('weapon count', d.weapons?.length, weapons.length);
  weapons.forEach((w, i) => {
    const dw = d.weapons?.[i] ?? {};
    const trait = w.trait === 'spellcast' ? spell : w.trait === 'choice' ? highestTrait(traits) : w.trait;
    const ownAttack = mods.filter((m) => m.target === 'attackRoll' && m.from === w.id).reduce((t, m) => t + m.value, 0);
    const primaryOnly = w.slot === 'primary' ? add('primaryWeaponAttackRoll') : 0;
    expect(`${w.name} weaponId`, dw.weaponId, w.id);
    expect(`${w.name} attack trait`, dw.attackTrait, trait);
    expect(`${w.name} attack modifier`, dw.attackModifier, traits[trait] + ownAttack + add('weaponAttackRoll') + primaryOnly + actionBonus);
    expect(`${w.name} damage`, dw.damage, dmg(w.damage.die, w.damage.bonus, w.damageType, w.range === 'Melee' ? add('meleeWeaponDamage') : 0, w.damage.extraDie));
  });

  const attackFeatures = features.filter((f) => f.mechanics?.attack);
  expect('extra attack count', d.extraAttacks?.length, attackFeatures.length);
  attackFeatures.forEach((f, i) => {
    const a = f.mechanics.attack;
    const trait = a.trait === 'choice' ? highestTrait(traits) : a.trait;
    expect(`${a.name} attack trait`, d.extraAttacks?.[i]?.attackTrait, trait);
    expect(`${a.name} attack modifier`, d.extraAttacks?.[i]?.attackModifier, traits[trait] + actionBonus);
    expect(`${a.name} damage`, d.extraAttacks?.[i]?.damage, dmg(a.damage.die, a.damage.bonus, a.damageType));
  });

  expect('experience count', d.experiences?.length, c.experiences.length);
  c.experiences.forEach((e, i) => {
    expect(`experience ${e.name} modifier`, d.experiences?.[i]?.modifier, e.modifier + (replay.totals.experiences[e.id] ?? 0) + add(`experience:${e.id}`));
  });

  const upgrades = Object.fromEntries(features.filter((f) => f.mechanics?.resourceUpgrade?.value).map((f) => [f.mechanics.resourceUpgrade.id, f.mechanics.resourceUpgrade.value]));
  // Later features override earlier ones (Backstab d8s replaces Ambush d6s).
  const dieUpgrades = Object.fromEntries(features.filter((f) => f.mechanics?.resourceUpgrade?.die).map((f) => [f.mechanics.resourceUpgrade.id, f.mechanics.resourceUpgrade.die]));
  const resourceSources = [...features, ...effectiveCards].filter((s) => s.mechanics?.resource);
  expect('resource count', d.resources?.length, resourceSources.length);
  resourceSources.forEach((s, i) => {
    const r = s.mechanics.resource;
    let wanted;
    if (r.dieByLevel) {
      const steps = r.dieByLevel.filter(([lvl]) => lvl <= level);
      wanted = upgrades[r.id] ?? steps[steps.length - 1][1];
    } else if (r.dieSteps) {
      wanted = r.dieSteps[Math.min(replay.optionCounts[r.advancedBy] ?? 0, r.dieSteps.length - 1)];
    } else if (typeof r.count === 'number') {
      wanted = String(r.count);
    } else {
      const key = r.count.startsWith('trait:') ? r.count.slice(6) : null;
      const n = key ? Math.max(r.min ?? 0, traits[key === 'spellcast' ? spell : key]) : { tier, level, proficiency }[r.count];
      const die = dieUpgrades[r.id] ?? r.die;
      wanted = die ? (n > 0 ? `${r.prefix ?? ''}${n}${die}` : 'none') : String(n);
    }
    expect(`${r.label}`, d.resources?.[i]?.value, wanted);
  });

  const companionFeature = features.find((f) => f.mechanics?.companion);
  if (companionFeature) {
    const base = companionFeature.mechanics.companion;
    const choice = choices[companionFeature.id] ?? {};
    const prog = replay.companion;
    const dc = d.companion ?? {};
    expect('companion evasion', dc.evasion, base.evasion + 2 * (prog.counts.aware ?? 0));
    expect('companion stress slots', dc.stressSlots, base.stressSlots + (prog.counts.resilient ?? 0));
    expect('companion damage', dc.damage, `${proficiency}d${prog.die}`);
    expect('companion range', dc.attackRange, prog.range);
    expect('companion damage type', dc.damageType, choice.damageType);
    expect('companion command modifier', dc.commandModifier, traits[spell] + actionBonus);
    const wantExps = [...(choice.experiences ?? []), ...prog.experiences].map((n) => `${n}+${base.experienceModifier + (prog.intelligent[n] ?? 0)}`).join(',');
    expect('companion experiences', (dc.experiences ?? []).map((e) => `${e.name}+${e.modifier}`).join(','), wantExps);
  } else if (d.companion) {
    err('derived companion present without a companion feature');
  }

  const showsBeastforms = features.some((f) => f.mechanics?.display === 'beastforms');
  const forms = showsBeastforms ? catalog.beastforms.filter((b) => b.tier <= tier && !b.variant) : [];
  expect('beastform count', d.beastforms?.length, forms.length);
  forms.forEach((b, i) => {
    const row = d.beastforms?.[i] ?? {};
    const bonus = b.traitBonus?.trait === b.attack.trait ? b.traitBonus.value : 0;
    expect(`${b.name} evasion`, row.evasion, evasion + b.evasionBonus);
    expect(`${b.name} attack modifier`, row.attackModifier, traits[b.attack.trait] + bonus + actionBonus);
    expect(`${b.name} damage`, row.damage, dmg(b.attack.damage.die, b.attack.damage.bonus, b.attack.damageType));
  });

  const stanceFeature = features.find((f) => f.mechanics?.stances);
  const stanceIds = (d.martialStances ?? []).map((x) => x.id);
  if (stanceFeature) {
    const want = stanceFeature.mechanics.stances.initial + (level - 1) * stanceFeature.mechanics.stances.perLevel;
    expect('martial stance count', stanceIds.length, want);
    if (stanceIds.some((id) => !replay.stancesKnown.has(id)) || new Set(stanceIds).size !== stanceIds.length) err('derived martial stances do not match the stances learned');
  } else if (stanceIds.length) err('martial stances present without Stance Fighter');
}
