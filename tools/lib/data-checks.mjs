// Data integrity checks shared by `npm run validate:data` and the test suite.

import { RESOLVERS } from '../../src/resolvers.js';
import { TRAITS } from '../../src/catalog.js';
import { RULES } from '../../src/rules.js';

const SOURCE_SETS = ['core', 'hope-fear'];
const MECHANIC_KINDS = ['effects', 'reference', 'deferred'];
const EFFECT_KEYS = ['modifiers', 'resource', 'attack', 'flags', 'grants', 'resolver', 'companion', 'display'];
const KNOWN_FLAGS = ['ignore-burden'];
const RESOURCE_COUNTS = /^(tier|level|proficiency|trait:(spellcast|agility|strength|finesse|instinct|presence|knowledge))$/;
const MODIFIER_TARGETS = new Set([
  'evasion', 'hpSlots', 'stressSlots', 'armorScore', 'thresholds', 'attackRoll', 'primaryWeaponDamage', 'physicalDamage',
  ...TRAITS.map((t) => `trait.${t}`),
]);
const RANGES = ['Melee', 'Very Close', 'Close', 'Far', 'Very Far'];

/** @returns {string[]} errors */
export function checkData({ manifest, gameDataByProfile, flavor }) {
  const errors = [];
  const err = (m) => errors.push(m);

  for (const [profileName, gameData] of Object.entries(gameDataByProfile)) {
    const profile = manifest.profiles[profileName];
    const allowed = new Set(profile.sourceSets);
    const all = new Map();
    const p = (m) => err(`[${profileName}] ${m}`);

    for (const [collection, bundle] of Object.entries(gameData)) {
      if (!bundle?.meta) p(`${collection}: missing meta block`);
      if (!Array.isArray(bundle?.records) || bundle.records.length === 0) { p(`${collection}: no records`); continue; }
      for (const r of bundle.records) {
        if (typeof r.id !== 'string' || !/^[a-z]+\.[a-z0-9.-]+$/.test(r.id)) p(`${collection}: bad id ${r.id}`);
        if (all.has(r.id)) p(`duplicate id ${r.id}`);
        all.set(r.id, { ...r, collection });
        const s = r.source;
        if (!s) { p(`${r.id}: missing source tag`); continue; }
        if (!SOURCE_SETS.includes(s.sourceSet)) p(`${r.id}: unknown sourceSet ${s.sourceSet}`);
        if (!allowed.has(s.sourceSet)) p(`${r.id}: sourceSet ${s.sourceSet} is not allowed in profile ${profileName}`);
        if (s.sourceVersion !== manifest.srdVersion) p(`${r.id}: sourceVersion ${s.sourceVersion} != ${manifest.srdVersion}`);
        if (!s.reference || !Array.isArray(s.pages)) p(`${r.id}: source needs reference and pages`);
        if (s.pages?.some((pg) => /^DH HF/.test(pg)) && s.sourceSet === 'core') p(`${r.id}: Hope & Fear page reference in a core record`);
        if (typeof r.name !== 'string' || !r.name.trim()) p(`${r.id}: missing name`);
      }
    }
    const get = (id, collection, from) => {
      const r = all.get(id);
      if (!r) p(`${from}: reference to missing ${id}`);
      else if (collection && r.collection !== collection) p(`${from}: ${id} should be in ${collection}, found in ${r.collection}`);
      return r;
    };
    const records = (collection) => gameData[collection]?.records ?? [];

    for (const c of records('classes')) {
      if (c.domainIds.length !== 2 || new Set(c.domainIds).size !== 2) p(`${c.id}: must have two distinct domains`);
      c.domainIds.forEach((id) => get(id, 'domains', c.id));
      if (!Number.isInteger(c.startingEvasion) || !Number.isInteger(c.startingHp)) p(`${c.id}: starting Evasion/HP must be integers`);
      [...c.featureIds, c.hopeFeatureId].forEach((id) => {
        const f = get(id, 'features', c.id);
        if (f && f.ownerId !== c.id) p(`${id}: owner ${f.ownerId} != ${c.id}`);
      });
      if (c.subclassIds.length !== 2) p(`${c.id}: expected exactly two subclasses, found ${c.subclassIds.length}`);
      c.subclassIds.forEach((id) => {
        const s = get(id, 'subclasses', c.id);
        if (s && s.classId !== c.id) p(`${id}: parent ${s.classId} != ${c.id}`);
      });
      if (c.classItems.length !== 2) p(`${c.id}: expected two class item options`);
      const suggested = TRAITS.map((t) => c.suggested.traits[t]).sort().join(',');
      if (suggested !== [...RULES.TRAIT_ARRAY].sort().join(',')) p(`${c.id}: suggested traits are not the SRD array`);
      for (const key of ['primaryWeaponId', 'secondaryWeaponId', 'armorId']) {
        if (c.suggested[key]) get(c.suggested[key], key === 'armorId' ? 'armor' : 'weapons', `${c.id}.suggested`);
      }
      if (!c.backgroundQuestions.length || !c.connectionQuestions.length) p(`${c.id}: needs background and connection questions`);
      if (!flavor.classStyles.records.some((s) => s.classId === c.id)) p(`${c.id}: no flavor class style`);
    }
    for (const s of records('subclasses')) {
      get(s.classId, 'classes', s.id);
      if (s.spellcastTrait !== null && !TRAITS.includes(s.spellcastTrait)) p(`${s.id}: bad spellcast trait ${s.spellcastTrait}`);
      for (const key of ['foundationFeatureIds', 'specializationFeatureIds', 'masteryFeatureIds']) {
        if (!s[key].length) p(`${s.id}: ${key} is empty`);
        s[key].forEach((id) => get(id, 'features', s.id));
      }
    }
    for (const a of records('ancestries')) {
      const top = get(a.topFeatureId, 'features', a.id);
      const bottom = get(a.bottomFeatureId, 'features', a.id);
      if (top && top.position !== 'top') p(`${a.id}: top feature not marked top`);
      if (bottom && bottom.position !== 'bottom') p(`${a.id}: bottom feature not marked bottom`);
    }
    for (const c of records('communities')) get(c.featureId, 'features', c.id);
    for (const f of records('features')) {
      get(f.ownerId, null, f.id);
      if (!f.text?.trim()) p(`${f.id}: empty rules text`);
      checkMechanics(f.mechanics, f.id, p, get);
    }
    for (const card of records('domainCards')) {
      get(card.domainId, 'domains', card.id);
      if (!Number.isInteger(card.level) || card.level < 1 || card.level > 10) p(`${card.id}: bad level ${card.level}`);
      if (!Number.isInteger(card.recallCost) || card.recallCost < 0) p(`${card.id}: bad recall cost`);
      if (!card.text?.trim()) p(`${card.id}: empty text`);
      checkMechanics(card.mechanics, card.id, p, get);
    }
    for (const w of records('weapons')) {
      if (!['primary', 'secondary'].includes(w.slot)) p(`${w.id}: bad slot`);
      if (!(w.tier >= 1 && w.tier <= 4)) p(`${w.id}: bad tier`);
      if (![...TRAITS, 'spellcast'].includes(w.trait)) p(`${w.id}: bad trait ${w.trait}`);
      if (!RANGES.includes(w.range)) p(`${w.id}: bad range ${w.range}`);
      if (!['one-handed', 'two-handed'].includes(w.burden)) p(`${w.id}: bad burden ${w.burden}`);
      if (!['phy', 'mag'].includes(w.damageType)) p(`${w.id}: bad damage type`);
      if (!Number.isInteger(w.damage?.die) || !Number.isInteger(w.damage?.bonus)) p(`${w.id}: bad damage`);
      if (w.slot === 'secondary' && w.burden !== 'one-handed') p(`${w.id}: secondary weapons must be one-handed`);
      if (w.feature) checkMechanics(w.feature.mechanics, `${w.id} feature`, p, get);
    }
    for (const a of records('armor')) {
      if (!(a.baseThresholds.major < a.baseThresholds.severe)) p(`${a.id}: thresholds out of order`);
      if (!Number.isInteger(a.baseScore)) p(`${a.id}: bad base score`);
      if (a.feature) checkMechanics(a.feature.mechanics, `${a.id} feature`, p, get);
    }
    for (const id of [...RULES.STARTING_KIT, ...RULES.STARTING_POTIONS]) get(id, 'items', 'RULES');
    for (const b of records('beastforms')) {
      if (!(b.tier >= 1 && b.tier <= 4)) p(`${b.id}: bad tier`);
      if (!b.variant && (!b.attack || !TRAITS.includes(b.attack.trait) || !RANGES.includes(b.attack.range))) p(`${b.id}: bad attack`);
      if (b.variant && b.tier < 3) p(`${b.id}: composite forms are expected only at Tier 3+`);
      if (!Number.isInteger(b.evasionBonus)) p(`${b.id}: bad evasion bonus`);
      if (b.traitBonus && !TRAITS.includes(b.traitBonus.trait)) p(`${b.id}: bad trait bonus`);
      if (!b.features?.length) p(`${b.id}: no features`);
    }
    if (records('features').some((f) => f.mechanics?.display === 'beastforms') && !records('beastforms').some((b) => b.tier === 1)) {
      p('Beastform feature present but no Tier 1 beastforms');
    }
  }

  // Flavor tables (original QuickSheet content)
  for (const [key, bundle] of Object.entries(flavor)) {
    if (bundle.meta?.source !== 'quicksheet-original') err(`flavor ${key}: meta.source must be quicksheet-original`);
  }
  const exps = flavor.experiences.records;
  if (exps.length < 20) err('flavor experiences: need at least 20 candidates');
  if (new Set(exps.map((e) => e.id)).size !== exps.length) err('flavor experiences: duplicate ids');
  if (new Set(exps.map((e) => e.name.toLowerCase())).size !== exps.length) err('flavor experiences: duplicate names');
  for (const e of exps) if (!e.tags?.length) err(`flavor experience ${e.id}: needs tags`);
  for (const key of ['givenNames', 'familyNames', 'pronouns']) if (!flavor.names[key]?.length) err(`flavor names.${key} is empty`);
  for (const key of ['distinguishingDetails', 'personalities', 'motivations', 'origins', 'turningPoints', 'hookTemplates']) {
    if (!flavor.details[key]?.length) err(`flavor details.${key} is empty`);
  }
  for (const s of flavor.classStyles.records) {
    for (const tag of s.conceptTags) if (!flavor.details.conceptTails[tag]?.length) err(`flavor: concept tag ${tag} for ${s.classId} has no tails`);
    for (const tag of s.experienceTags) if (!exps.some((e) => e.tags.includes(tag))) err(`flavor: no Experiences tagged ${tag} (${s.classId})`);
  }
  if ((flavor.companions?.companionAnimals?.length ?? 0) < 5 || (flavor.companions?.companionNames?.length ?? 0) < 5) err('flavor companions: need animals and names');
  const sayings = flavor.sayings?.orderborneSayings ?? [];
  if (sayings.length < 6 || new Set(sayings).size !== sayings.length) err('flavor sayings: need at least 6 distinct Orderborne sayings');
  return errors;
}

