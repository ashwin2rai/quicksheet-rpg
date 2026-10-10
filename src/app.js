// UI: generator selections, a Markdown-driven visual folio, and exact .md export.
// All game data is local. There is no backend or runtime third-party request.
import { loadCatalog } from './catalog.js';
import { generateCharacter, GenerationError } from './generator.js';
import { renderCharacterMarkdown } from './markdown.js';
import { renderCharacterSheet, sheetNameFromMarkdown } from './sheet-view.js';
import { buildDownload } from './sheet-file.js';
import { GENERATOR_VERSION } from './version.js';

const RANDOM = '';
const NO_TRANSFORMATION = '';
const RANDOM_TRANSFORMATION = 'random';
const $ = (id) => document.getElementById(id);
const els = {
  form: $('generator-form'), content: $('content'), level: $('level'), ancestry: $('ancestry'),
  community: $('community'), cls: $('class'), subclass: $('subclass'),
  mixed: $('mixed'), secondAncestry: $('second-ancestry'),
  secondAncestryLabel: $('second-ancestry-label'), generate: $('generate'),
  transformation: $('transformation'), transformationLabel: $('transformation-label'),
  generateLabel: $('generate-label'), status: $('status'), error: $('error'),
  empty: $('empty-state'), output: $('output'), preview: $('preview'),
  sourceView: $('source-preview'), source: $('markdown-source'),
  sheetTab: $('view-sheet'), sourceTab: $('view-source'),
  copy: $('copy'), download: $('download'), openFile: $('open-file'), fileInput: $('file-input'),
};

// One catalog per content profile, loaded on first use.
const state = { catalog: null, catalogs: {}, markdown: '', character: null, selectedView: 'sheet' };

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
    fillSelect(els.subclass, catalog.subclassesOf(els.cls.value));
    els.subclass.disabled = false;
    els.subclass.title = '';
  }
}

function syncSecondAncestry() {
  // A fixed second ancestry may not equal the first one.
  fillSelect(els.secondAncestry, state.catalog.ancestries.filter((a) => a.id !== els.ancestry.value));
  els.secondAncestryLabel.hidden = !els.mixed.checked;
}

function syncTransformations() {
  // Transformations exist only in the Hope & Fear profile and are explicit opt-in (default None).
  const list = state.catalog.transformations;
  const previous = els.transformation.value;
  els.transformation.replaceChildren(new Option('None', NO_TRANSFORMATION), new Option('Random', RANDOM_TRANSFORMATION));
  for (const t of [...list].sort((a, b) => a.name.localeCompare(b.name))) els.transformation.add(new Option(t.name, t.id));
  els.transformation.value = [RANDOM_TRANSFORMATION, ...list.map((t) => t.id)].includes(previous) ? previous : NO_TRANSFORMATION;
  els.transformationLabel.hidden = list.length === 0;
}

/** Fills every selector from the current catalog, keeping choices that are still available. */
function applyCatalog() {
  const { catalog } = state;
  fillSelect(els.ancestry, catalog.ancestries);
  fillSelect(els.community, catalog.communities);
  fillSelect(els.cls, catalog.classes);
  syncSubclassOptions();
  syncSecondAncestry();
  syncTransformations();
}

async function selectContent(readJson) {
  const profile = els.content.value;
  els.generate.disabled = true;
  try {
    state.catalogs[profile] ??= await loadCatalog(readJson, { contentProfile: profile });
    state.catalog = state.catalogs[profile];
    applyCatalog();
    showError('');
    announce(`${state.catalog.contentLabel} content selected.`);
  } catch (error) {
    showError(`Could not load ${profile} game data: ${error.message}`);
    els.content.value = state.catalog?.contentProfile ?? 'core';
  } finally {
    els.generate.disabled = !state.catalog;
  }
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = !message;
}

function announce(message) { els.status.textContent = message; }

function switchView(view, { focus = false } = {}) {
  state.selectedView = view === 'source' ? 'source' : 'sheet';
  const source = state.selectedView === 'source';
  els.preview.hidden = source;
  els.sourceView.hidden = !source;
  els.sheetTab.setAttribute('aria-selected', String(!source));
  els.sourceTab.setAttribute('aria-selected', String(source));
  els.sheetTab.classList.toggle('is-active', !source);
  els.sourceTab.classList.toggle('is-active', source);
  els.sheetTab.tabIndex = source ? -1 : 0;
  els.sourceTab.tabIndex = source ? 0 : -1;
  if (focus) (source ? els.sourceView : els.preview).focus();
}

