// Validation: an authoritative, independent check of a finished character.
// It deliberately does not reuse the generator's selection logic or derive.js;
// derived numbers are recomputed here from the rules and compared.

import { TRAITS, tierForLevel } from './catalog.js';
import { RULES } from './rules.js';
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

function runChecks(c, catalog, err) {
  // ---- versions and provenance
  if (c.generatorVersion !== GENERATOR_VERSION) err(`generatorVersion is ${c.generatorVersion}, expected ${GENERATOR_VERSION}`);
  if (c.srdVersion !== SRD_VERSION) err(`srdVersion is ${c.srdVersion}, expected ${SRD_VERSION}`);
  if (c.dataVersion !== catalog.dataVersion) err(`dataVersion is ${c.dataVersion}, expected ${catalog.dataVersion}`);
  if (c.contentProfile !== catalog.contentProfile) err(`contentProfile ${c.contentProfile} does not match catalog ${catalog.contentProfile}`);
  if (typeof c.seed !== 'string' || !c.seed) err('seed is missing');
  if (!SUPPORTED_LEVELS.includes(c.level)) err(`level ${c.level} is not supported`);
  if (c.level === 1 && c.advancementHistory?.length) err('a Level 1 character must have an empty advancement history');

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

  // ---- subclass tiers: Level 1 has only the Foundation
  const tiers = c.subclassTiers ?? [];
  if (c.level === 1 && (tiers.length !== 1 || tiers[0] !== 'foundation')) err(`a Level 1 character has only the Foundation subclass tier, got [${tiers}]`);

  // ---- traits
  const traitKeys = Object.keys(c.traits ?? {});
  if (traitKeys.length !== 6 || !TRAITS.every((t) => traitKeys.includes(t))) err('traits must contain exactly the six SRD traits');
  const values = TRAITS.map((t) => c.traits?.[t]).sort((a, b) => a - b).join(',');
  const expected = [...RULES.TRAIT_ARRAY].sort((a, b) => a - b).join(',');
  if (values !== expected) err(`base traits must be exactly +2, +1, +1, +0, +0, -1 (got ${values})`);

  // ---- features acquired (independent enumeration). Mixed Ancestry: top of the first, bottom of the second.
  const featureIds = [
    ancestry.topFeatureId,
    (secondAncestry ?? ancestry).bottomFeatureId,
    community.featureId,
    ...cls.featureIds,
    cls.hopeFeatureId,
    ...subclass.foundationFeatureIds,
  ];
  if (tiers.includes('specialization')) featureIds.push(...subclass.specializationFeatureIds);
  if (tiers.includes('mastery')) featureIds.push(...subclass.masteryFeatureIds);
  const features = [];
  for (const id of featureIds) {
    const f = catalog.find(id);
    if (!f) { err(`missing feature ${id}`); continue; }
    if (!f.mechanics) err(`feature ${id} has no mechanics classification`);
    else if (f.mechanics.kind === 'deferred') err(`feature ${f.name} requires progression support that is not implemented`);
    features.push(f);
  }
  const top = catalog.find(ancestry.topFeatureId);
  const bottom = catalog.find((secondAncestry ?? ancestry).bottomFeatureId);
  if (top?.position !== 'top' || bottom?.position !== 'bottom') err('ancestry features must be one top and one bottom feature');

  // ---- mandatory choices
  const choices = c.featureChoices ?? {};
  for (const f of features.filter((x) => x.mechanics?.resolver)) {
    const resolver = RESOLVERS[f.mechanics.resolver];
    if (!resolver) { err(`no resolver named ${f.mechanics.resolver} for ${f.name}`); continue; }
    for (const message of resolver.validate(choices[f.id], c, f.mechanics, catalog)) err(`${f.name}: ${message}`);
  }
  for (const id of Object.keys(choices)) {
    if (!features.some((f) => f.id === id && f.mechanics?.resolver)) err(`choice recorded for feature ${id} that the character does not have or that needs no choice`);
  }

  // ---- equipment
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
  if (primary.burden === 'two-handed' && secondary && !ignoresBurden) err(`${primary.name} is two-handed, so no secondary weapon can be equipped`);
  if (primary.burden === 'one-handed' && !secondary) err(`a one-handed primary weapon must be paired with a one-handed secondary weapon at creation`);
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
  if (c.gold?.handfuls !== RULES.STARTING_GOLD_HANDFULS) err(`starting gold must be ${RULES.STARTING_GOLD_HANDFULS} handful`);

  // ---- domain cards
  const cards = c.domainCards ?? [];
  const cardIds = cards.map((x) => x.cardId);
  const extraCards = features.reduce((n, f) => n + (f.mechanics?.grants?.domainCards ?? 0), 0);
  const expectedCards = RULES.STARTING_DOMAIN_CARDS + extraCards;
  if (c.level === 1 && cards.length !== expectedCards) err(`a Level 1 ${subclass.name} has exactly ${expectedCards} domain cards (has ${cards.length})`);
  if (new Set(cardIds).size !== cardIds.length) err('domain cards must be distinct');
  const loadoutCards = [];
  for (const entry of cards) {
    const card = inProfile(entry.cardId, 'card.');
    if (!card) { err(`invalid domain card ${entry.cardId}`); continue; }
    if (!cls.domainIds.includes(card.domainId)) err(`${card.name} is from ${card.domainId}, outside ${cls.name}'s domains`);
    if (card.level > c.level) err(`${card.name} is level ${card.level}, above character level ${c.level}`);
    if (entry.acquiredAtLevel < card.level || entry.acquiredAtLevel > c.level) err(`${card.name} has an impossible acquisition level ${entry.acquiredAtLevel}`);
    if (!['loadout', 'vault'].includes(entry.location)) err(`${card.name} has an invalid location ${entry.location}`);
    if (!card.mechanics || card.mechanics.kind === 'deferred') err(`${card.name} has no implemented mechanics classification`);
    if (entry.location === 'loadout') loadoutCards.push(card);
  }
  if (loadoutCards.length > RULES.MAX_LOADOUT) err(`more than ${RULES.MAX_LOADOUT} cards in the active loadout`);

  // ---- experiences
  const exps = c.experiences ?? [];
  if (c.level === 1 && exps.length !== RULES.STARTING_EXPERIENCES) err(`a Level 1 character has exactly ${RULES.STARTING_EXPERIENCES} Experiences (has ${exps.length})`);
  const names = exps.map((e) => String(e.name ?? '').trim().toLowerCase());
  if (names.some((n) => !n)) err('every Experience needs a name');
  if (new Set(names).size !== names.length || new Set(exps.map((e) => e.id)).size !== exps.length) err('Experiences must be distinct');
  for (const e of exps) if (e.modifier !== RULES.EXPERIENCE_MODIFIER) err(`Experience ${e.name} must start at +${RULES.EXPERIENCE_MODIFIER}`);

  // ---- flavor completeness
  const fl = c.flavor ?? {};
  for (const key of ['name', 'pronouns', 'concept', 'personality', 'motivation', 'hook', 'backgroundQuestion']) {
    if (typeof fl[key] !== 'string' || !fl[key].trim()) err(`flavor.${key} is missing`);
  }
  if (!Array.isArray(fl.connectionPrompts) || fl.connectionPrompts.length < 1 || fl.connectionPrompts.length > 2) err('flavor needs 1-2 connection prompts');

  // ---- derived statistics, recomputed independently
  checkDerived(c, catalog, { cls, subclass, features, loadoutCards, primary, secondary, armor, choices, tier }, err);
}

