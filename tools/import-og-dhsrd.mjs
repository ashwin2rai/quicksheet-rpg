#!/usr/bin/env node
// Imports the curated QuickSheet subset of game data from a local checkout of
// Old Gus's edited SRD (https://github.com/callmepartario/og-dhsrd).
//
// Usage: node tools/import-og-dhsrd.mjs <path-to-og-dhsrd-checkout> [--check]
//
// The upstream file is a browser script. Only its leading data section (array
// literals) is evaluated, inside an empty vm context with a timeout; nothing
// from upstream is copied into QuickSheet's runtime code. Output is written to
// data/core/*.json. With --check, the generated output is compared to the
// committed files instead of written (non-zero exit on difference).

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { htmlToMarkdown, splitNamedFeature, slugify, decodeEntities } from './lib/html-to-markdown.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TRAITS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

const [ogPath, ...flags] = process.argv.slice(2);
if (!ogPath) {
  console.error('Usage: node tools/import-og-dhsrd.mjs <path-to-og-dhsrd-checkout> [--check]');
  process.exit(2);
}
const checkOnly = flags.includes('--check');
const curation = JSON.parse(readFileSync(join(ROOT, 'tools/curation/core.json'), 'utf8'));
const { sourceSet, sourceVersion } = curation;

// ---------------------------------------------------------------- upstream
const featuresPath = join(ogPath, 'scripts/og-dhsrd-features.js');
const featuresSrc = readFileSync(featuresPath, 'utf8');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
let commit = null;
try {
  commit = execFileSync('git', ['-C', ogPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  commit = null;
}
const upstream = {
  repository: 'https://github.com/callmepartario/og-dhsrd',
  commit,
  file: 'scripts/og-dhsrd-features.js',
  sha256: sha256(readFileSync(featuresPath)),
};

function loadUpstreamData(src) {
  const end = src.search(/\n(function |\$\(|document\.)/);
  if (end < 0) throw new Error('Could not locate end of the data section in og-dhsrd-features.js');
  const dataSection = src.slice(0, end).replace(/localStorage\.getItem\([^)]*\)/g, 'null');
  const names = [...dataSection.matchAll(/^const (\w+) *= *\[/gm)].map((m) => m[1]);
  const script = `${dataSection}\n;({ ${names.join(', ')} })`;
  return vm.runInNewContext(script, Object.create(null), { timeout: 5000 });
}
const og = loadUpstreamData(featuresSrc);

// ---------------------------------------------------------------- helpers
const errors = [];
const usedFeatureMechanics = new Set();
const usedGearMechanics = new Set();
const usedOverrides = new Set();

function source(pages, extra = {}) {
  const list = (pages ?? []).filter(Boolean);
  return {
    sourceSet,
    sourceVersion,
    reference: 'og-dhsrd',
    pages: list.filter((p) => p !== 'Errata'),
    errata: list.includes('Errata'),
    ...extra,
  };
}
const isCorePages = (pages) => (pages ?? []).every((p) => p === 'Errata' || p.startsWith('DH Core'));
const pick = (list, names, what) =>
  names.map((name) => {
    const found = list.find((r) => r.name === name);
    if (!found) errors.push(`Upstream ${what} "${name}" not found`);
    return found;
  }).filter(Boolean);
const plain = (html) => htmlToMarkdown(html).replace(/\*+/g, '');
// Old Gus adds metric conversions such as "50 feet (15 m)" that are not in the SRD.
const stripMetric = (text) => text.replace(/ \(\d[\d.]* ?(?:m|km|cm|kg)\)/g, '');
const overrides = curation.officialOverrides ?? {};
function applyTextOverride(entry, text) {
  if (!entry) return text;
  if (entry.text) return entry.text;
  let out = text;
  for (const [from, to] of entry.replace ?? []) {
    if (!out.includes(from)) errors.push(`Override text "${from}" not found`);
    out = out.replace(from, to);
  }
  return out;
}
const usedRecordOverrides = new Set();

const features = [];
// Upstream sometimes merges two features into one string ("...</p></li><li><p>...") or
// leaves stray list tags around a feature. Split and clean before parsing.
function splitFeatureHtml(list) {
  return list.flatMap((html) => String(html).split(/<\/p>\s*<\/li>\s*<li>\s*<p>/).map((part, i, parts) => {
    let h = part.replace(/^\s*<li>\s*/, '').replace(/<\/li>\s*$/, '');
    if (parts.length > 1 && i < parts.length - 1) h += '</p>';
    if (parts.length > 1 && i > 0) h = `<p>${h}`;
    return h;
  }));
}
const correctName = (name) => curation.nameCorrections?.[name] ?? name;
function addFeature(ownerSlug, ownerId, category, html, pages, extra = {}) {
  // Some upstream strings end with a stray closing </li>.
  const parsed = splitNamedFeature(html);
  const name = correctName(parsed.name);
  const { text } = parsed;
  const id = `feature.${ownerSlug}.${slugify(name)}`;
  const mechanics = curation.featureMechanics[id];
  if (!mechanics) errors.push(`No curated mechanics entry for ${id}`);
  usedFeatureMechanics.add(id);
  if (features.some((f) => f.id === id)) errors.push(`Duplicate feature id ${id}`);
  const override = curation.officialOverrides?.features?.[id];
  usedOverrides.add(id);
  features.push({
    id, name, ownerId, category, text: override ? override.text : stripMetric(text), mechanics: mechanics ?? null, ...extra,
    source: source(pages, override ? { textOverride: 'official-srd-2.0' } : {}),
  });
  return id;
}

// Gear feature values vary by item (e.g. Protective +1 to +4), so a curated entry
// may carry a `match` pattern; its capture groups fill "$1"-style modifier values.
function gearFeature(html, itemLabel) {
  if (!html) return null;
  const { name, text } = splitNamedFeature(html);
  const curated = curation.gearFeatureMechanics[name];
  usedGearMechanics.add(name);
  if (!curated) {
    errors.push(`No curated gear feature mechanics for "${name}"`);
    return { name, text, mechanics: null };
  }
  const { match, ...mechanics } = curated;
  if (match) {
    const plainText = text.replace(/\*+/g, '').trim();
    const m = plainText.match(new RegExp(match));
    if (!m) {
      errors.push(`Gear feature "${name}" on ${itemLabel} does not match its curated pattern: "${plainText}"`);
      return { name, text, mechanics: null };
    }
    const fill = (v) => (typeof v === 'string' && /^\$\d$/.test(v) ? Number(m[Number(v.slice(1))]) : v);
    if (mechanics.modifiers) mechanics.modifiers = mechanics.modifiers.map((mod) => ({ ...mod, value: fill(mod.value) }));
  }
  return { name, text, mechanics };
}

function parseDamage(damage) {
  // Upstream occasionally appends notes (Ghostblade: "d10+7 phy or"); the Otherworldly feature covers those.
  const m = String(damage).trim().match(/^d(\d+)(?:\+(\d+))?(?:\s+phy or)?$/);
  if (!m) throw new Error(`Unrecognised damage "${damage}"`);
  return { die: Number(m[1]), bonus: Number(m[2] ?? 0) };
}
const parseTrait = (t) => (t === 'Spellcast' ? 'spellcast' : t.toLowerCase());
const domainId = (label) => `domain.${slugify(label)}`;
const weaponId = (label) => `weapon.${slugify(label)}`;
const armorId = (label) => `armor.${slugify(label)}`;

// ---------------------------------------------------------------- domains & cards
function cardMechanics(id) {
  const mechanics = curation.cardMechanics[id];
  if (!mechanics) errors.push(`No curated mechanics entry for ${id}`);
  return mechanics ?? null;
}
const domains = pick(og.domainList, curation.select.domains, 'domain').map((d) => ({
  id: domainId(d.label),
  name: d.label,
  theme: d.theme,
  summary: plain(d.summarybrief),
  source: source(d.pages),
}));
const domainLabels = new Set(domains.map((d) => d.name));

const domainCards = og.domaincardList
  .filter((c) => domainLabels.has(c.domain) && c.level <= curation.select.domainCardMaxLevel)
  .map((c) => ({
    id: `card.${c.name}`,
    name: decodeEntities(c.label),
    domainId: domainId(c.domain),
    level: c.level,
    type: c.type,
    recallCost: c.recall,
    text: (usedRecordOverrides.add(`card.${c.name}`), applyTextOverride(overrides.cards?.[`card.${c.name}`], stripMetric(htmlToMarkdown(c.effects)))),
    mechanics: cardMechanics(`card.${c.name}`),
    source: source(c.pages, overrides.cards?.[`card.${c.name}`] ? { textOverride: 'official-srd-2.0' } : {}),
  }));
for (const id of Object.keys(curation.cardMechanics)) {
  if (!domainCards.some((c) => c.id === id)) errors.push(`Curated card mechanics entry ${id} matches no imported card`);
}

// ---------------------------------------------------------------- gear
function importWeapons(list, slot) {
  return list
    .filter((w) => w.tier <= curation.select.weaponTierMax && !w.campaign && isCorePages(w.pages))
    .filter((w) => !(overrides.excludeNotInSrd?.ids ?? []).includes(weaponId(w.label)))
    .map((w) => {
      const fix = overrides.weapons?.[weaponId(w.label)];
      if (fix) usedRecordOverrides.add(weaponId(w.label));
      const tags = [];
      if (/wheelchair/i.test(w.label)) tags.push('combat-wheelchair');
      return {
        id: weaponId(w.label),
        name: decodeEntities(w.label),
        slot,
        tier: w.tier,
        magic: Boolean(w.magic) || w.damagetype === 'mag',
        trait: parseTrait(w.trait),
        range: fix?.range ?? w.range,
        damage: parseDamage(w.damage),
        damageType: w.damagetype,
        burden: fix?.burden ?? w.burden.toLowerCase(),
        feature: gearFeature(w.feature, w.label),
        tags,
        source: source(w.pages, fix ? { dataOverride: 'official-srd-2.0' } : {}),
      };
    });
}
const weapons = [
  ...importWeapons(og.weaponprimaryList, 'primary'),
  ...importWeapons(og.weaponsecondaryList, 'secondary'),
];
const armor = og.armorList
  .filter((a) => a.tier <= curation.select.armorTierMax && !a.campaign && isCorePages(a.pages))
  .map((a) => ({
    id: armorId(a.label),
    name: decodeEntities(a.label),
    tier: a.tier,
    baseThresholds: { major: a.thresholdmajor, severe: a.thresholdsevere },
    baseScore: a.score,
    feature: gearFeature(a.feature, a.label),
    tags: [],
    source: source(a.pages),
  }));

const consumables = pick(og.consumableList, curation.select.consumables, 'consumable').map((c) => ({
  id: `item.${c.name}`,
  name: c.label,
  category: 'consumable',
  text: htmlToMarkdown(c.feature),
  source: source(c.pages),
}));
const creationStep = { sourceSet, sourceVersion, reference: 'srd-character-creation', pages: ['SRD 2.0 Character Creation, Step 5'], errata: false };
const items = [
  ...curation.startingKit.map((i) => ({ ...i, category: 'starting-kit', source: creationStep })),
  ...consumables,
  ...curation.grantedItems.map((i) => ({ ...i, category: 'granted', source: { sourceSet, sourceVersion, reference: 'og-dhsrd', pages: [], errata: false } })),
];

// ---------------------------------------------------------------- classes & subclasses
const classes = [];
const subclasses = [];
for (const c of pick(og.classesList, curation.select.classes, 'class')) {
  const classId = `class.${c.name}`;
  const featureIds = splitFeatureHtml(c.features).map((html) => addFeature(c.name, classId, 'class', html, c.pages));
  const hopeFeatureId = addFeature(c.name, classId, 'hope', c.hopefeature, c.pages);
  const subclassIds = [];
  for (const label of c.subclasses) {
    const s = og.subclassList.find((x) => x.label === label);
    if (!s) { errors.push(`Subclass ${label} of ${c.name} not found upstream`); continue; }
    if (!curation.select.subclasses.includes(s.name)) continue;
    const subclassId = `subclass.${s.name}`;
    subclassIds.push(subclassId);
    const tierFeatures = (key, category, cards) =>
      splitFeatureHtml(s[key]).map((html) => addFeature(s.name, subclassId, category, html, s.pages, { card: cards?.[0] ?? null }));
    subclasses.push({
      id: subclassId,
      name: s.label,
      classId,
      summary: plain(s.summarybrief),
      spellcastTrait: s.spellcast ? s.spellcast.toLowerCase() : null,
      foundationFeatureIds: tierFeatures('foundation', 'subclass-foundation', s.foundationcard),
      specializationFeatureIds: tierFeatures('specialization', 'subclass-specialization', s.specializationcard),
      masteryFeatureIds: tierFeatures('mastery', 'subclass-mastery', s.masterycard),
      source: source(s.pages),
    });
  }
  const suggestedTraits = Object.fromEntries(TRAITS.map((t, i) => [t, c.traitarray[i]]));
  classes.push({
    id: classId,
    name: c.label,
    summary: plain(c.summarybrief),
    domainIds: c.domains.map(domainId),
    startingEvasion: c.evasion,
    startingHp: c.hp,
    featureIds,
    hopeFeatureId,
    subclassIds,
    classItems: curation.officialOverrides?.classItems?.[classId]?.items ?? c.items.map(decodeEntities),
    suggested: {
      traits: suggestedTraits,
      primaryWeaponId: c.weaponprimary ? weaponId(c.weaponprimary) : null,
      secondaryWeaponId: c.weaponsecondary ? weaponId(c.weaponsecondary) : null,
      armorId: c.armor ? armorId(c.armor) : null,
    },
    backgroundQuestions: c.questions.map(decodeEntities),
    connectionQuestions: c.connections.map(decodeEntities),
    descriptionSuggestions: { clothes: c.clothes.map(decodeEntities), attitudes: c.attitudes.map(decodeEntities) },
    source: source(c.pages),
  });
}

// ---------------------------------------------------------------- heritage
const ancestries = pick(og.ancestryList, curation.select.ancestries, 'ancestry').map((a) => {
  const id = `ancestry.${a.name}`;
  if (a.features.length !== 2) errors.push(`Ancestry ${a.name} does not have exactly two features`);
  const [topFeatureId, bottomFeatureId] = a.features.map((html, i) =>
    addFeature(a.name, id, 'ancestry', html, a.pages, { position: i === 0 ? 'top' : 'bottom' }));
  return { id, name: a.label, summary: plain(a.summarybrief), topFeatureId, bottomFeatureId, source: source(a.pages, { card: a.featurecard?.[0] ?? null }) };
});
const communities = pick(og.communityList, curation.select.communities, 'community').map((c) => {
  const id = `community.${c.name}`;
  const featureId = addFeature(c.name, id, 'community', c.feature.replace(/<\/li>\s*$/, ''), c.pages);
  return { id, name: c.label, summary: plain(c.summarybrief), featureId, source: source(c.pages, { card: c.featurecard?.[0] ?? null }) };
});

// ---------------------------------------------------------------- beastforms
const beastforms = curation.select.beastforms
  ? og.beastformList.filter((b) => isCorePages(b.pages)).map((b) => ({
    id: `beastform.${b.name}`,
    name: b.label,
    tier: b.tier,
    examples: plain(b.examples).replace(/^\(|\)$/g, ''),
    traitBonus: b.stat ? { trait: b.stat.toLowerCase(), value: Number(b.statbonus) } : null,
    evasionBonus: Number(b.evasionbonus),
    attack: b.attacktrait
      ? { trait: b.attacktrait.toLowerCase(), range: b.attackrange, damage: parseDamage(String(b.attackdamage).trim()), damageType: b.attackdamagetype }
      : null,
    advantages: b.advantage ? b.advantage.split(',').map((x) => x.trim()).filter(Boolean) : [],
    features: b.features.map((html) => {
      const f = splitNamedFeature(html);
      const key = `beastform.${b.name}/${f.name}`;
      usedRecordOverrides.add(key);
      return { name: f.name, text: applyTextOverride(overrides.beastformFeatures?.[key], stripMetric(f.text)) };
    }),
    // Evolved/Hybrid forms build on other forms (V2 handles them; RD-024).
    variant: b.features.some((html) => /Evolved:|Hybrid Features:/.test(html)) ? 'composite' : null,
    source: source(b.pages),
  }))
  : [];

// ---------------------------------------------------------------- checks & output
for (const id of Object.keys(curation.featureMechanics)) {
  if (!usedFeatureMechanics.has(id)) errors.push(`Curated mechanics entry ${id} matches no imported feature`);
}
for (const id of Object.keys(curation.officialOverrides?.features ?? {})) {
  if (id !== '$comment' && !usedOverrides.has(id)) errors.push(`Official text override ${id} matches no imported feature`);
}
for (const group of ['cards', 'beastformFeatures', 'weapons']) {
  for (const id of Object.keys(overrides[group] ?? {})) if (!usedRecordOverrides.has(id)) errors.push(`Official override ${group}.${id} matches nothing`);
}
const allWeaponIds = [...og.weaponprimaryList, ...og.weaponsecondaryList].map((w) => weaponId(w.label));
for (const id of overrides.excludeNotInSrd?.ids ?? []) if (!allWeaponIds.includes(id)) errors.push(`Exclusion ${id} matches no upstream weapon`);
for (const name of Object.keys(curation.gearFeatureMechanics)) {
  if (!usedGearMechanics.has(name)) errors.push(`Curated gear feature "${name}" matches no imported gear`);
}
if (errors.length) {
  console.error(`Import failed with ${errors.length} error(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

const meta = {
  generatedBy: 'tools/import-og-dhsrd.mjs',
  note: 'Generated file. Edit tools/curation/core.json and re-run the importer instead of editing by hand.',
  contentProfile: sourceSet,
  sourceVersion,
  upstream,
  copyright: 'Includes materials from the Daggerheart System Reference Document 2.0, © Critical Role, LLC. All rights reserved. Used under the Darrington Press Community Gaming License; see NOTICE.md.',
};
const outputs = {
  'classes.json': classes,
  'subclasses.json': subclasses,
  'features.json': features,
  'ancestries.json': ancestries,
  'communities.json': communities,
  'domains.json': domains,
  'domain-cards.json': domainCards,
  'weapons.json': weapons,
  'armor.json': armor,
  'items.json': items,
  'beastforms.json': beastforms,
};
let differences = 0;
for (const [file, records] of Object.entries(outputs)) {
  const path = join(ROOT, 'data/core', file);
  const text = `${JSON.stringify({ meta, records }, null, 2)}\n`;
  if (checkOnly) {
    let current = '';
    try { current = readFileSync(path, 'utf8'); } catch { current = ''; }
    if (current !== text) { differences += 1; console.log(`DIFFERS: data/core/${file}`); }
  } else {
    writeFileSync(path, text);
    console.log(`wrote data/core/${file} (${records.length} records)`);
  }
}
console.log(`Old Gus commit ${commit ?? 'unknown'}; og-dhsrd-features.js sha256 ${upstream.sha256}`);
if (checkOnly && differences) process.exit(1);
