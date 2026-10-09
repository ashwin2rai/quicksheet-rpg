// Data integrity checks shared by `npm run validate:data` and the test suite.

import { RESOLVERS } from '../../src/resolvers.js';
import { TRAITS } from '../../src/catalog.js';
import { RULES } from '../../src/rules.js';

const SOURCE_SETS = ['core', 'hope-fear'];
const MECHANIC_KINDS = ['modifiers', 'resolver', 'resource', 'grant', 'reference', 'deferred'];
const MODIFIER_TARGETS = new Set([
  'evasion', 'hpSlots', 'stressSlots', 'armorScore', 'thresholds', 'attackRoll', 'primaryWeaponDamage', 'proficiency',
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
  return errors;
}

function checkMechanics(m, where, p, get) {
  if (!m) { p(`${where}: missing mechanics classification`); return; }
  if (!MECHANIC_KINDS.includes(m.kind)) p(`${where}: unknown mechanics kind ${m.kind}`);
  if (m.kind === 'modifiers') {
    if (!m.modifiers?.length) p(`${where}: modifiers kind without modifiers`);
    for (const mod of m.modifiers ?? []) {
      if (!MODIFIER_TARGETS.has(mod.target)) p(`${where}: unknown modifier target ${mod.target}`);
      if (typeof mod.value !== 'number' && mod.value !== 'proficiency') p(`${where}: bad modifier value ${mod.value}`);
    }
  }
  if (m.kind === 'resolver' && !RESOLVERS[m.resolver]) p(`${where}: resolver ${m.resolver} is not implemented`);
  if (m.kind === 'resource') {
    const steps = m.resource?.dieByLevel ?? [];
    if (!steps.length || steps[0][0] !== 1) p(`${where}: resource must define a die from level 1`);
  }
  if (m.kind === 'grant') (m.grants?.items ?? []).forEach((id) => get(id, 'items', where));
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
