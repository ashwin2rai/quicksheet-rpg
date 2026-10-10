// Data integrity checks shared by `npm run validate:data` and the test suite.

import { RESOLVERS } from '../../src/resolvers.js';
import { TRAITS, readBundles } from '../../src/catalog.js';
import { RULES, PROGRESSION } from '../../src/rules.js';

const SOURCE_SETS = ['core', 'hope-fear'];
const MECHANIC_KINDS = ['effects', 'reference', 'deferred'];
const EFFECT_KEYS = ['modifiers', 'resource', 'attack', 'flags', 'grants', 'resolver', 'companion', 'display', 'resourceUpgrade', 'restriction', 'advancement', 'stances', 'loadoutSlots'];
const KNOWN_FLAGS = ['ignore-burden', 'single-ancestry-feature'];
const RESOURCE_COUNTS = /^(tier|level|proficiency|trait:(spellcast|agility|strength|finesse|instinct|presence|knowledge))$/;
const MODIFIER_TARGETS = new Set([
  'evasion', 'hpSlots', 'stressSlots', 'armorScore', 'thresholds', 'severeThreshold', 'attackRoll', 'weaponAttackRoll',
  'primaryWeaponAttackRoll', 'actionRolls', 'primaryWeaponDamage', 'physicalDamage', 'damageRolls', 'meleeWeaponDamage',
  ...TRAITS.map((t) => `trait.${t}`),
]);
const RANGES = ['Melee', 'Very Close', 'Close', 'Far', 'Very Far'];
const DAMAGE_TYPES = ['phy', 'mag', 'phy/mag'];
const DIE = /^d(4|6|8|10|12|20)$/;

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

    // Hope & Fear records may build on core records (e.g. Warlock's Grace domain); never the reverse.
    for (const [id, r] of all) {
      if (r.source?.sourceSet !== 'core') continue;
      const refs = JSON.stringify(r).match(/"(?:class|subclass|feature|ancestry|community|domain|card|weapon|armor|item|transformation|stance)\.[a-z0-9.-]+"/g) ?? [];
      for (const ref of refs) if (all.get(ref.slice(1, -1))?.source?.sourceSet === 'hope-fear') p(`${id}: core record refers to Hope & Fear record ${ref}`);
    }

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
    for (const t of records('transformations')) {
      if (t.featureIds.length !== 2) p(`${t.id}: a transformation card has two features`);
      t.featureIds.forEach((id) => {
        const f = get(id, 'features', t.id);
        if (f && (f.ownerId !== t.id || f.category !== 'transformation')) p(`${id}: must be a transformation feature owned by ${t.id}`);
      });
      if (!t.questions?.length) p(`${t.id}: needs transformation questions`);
    }
    for (const st of records('martialStances')) {
      if (!(st.tier >= 1 && st.tier <= 4)) p(`${st.id}: bad tier`);
      if (!st.text?.trim()) p(`${st.id}: empty text`);
    }
    for (const f of records('features')) {
      get(f.ownerId, null, f.id);
      if (!f.text?.trim()) p(`${f.id}: empty rules text`);
      checkMechanics(f.mechanics, f.id, p, get);
      const st = f.mechanics?.stances;
      if (st) {
        const pool = records('martialStances');
        if (pool.filter((x) => x.tier <= st.initialTier).length < st.initial) p(`${f.id}: not enough Tier ${st.initialTier} martial stances`);
        if (pool.length < st.initial + 9 * st.perLevel) p(`${f.id}: not enough martial stances for ten levels`);
        if (f.mechanics.resolver !== 'martialStances' || !st.rules?.trim()) p(`${f.id}: stances need the martialStances resolver and rules text`);
      }
      if (f.mechanics?.advancement && f.category !== 'class') p(`${f.id}: only class features may add advancement options`);
      if (f.mechanics?.flags?.includes('single-ancestry-feature') && (f.category !== 'transformation' || f.mechanics.resolver !== 'onlySkinDeep')) p(`${f.id}: single-ancestry-feature needs a transformation feature with the onlySkinDeep resolver`);
    }
    for (const card of records('domainCards')) {
      get(card.domainId, 'domains', card.id);
      if (!Number.isInteger(card.level) || card.level < 1 || card.level > 10) p(`${card.id}: bad level ${card.level}`);
      if (!Number.isInteger(card.recallCost) || card.recallCost < 0) p(`${card.id}: bad recall cost`);
      if (!card.text?.trim()) p(`${card.id}: empty text`);
      checkMechanics(card.mechanics, card.id, p, get);
    }
    const grantedWeaponIds = new Set(records('features').flatMap((f) => f.mechanics?.grants?.weapons ?? []));
    for (const w of records('weapons')) {
      const granted = w.tags?.includes('feature-granted');
      if (!['primary', 'secondary'].includes(w.slot)) p(`${w.id}: bad slot`);
      if (!(w.tier >= 1 && w.tier <= 4)) p(`${w.id}: bad tier`);
      if (![...TRAITS, 'spellcast', ...(granted ? ['choice'] : [])].includes(w.trait)) p(`${w.id}: bad trait ${w.trait}`);
      if (!RANGES.includes(w.range)) p(`${w.id}: bad range ${w.range}`);
      if (!['one-handed', 'two-handed', ...(granted ? ['unarmed'] : [])].includes(w.burden)) p(`${w.id}: bad burden ${w.burden}`);
      if (!DAMAGE_TYPES.includes(w.damageType)) p(`${w.id}: bad damage type`);
      if (!Number.isInteger(w.damage?.die) || !Number.isInteger(w.damage?.bonus)) p(`${w.id}: bad damage`);
      if (w.damage?.extraDie !== undefined && !(granted && Number.isInteger(w.damage.extraDie))) p(`${w.id}: bad extra damage die`);
      if (granted && !grantedWeaponIds.has(w.id)) p(`${w.id}: feature-granted weapon that no feature grants`);
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

  // No markup may leak from upstream HTML into any data string.
  const scan = (value, where) => {
    if (typeof value === 'string') { if (/<\/?[a-z][^>]*>/i.test(value)) err(`${where}: contains HTML markup`); }
    else if (Array.isArray(value)) value.forEach((v, i) => scan(v, `${where}[${i}]`));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) scan(v, `${where}.${k}`);
  };
  for (const [profileName, gameData] of Object.entries(gameDataByProfile)) {
    for (const [collection, bundle] of Object.entries(gameData)) for (const r of bundle.records ?? []) scan(r, `[${profileName}] ${collection}:${r.id}`);
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
  const featureAdvancements = Object.values(gameDataByProfile).flatMap((g) => g.features?.records ?? []).map((f) => f.mechanics?.advancement?.id).filter(Boolean);
  const ADV = [...PROGRESSION.OPTIONS.map((o) => o.id), ...featureAdvancements];
  for (const s of flavor.classStyles.records) {
    for (const [k, v] of Object.entries(s.advancementWeights ?? {})) if (!ADV.includes(k) || !(v > 0)) err(`flavor: bad advancement weight ${k} for ${s.classId}`);
    for (const tag of s.conceptTags) if (!flavor.details.conceptTails[tag]?.length) err(`flavor: concept tag ${tag} for ${s.classId} has no tails`);
    for (const tag of s.experienceTags) if (!exps.some((e) => e.tags.includes(tag))) err(`flavor: no Experiences tagged ${tag} (${s.classId})`);
  }
  if ((flavor.companions?.companionAnimals?.length ?? 0) < 5 || (flavor.companions?.companionNames?.length ?? 0) < 5) err('flavor companions: need animals and names');
  const sayings = flavor.sayings?.orderborneSayings ?? [];
  if (sayings.length < 6 || new Set(sayings).size !== sayings.length) err('flavor sayings: need at least 6 distinct Orderborne sayings');
  const a = flavor.aspects ?? {};
  const distinct = (list, min, what) => { if ((list?.length ?? 0) < min || new Set(list).size !== list.length) err(`flavor aspects: need at least ${min} distinct ${what}`); };
  for (const c of Object.values(gameDataByProfile).flatMap((g) => g.classes?.records ?? [])) distinct(a.highConceptRoles?.[c.id], 6, `high concept roles for ${c.id}`);
  distinct(a.highConceptDescriptors, 20, 'descriptors');
  distinct(a.highConceptPurposes, 10, 'purposes');
  distinct(a.troubles?.personal, 20, 'personal troubles');
  distinct(a.troubles?.relationships, 20, 'relationship troubles');
  for (const t of a.highConceptTemplates ?? []) {
    if (!(t.weight > 0) || !t.template.includes('{role}') || (t.template.match(/\{(\w+)\}/g) ?? []).some((x) => !['{role}', '{descriptor}', '{purpose}'].includes(x))) err(`flavor aspects: bad template ${t.template}`);
  }
  if (!a.highConceptTemplates?.length) err('flavor aspects: no high concept templates');
  const patrons = flavor.patrons?.patronNames ?? [];
  if (patrons.length < 10 || new Set(patrons).size !== patrons.length) err('flavor patrons: need at least 10 distinct patron names');
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
    const okValue = typeof mod.value === 'number' || ['proficiency', 'level', 'tier', 'trait:spellcast'].includes(mod.value) || /^(halfUp|trait):(agility|strength|finesse|instinct|presence|knowledge)$/.test(mod.value);
    if (mod.requires && !(typeof mod.requires.loadoutDomain === 'string' && Number.isInteger(mod.requires.min))) p(`${where}: bad modifier requirement`);
    if (mod.requires) get(mod.requires.loadoutDomain, 'domains', where);
    if (!okValue) p(`${where}: bad modifier value ${mod.value}`);
    if (mod.target.startsWith('trait.') && typeof mod.value !== 'number') p(`${where}: trait modifiers must be plain numbers`);
  }
  if (m.resolver) {
    const resolver = RESOLVERS[m.resolver];
    if (!resolver) p(`${where}: resolver ${m.resolver} is not implemented`);
    if (m.resolver === 'chooseOption' && !(m.choice?.options?.length > 1 && m.choice.label)) p(`${where}: chooseOption needs a label and at least two options`);
    if (m.resolver === 'chooseNumber' && !(Number.isInteger(m.choice?.min) && Number.isInteger(m.choice?.max) && m.choice.min < m.choice.max)) p(`${where}: chooseNumber needs integer min < max`);
    if (m.resolver === 'chooseBenefits') {
      const opts = Object.entries(m.choice?.options ?? {});
      if (!(opts.length > m.choice?.count) || opts.some(([k, mods]) => !mods.every((x) => MODIFIER_TARGETS.has(x.target)) || !m.choice.optionLabels?.[k])) p(`${where}: chooseBenefits needs labelled options with valid modifiers`);
    }
  }
  if (m.resource) {
    const r = m.resource;
    if (!r.id || !r.label) p(`${where}: resource needs id and label`);
    if (r.dieByLevel) {
      if (!r.dieByLevel.length || r.dieByLevel[0][0] !== 1) p(`${where}: resource must define a die from level 1`);
    } else if (r.dieSteps) {
      if (!r.dieSteps.length || !r.dieSteps.every((d) => DIE.test(d)) || m.advancement?.id !== r.advancedBy) p(`${where}: dieSteps need valid dice and the advancement that raises them`);
      else if (Object.values(m.advancement.slots).reduce((a, b) => a + b, 0) >= r.dieSteps.length) p(`${where}: more advancement slots than die steps`);
    } else if (typeof r.count === 'number') {
      if (!Number.isInteger(r.count) || r.count < 0) p(`${where}: a fixed resource count must be a non-negative integer`);
    } else if (!RESOURCE_COUNTS.test(r.count ?? '')) p(`${where}: resource needs dieByLevel, dieSteps or a valid count`);
    if (r.die !== undefined && !DIE.test(r.die)) p(`${where}: bad resource die ${r.die}`);
  }
  if (m.attack) {
    const a = m.attack;
    if (![...TRAITS, 'choice'].includes(a.trait) || !RANGES.includes(a.range) || !Number.isInteger(a.damage?.die) || !['phy', 'mag'].includes(a.damageType)) p(`${where}: bad attack definition`);
  }
  if (m.advancement) {
    const a = m.advancement;
    const slotTiers = Object.keys(a.slots ?? {});
    if (!a.id || !a.label || !Number.isInteger(a.cost) || a.cost < 1 || !slotTiers.length || slotTiers.some((t) => !['2', '3', '4'].includes(t) || !Number.isInteger(a.slots[t]))) p(`${where}: bad advancement option`);
    if (PROGRESSION.OPTIONS.some((o) => o.id === a.id)) p(`${where}: advancement id ${a.id} clashes with an SRD option`);
  }
  if (m.stances && !(Number.isInteger(m.stances.initial) && Number.isInteger(m.stances.initialTier) && Number.isInteger(m.stances.perLevel))) p(`${where}: bad stances definition`);
  if (m.loadoutSlots !== undefined && !(Number.isInteger(m.loadoutSlots) && m.loadoutSlots < 0)) p(`${where}: loadoutSlots must be a negative integer`);
  (m.grants?.weapons ?? []).forEach((id) => {
    const w = get(id, 'weapons', where);
    if (w && !w.tags?.includes('feature-granted')) p(`${where}: granted weapon ${id} must be tagged feature-granted`);
  });
  for (const flag of m.flags ?? []) if (!KNOWN_FLAGS.includes(flag)) p(`${where}: unknown flag ${flag}`);
  (m.grants?.items ?? []).forEach((id) => get(id, 'items', where));
  if (m.grants?.domainCards !== undefined && !(Number.isInteger(m.grants.domainCards) && m.grants.domainCards > 0)) p(`${where}: bad domainCards grant`);
  if (m.grants?.companionAdvancements !== undefined && !(Number.isInteger(m.grants.companionAdvancements) && m.grants.companionAdvancements > 0)) p(`${where}: bad companionAdvancements grant`);
  if (m.resourceUpgrade && !(m.resourceUpgrade.id && (DIE.test(m.resourceUpgrade.value ?? '') !== DIE.test(m.resourceUpgrade.die ?? '')))) p(`${where}: bad resourceUpgrade (needs a die as value or die)`);
  if (m.restriction && !(TRAITS.includes(m.restriction.trait) && Number.isInteger(m.restriction.max))) p(`${where}: bad restriction`);
  if ((m.persistent || m.vaultOnAcquire) && !m.resolver && !m.modifiers) p(`${where}: persistent/vault-on-acquire cards need an effect`);
  if (m.resource?.min !== undefined && !Number.isInteger(m.resource.min)) p(`${where}: resource min must be an integer`);
  if (m.companion) {
    const c = m.companion;
    for (const key of ['evasion', 'stressSlots', 'damageDie', 'experienceCount', 'experienceModifier']) if (!Number.isInteger(c[key])) p(`${where}: companion.${key} must be an integer`);
    if (!RANGES.includes(c.attackRange)) p(`${where}: companion attack range`);
    if (!(c.exampleExperiences?.length >= c.experienceCount)) p(`${where}: companion needs enough example Experiences`);
    if (m.resolver !== 'beastboundCompanion') p(`${where}: companion requires the beastboundCompanion resolver`);
    if (!c.advancements?.length || c.advancements.some((a) => !a.id || !a.label || !Number.isInteger(a.slots) || !a.text)) p(`${where}: companion advancements need id, label, slots and text`);
    if (!Number.isInteger(c.maxDamageDie)) p(`${where}: companion needs maxDamageDie`);
  }
  if (m.display !== undefined && m.display !== 'beastforms') p(`${where}: unknown display ${m.display}`);
}

export async function loadAllData(readJson) {
  const manifest = await readJson('manifest.json');
  const gameDataByProfile = {};
  for (const [name, profile] of Object.entries(manifest.profiles)) gameDataByProfile[name] = await readBundles(readJson, profile.files);
  const flavor = await readBundles(readJson, manifest.flavor);
  return { manifest, gameDataByProfile, flavor };
}
