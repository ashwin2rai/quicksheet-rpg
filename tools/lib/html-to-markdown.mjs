// Converts the small HTML vocabulary used in Old Gus's SRD data strings into
// portable Markdown. Throws on any tag it does not understand so that upstream
// changes are noticed instead of silently mangled.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  minus: '-', ndash: '–', mdash: '—', half: '½', dagger: '†',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', times: '×',
};

export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return String.fromCodePoint(code);
    }
    if (!(name in ENTITIES)) throw new Error(`Unknown HTML entity ${match}`);
    return ENTITIES[name];
  });
}

export function htmlToMarkdown(html) {
  let s = String(html).replace(/\r?\n/g, ' ');
  s = s.replace(/<a\b[^>]*>(.*?)<\/a>/g, '$1');
  s = s.replace(/<span\b[^>]*>(.*?)<\/span>/g, '$1');
  s = s.replace(/<strong>\s*<em>(.*?)<\/em>\s*<\/strong>/g, '***$1***');
  s = s.replace(/<em>\s*<strong>(.*?)<\/strong>\s*<\/em>/g, '***$1***');
  s = s.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
  s = s.replace(/<em>(.*?)<\/em>/g, '*$1*');
  s = s.replace(/<li>(.*?)<\/li>/g, (_, inner) => `\n- ${inner.replace(/<\/?p>/g, ' ')}\n`);
  s = s.replace(/<\/?ul\b[^>]*>/g, '\n');
  s = s.replace(/<\/?p\b[^>]*>/g, '\n');
  s = s.replace(/<br\s*\/?>/g, '\n');
  const leftover = s.match(/<\/?[a-z][^>]*>/i);
  if (leftover) throw new Error(`Unsupported HTML tag ${leftover[0]} in: ${html.slice(0, 120)}`);
  s = decodeEntities(s);
  const lines = s.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return lines
    .map((line, i) => {
      if (i === 0) return line;
      const listContinues = line.startsWith('- ') && lines[i - 1].startsWith('- ');
      return (listContinues ? '\n' : '\n\n') + line;
    })
    .join('');
}

// Splits "<strong><em>Name:</em></strong> rules..." into { name, text }.
export function splitNamedFeature(html) {
  const match = String(html).match(/^\s*(?:<p>)?\s*<strong>\s*<em>\s*([^<:]+?)\s*:\s*<\/em>\s*<\/strong>\s*/);
  if (!match) throw new Error(`Feature has no leading name: ${String(html).slice(0, 120)}`);
  const name = decodeEntities(match[1]).trim();
  const rest = (match[0].includes('<p>') ? '<p>' : '') + html.slice(match[0].length);
  return { name, text: htmlToMarkdown(rest) };
}

export function slugify(text) {
  return decodeEntities(String(text))
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
