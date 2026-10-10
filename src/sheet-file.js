// Pure helpers for exporting a sheet: the exact Markdown string that is previewed and
// copied, or a standalone HTML folio with styles and the small interaction runtime
// embedded inline, so it opens directly from file:// with no other assets.
import { renderCharacterSheet } from './sheet-view.js';
import { escapeHtml } from './preview.js';

const safeScript = (text) => String(text).replace(/<\/script/gi, '<\\/script');
const jsonForScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export function safeFilename(characterName, seed) {
  const slug = (text) =>
    String(text ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  const parts = ['quicksheet', slug(characterName) || 'character', slug(seed).slice(0, 16)].filter(Boolean);
  return `${parts.join('-')}.md`;
}

export function buildDownload(markdown, character) {
  return {
    filename: safeFilename(character.flavor?.name, character.seed),
    mimeType: 'text/markdown;charset=utf-8',
    content: markdown,
  };
}

export function buildHtmlDownload({ baseMarkdown, character, session, stylesheet, runtime, bootstrap, theme }) {
  if (![stylesheet, runtime, bootstrap].every((s) => typeof s === 'string' && s.length)) throw new Error('Standalone HTML assets are missing.');
  const filename = safeFilename(character?.flavor?.name, character?.seed).replace(/\.md$/, '.html');
  const markdownFilename = filename.replace(/\.html$/, '.md');
  const chosenTheme = theme === 'dark' ? 'dark' : 'light';
  const data = {
    baseMarkdown, notes: session.notes ?? '', resources: session.resources ?? {},
    trackingEnabled: Boolean(session.trackingEnabled), theme: chosenTheme,
    htmlFilename: filename, markdownFilename,
  };
  const folio = renderCharacterSheet(baseMarkdown, { notes: session.notes ?? '' });
  const name = character?.flavor?.name || 'Character';
  const html = `<!doctype html>
<html lang="en" data-theme="${chosenTheme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(name)} — QuickSheet folio</title>
  <style>${safeScript(stylesheet)}
    /* The standalone file contains only the character, not the generator. */
    .standalone-topbar { max-width: 1210px; margin: 0 auto; padding: 18px 20px; display:flex; flex-wrap:wrap; justify-content:space-between; gap:14px; align-items:center; }
    .standalone-brand { font-size:20px; font-weight:800; letter-spacing:-.04em; }
    .standalone-brand span { color:var(--gold); }
    .standalone-controls { display:flex; flex-wrap:wrap; align-items:center; gap:9px; }
    .standalone-main { max-width:1210px; margin:10px auto 50px; padding:0 20px; }
    .standalone-help { max-width:1210px; margin:0 auto; padding:0 20px 15px; font-size:13px; color:inherit; opacity:.85; }
    .standalone-main .folio-page { max-width:unset; }
    @media(min-width:1050px) { .standalone-main .folio-columns { grid-template-columns:minmax(0,.91fr) minmax(0,1.09fr); } }
    @media(max-width:600px) { .standalone-topbar,.standalone-main,.standalone-help { padding-left:10px; padding-right:10px; } .standalone-controls { width:100%; } .standalone-controls button { flex:1; } }
    @media print { .standalone-topbar,.standalone-help {display:none!important;} .standalone-main { margin:0; padding:0; max-width:none;} }
  </style>
</head>
<body class="standalone-body">
  <header class="standalone-topbar">
    <div class="standalone-brand">quick<span>sheet</span> <small>• SAVED ADVENTURER'S FOLIO</small></div>
    <div class="standalone-controls">
      <button type="button" id="portable-theme" class="theme-toggle" aria-pressed="${chosenTheme === 'dark'}"><span data-theme-symbol aria-hidden="true">${chosenTheme === 'dark' ? '☼' : '☾'}</span><span data-theme-label>${chosenTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span></button>
      <button type="button" id="portable-save-md" class="quiet-button">Save .md</button>
      <button type="button" id="portable-save-html" class="download-button">↓ Save updated HTML</button>
    </div>
  </header>
  <p class="standalone-help">Slots and dice are visual-only. Make notes below, then choose <strong>Save updated HTML</strong> to keep changes in a new file. Nothing is uploaded.</p>
  <main id="portable-sheet" class="standalone-main">${folio}</main>
  <p id="portable-status" class="standalone-help" role="status" aria-live="polite"></p>
  <script type="application/json" id="quicksheet-session-data">${jsonForScript(data)}</script>
  <script>${safeScript(runtime)}</script>
  <script>${safeScript(bootstrap)}</script>
</body>
</html>`;
  return { filename, mimeType: 'text/html;charset=utf-8', content: html };
}
