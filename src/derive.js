// Derived statistics: computed from base stats, equipment, level, advancements,
// feature modifiers and active domain cards. Nothing derived is stored in the data.

import { TRAITS, tierForLevel } from './catalog.js';
import { RULES } from './rules.js';
import { RESOLVERS } from './resolvers.js';
import { proficiencyFromHistory } from './progression.js';

const SUBCLASS_TIERS = [
  ['foundation', 'foundationFeatureIds'],
  ['specialization', 'specializationFeatureIds'],
  ['mastery', 'masteryFeatureIds'],
];

/** Every feature the character currently has, in sheet order. */
export function acquiredFeatures(character, catalog) {
  const { ancestryId, secondAncestryId, communityId, classId, subclassId } = character.selections;
  const ancestry = catalog.get(ancestryId);
  const bottomSource = secondAncestryId ? catalog.get(secondAncestryId) : ancestry;
  const cls = catalog.get(classId);
  const subclass = catalog.get(subclassId);
  const ids = [ancestry.topFeatureId, bottomSource.bottomFeatureId, catalog.get(communityId).featureId, ...cls.featureIds, cls.hopeFeatureId];
  for (const [tier, key] of SUBCLASS_TIERS) {
    if (character.subclassTiers.includes(tier)) ids.push(...subclass[key]);
  }
  return ids.map((id) => catalog.get(id));
}

/** Domain cards in the active loadout (only these apply their effects). */
export const activeCards = (character, catalog) =>
  character.domainCards.filter((c) => c.location === 'loadout').map((c) => catalog.get(c.cardId));

