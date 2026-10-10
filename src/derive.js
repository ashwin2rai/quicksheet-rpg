// Derived statistics: computed from base stats, equipment, level, advancements,
// feature modifiers and active domain cards. Nothing derived is stored in the data.

import { TRAITS, tierForLevel } from './catalog.js';
import { RULES } from './rules.js';
import { RESOLVERS } from './resolvers.js';
import { advancementCount, advancementTotals, companionProgress, knownStances, loadoutLimit, proficiencyFromHistory } from './progression.js';

const SUBCLASS_TIERS = [
  ['foundation', 'foundationFeatureIds'],
  ['specialization', 'specializationFeatureIds'],
  ['mastery', 'masteryFeatureIds'],
];

/** Every feature the character currently has, in sheet order. Transformation features come last. */
export function acquiredFeatures(character, catalog) {
  const { ancestryId, secondAncestryId, communityId, classId, subclassId, transformationId } = character.selections;
  const ancestry = catalog.get(ancestryId);
  const bottomSource = secondAncestryId ? catalog.get(secondAncestryId) : ancestry;
  const cls = catalog.get(classId);
  const subclass = catalog.get(subclassId);
  const transformation = transformationId ? catalog.get(transformationId).featureIds.map((id) => catalog.get(id)) : [];
  // Shapeshifter "Only Skin Deep": only the chosen one of the two ancestry features applies.
  const skinDeep = transformation.find((f) => f.mechanics.flags?.includes('single-ancestry-feature'));
  const keep = skinDeep ? character.featureChoices[skinDeep.id]?.keep : null;
  const heritage = [
    ...(keep === 'bottom' ? [] : [ancestry.topFeatureId]),
    ...(keep === 'top' ? [] : [bottomSource.bottomFeatureId]),
  ];
  const ids = [...heritage, catalog.get(communityId).featureId, ...cls.featureIds, cls.hopeFeatureId];
  for (const [tier, key] of SUBCLASS_TIERS) {
    if (character.subclassTiers.includes(tier)) ids.push(...subclass[key]);
  }
  return [...ids.map((id) => catalog.get(id)), ...transformation];
}

/** The highest effective trait (first in SRD order on a tie), for "a trait of your choice". */
export const bestTrait = (traits) => TRAITS.reduce((best, t) => (traits[t] > traits[best] ? t : best), TRAITS[0]);

/** Domain cards in the active loadout (only these apply their effects). */
export const activeCards = (character, catalog) =>
  character.domainCards.filter((c) => c.location === 'loadout').map((c) => catalog.get(c.cardId));

/** Cards whose effects apply: the active loadout plus any "persistent" card (e.g. Vitality) wherever it is. */
export const effectiveCards = (character, catalog) =>
  character.domainCards.map((c) => ({ entry: c, card: catalog.get(c.cardId) }))
    .filter(({ entry, card }) => entry.location === 'loadout' || card.mechanics.persistent)
    .map(({ card }) => card);

/** Features and effective cards, i.e. everything whose mechanics can apply. */
export const effectSources = (character, catalog) => [...acquiredFeatures(character, catalog), ...effectiveCards(character, catalog)];

export function featureFlags(character, catalog) {
  return new Set(acquiredFeatures(character, catalog).flatMap((f) => f.mechanics.flags ?? []));
}

/** Extra domain cards granted at creation (e.g. School of Knowledge "Prepared"). */
export function grantedDomainCards(character, catalog) {
  return acquiredFeatures(character, catalog).reduce((n, f) => n + (f.mechanics.grants?.domainCards ?? 0), 0);
}

export function equippedGear(character, catalog) {
  const { primaryWeaponId, secondaryWeaponId, armorId } = character.equipment;
  return {
    primary: catalog.get(primaryWeaponId),
    secondary: secondaryWeaponId ? catalog.get(secondaryWeaponId) : null,
    armor: catalog.get(armorId),
  };
}

/** All raw modifiers in effect, each tagged with where it came from. Values may be expressions. */
export function collectModifiers(character, catalog) {
  const out = [];
  const loadoutDomains = {};
  for (const card of activeCards(character, catalog)) loadoutDomains[card.domainId] = (loadoutDomains[card.domainId] ?? 0) + 1;
  const applies = (mod) => !mod.requires || (loadoutDomains[mod.requires.loadoutDomain] ?? 0) >= mod.requires.min;
  for (const source of effectSources(character, catalog)) {
    const m = source.mechanics;
    for (const mod of m.modifiers ?? []) if (applies(mod)) out.push({ ...mod, sourceId: source.id, sourceName: source.name });
    if (m.resolver) {
      const choice = character.featureChoices[source.id];
      if (choice) {
        for (const mod of RESOLVERS[m.resolver].modifiers(choice, m)) out.push({ ...mod, sourceId: source.id, sourceName: source.name });
      }
    }
  }
  const gear = equippedGear(character, catalog);
  for (const item of [gear.primary, gear.secondary, gear.armor]) {
    for (const mod of item?.feature?.mechanics?.modifiers ?? []) {
      out.push({ ...mod, sourceId: item.id, sourceName: `${item.name} (${item.feature.name})` });
    }
  }
  return out;
}

