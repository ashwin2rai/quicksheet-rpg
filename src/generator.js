// Generation: resolves selections and builds a complete Level 1 character,
// including every mandatory class/subclass/ancestry choice. A candidate is only
// returned after the independent validator accepts it.

import { TRAITS, tierForLevel } from './catalog.js';
import { createRng, randomSeed } from './rng.js';
import { RULES } from './rules.js';
import { RESOLVERS } from './resolvers.js';
import { acquiredFeatures, deriveStats, featureFlags, grantedDomainCards } from './derive.js';
import { validateCharacter } from './validate.js';
import { acquireCard, advanceOneLevel, arrangeLoadout, trainedTraits } from './progression.js';
import { GENERATOR_VERSION, SRD_VERSION, CHARACTER_SCHEMA_VERSION, SUPPORTED_LEVELS } from './version.js';

export const MAX_ATTEMPTS = 25;
// Legal equipment the random generator does not assign by default (docs/rules-decisions.md, RD-005).
export const RANDOM_GEAR_EXCLUDED_TAGS = Object.freeze(['combat-wheelchair']);

export class GenerationError extends Error {
  constructor(message, { code, details = [] } = {}) {
    super(message);
    this.name = 'GenerationError';
    this.code = code;
    this.details = details;
  }
}

const TRAIT_PRIORITY_WEIGHT = { 2: 8, 1: 4, 0: 2, [-1]: 1 };
const GEAR_TRAIT_WEIGHT = { 2: 6, 1: 4, 0: 1, [-1]: 0.1 };
const PRONOUN_FORMS = {
  'she/her': { they: 'she', them: 'her', their: 'her' },
  'he/him': { they: 'he', them: 'him', their: 'his' },
  'they/them': { they: 'they', them: 'them', their: 'their' },
};

// Brawler "I Am the Weapon": how often the generator equips Brawler's Strike instead of
// rolling ordinary weapons (RD-044).
export const GRANTED_WEAPON_CHANCE = 0.75;

/**
 * @param {object} input { level, ancestryId, secondAncestryId, communityId, classId, subclassId,
 *   transformationId, contentProfile, seed, options: { mixedAncestry, transformation } }
 * @param {object} catalog from loadCatalog/createCatalog
 * @param {{ onAttempt?: Function }} [hooks] optional diagnostics callback, called after each attempt
 */
export function generateCharacter(input, catalog, { onAttempt } = {}) {
  const {
    level = 1,
    ancestryId = null,
    secondAncestryId = null,
    communityId = null,
    classId = null,
    subclassId = null,
    transformationId = null,
    contentProfile = 'core',
    seed = randomSeed(),
    options = {},
  } = input ?? {};

  if (!SUPPORTED_LEVELS.includes(level)) {
    throw new GenerationError(`Level ${level} is not supported. QuickSheet generates levels ${SUPPORTED_LEVELS[0]}-${SUPPORTED_LEVELS.at(-1)}.`, { code: 'unsupported-level' });
  }
  if (contentProfile !== catalog.contentProfile) {
    throw new GenerationError(`Content profile "${contentProfile}" is not available. Supported: "${catalog.contentProfile}".`, { code: 'unsupported-profile' });
  }
  const fixed = resolveFixedSelections({ ancestryId, secondAncestryId, communityId, classId, subclassId, transformationId }, catalog);
  if (options.transformation && !catalog.transformations.length) {
    throw new GenerationError(`Transformations are Hope & Fear content and are not available in ${catalog.contentLabel}.`, { code: 'transformation-unavailable' });
  }
  if (fixed.transformationId && isSingleFeatureTransformation(catalog.get(fixed.transformationId), catalog) && (options.mixedAncestry || fixed.secondAncestryId)) {
    throw new GenerationError(`${catalog.get(fixed.transformationId).name} keeps only one feature of a single ancestry, so it cannot be combined with Mixed Ancestry.`, { code: 'transformation-mixed-ancestry' });
  }

  const rng = createRng(seed);
  const failures = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const character = buildCandidate({ fixed, level, seed: String(seed), contentProfile, options, rng, catalog });
    const result = validateCharacter(character, catalog);
    const quality = qualityIssues(character, catalog);
    onAttempt?.({ attempt, errors: result.errors, quality });
    if (result.valid && quality.length === 0) return character;
    failures.push({ attempt, errors: result.errors, quality });
  }
  throw new GenerationError(`Could not generate a valid character after ${MAX_ATTEMPTS} attempts.`, { code: 'generation-failed', details: failures });
}