function checkMechanics(m, where, p, get) {
  if (!m) { p(`${where}: missing mechanics classification`); return; }
  if (!MECHANIC_KINDS.includes(m.kind)) p(`${where}: unknown mechanics kind ${m.kind}`);
  const effects = EFFECT_KEYS.filter((k) => m[k] !== undefined);
  if (m.kind === 'effects' && !effects.length) p(`${where}: 'effects' kind without any effect`);
  if (m.kind !== 'effects' && effects.length) p(`${where}: '${m.kind}' kind must not declare effects (${effects.join(', ')})`);
  for (const mod of m.modifiers ?? []) {
    if (!MODIFIER_TARGETS.has(mod.target)) p(`${where}: unknown modifier target ${mod.target}`);
    const okValue = typeof mod.value === 'number' || ['proficiency', 'level'].includes(mod.value) || /^halfUp:(agility|strength|finesse|instinct|presence|knowledge)$/.test(mod.value);
    if (!okValue) p(`${where}: bad modifier value ${mod.value}`);
    if (mod.target.startsWith('trait.') && typeof mod.value !== 'number') p(`${where}: trait modifiers must be plain numbers`);
  }
  if (m.resolver) {
    const resolver = RESOLVERS[m.resolver];
    if (!resolver) p(`${where}: resolver ${m.resolver} is not implemented`);
    if (m.resolver === 'chooseOption' && !(m.choice?.options?.length > 1 && m.choice.label)) p(`${where}: chooseOption needs a label and at least two options`);
    if (m.resolver === 'chooseNumber' && !(Number.isInteger(m.choice?.min) && Number.isInteger(m.choice?.max) && m.choice.min < m.choice.max)) p(`${where}: chooseNumber needs integer min < max`);
  }
  if (m.resource) {
    const r = m.resource;
    if (!r.id || !r.label) p(`${where}: resource needs id and label`);
    if (r.dieByLevel) {
      if (!r.dieByLevel.length || r.dieByLevel[0][0] !== 1) p(`${where}: resource must define a die from level 1`);
    } else if (!RESOURCE_COUNTS.test(r.count ?? '')) p(`${where}: resource needs dieByLevel or a valid count`);
  }
  if (m.attack) {
    const a = m.attack;
    if (!TRAITS.includes(a.trait) || !RANGES.includes(a.range) || !Number.isInteger(a.damage?.die) || !['phy', 'mag'].includes(a.damageType)) p(`${where}: bad attack definition`);
  }
  for (const flag of m.flags ?? []) if (!KNOWN_FLAGS.includes(flag)) p(`${where}: unknown flag ${flag}`);
  (m.grants?.items ?? []).forEach((id) => get(id, 'items', where));
  if (m.grants?.domainCards !== undefined && !(Number.isInteger(m.grants.domainCards) && m.grants.domainCards > 0)) p(`${where}: bad domainCards grant`);
  if (m.companion) {
    const c = m.companion;
    for (const key of ['evasion', 'stressSlots', 'damageDie', 'experienceCount', 'experienceModifier']) if (!Number.isInteger(c[key])) p(`${where}: companion.${key} must be an integer`);
    if (!RANGES.includes(c.attackRange)) p(`${where}: companion attack range`);
    if (!(c.exampleExperiences?.length >= c.experienceCount)) p(`${where}: companion needs enough example Experiences`);
    if (m.resolver !== 'beastboundCompanion') p(`${where}: companion requires the beastboundCompanion resolver`);
  }
  if (m.display !== undefined && m.display !== 'beastforms') p(`${where}: unknown display ${m.display}`);
}

export async function loadAllData(readJson) {
  const manifest = await readJson('manifest.json');
  const gameDataByProfile = {};
  for (const [name, profile] of Object.entries(manifest.profiles)) {
    gameDataByProfile[name] = {};
    for (const [key, path] of Object.entries(profile.files)) gameDataByProfile[name][key] = await readJson(path);
  }
  const flavor = {};
  for (const [key, path] of Object.entries(manifest.flavor)) flavor[key] = await readJson(path);
  return { manifest, gameDataByProfile, flavor };
}
