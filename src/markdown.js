// Markdown rendering: a pure function from a validated character to the exact
// text that is previewed, copied and downloaded. Plain CommonMark/GFM only (no
// HTML, images or scripts) so the file works in GitHub, Obsidian, editors and print.

import { TRAITS, TRAIT_LABELS } from './catalog.js';
import { acquiredFeatures } from './derive.js';
import { RESOLVERS } from './resolvers.js';

export const ATTRIBUTION_LINES = Object.freeze([
  'This product includes materials from the Daggerheart System Reference Document 2.0, © Critical Role, LLC. All rights reserved. ' +
    'Darrington Press created the SRD material; it is used subject to the Darrington Press Community Gaming License (DPCGL): https://darringtonpress.com/license/ . ' +
    'Official SRD: https://www.daggerheart.com/srd/',
  "Modifications: game text was referenced from Old Gus' Daggerheart System Reference Document (https://github.com/callmepartario/og-dhsrd), " +
    'an edited and reorganized web edition of the SRD. QuickSheet further selected, structured and reformatted that material into this Markdown sheet. ' +
    'Names, descriptions, Experiences, concepts and hooks are original QuickSheet content.',
  'QuickSheet is a free, unofficial, non-commercial fan project for Daggerheart™ Compatible play. ' +
    'It is not sponsored by, affiliated with, endorsed by, or approved by Darrington Press or Critical Role.',
]);

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const cell = (text) => String(text).replace(/\|/g, '\\|');
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const burdenLabel = (b) => (b === 'two-handed' ? 'Two-Handed' : 'One-Handed');
const damageTypeLabel = (t) => (t === 'mag' ? 'mag' : 'phy');

/** Renders a feature as a bold name followed by its rules text. */
function featureBlock(name, text, suffix = '') {
  const [first, ...rest] = text.split('\n\n');
  const lead = first.startsWith('- ') ? `**${name}.**${suffix}\n\n${first}` : `**${name}.**${suffix} ${first}`;
  return [lead, ...rest].join('\n\n');
}

