// Generation: resolves selections and builds a complete Level 1 character,
// including every mandatory class/subclass/ancestry choice. A candidate is only
// returned after the independent validator accepts it.

import { TRAITS, tierForLevel } from './catalog.js';
import { createRng, randomSeed } from './rng.js';
import { RULES } from './rules.js';
import { RESOLVERS } from './resolvers.js';
import { acquiredFeatures, deriveStats } from './derive.js';
import { validateCharacter } from './validate.js';
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

/**
 * @param {object} input { level, ancestryId, communityId, classId, subclassId, contentProfile, seed, options }
 * @param {object} catalog from loadCatalog/createCatalog
 */
export function generateCharacter(input, catalog) {
  const {
    level = 1,
    ancestryId = null,
    communityId = null,
    classId = null,
    subclassId = null,
    contentProfile = 'core',
    seed = randomSeed(),
    options = {},
  } = input ?? {};

  if (!SUPPORTED_LEVELS.includes(level)) {
    throw new GenerationError(`Level ${level} is not supported yet. This proof of concept generates Level 1 characters only.`, { code: 'unsupported-level' });
  }
  if (contentProfile !== catalog.contentProfile) {
    throw new GenerationError(`Content profile "${contentProfile}" is not available. Supported: "${catalog.contentProfile}".`, { code: 'unsupported-profile' });
  }
  const fixed = resolveFixedSelections({ ancestryId, communityId, classId, subclassId }, catalog);

  const rng = createRng(seed);
  const failures = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const character = buildCandidate({ fixed, level, seed: String(seed), contentProfile, options, rng, catalog });
    const result = validateCharacter(character, catalog);
    if (result.valid) return character;
    failures.push({ attempt, errors: result.errors });
  }
  throw new GenerationError(`Could not generate a valid character after ${MAX_ATTEMPTS} attempts.`, { code: 'generation-failed', details: failures });
}