/** Shapeshifter "Only Skin Deep" keeps one feature of one ancestry (RD-046). */
const isSingleFeatureTransformation = (transformation, catalog) =>
  transformation.featureIds.some((id) => catalog.get(id).mechanics.flags?.includes('single-ancestry-feature'));

/** Checks fixed IDs exist, have the right type, and are mutually compatible. */
export function resolveFixedSelections({ ancestryId, secondAncestryId = null, communityId, classId, subclassId, transformationId = null }, catalog) {
  const check = (id, list, label) => {
    if (id === null || id === undefined || id === '') return null;
    if (!list.some((r) => r.id === id)) {
      throw new GenerationError(`Unknown or unavailable ${label} "${id}".`, { code: 'unknown-id' });
    }
    return id;
  };
  const fixed = {
    ancestryId: check(ancestryId, catalog.ancestries, 'ancestry'),
    secondAncestryId: check(secondAncestryId, catalog.ancestries, 'second ancestry'),
    communityId: check(communityId, catalog.communities, 'community'),
    classId: check(classId, catalog.classes, 'class'),
    subclassId: check(subclassId, catalog.subclasses, 'subclass'),
    transformationId: check(transformationId, catalog.transformations, 'transformation'),
  };
  if (fixed.secondAncestryId && fixed.secondAncestryId === fixed.ancestryId) {
    throw new GenerationError('A Mixed Ancestry needs two different ancestries.', { code: 'mixed-ancestry-duplicate' });
  }
  if (fixed.subclassId) {
    const parent = catalog.get(fixed.subclassId).classId;
    if (fixed.classId && fixed.classId !== parent) {
      throw new GenerationError(
        `${catalog.get(fixed.subclassId).name} is a ${catalog.get(parent).name} subclass and cannot be combined with ${catalog.get(fixed.classId).name}.`,
        { code: 'subclass-class-mismatch' },
      );
    }
    fixed.classId = parent;
  }
  return fixed;
}

/**
 * Coherence checks that are not rules violations but would make a poor sheet,
 * e.g. a Seraph whose Prayer Dice count (equal to the Spellcast trait) is zero.
 * Candidates with issues are rerolled; the rules themselves are never bent.
 */
export function qualityIssues(character, catalog) {
  const issues = [];
  const classFeatureIds = new Set(catalog.get(character.selections.classId).featureIds);
  for (const r of character.derived.resources) {
    if (r.count === 0 && classFeatureIds.has(r.sourceId)) issues.push(`${r.label} would be zero`);
  }
  return issues;
}

