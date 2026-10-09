// Derived statistics: computed from base stats, equipment, level, advancements
// and feature modifiers. Nothing derived is stored in the game data.

import { TRAITS, tierForLevel } from './catalog.js';
import { RULES } from './rules.js';
import { RESOLVERS } from './resolvers.js';
import { proficiencyFromHistory } from './progression.js';

const SUBCLASS_TIERS = [
  ['foundation', 'foundationFeatureIds', 'subclass-foundation'],
  ['specialization', 'specializationFeatureIds', 'subclass-specialization'],
  ['mastery', 'masteryFeatureIds', 'subclass-mastery'],
];

/** Every feature the character currently has, in sheet order. */
export function acquiredFeatures(character, catalog) {
  const { ancestryId, communityId, classId, subclassId } = character.selections;
  const ancestry = catalog.get(ancestryId);
  const cls = catalog.get(classId);
  const subclass = catalog.get(subclassId);
  const ids = [
    ancestry.topFeatureId,
    ancestry.bottomFeatureId,
    catalog.get(communityId).featureId,
    ...cls.featureIds,
    cls.hopeFeatureId,
  ];
  for (const [tier, key] of SUBCLASS_TIERS) {
    if (character.subclassTiers.includes(tier)) ids.push(...subclass[key]);
  }
  return ids.map((id) => catalog.get(id));
}

export function equippedGear(character, catalog) {
  const { primaryWeaponId, secondaryWeaponId, armorId } = character.equipment;
  return {
    primary: catalog.get(primaryWeaponId),
    secondary: secondaryWeaponId ? catalog.get(secondaryWeaponId) : null,
    armor: catalog.get(armorId),
  };
}

/** All modifiers in effect, each tagged with where it came from. */
export function collectModifiers(character, catalog) {
  const out = [];
  for (const feature of acquiredFeatures(character, catalog)) {
    const m = feature.mechanics;
    if (m.kind === 'modifiers') {
      for (const mod of m.modifiers) out.push({ ...mod, sourceId: feature.id, sourceName: feature.name });
    } else if (m.kind === 'resolver') {
      const choice = character.featureChoices[feature.id];
      if (choice) {
        for (const mod of RESOLVERS[m.resolver].modifiers(choice)) out.push({ ...mod, sourceId: feature.id, sourceName: feature.name });
      }
    }
  }
  const gear = equippedGear(character, catalog);
  for (const item of [gear.primary, gear.secondary, gear.armor]) {
    const m = item?.feature?.mechanics;
    if (m?.kind !== 'modifiers') continue;
    for (const mod of m.modifiers) {
      out.push({ ...mod, sourceId: item.id, sourceName: `${item.name} (${item.feature.name})` });
    }
  }
  return out;
}

const sum = (mods) => mods.reduce((total, m) => total + m.value, 0);
const formatDamage = (proficiency, { die, bonus }) => `${proficiency}d${die}${bonus ? `+${bonus}` : ''}`;

export function deriveStats(character, catalog) {
  const cls = catalog.get(character.selections.classId);
  const subclass = catalog.get(character.selections.subclassId);
  const gear = equippedGear(character, catalog);
  const level = character.level;
  const proficiency = proficiencyFromHistory(character.advancementHistory);

  const mods = collectModifiers(character, catalog).map((m) => ({
    ...m,
    value: m.value === 'proficiency' ? proficiency : m.value,
  }));
  const forTarget = (target) => mods.filter((m) => m.target === target);
  const entries = (base, baseLabel, target) => [{ label: baseLabel, value: base }, ...forTarget(target).map((m) => ({ label: m.sourceName, value: m.value }))];

  const traits = {};
  const traitAdjustments = [];
  for (const trait of TRAITS) {
    const adjust = forTarget(`trait.${trait}`);
    traits[trait] = character.traits[trait] + sum(adjust);
    for (const m of adjust) traitAdjustments.push({ trait, value: m.value, sourceName: m.sourceName });
  }

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
  const armorScore = Math.min(RULES.MAX_ARMOR_SCORE, total('armorScore'));
  const spellcastTrait = subclass.spellcastTrait;

  const paired = forTarget('primaryWeaponDamage');
  const weapons = [gear.primary, gear.secondary].filter(Boolean).map((w) => {
    const attackTrait = w.trait === 'spellcast' ? spellcastTrait : w.trait;
    const attackBonus = mods.filter((m) => m.target === 'attackRoll' && m.sourceId === w.id);
    return {
      weaponId: w.id,
      slot: w.slot,
      name: w.name,
      attackTrait,
      attackModifier: traits[attackTrait] + sum(attackBonus),
      range: w.range,
      damage: formatDamage(proficiency, w.damage),
      damageType: w.damageType,
      burden: w.burden,
      conditional: w.slot === 'primary'
        ? paired.map((m) => ({
          value: m.value,
          condition: m.condition,
          sourceName: m.sourceName,
          damage: formatDamage(proficiency, { die: w.damage.die, bonus: w.damage.bonus + m.value }),
        }))
        : [],
    };
  });

  const experiences = character.experiences.map((e) => {
    const bonuses = forTarget(`experience:${e.id}`).map((m) => ({ value: m.value, sourceName: m.sourceName }));
    return { id: e.id, name: e.name, modifier: e.modifier + sum(bonuses), bonuses };
  });

  const resources = acquiredFeatures(character, catalog)
    .filter((f) => f.mechanics.kind === 'resource')
    .map((f) => {
      const { id, label, dieByLevel } = f.mechanics.resource;
      const die = dieByLevel.filter(([fromLevel]) => fromLevel <= level).at(-1)[1];
      return { id, label, die, sourceId: f.id };
    });

  return {
    level,
    tier: tierForLevel(level),
    proficiency,
    traits,
    traitAdjustments,
    spellcastTrait,
    evasion: total('evasion'),
    hpSlots: total('hpSlots'),
    stressSlots: total('stressSlots'),
    hope: { starting: RULES.STARTING_HOPE, max: RULES.MAX_HOPE },
    armorScore,
    thresholds: { major: gear.armor.baseThresholds.major + thresholdBonus, severe: gear.armor.baseThresholds.severe + thresholdBonus },
    weapons,
    experiences,
    resources,
    breakdown,
  };
}