function checkDerived(c, catalog, { cls, subclass, features, loadoutCards, primary, secondary, armor, choices, tier }, err) {
  const d = c.derived;
  if (!d) { err('derived statistics are missing'); return; }
  const proficiency = RULES.BASE_PROFICIENCY + (c.advancementHistory ?? []).reduce((t, h) => t + (h.gains?.proficiency ?? 0), 0);
  const spell = subclass.spellcastTrait;

  const mods = [];
  for (const src of [...features, ...loadoutCards]) {
    const m = src.mechanics ?? {};
    for (const mod of m.modifiers ?? []) mods.push({ ...mod, from: src.id });
    if (m.resolver && choices[src.id]) mods.push(...RESOLVERS[m.resolver].modifiers(choices[src.id], m).map((x) => ({ ...x, from: src.id })));
  }
  for (const item of [primary, secondary, armor]) {
    for (const mod of item?.feature?.mechanics?.modifiers ?? []) mods.push({ ...mod, from: item.id });
  }

  const traits = {};
  for (const t of TRAITS) {
    traits[t] = c.traits[t] + mods.filter((m) => m.target === `trait.${t}`).reduce((s, m) => s + m.value, 0);
  }
  const value = (v) => {
    if (typeof v === 'number') return v;
    if (v === 'proficiency') return proficiency;
    if (v === 'level') return c.level;
    if (typeof v === 'string' && v.startsWith('halfUp:')) return Math.max(0, Math.ceil(traits[v.slice(7)] / 2));
    throw new Error(`unknown modifier value ${v}`);
  };
  const add = (target) => mods.filter((m) => m.target === target).reduce((t, m) => t + value(m.value), 0);
  const dmg = (die, bonus, type) => {
    const b = bonus + (type === 'phy' ? add('physicalDamage') : 0);
    return `${proficiency}d${die}${b ? `+${b}` : ''}`;
  };
  const expect = (label, actual, wanted) => {
    if (actual !== wanted) err(`derived ${label} is ${actual}, expected ${wanted}`);
  };
  const evasion = cls.startingEvasion + add('evasion');

  expect('proficiency', d.proficiency, proficiency);
  expect('tier', d.tier, tier);
  expect('evasion', d.evasion, evasion);
  expect('hpSlots', d.hpSlots, cls.startingHp + add('hpSlots'));
  expect('stressSlots', d.stressSlots, RULES.BASE_STRESS_SLOTS + add('stressSlots'));
  expect('hope.starting', d.hope?.starting, RULES.STARTING_HOPE);
  expect('hope.max', d.hope?.max, RULES.MAX_HOPE);
  expect('armorScore', d.armorScore, Math.min(RULES.MAX_ARMOR_SCORE, armor.baseScore + add('armorScore')));
  expect('thresholds.major', d.thresholds?.major, armor.baseThresholds.major + c.level + add('thresholds'));
  expect('thresholds.severe', d.thresholds?.severe, armor.baseThresholds.severe + c.level + add('thresholds'));
  expect('spellcastTrait', d.spellcastTrait, spell);
  for (const t of TRAITS) expect(`traits.${t}`, d.traits?.[t], traits[t]);

  const weapons = [primary, secondary].filter(Boolean);
  expect('weapon count', d.weapons?.length, weapons.length);
  weapons.forEach((w, i) => {
    const dw = d.weapons?.[i] ?? {};
    const trait = w.trait === 'spellcast' ? spell : w.trait;
    const ownAttack = mods.filter((m) => m.target === 'attackRoll' && m.from === w.id).reduce((t, m) => t + m.value, 0);
    expect(`${w.name} weaponId`, dw.weaponId, w.id);
    expect(`${w.name} attack trait`, dw.attackTrait, trait);
    expect(`${w.name} attack modifier`, dw.attackModifier, traits[trait] + ownAttack);
    expect(`${w.name} damage`, dw.damage, dmg(w.damage.die, w.damage.bonus, w.damageType));
  });

  const attackFeatures = features.filter((f) => f.mechanics?.attack);
  expect('extra attack count', d.extraAttacks?.length, attackFeatures.length);
  attackFeatures.forEach((f, i) => {
    const a = f.mechanics.attack;
    expect(`${a.name} attack modifier`, d.extraAttacks?.[i]?.attackModifier, traits[a.trait]);
    expect(`${a.name} damage`, d.extraAttacks?.[i]?.damage, dmg(a.damage.die, a.damage.bonus, a.damageType));
  });

  expect('experience count', d.experiences?.length, c.experiences.length);
  c.experiences.forEach((e, i) => {
    expect(`experience ${e.name} modifier`, d.experiences?.[i]?.modifier, e.modifier + add(`experience:${e.id}`));
  });

  const resourceSources = [...features, ...loadoutCards].filter((s) => s.mechanics?.resource);
  expect('resource count', d.resources?.length, resourceSources.length);
  resourceSources.forEach((s, i) => {
    const r = s.mechanics.resource;
    let wanted;
    if (r.dieByLevel) {
      const steps = r.dieByLevel.filter(([lvl]) => lvl <= c.level);
      wanted = steps[steps.length - 1][1];
    } else {
      const key = r.count.startsWith('trait:') ? r.count.slice(6) : null;
      const n = key ? Math.max(0, traits[key === 'spellcast' ? spell : key]) : { tier, level: c.level, proficiency }[r.count];
      wanted = r.die ? (n > 0 ? `${r.prefix ?? ''}${n}${r.die}` : 'none') : String(n);
    }
    expect(`${r.label}`, d.resources?.[i]?.value, wanted);
  });

  const companionFeature = features.find((f) => f.mechanics?.companion);
  if (companionFeature) {
    const base = companionFeature.mechanics.companion;
    const choice = choices[companionFeature.id] ?? {};
    const dc = d.companion ?? {};
    expect('companion evasion', dc.evasion, base.evasion);
    expect('companion stress slots', dc.stressSlots, base.stressSlots);
    expect('companion damage', dc.damage, `${proficiency}d${base.damageDie}`);
    expect('companion damage type', dc.damageType, choice.damageType);
    expect('companion command modifier', dc.commandModifier, traits[spell]);
    expect('companion experiences', (dc.experiences ?? []).map((e) => `${e.name}+${e.modifier}`).join(','), (choice.experiences ?? []).map((n) => `${n}+${base.experienceModifier}`).join(','));
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
    expect(`${b.name} attack modifier`, row.attackModifier, traits[b.attack.trait] + bonus);
    expect(`${b.name} damage`, row.damage, dmg(b.attack.damage.die, b.attack.damage.bonus, b.attack.damageType));
  });
}