function buildCandidate({ fixed, level, seed, contentProfile, options, rng, catalog }) {
  const cls = fixed.classId ? catalog.get(fixed.classId) : rng.pick(catalog.classes);
  const subclass = fixed.subclassId ? catalog.get(fixed.subclassId) : rng.pick(catalog.subclassesOf(cls.id));
  // Mixed Ancestry: top feature from `ancestry`, bottom feature from a different ancestry.
  // Choosing a second ancestry implies Mixed Ancestry.
  const mixed = Boolean(options.mixedAncestry || fixed.secondAncestryId);
  const ancestry = fixed.ancestryId
    ? catalog.get(fixed.ancestryId)
    : rng.pick(catalog.ancestries.filter((a) => a.id !== fixed.secondAncestryId));
  const secondAncestry = !mixed
    ? null
    : fixed.secondAncestryId
      ? catalog.get(fixed.secondAncestryId)
      : rng.pick(catalog.ancestries.filter((a) => a.id !== ancestry.id));
  const community = fixed.communityId ? catalog.get(fixed.communityId) : rng.pick(catalog.communities);
  // Transformations are opt-in (RD-045): only with options.transformation or a fixed choice.
  const transformation = fixed.transformationId
    ? catalog.get(fixed.transformationId)
    : options.transformation
      ? rng.pick(catalog.transformations.filter((t) => !mixed || !isSingleFeatureTransformation(t, catalog)))
      : null;
  const targetLevel = level;

  const character = {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    srdVersion: SRD_VERSION,
    dataVersion: catalog.dataVersion,
    contentProfile,
    seed,
    requested: { ...fixed },
    options: { mixedAncestry: mixed, transformation: Boolean(transformation) },
    level: 1,
    selections: {
      ancestryId: ancestry.id, secondAncestryId: secondAncestry ? secondAncestry.id : null, communityId: community.id,
      classId: cls.id, subclassId: subclass.id, transformationId: transformation ? transformation.id : null,
    },
    subclassTiers: ['foundation'],
    traits: allocateTraits(rng, cls, subclass),
    equipment: null,
    inventory: [],
    classItem: rng.pick(cls.classItems),
    gold: { handfuls: RULES.STARTING_GOLD_HANDFULS },
    domainCards: [],
    experiences: [],
    featureChoices: {},
    flavor: null,
    advancementHistory: [],
    derived: null,
  };

  // Choices that decide which features apply (Shapeshifter "Only Skin Deep") come first.
  for (const id of transformation?.featureIds ?? []) {
    const m = catalog.get(id).mechanics;
    if (m.flags?.includes('single-ancestry-feature')) character.featureChoices[id] = RESOLVERS[m.resolver].resolve({ character, rng, catalog, mechanics: m });
  }
  const flags = featureFlags(character, catalog);
  // A feature-granted weapon (Brawler's Strike) is the primary while no other weapon is active.
  const grantedWeaponId = acquiredFeatures(character, catalog).flatMap((f) => f.mechanics.grants?.weapons ?? [])[0] ?? null;
  const useGrantedWeapon = Boolean(grantedWeaponId) && rng.next() < GRANTED_WEAPON_CHANCE;
  const loadoutOptions = { cls, subclass, ignoreBurden: flags.has('ignore-burden'), grantedWeaponId: useGrantedWeapon ? grantedWeaponId : null };
  character.equipment = chooseLoadout(rng, catalog, { ...loadoutOptions, traits: character.traits, tier: 1 });

  character.inventory = [
    ...RULES.STARTING_KIT.map((itemId) => ({ itemId, quantity: 1, source: 'starting-kit' })),
    { itemId: rng.pick(RULES.STARTING_POTIONS), quantity: 1, source: 'starting-potion' },
  ];

  for (const card of rng.weightedSample(catalog.domainCardsFor(cls.id, 1), RULES.STARTING_DOMAIN_CARDS + grantedDomainCards(character, catalog))) {
    acquireCard(character, card, 1, 'creation', { rng, catalog });
  }
  arrangeLoadout(character, catalog);

  const style = catalog.classStyle(cls.id);
  character.experiences = rng
    .weightedSample(catalog.flavor.experiences, RULES.STARTING_EXPERIENCES, (e) => (e.tags.some((t) => style.experienceTags.includes(t)) ? 3 : 1))
    .map((e) => ({ id: e.id, name: e.name, modifier: RULES.EXPERIENCE_MODIFIER, source: 'creation' }));

  // Grants and mandatory choices from every acquired feature.
  for (const feature of acquiredFeatures(character, catalog)) {
    const m = feature.mechanics;
    for (const itemId of m.grants?.items ?? []) character.inventory.push({ itemId, quantity: 1, source: feature.id });
    if (m.resolver && !character.featureChoices[feature.id]) character.featureChoices[feature.id] = RESOLVERS[m.resolver].resolve({ character, rng, catalog, mechanics: m });
  }

  character.flavor = generateFlavor(rng, catalog, { cls, ancestry, secondAncestry, community, transformation });

  // Higher levels: apply legal level-ups one at a time from the Level 1 character.
  let current = character;
  while (current.level < targetLevel) current = advanceOneLevel(current, catalog, rng);
  if (targetLevel > 1) {
    // Instant-character gear assumption (docs/rules-decisions.md): equipment is chosen from
    // the final tier's tables like at creation; no loot, gold or magic items are invented.
    current.equipment = chooseLoadout(rng, catalog, { ...loadoutOptions, traits: trainedTraits(current), tier: tierForLevel(targetLevel) });
    // Gear can change the loadout size (Attuned armor), so place cards again for the final gear.
    arrangeLoadout(current, catalog);
  }
  current.derived = deriveStats(current, catalog);
  return current;
}

