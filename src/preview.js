// Minimal, escaping Markdown-to-HTML converter for the on-page preview.
// It supports only the constructs renderCharacterMarkdown emits (headings,
// paragraphs with hard line breaks, bullet lists, GFM tables, horizontal
// rules, emphasis, inline code and bare https links). All text is HTML-escaped
// before formatting, so the preview cannot inject markup.

export const escapeHtml = (text) =>
  String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inline(raw) {
  const codeSpans = [];
  let text = escapeHtml(raw).replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  text = text
    .replace(/\\\|/g, '|')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/(^|[\s(])(https:\/\/[^\s<)]+[^\s<).,])/g, '$1<a href="$2" rel="noopener noreferrer" target="_blank">$2</a>');
  return text.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codeSpans[Number(i)]}</code>`);
}

const splitRow = (line) =>
  line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim());

export function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) { html.push('<hr>'); i++; continue; }

    if (line.startsWith('|') && i + 1 < lines.length && /^\|\s*:?-{3,}/.test(lines[i + 1])) {
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : null));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(splitRow(lines[i++]));
      const cellHtml = (tag, text, col) => `<${tag}${aligns[col] ? ` style="text-align:${aligns[col]}"` : ''}>${inline(text)}</${tag}>`;
      html.push(
        '<div class="table-wrap"><table>',
        `<thead><tr>${header.map((h, col) => cellHtml('th', h, col)).join('')}</tr></thead>`,
        `<tbody>${rows.map((r) => `<tr>${r.map((cell, col) => cellHtml('td', cell, col)).join('')}</tr>`).join('')}</tbody>`,
        '</table></div>',
      );
      continue;
    }

    if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      html.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    const paragraph = [];
    // A pipe outside a valid table is ordinary text, not a reason to stall.
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|- |-{3,}\s*$)/.test(lines[i])) {
      if (paragraph.length && lines[i].startsWith('|') && /^\|\s*:?-{3,}/.test(lines[i + 1] ?? '')) break;
      paragraph.push(lines[i++]);
    }
    html.push(`<p>${paragraph.map((l, idx) => inline(l.replace(/ {2,}$/, '')) + (idx < paragraph.length - 1 ? (/ {2,}$/.test(l) ? '<br>' : ' ') : '')).join('')}</p>`);
  }
  return html.join('\n');
}