function showSheet(markdown, character, message) {
  state.character = character;
  state.markdown = markdown;
  els.preview.innerHTML = renderCharacterSheet(markdown);
  els.source.textContent = markdown; // never insert untrusted Markdown as HTML
  els.empty.hidden = true;
  els.output.hidden = false;
  switchView('sheet');
  showError('');
  announce(message);
  // On phones the options precede the sheet: bring the new result into view.
  if (window.matchMedia('(max-width: 1080px)').matches) {
    els.output.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
}

function generate() {
  showError('');
  try {
    const character = generateCharacter({
      level: Number(els.level.value),
      ancestryId: els.ancestry.value || null,
      communityId: els.community.value || null,
      classId: els.cls.value || null,
      subclassId: els.subclass.value || null,
      contentProfile: state.catalog.contentProfile,
      secondAncestryId: (els.mixed.checked && els.secondAncestry.value) || null,
      transformationId: [NO_TRANSFORMATION, RANDOM_TRANSFORMATION].includes(els.transformation.value) ? null : els.transformation.value,
      options: { mixedAncestry: els.mixed.checked, transformation: els.transformation.value === RANDOM_TRANSFORMATION },
    }, state.catalog);
    const markdown = renderCharacterMarkdown(character, state.catalog);
    showSheet(markdown, character, `Generated ${character.flavor.name}.`);
    els.generateLabel.textContent = 'Regenerate character';
  } catch (error) {
    // Keep the last *valid* sheet instead of showing invalid partial output.
    showError(error instanceof GenerationError ? error.message : `Generation failed: ${error.message}`);
    if (error.details?.length) console.error('Generation diagnostics', error.details);
  }
}

async function openMarkdownFile(file) {
  if (!file) return;
  if (!/\.(?:md|markdown)$/i.test(file.name)) { showError('Choose a Markdown (.md) character file.'); return; }
  if (file.size > 2 * 1024 * 1024) { showError('That file is too large. The limit is 2 MB.'); return; }
  try {
    const markdown = await file.text();
    if (!markdown.trim()) throw new Error('The selected file is empty.');
    const name = sheetNameFromMarkdown(markdown);
    // Import is view-only. It never runs generation, rule validation or editing.
    const virtualCharacter = { flavor: { name }, seed: 'imported' };
    showSheet(markdown, virtualCharacter, `Opened ${file.name}.`);
  } catch (error) {
    showError(`Could not open file: ${error.message}`);
  } finally {
    els.fileInput.value = '';
  }
}

async function copyMarkdown() {
  if (!state.markdown) return;
  let copied = false;
  try {
    await navigator.clipboard.writeText(state.markdown);
    copied = true;
  } catch {
    // Fallback for browsers that restrict async clipboard access.
    const area = document.createElement('textarea');
    area.value = state.markdown;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    copied = document.execCommand('copy');
    area.remove();
  }
  if (copied) {
    els.copy.textContent = 'Copied ✓';
    window.setTimeout(() => { els.copy.textContent = 'Copy Markdown'; }, 1800);
  }
  announce(copied ? 'Markdown copied to clipboard.' : 'Copy failed. Use Download .md instead.');
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
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(`Downloaded ${file.filename}.`);
}

async function init() {
  // Viewing an existing .md works even when the local game-data catalog fails.
  els.openFile.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => openMarkdownFile(els.fileInput.files[0]));
  els.sheetTab.addEventListener('click', () => switchView('sheet', { focus: true }));
  els.sourceTab.addEventListener('click', () => switchView('source', { focus: true }));
  for (const tab of [els.sheetTab, els.sourceTab]) {
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const next = tab === els.sheetTab ? els.sourceTab : els.sheetTab;
      next.focus();
      switchView(next === els.sheetTab ? 'sheet' : 'source');
    });
  }
  els.copy.addEventListener('click', copyMarkdown);
  els.download.addEventListener('click', downloadMarkdown);

  const readJson = async (path) => {
    const response = await fetch(new URL(`../data/${path}`, import.meta.url));
    if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`);
    return response.json();
  };
  try {
    els.content.value = 'core';
    state.catalog = await loadCatalog(readJson, { contentProfile: 'core' });
    state.catalogs.core = state.catalog;
  } catch (error) {
    showError(`Could not load game data: ${error.message}. Serve the folder over HTTP (see README). Existing .md files can still be opened.`);
    return;
  }
  applyCatalog();
  els.content.addEventListener('change', () => selectContent(readJson));
  els.cls.addEventListener('change', syncSubclassOptions);
  els.ancestry.addEventListener('change', syncSecondAncestry);
  els.mixed.addEventListener('change', syncSecondAncestry);
  els.form.addEventListener('submit', (event) => { event.preventDefault(); generate(); });
  els.generate.disabled = false;
  $('version').textContent = `QuickSheet ${GENERATOR_VERSION} - data ${state.catalog.dataVersion}`;
  announce('Ready. Choose options and generate your character.');
}

init();