/** Features and active cards, i.e. everything whose mechanics can apply. */
export const effectSources = (character, catalog) => [...acquiredFeatures(character, catalog), ...activeCards(character, catalog)];

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
  for (const source of effectSources(character, catalog)) {
    const m = source.mechanics;
    for (const mod of m.modifiers ?? []) out.push({ ...mod, sourceId: source.id, sourceName: source.name });
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
const formatDamage = (proficiency, die, bonus) => `${proficiency}d${die}${bonus ? `+${bonus}` : ''}`;
const COUNT_BASIS = { tier: 'your tier', level: 'your level', proficiency: 'your Proficiency' };

export function deriveStats(character, catalog) {
  const cls = catalog.get(character.selections.classId);
  const subclass = catalog.get(character.selections.subclassId);
  const gear = equippedGear(character, catalog);
  const level = character.level;
  const tier = tierForLevel(level);
  const proficiency = proficiencyFromHistory(character.advancementHistory);
  const spellcastTrait = subclass.spellcastTrait;
  const raw = collectModifiers(character, catalog);

  // Traits first: trait modifiers are always plain numbers.
  const traits = {};
  const traitAdjustments = [];
  for (const trait of TRAITS) {
    const adjust = raw.filter((m) => m.target === `trait.${trait}`);
    traits[trait] = character.traits[trait] + sum(adjust);
    for (const m of adjust) traitAdjustments.push({ trait, value: m.value, sourceName: m.sourceName });
  }
  const evalValue = (value) => {
    if (typeof value === 'number') return value;
    if (value === 'proficiency') return proficiency;
    if (value === 'level') return level;
    const half = /^halfUp:(\w+)$/.exec(value);
    if (half) return Math.max(0, Math.ceil(traits[half[1]] / 2));
    throw new Error(`Unknown modifier value "${value}"`);
  };
  const mods = raw.map((m) => ({ ...m, value: evalValue(m.value) }));
  const forTarget = (target) => mods.filter((m) => m.target === target);
  const entries = (base, baseLabel, target) => [{ label: baseLabel, value: base }, ...forTarget(target).map((m) => ({ label: m.sourceName, value: m.value }))];

  const breakdown = {
    evasion: entries(cls.startingEvasion, `${cls.name} starting Evasion`, 'evasion'),
    hpSlots: entries(cls.startingHp, `${cls.name} starting HP`, 'hpSlots'),
    stressSlots: entries(RULES.BASE_STRESS_SLOTS, 'Base Stress', 'stressSlots'),
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
  const physicalDamageBonus = sum(physicalBonus);
  const damageBonusFor = (damageType) => (damageType === 'phy' ? physicalDamageBonus : 0);
  const traitOf = (t) => (t === 'spellcast' ? spellcastTrait : t);

  const paired = forTarget('primaryWeaponDamage');
  const weapons = [gear.primary, gear.secondary].filter(Boolean).map((w) => {
    const attackTrait = traitOf(w.trait);
    const attackBonus = mods.filter((m) => m.target === 'attackRoll' && m.sourceId === w.id);
    const bonus = w.damage.bonus + damageBonusFor(w.damageType);
    return {
      weaponId: w.id,
      slot: w.slot,
      name: w.name,
      attackTrait,
      attackModifier: traits[attackTrait] + sum(attackBonus),
      range: w.range,
      damage: formatDamage(proficiency, w.damage.die, bonus),
      damageType: w.damageType,
      burden: w.burden,
      conditional: w.slot === 'primary'
        ? paired.map((m) => ({ value: m.value, condition: m.condition, sourceName: m.sourceName, damage: formatDamage(proficiency, w.damage.die, bonus + m.value) }))
        : [],
    };
  });

  const features = acquiredFeatures(character, catalog);
  const extraAttacks = features.filter((f) => f.mechanics.attack).map((f) => {
    const a = f.mechanics.attack;
    const choice = character.featureChoices[f.id];
    const detail = choice && RESOLVERS[f.mechanics.resolver]?.detail?.(choice);
    return {
      sourceId: f.id,
      name: detail ? `${a.name} (${detail})` : a.name,
      attackTrait: a.trait,
      attackModifier: traits[a.trait],
      range: a.range,
      damage: formatDamage(proficiency, a.damage.die, a.damage.bonus + damageBonusFor(a.damageType)),
      damageType: a.damageType,
      cost: a.cost,
    };
  });

  const experiences = character.experiences.map((e) => {
    const bonuses = forTarget(`experience:${e.id}`).map((m) => ({ value: m.value, sourceName: m.sourceName }));
    return { id: e.id, name: e.name, modifier: e.modifier + sum(bonuses), bonuses };
  });

  const resources = effectSources(character, catalog).filter((s) => s.mechanics.resource).map((s) => {
    const r = s.mechanics.resource;
    if (r.dieByLevel) {
      return { id: r.id, label: r.label, value: r.dieByLevel.filter(([from]) => from <= level).at(-1)[1], basis: null, sourceId: s.id };
    }
    let count;
    let basis;
    if (r.count.startsWith('trait:')) {
      const trait = traitOf(r.count.slice(6));
      count = Math.max(0, traits[trait]);
      basis = `equal to your ${trait.charAt(0).toUpperCase()}${trait.slice(1)}`;
    } else {
      count = { tier, level, proficiency }[r.count];
      basis = `equal to ${COUNT_BASIS[r.count]}`;
    }
    const value = r.die ? (count > 0 ? `${r.prefix ?? ''}${count}${r.die}` : 'none') : String(count);
    return { id: r.id, label: r.label, value, count, basis, sourceId: s.id };
  });

  let companion = null;
  const companionFeature = features.find((f) => f.mechanics.companion);
  if (companionFeature) {
    const c = companionFeature.mechanics.companion;
    const choice = character.featureChoices[companionFeature.id] ?? {};
    companion = {
      name: choice.name,
      animal: choice.animal,
      evasion: c.evasion,
      stressSlots: c.stressSlots,
      attackRange: c.attackRange,
      damage: formatDamage(proficiency, c.damageDie, 0),
      damageType: choice.damageType,
      experiences: (choice.experiences ?? []).map((name) => ({ name, modifier: c.experienceModifier })),
      commandTrait: spellcastTrait,
      commandModifier: spellcastTrait ? traits[spellcastTrait] : null,
    };
  }

  const beastforms = features.some((f) => f.mechanics.display === 'beastforms')
    ? catalog.beastforms.filter((b) => b.tier <= tier && !b.variant).map((b) => {
      const traitBonus = b.traitBonus && b.attack && b.traitBonus.trait === b.attack.trait ? b.traitBonus.value : 0;
      return {
        beastformId: b.id,
        name: b.name,
        tier: b.tier,
        evasion: evasion + b.evasionBonus,
        traitBonus: b.traitBonus,
        attackTrait: b.attack.trait,
        attackModifier: traits[b.attack.trait] + traitBonus,
        range: b.attack.range,
        damage: formatDamage(proficiency, b.attack.damage.die, b.attack.damage.bonus + damageBonusFor(b.attack.damageType)),
        damageType: b.attack.damageType,
      };
    })
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
    stressSlots: total('stressSlots'),
    hope: { starting: RULES.STARTING_HOPE, max: RULES.MAX_HOPE },
    armorScore: Math.min(RULES.MAX_ARMOR_SCORE, total('armorScore')),
    thresholds: { major: gear.armor.baseThresholds.major + thresholdBonus, severe: gear.armor.baseThresholds.severe + thresholdBonus },
    physicalDamageBonus: physicalBonus.length ? { value: physicalDamageBonus, sources: physicalBonus.map((m) => m.sourceName) } : null,
    weapons,
    extraAttacks,
    experiences,
    resources,
    companion,
    beastforms,
    breakdown,
  };
}
