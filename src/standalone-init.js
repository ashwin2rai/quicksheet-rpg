/* Runs inside each standalone HTML character sheet; intentionally no imports.
   Saving creates a new file because browsers cannot overwrite opened files. */
(function () {
  'use strict';
  const root = document.getElementById('portable-sheet');
  const encoded = document.getElementById('quicksheet-session-data');
  const original = JSON.parse(encoded.textContent);
  const runtime = window.QuickSheetFolio;
  const controller = runtime.mount(root, original);
  const themeButton = document.getElementById('portable-theme');
  const status = document.getElementById('portable-status');

  runtime.applyTheme(themeButton, original.theme);
  themeButton.addEventListener('click', () => runtime.applyTheme(themeButton, document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

  function download(content, filename, mimeType) {
    runtime.download(content, filename, mimeType);
    status.textContent = `Downloaded ${filename}.`;
  }
  document.getElementById('portable-save-html').addEventListener('click', () => {
    // Persist in the embedded JSON, including notes and marks. This HTML
    // already carries its CSS, runtime JS, and original Markdown inline.
    const snapshot = controller.snapshot();
    const data = { ...original, ...snapshot, theme: document.documentElement.dataset.theme };
    encoded.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    download(`<!doctype html>\n${document.documentElement.outerHTML}`, original.htmlFilename, 'text/html;charset=utf-8');
  });
  document.getElementById('portable-save-md').addEventListener('click', () => {
    const markdown = runtime.composeMarkdown(original.baseMarkdown, controller.snapshot());
    download(markdown, original.markdownFilename, 'text/markdown;charset=utf-8');
  });
})();