/** Assigns +2, +1, +1, +0, +0, -1, favouring the class's suggested priorities and spellcast trait. */
function allocateTraits(rng, cls, subclass) {
  const weightOf = (trait) =>
    TRAIT_PRIORITY_WEIGHT[cls.suggested.traits[trait]] * (subclass.spellcastTrait === trait ? 3 : 1);
  const order = rng.weightedSample(TRAITS, TRAITS.length, weightOf);
  const values = [...RULES.TRAIT_ARRAY].sort((a, b) => b - a);
  return Object.fromEntries(TRAITS.map((trait) => [trait, values[order.indexOf(trait)]]));
}

function chooseLoadout(rng, catalog, { cls, subclass, traits, tier, ignoreBurden, grantedWeaponId = null }) {
  const meetsRestriction = (item) => {
    const r = item.feature?.mechanics?.restriction;
    return !r || traits[r.trait] <= r.max;
  };
  const usable = (w) =>
    w.tier <= tier &&
    (!w.magic || Boolean(subclass.spellcastTrait)) &&
    !w.tags.some((t) => RANDOM_GEAR_EXCLUDED_TAGS.includes(t) || t === 'feature-granted') &&
    meetsRestriction(w);
  // Gear of the character's own tier, occasionally one tier below (RD-034).
  const tierWeight = (item) => (item.tier === tier ? 8 : item.tier === tier - 1 ? 1 : 0);
  const traitOf = (w) => (w.trait === 'spellcast' ? subclass.spellcastTrait : w.trait);
  const traitWeight = (value) => GEAR_TRAIT_WEIGHT[Math.max(-1, Math.min(2, value))] * (value > 2 ? 1.5 : 1);
  const weightOf = (suggestedId) => (w) => traitWeight(traits[traitOf(w)]) * tierWeight(w) * (w.id === suggestedId ? 2 : 1);

  const primary = grantedWeaponId
    ? catalog.get(grantedWeaponId)
    : rng.weighted(catalog.weapons.filter((w) => w.slot === 'primary' && usable(w)), weightOf(cls.suggested.primaryWeaponId));
  let secondary = null;
  // Two-handed primary alone, or one-handed primary + one-handed secondary. Features that
  // ignore burden (Warrior "Combat Training") may also add a secondary to a two-handed primary.
  // A feature-granted unarmed weapon is used with no other weapons.
  const wantsSecondary = !grantedWeaponId && (primary.burden === 'one-handed' || (ignoreBurden && rng.next() < 0.4));
  if (wantsSecondary) {
    const options = catalog.weapons.filter((w) => w.slot === 'secondary' && w.burden === 'one-handed' && usable(w));
    secondary = rng.weighted(options, weightOf(cls.suggested.secondaryWeaponId));
  }
  const armor = rng.weighted(
    catalog.armor.filter((a) => a.tier <= tier && !a.tags.some((t) => RANDOM_GEAR_EXCLUDED_TAGS.includes(t))),
    (a) => {
      const agilityPenalty = (a.feature?.mechanics?.modifiers ?? []).some((m) => m.target === 'trait.agility');
      return tierWeight(a) * (a.id === cls.suggested.armorId ? 2 : 1) * (agilityPenalty && traits.agility > 0 ? 0.5 : 1);
    },
  );
  return { primaryWeaponId: primary.id, secondaryWeaponId: secondary ? secondary.id : null, armorId: armor.id };
}

