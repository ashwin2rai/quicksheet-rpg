import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml } from '../src/preview.js';
import { safeFilename, buildDownload } from '../src/sheet-file.js';
import { generateCharacter } from '../src/generator.js';
import { renderCharacterMarkdown } from '../src/markdown.js';
import { getCatalog } from './helpers.js';

test('preview escapes HTML and renders the supported Markdown subset', () => {
  const html = markdownToHtml('# Title <script>alert(1)</script>\n\n**bold** and *em* and `code`  \nnext line\n\n- one\n- two\n\n| A | B |\n| --- | :---: |\n| x \\| y | z |\n\n---\n\nSee https://example.com/x.');
  assert.match(html, /<h1>Title &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/h1>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<strong>bold<\/strong> and <em>em<\/em> and <code>code<\/code><br>next line/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<td>x \| y<\/td><td style="text-align:center">z<\/td>/);
  assert.match(html, /<hr>/);
  assert.match(html, /<a href="https:\/\/example.com\/x" rel="noopener noreferrer" target="_blank">https:\/\/example.com\/x<\/a>\./);
});

test('preview renders every section of a real sheet', async () => {
  const catalog = await getCatalog();
  const md = renderCharacterMarkdown(generateCharacter({ seed: 'preview' }, catalog), catalog);
  const html = markdownToHtml(md);
  assert.equal((html.match(/<h2>/g) ?? []).length, (md.match(/^## /gm) ?? []).length);
  assert.equal((html.match(/<table>/g) ?? []).length, (md.match(/^\| --- |^\| :---: /gm) ?? []).length);
  assert.doesNotMatch(html, /\*\*|\n\| /);
});

test('safe filenames', () => {
  assert.equal(safeFilename('Aderyn Ashgrove', 'abc123'), 'quicksheet-aderyn-ashgrove-abc123.md');
  assert.equal(safeFilename('../../etc/passwd', 's'), 'quicksheet-etc-passwd-s.md');
  assert.equal(safeFilename('Élodie <Ø>', ''), 'quicksheet-elodie.md');
  assert.equal(safeFilename('', null), 'quicksheet-character.md');
  assert.match(safeFilename('x'.repeat(200), 'y'.repeat(50)), /^quicksheet-x{48}-y{16}\.md$/);
});

test('download content is exactly the previewed/copied Markdown string', async () => {
  const catalog = await getCatalog();
  const character = generateCharacter({ seed: 'download' }, catalog);
  const md = renderCharacterMarkdown(character, catalog);
  const file = buildDownload(md, character);
  assert.equal(file.content, md);
  assert.equal(file.mimeType, 'text/markdown;charset=utf-8');
  const bytes = new TextEncoder().encode(file.content);
  assert.equal(new TextDecoder('utf-8').decode(bytes), md);
});