/** Checks fixed IDs exist, have the right type, and are mutually compatible. */
export function resolveFixedSelections({ ancestryId, communityId, classId, subclassId }, catalog) {
  const check = (id, list, label) => {
    if (id === null || id === undefined || id === '') return null;
    if (!list.some((r) => r.id === id)) {
      throw new GenerationError(`Unknown or unavailable ${label} "${id}".`, { code: 'unknown-id' });
    }
    return id;
  };
  const fixed = {
    ancestryId: check(ancestryId, catalog.ancestries, 'ancestry'),
    communityId: check(communityId, catalog.communities, 'community'),
    classId: check(classId, catalog.classes, 'class'),
    subclassId: check(subclassId, catalog.subclasses, 'subclass'),
  };
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

function buildCandidate({ fixed, level, seed, contentProfile, options, rng, catalog }) {
  const cls = fixed.classId ? catalog.get(fixed.classId) : rng.pick(catalog.classes);
  const subclass = fixed.subclassId ? catalog.get(fixed.subclassId) : rng.pick(catalog.subclassesOf(cls.id));
  const ancestry = fixed.ancestryId ? catalog.get(fixed.ancestryId) : rng.pick(catalog.ancestries);
  const community = fixed.communityId ? catalog.get(fixed.communityId) : rng.pick(catalog.communities);
  const tier = tierForLevel(level);

  const character = {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    srdVersion: SRD_VERSION,
    dataVersion: catalog.dataVersion,
    contentProfile,
    seed,
    requested: { ...fixed },
    options: { ...options },
    level,
    selections: { ancestryId: ancestry.id, communityId: community.id, classId: cls.id, subclassId: subclass.id },
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

  character.equipment = chooseLoadout(rng, catalog, { cls, subclass, traits: character.traits, tier });

  character.inventory = [
    ...RULES.STARTING_KIT.map((itemId) => ({ itemId, quantity: 1, source: 'starting-kit' })),
    { itemId: rng.pick(RULES.STARTING_POTIONS), quantity: 1, source: 'starting-potion' },
  ];

  character.domainCards = rng
    .weightedSample(catalog.domainCardsFor(cls.id, level), RULES.STARTING_DOMAIN_CARDS)
    .map((card) => ({ cardId: card.id, acquiredAtLevel: 1, location: 'loadout' }));

  const style = catalog.classStyle(cls.id);
  character.experiences = rng
    .weightedSample(catalog.flavor.experiences, RULES.STARTING_EXPERIENCES, (e) => (e.tags.some((t) => style.experienceTags.includes(t)) ? 3 : 1))
    .map((e) => ({ id: e.id, name: e.name, modifier: RULES.EXPERIENCE_MODIFIER, source: 'creation' }));

  // Grants and mandatory choices from every acquired feature.
  for (const feature of acquiredFeatures(character, catalog)) {
    const m = feature.mechanics;
    if (m.kind === 'grant') {
      for (const itemId of m.grants.items) character.inventory.push({ itemId, quantity: 1, source: feature.id });
    } else if (m.kind === 'resolver') {
      character.featureChoices[feature.id] = RESOLVERS[m.resolver].resolve({ character, rng, catalog });
    }
  }

  character.flavor = generateFlavor(rng, catalog, { cls, ancestry, community });
  character.derived = deriveStats(character, catalog);
  return character;
}

/** Assigns +2, +1, +1, +0, +0, -1, favouring the class's suggested priorities and spellcast trait. */
function allocateTraits(rng, cls, subclass) {
  const weightOf = (trait) =>
    TRAIT_PRIORITY_WEIGHT[cls.suggested.traits[trait]] * (subclass.spellcastTrait === trait ? 2 : 1);
  const order = rng.weightedSample(TRAITS, TRAITS.length, weightOf);
  const values = [...RULES.TRAIT_ARRAY].sort((a, b) => b - a);
  return Object.fromEntries(TRAITS.map((trait) => [trait, values[order.indexOf(trait)]]));
}

function chooseLoadout(rng, catalog, { cls, subclass, traits, tier }) {
  const usable = (w) =>
    w.tier <= tier &&
    (!w.magic || Boolean(subclass.spellcastTrait)) &&
    !w.tags.some((t) => RANDOM_GEAR_EXCLUDED_TAGS.includes(t));
  const traitOf = (w) => (w.trait === 'spellcast' ? subclass.spellcastTrait : w.trait);
  const weightOf = (suggestedId) => (w) => GEAR_TRAIT_WEIGHT[traits[traitOf(w)]] * (w.id === suggestedId ? 2 : 1);

  const primary = rng.weighted(catalog.weapons.filter((w) => w.slot === 'primary' && usable(w)), weightOf(cls.suggested.primaryWeaponId));
  let secondary = null;
  if (primary.burden === 'one-handed') {
    const options = catalog.weapons.filter((w) => w.slot === 'secondary' && w.burden === 'one-handed' && usable(w));
    secondary = rng.weighted(options, weightOf(cls.suggested.secondaryWeaponId));
  }
  const armor = rng.weighted(
    catalog.armor.filter((a) => a.tier <= tier && !a.tags.some((t) => RANDOM_GEAR_EXCLUDED_TAGS.includes(t))),
    (a) => {
      const agilityPenalty = (a.feature?.mechanics?.modifiers ?? []).some((m) => m.target === 'trait.agility');
      return (a.id === cls.suggested.armorId ? 2 : 1) * (agilityPenalty && traits.agility > 0 ? 0.5 : 1);
    },
  );
  return { primaryWeaponId: primary.id, secondaryWeaponId: secondary ? secondary.id : null, armorId: armor.id };
}

const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function generateFlavor(rng, catalog, { cls, ancestry, community }) {
  const f = catalog.flavor;
  const pronouns = rng.pick(f.pronouns);
  const forms = PRONOUN_FORMS[pronouns];
  const first = rng.pick(f.givenNames);
  const name = `${first} ${rng.pick(f.familyNames)}`;
  const fill = (text) => text.replace(/\{(\w+)\}/g, (match, key) => {
    if (key === 'name') return name;
    if (key === 'first') return first;
    if (key in forms) return forms[key];
    return match;
  });
  const style = catalog.classStyle(cls.id);
  const tailTags = style.conceptTags.filter((t) => f.conceptTails[t]);
  const tails = [...tailTags.flatMap((t) => f.conceptTails[t]), ...f.conceptTails.general];
  const motivation = fill(rng.pick(f.motivations));
  const hook = fill(rng.pick(f.hookTemplates)
    .replaceAll('{origin}', rng.pick(f.origins))
    .replaceAll('{turningPoint}', rng.pick(f.turningPoints))
    .replaceAll('{motivation}', motivation));
  const connectionCount = rng.int(1, 2);

  return {
    name,
    pronouns,
    concept: `${capitalize(article(ancestry.name))} ${ancestry.name} ${cls.name.toLowerCase()} raised among the ${community.name} ${rng.pick(tails)}.`,
    appearance: {
      clothes: rng.pick(cls.descriptionSuggestions.clothes),
      attitude: rng.pick(cls.descriptionSuggestions.attitudes),
      detail: rng.pick(f.distinguishingDetails),
    },
    personality: rng.pick(f.personalities),
    motivation,
    hook,
    backgroundQuestion: rng.pick(cls.backgroundQuestions),
    connectionPrompts: rng.weightedSample(cls.connectionQuestions, connectionCount),
    provenance: {
      srdClassGuide: ['appearance.clothes', 'appearance.attitude', 'backgroundQuestion', 'connectionPrompts'],
      quicksheetOriginal: ['name', 'pronouns', 'concept', 'appearance.detail', 'personality', 'motivation', 'hook'],
    },
  };
}