/** High concept: a short, plain phrase for who the character is and what they do, built from class roles. */
function highConcept(rng, f, cls) {
  const role = rng.pick(f.highConceptRoles[cls.id]);
  const { template } = rng.weighted(f.highConceptTemplates, (t) => t.weight);
  // Avoid repeats such as "Wandering Wandering Singer".
  const words = role.toLowerCase().split(/[\s-]+/);
  const descriptors = f.highConceptDescriptors.filter((d) => !d.toLowerCase().split(/[\s-]+/).some((w) => words.includes(w)));
  return template.replace('{role}', role)
    .replace('{descriptor}', () => rng.pick(descriptors))
    .replace('{purpose}', () => rng.pick(f.highConceptPurposes));
}

const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function generateFlavor(rng, catalog, { cls, ancestry, secondAncestry, community, transformation }) {
  const f = catalog.flavor;
  const pronouns = rng.pick(f.pronouns);
  const forms = PRONOUN_FORMS[pronouns];
  const first = rng.pick(f.givenNames);
  const family = rng.pick(f.familyNames);
  const name = `${first} ${family}`;
  const fill = (text) => text.replace(/\{(\w+)\}/g, (match, key) => {
    if (key === 'name') return name;
    if (key === 'first') return first;
    if (key in forms) return forms[key];
    return match;
  });
  const style = catalog.classStyle(cls.id);
  const tailTags = style.conceptTags.filter((t) => f.conceptTails[t]);
  const tails = [...tailTags.flatMap((t) => f.conceptTails[t]), ...f.conceptTails.general].map(fill);
  const motivation = fill(rng.pick(f.motivations));
  const hook = fill(rng.pick(f.hookTemplates)
    .replaceAll('{origin}', rng.pick(f.origins))
    .replaceAll('{turningPoint}', rng.pick(f.turningPoints))
    .replaceAll('{motivation}', motivation));
  const connectionCount = rng.int(1, 2);

  return {
    name,
    pronouns,
    concept: secondAncestry
      ? `${capitalize(article(cls.name))} ${cls.name.toLowerCase()} of mixed ${ancestry.name} and ${secondAncestry.name} heritage, raised among the ${community.name}, ${rng.pick(tails)}.`
      : `${capitalize(article(ancestry.name))} ${ancestry.name} ${cls.name.toLowerCase()} raised among the ${community.name} ${rng.pick(tails)}.`,
    appearance: {
      clothes: rng.pick(cls.descriptionSuggestions.clothes),
      attitude: rng.pick(cls.descriptionSuggestions.attitudes),
      detail: rng.pick(f.distinguishingDetails),
    },
    personality: rng.pick(f.personalities),
    highConcept: highConcept(rng, f, cls),
    trouble: rng.pick(f.troubles[rng.pick(['personal', 'relationships'])]).replaceAll('{family}', family),
    motivation,
    hook,
    backgroundQuestion: rng.pick(cls.backgroundQuestions),
    connectionPrompts: rng.weightedSample(cls.connectionQuestions, connectionCount),
    ...(transformation ? { transformationQuestion: rng.pick(transformation.questions) } : {}),
    provenance: {
      srdClassGuide: ['appearance.clothes', 'appearance.attitude', 'backgroundQuestion', 'connectionPrompts', ...(transformation ? ['transformationQuestion'] : [])],
      quicksheetOriginal: ['name', 'pronouns', 'concept', 'appearance.detail', 'personality', 'highConcept', 'trouble', 'motivation', 'hook'],
    },
  };
}
