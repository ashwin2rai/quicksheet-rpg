// UI: selector state, generation, preview, copy and download.
// All data is loaded from this site with relative URLs; no other network access.

import { loadCatalog } from './catalog.js';
import { generateCharacter, GenerationError } from './generator.js';
import { renderCharacterMarkdown } from './markdown.js';
import { markdownToHtml } from './preview.js';
import { buildDownload } from './sheet-file.js';

const RANDOM = '';
const $ = (id) => document.getElementById(id);
const els = {
  form: $('generator-form'),
  ancestry: $('ancestry'),
  community: $('community'),
  cls: $('class'),
  subclass: $('subclass'),
  mixed: $('mixed'),
  secondAncestry: $('second-ancestry'),
  secondAncestryLabel: $('second-ancestry-label'),
  generate: $('generate'),
  status: $('status'),
  error: $('error'),
  output: $('output'),
  preview: $('preview'),
  copy: $('copy'),
  download: $('download'),
};

const state = { catalog: null, markdown: '', character: null };

function fillSelect(select, records, { keep = true } = {}) {
  const previous = select.value;
  select.replaceChildren(new Option('Random', RANDOM));
  for (const r of [...records].sort((a, b) => a.name.localeCompare(b.name))) select.add(new Option(r.name, r.id));
  select.value = keep && records.some((r) => r.id === previous) ? previous : RANDOM;
}

function syncSubclassOptions() {
  const { catalog } = state;
  if (els.cls.value === RANDOM) {
    fillSelect(els.subclass, [], { keep: false });
    els.subclass.disabled = true;
    els.subclass.title = 'Choose a class to pick a subclass';
  } else {
    fillSelect(els.subclass, catalog.subclassesOf(els.cls.value)); // resets an incompatible subclass to Random
    els.subclass.disabled = false;
    els.subclass.title = '';
  }
}

function syncSecondAncestry() {
  // Offer every ancestry except the one chosen above; resets a now-conflicting choice to Random.
  fillSelect(els.secondAncestry, state.catalog.ancestries.filter((a) => a.id !== els.ancestry.value));
  els.secondAncestryLabel.hidden = !els.mixed.checked;
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = !message;
}

function announce(message) {
  els.status.textContent = message;
}

function generate() {
  showError('');
  try {
    const character = generateCharacter({
      level: 1,
      ancestryId: els.ancestry.value || null,
      communityId: els.community.value || null,
      classId: els.cls.value || null,
      subclassId: els.subclass.value || null,
      contentProfile: 'core',
      secondAncestryId: (els.mixed.checked && els.secondAncestry.value) || null,
      options: { mixedAncestry: els.mixed.checked },
    }, state.catalog);
    state.character = character;
    state.markdown = renderCharacterMarkdown(character, state.catalog);
    els.preview.innerHTML = markdownToHtml(state.markdown);
    els.output.hidden = false;
    els.generate.textContent = 'Regenerate Character';
    announce(`Generated ${character.flavor.name}.`);
  } catch (e) {
    // Never show a partial or invalid sheet.
    state.character = null;
    state.markdown = '';
    els.output.hidden = true;
    showError(e instanceof GenerationError ? e.message : `Generation failed: ${e.message}`);
    if (e.details?.length) console.error('Generation diagnostics', e.details);
  }
}

async function copyMarkdown() {
  if (!state.markdown) return;
  try {
    await navigator.clipboard.writeText(state.markdown);
    announce('Markdown copied to clipboard.');
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const area = document.createElement('textarea');
    area.value = state.markdown;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    announce(ok ? 'Markdown copied to clipboard.' : 'Copy failed. Use Download .md instead.');
  }
}

function downloadMarkdown() {
  if (!state.markdown) return;
  const file = buildDownload(state.markdown, state.character);
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(`Downloaded ${file.filename}.`);
}

async function init() {
  try {
    const readJson = async (path) => {
      const response = await fetch(new URL(`../data/${path}`, import.meta.url));
      if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`);
      return response.json();
    };
    state.catalog = await loadCatalog(readJson, { contentProfile: 'core' });
  } catch (e) {
    showError(`Could not load game data: ${e.message}. If you opened this file directly, serve the folder over HTTP instead (see README).`);
    return;
  }
  fillSelect(els.ancestry, state.catalog.ancestries);
  fillSelect(els.community, state.catalog.communities);
  fillSelect(els.cls, state.catalog.classes);
  syncSubclassOptions();
  els.cls.addEventListener('change', syncSubclassOptions);
  syncSecondAncestry();
  els.ancestry.addEventListener('change', syncSecondAncestry);
  els.mixed.addEventListener('change', syncSecondAncestry);
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    generate();
  });
  els.copy.addEventListener('click', copyMarkdown);
  els.download.addEventListener('click', downloadMarkdown);
  els.generate.disabled = false;
  announce('Ready.');
}

init();