export function renderCharacterMarkdown(character, catalog) {
  const c = character;
  const d = c.derived;
  const cls = catalog.get(c.selections.classId);
  const subclass = catalog.get(c.selections.subclassId);
  const ancestry = catalog.get(c.selections.ancestryId);
  const community = catalog.get(c.selections.communityId);
  const armor = catalog.get(c.equipment.armorId);
  const features = acquiredFeatures(c, catalog);
  const out = [];
  const push = (...lines) => out.push(...lines);

  // 1. Title
  push(`# ${c.flavor.name}`, '', `*${c.flavor.concept}*`, '');
  push(
    `**Level:** ${c.level} (Tier ${d.tier}) | **Class:** ${cls.name} - ${subclass.name}  `,
    `**Heritage:** ${ancestry.name} / ${community.name} | **Pronouns:** ${c.flavor.pronouns}`,
    '',
  );

  // 2. At a glance
  push('## At a Glance', '');
  push(`| ${TRAITS.map((t) => TRAIT_LABELS[t]).join(' | ')} |`);
  push(`| ${TRAITS.map(() => ':---:').join(' | ')} |`);
  push(`| ${TRAITS.map((t) => signed(d.traits[t])).join(' | ')} |`, '');
  if (d.traitAdjustments.length) {
    const notes = d.traitAdjustments.map((a) => `${TRAIT_LABELS[a.trait]} ${signed(a.value)} from ${a.sourceName}`);
    push(`*Trait totals include equipment: ${notes.join('; ')}.*`, '');
  }
  push(
    `**Evasion** ${d.evasion} | **Proficiency** ${d.proficiency}${d.spellcastTrait ? ` | **Spellcast trait** ${TRAIT_LABELS[d.spellcastTrait]}` : ''}  `,
    `**HP** ${d.hpSlots} slots (0 marked) | **Stress** ${d.stressSlots} slots (0 marked)  `,
    `**Hope** ${d.hope.starting} (max ${d.hope.max}) | **Armor Score** ${d.armorScore} (${d.armorScore} Armor Slots, 0 marked)  `,
    `**Damage Thresholds** Major ${d.thresholds.major} / Severe ${d.thresholds.severe}`,
  );
  if (d.resources.length) {
    push('', d.resources.map((r) => `**${r.label}** ${r.die}`).join(' | '));
  }
  push('');

  // 3. Combat & gear
  push('## Combat & Gear', '', '### Weapons', '');
  push('| Slot | Weapon | Attack | Range | Damage | Burden |', '| --- | --- | --- | --- | --- | --- |');
  for (const w of d.weapons) {
    push(`| ${capitalize(w.slot)} | ${cell(w.name)} | ${TRAIT_LABELS[w.attackTrait]} ${signed(w.attackModifier)} | ${w.range} | ${w.damage} ${damageTypeLabel(w.damageType)} | ${burdenLabel(w.burden)} |`);
  }
  push('');
  const weaponNotes = [];
  for (const w of d.weapons) {
    const record = catalog.get(w.weaponId);
    if (record.magic) weaponNotes.push(`- **${record.name}** is a magic weapon (requires a Spellcast trait).`);
    if (record.feature) weaponNotes.push(`- **${record.name} - ${record.feature.name}:** ${record.feature.text}`);
    for (const cond of w.conditional) {
      weaponNotes.push(`- **${w.name}** deals **${cond.damage}** ${damageTypeLabel(w.damageType)} against ${cond.condition} while paired with your secondary weapon.`);
    }
  }
  if (weaponNotes.length) push(...weaponNotes, '');

  push('### Armor', '');
  push(`**${armor.name}** - base thresholds ${armor.baseThresholds.major} / ${armor.baseThresholds.severe}, base score ${armor.baseScore}`);
  if (armor.feature) push('', `- **${armor.feature.name}:** ${armor.feature.text}`);
  push('');

  push('### Inventory', '');
  for (const entry of c.inventory) {
    const item = catalog.get(entry.itemId);
    push(`- ${item.name}${item.text ? ` - ${item.text}` : ''}`);
  }
  push(`- ${capitalize(c.classItem)} (class item)`);
  push(`- Gold: ${c.gold.handfuls} handful${c.gold.handfuls === 1 ? '' : 's'}`, '');

  // 4. Experiences
  push('## Experiences', '');
  for (const e of d.experiences) {
    const detail = e.bonuses.length ? ` (+2 base, ${e.bonuses.map((b) => `${signed(b.value)} ${b.sourceName}`).join(', ')})` : '';
    push(`- **${e.name}** ${signed(e.modifier)}${detail}`);
  }
  push('');

  // 5. Features
  push('## Features', '');
  const section = (heading, list, suffixFor = () => '') => {
    push(`### ${heading}`, '');
    for (const f of list) push(featureBlock(f.name, f.text, suffixFor(f)), '');
  };
  const choiceSuffix = (f) => {
    const choice = c.featureChoices[f.id];
    if (!choice || f.mechanics.kind !== 'resolver') return '';
    return ` *(${RESOLVERS[f.mechanics.resolver].describe(choice, c)})*`;
  };
  section(`Ancestry: ${ancestry.name}`, features.filter((f) => f.category === 'ancestry'), choiceSuffix);
  section(`Community: ${community.name}`, features.filter((f) => f.category === 'community'), choiceSuffix);
  section(`Class: ${cls.name}`, features.filter((f) => f.category === 'class' || f.category === 'hope'), (f) => {
    if (f.category === 'hope') return ' *(Hope feature)*';
    const res = d.resources.find((r) => r.sourceId === f.id);
    return res ? ` *(your ${res.label}: ${res.die})*` : '';
  });
  section(`Subclass: ${subclass.name} (Foundation)`, features.filter((f) => f.category === 'subclass-foundation'), choiceSuffix);
  for (const [category, label] of [['subclass-specialization', 'Specialization'], ['subclass-mastery', 'Mastery']]) {
    const list = features.filter((f) => f.category === category);
    if (list.length) section(`Subclass: ${subclass.name} (${label})`, list, choiceSuffix);
  }

  // 6. Domain cards
  const cards = c.domainCards.map((entry) => ({ entry, card: catalog.get(entry.cardId) }));
  const cardSection = (title, list) => {
    push(`## ${title}`, '');
    push('| Card | Domain | Level | Type | Recall |', '| --- | --- | :---: | --- | :---: |');
    for (const { card } of list) {
      push(`| ${cell(card.name)} | ${catalog.get(card.domainId).name} | ${card.level} | ${card.type} | ${card.recallCost} |`);
    }
    push('');
    for (const { card } of list) {
      push(`### ${card.name}`, '', `*${catalog.get(card.domainId).name} ${card.level} - ${card.type} - Recall ${card.recallCost}*`, '', card.text, '');
    }
  };
  cardSection('Domain Cards - Active Loadout', cards.filter((x) => x.entry.location === 'loadout'));
  const vault = cards.filter((x) => x.entry.location === 'vault');
  if (vault.length) cardSection('Domain Cards - Vault', vault);

  // 7. Character hook
  const f = c.flavor;
  push('## Character Hook', '');
  push(
    `**Appearance:** Dresses in ${f.appearance.clothes} clothes, has the air of ${f.appearance.attitude}, and is recognizable by ${f.appearance.detail}.  `,
    `**Personality:** ${capitalize(f.personality)}.  `,
    `**Motivation:** Wants to ${f.motivation}.  `,
    `**Backstory:** ${f.hook}`,
    '',
    `**Background question:** ${f.backgroundQuestion}`,
    '',
    '**Connection prompts** (ask another player):',
    '',
    ...f.connectionPrompts.map((q) => `- ${q}`),
    '',
  );

  // 8. Advancement history (V2+)
  if (c.advancementHistory.length) {
    push('## Advancement History', '');
    for (const h of c.advancementHistory) push(`- **Level ${h.level}:** ${h.summary ?? ''}`.trimEnd());
    push('');
  }

  // 9. Attribution footer
  push('---', '');
  push(`*Generated by QuickSheet ${c.generatorVersion} - seed \`${c.seed}\` - data ${c.dataVersion} - SRD ${c.srdVersion} - ${catalog.contentProfile === 'core' ? 'Core content' : c.contentProfile}.*`, '');
  for (const line of ATTRIBUTION_LINES) push(line, '');

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
