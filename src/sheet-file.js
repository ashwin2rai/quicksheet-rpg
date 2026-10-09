// Pure helpers for exporting a sheet. The download content is always the exact
// Markdown string that is previewed and copied.

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