const sum = (mods) => mods.reduce((total, m) => total + m.value, 0);
// extraDie: a second die that also scales with Proficiency (Brawler's Strike "d8+d6").
const formatDamage = (proficiency, die, bonus, extraDie = null) =>
  `${proficiency}d${die}${extraDie ? `+${proficiency}d${extraDie}` : ''}${bonus ? `+${bonus}` : ''}`;
const COUNT_BASIS = { tier: 'your tier', level: 'your level', proficiency: 'your Proficiency' };

export function deriveStats(character, catalog) {
  const cls = catalog.get(character.selections.classId);
  const subclass = catalog.get(character.selections.subclassId);
  const gear = equippedGear(character, catalog);
  const level = character.level;
  const tier = tierForLevel(level);
  const proficiency = proficiencyFromHistory(character.advancementHistory);
  const advanced = advancementTotals(character.advancementHistory);
  const spellcastTrait = subclass.spellcastTrait;
  const raw = collectModifiers(character, catalog);

  // Traits first: trait modifiers are always plain numbers.
  const traits = {};
  const traitAdjustments = [];
  for (const trait of TRAITS) {
    const adjust = raw.filter((m) => m.target === `trait.${trait}`);
    traits[trait] = character.traits[trait] + advanced.traits[trait] + sum(adjust);
    for (const m of adjust) traitAdjustments.push({ trait, value: m.value, sourceName: m.sourceName });
  }
  const evalValue = (value) => {
    if (typeof value === 'number') return value;
    if (value === 'proficiency') return proficiency;
    if (value === 'level') return level;
    if (value === 'tier') return tier;
    if (value === 'trait:spellcast') return spellcastTrait ? Math.max(0, traits[spellcastTrait]) : 0;
    const half = /^halfUp:(\w+)$/.exec(value);
    if (half) return Math.max(0, Math.ceil(traits[half[1]] / 2));
    const trait = /^trait:(\w+)$/.exec(value);
    if (trait) return Math.max(0, traits[trait[1]]);
    throw new Error(`Unknown modifier value "${value}"`);
  };
  const mods = raw.map((m) => ({ ...m, value: evalValue(m.value) }));
  const forTarget = (target) => mods.filter((m) => m.target === target);
  const entries = (base, baseLabel, target, fromAdvancements = 0) => [
    { label: baseLabel, value: base },
    ...(fromAdvancements ? [{ label: 'Advancements', value: fromAdvancements }] : []),
    ...forTarget(target).map((m) => ({ label: m.sourceName, value: m.value })),
  ];

  const breakdown = {
    evasion: entries(cls.startingEvasion, `${cls.name} starting Evasion`, 'evasion', advanced.evasion),
    hpSlots: entries(cls.startingHp, `${cls.name} starting HP`, 'hpSlots', advanced.hpSlots),
    stressSlots: entries(RULES.BASE_STRESS_SLOTS, 'Base Stress', 'stressSlots', advanced.stressSlots),
    armorScore: entries(gear.armor.baseScore, `${gear.armor.name} base score`, 'armorScore'),
    thresholds: [
      { label: `${gear.armor.name} base thresholds`, value: null },
      { label: 'Level', value: level },
      ...forTarget('thresholds').map((m) => ({ label: m.sourceName, value: m.value })),
    ],
  };
  const total = (key) => breakdown[key].reduce((t, e) => t + (e.value ?? 0), 0);
  const thresholdBonus = level + sum(forTarget('thresholds'));
  const evasion = total('evasion');
  const physicalBonus = forTarget('physicalDamage');
  const allDamageBonus = forTarget('damageRolls');
  const physicalDamageBonus = sum(physicalBonus);
  const damageBonusFor = (damageType) => sum(allDamageBonus) + (damageType === 'phy' ? physicalDamageBonus : 0);
  const meleeWeaponBonus = sum(forTarget('meleeWeaponDamage'));
  const weaponAttackBonus = sum(forTarget('weaponAttackRoll'));
  const actionRollBonus = sum(forTarget('actionRolls'));
  const traitOf = (t) => (t === 'spellcast' ? spellcastTrait : t === 'choice' ? bestTrait(traits) : t);

  const paired = forTarget('primaryWeaponDamage');
  const weapons = [gear.primary, gear.secondary].filter(Boolean).map((w) => {
    const attackTrait = traitOf(w.trait);
    const attackBonus = mods.filter((m) => m.target === 'attackRoll' && m.sourceId === w.id);
    const primaryBonus = w.slot === 'primary' ? sum(forTarget('primaryWeaponAttackRoll')) : 0;
    const bonus = w.damage.bonus + damageBonusFor(w.damageType) + (w.range === 'Melee' ? meleeWeaponBonus : 0);
    return {
      weaponId: w.id,
      slot: w.slot,
      name: w.name,
      attackTrait,
      traitChoice: w.trait === 'choice',
      attackModifier: traits[attackTrait] + sum(attackBonus) + weaponAttackBonus + primaryBonus + actionRollBonus,
      range: w.range,
      damage: formatDamage(proficiency, w.damage.die, bonus, w.damage.extraDie),
      damageType: w.damageType,
      burden: w.burden,
      conditional: w.slot === 'primary'
        ? paired.map((m) => ({ value: m.value, condition: m.condition, sourceName: m.sourceName, damage: formatDamage(proficiency, w.damage.die, bonus + m.value, w.damage.extraDie) }))
        : [],
    };
  });

  const features = acquiredFeatures(character, catalog);
  const extraAttacks = features.filter((f) => f.mechanics.attack).map((f) => {
    const a = f.mechanics.attack;
    const choice = character.featureChoices[f.id];
    const detail = choice && RESOLVERS[f.mechanics.resolver]?.detail?.(choice);
    const attackTrait = traitOf(a.trait);
    return {
      sourceId: f.id,
      name: detail ? `${a.name} (${detail})` : a.name,
      attackTrait,
      traitChoice: a.trait === 'choice',
      attackModifier: traits[attackTrait] + actionRollBonus,
      range: a.range,
      damage: formatDamage(proficiency, a.damage.die, a.damage.bonus + damageBonusFor(a.damageType)),
      damageType: a.damageType,
      cost: a.cost,
    };
  });

  const experiences = character.experiences.map((e) => {
    const bonuses = [
      ...(advanced.experiences[e.id] ? [{ value: advanced.experiences[e.id], sourceName: 'Advancements' }] : []),
      ...forTarget(`experience:${e.id}`).map((m) => ({ value: m.value, sourceName: m.sourceName })),
    ];
    return { id: e.id, name: e.name, modifier: e.modifier + sum(bonuses), bonuses };
  });

  const upgrades = Object.fromEntries(features.filter((f) => f.mechanics.resourceUpgrade).map((f) => [f.mechanics.resourceUpgrade.id, f]));
  const resources = effectSources(character, catalog).filter((s) => s.mechanics.resource).map((s) => {
    const r = s.mechanics.resource;
    if (r.dieByLevel) {
      const upgrade = upgrades[r.id];
      const value = upgrade ? upgrade.mechanics.resourceUpgrade.value : r.dieByLevel.filter(([from]) => from <= level).at(-1)[1];
      return { id: r.id, label: r.label, value, basis: upgrade ? `from ${upgrade.name}` : null, sourceId: s.id };
    }
    if (r.dieSteps) {
      const steps = advancementCount(character.advancementHistory, r.advancedBy);
      const value = r.dieSteps[Math.min(steps, r.dieSteps.length - 1)];
      return { id: r.id, label: r.label, value, basis: steps ? `raised ${steps} step${steps > 1 ? 's' : ''} by level advancements` : null, sourceId: s.id };
    }
    if (typeof r.count === 'number') {
      return { id: r.id, label: r.label, value: String(r.count), count: r.count, basis: r.note ?? null, sourceId: s.id };
    }
    let count;
    let basis;
    // A die-count resource whose die a feature upgrades (Assassin "Marked for Death": Ambush, Backstab).
    const dieUpgrade = upgrades[r.id]?.mechanics.resourceUpgrade.die ? upgrades[r.id] : null;
    const die = dieUpgrade ? dieUpgrade.mechanics.resourceUpgrade.die : r.die;
    if (r.count.startsWith('trait:')) {
      const trait = traitOf(r.count.slice(6));
      count = Math.max(r.min ?? 0, traits[trait]);
      basis = `equal to your ${trait.charAt(0).toUpperCase()}${trait.slice(1)}${r.min ? `, minimum ${r.min}` : ''}`;
    } else {
      count = { tier, level, proficiency }[r.count];
      basis = `equal to ${COUNT_BASIS[r.count]}`;
    }
    if (dieUpgrade) basis += `; ${die}s from ${dieUpgrade.name}`;
    const value = die ? (count > 0 ? `${r.prefix ?? ''}${count}${die}` : 'none') : String(count);
    return { id: r.id, label: r.label, value, count, basis, sourceId: s.id };
  });

  let companion = null;
  const companionFeature = features.find((f) => f.mechanics.companion);
  if (companionFeature) {
    const c = companionFeature.mechanics.companion;
    const choice = character.featureChoices[companionFeature.id] ?? {};
    const progress = companionProgress(character.advancementHistory, c);
    const traitsTaken = c.advancements.filter((a) => progress.counts[a.id]).map((a) => ({ id: a.id, label: a.label, times: progress.counts[a.id], text: a.text }));
    companion = {
      name: choice.name,
      animal: choice.animal,
      evasion: c.evasion + 2 * (progress.counts.aware ?? 0),
      stressSlots: c.stressSlots + (progress.counts.resilient ?? 0),
      attackRange: progress.range,
      damage: formatDamage(proficiency, progress.die, 0),
      damageType: choice.damageType,
      experiences: [...(choice.experiences ?? []), ...progress.experiences].map((name) => ({ name, modifier: c.experienceModifier + (progress.intelligent[name] ?? 0) })),
      upgrades: traitsTaken,
      commandTrait: spellcastTrait,
      commandModifier: spellcastTrait ? traits[spellcastTrait] + actionRollBonus : null,
    };
  }

  const showsBeastforms = features.some((f) => f.mechanics.display === 'beastforms');
  const compositeBeastforms = showsBeastforms ? catalog.beastforms.filter((b) => b.tier <= tier && b.variant).map((b) => b.id) : [];
  const beastforms = showsBeastforms
    ? catalog.beastforms.filter((b) => b.tier <= tier && !b.variant).map((b) => {
      const traitBonus = b.traitBonus && b.attack && b.traitBonus.trait === b.attack.trait ? b.traitBonus.value : 0;
      return {
        beastformId: b.id,
        name: b.name,
        tier: b.tier,
        evasion: evasion + b.evasionBonus,
        traitBonus: b.traitBonus,
        attackTrait: b.attack.trait,
        attackModifier: traits[b.attack.trait] + traitBonus + actionRollBonus,
        range: b.attack.range,
        damage: formatDamage(proficiency, b.attack.damage.die, b.attack.damage.bonus + damageBonusFor(b.attack.damageType)),
        damageType: b.attack.damageType,
      };
    })
    : [];

  const stanceFeature = features.find((f) => f.mechanics.stances);
  const martialStances = stanceFeature
    ? knownStances(character, stanceFeature.id).map(({ stanceId, level: at }) => ({ ...catalog.get(stanceId), acquiredAtLevel: at }))
    : [];

  return {
    level,
    tier,
    proficiency,
    traits,
    traitAdjustments,
    spellcastTrait,
    evasion,
    hpSlots: total('hpSlots'),
    compositeBeastforms,
    stressSlots: total('stressSlots'),
    hope: { starting: RULES.STARTING_HOPE, max: RULES.MAX_HOPE },
    armorScore: Math.min(RULES.MAX_ARMOR_SCORE, total('armorScore')),
    thresholds: {
      major: gear.armor.baseThresholds.major + thresholdBonus,
      severe: gear.armor.baseThresholds.severe + thresholdBonus + sum(forTarget('severeThreshold')),
    },
    physicalDamageBonus: physicalBonus.length ? { value: physicalDamageBonus, sources: physicalBonus.map((m) => m.sourceName) } : null,
    damageBonuses: [...allDamageBonus, ...forTarget('meleeWeaponDamage').map((m) => ({ ...m, condition: 'Melee weapons' }))].map((m) => ({ value: m.value, sourceName: m.sourceName, condition: m.condition ?? null })),
    weaponAttackBonus: [...forTarget('weaponAttackRoll'), ...forTarget('primaryWeaponAttackRoll').map((m) => ({ ...m, sourceName: `${m.sourceName}, primary weapon only` }))]
      .map((m) => ({ value: m.value, sourceName: m.sourceName })),
    actionRollBonus: forTarget('actionRolls').map((m) => ({ value: m.value, sourceName: m.sourceName })),
    loadoutLimit: loadoutLimit(character, catalog),
    martialStances,
    weapons,
    extraAttacks,
    experiences,
    resources,
    companion,
    beastforms,
    breakdown,
  };
}
