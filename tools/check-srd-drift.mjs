#!/usr/bin/env node
// SRD Drift Check: downloads each upstream source in data/srd-sources.lock.json
// and compares a SHA-256 fingerprint with the approved pin. It never edits pins,
// imports data or deploys; a human reviews any drift (docs/data-provenance.md).
//
// Usage: node tools/check-srd-drift.mjs [--strict] [--print-current]
//   exit 0: no drift (inconclusive results are warnings unless --strict)
//   exit 1: drift detected
//   exit 2: inconclusive with --strict (network error, blocked, or unpinned)
//   --print-current: print current fingerprints for a manual pin refresh

import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const USER_AGENT = 'Mozilla/5.0 (compatible; QuickSheet-SRD-Drift-Check/1.0; +https://github.com/ashwin2rai/quicksheet-rpg)';

/** Fingerprint modes: raw bytes, the sorted set of linked PDFs, or normalized visible text. */
export function fingerprint(mode, body) {
  if (mode === 'sha256') return sha256(body);
  const html = Buffer.from(body).toString('utf8');
  if (mode === 'pdf-links') {
    const links = [...new Set([...html.matchAll(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)].map((m) => m[1]))].sort();
    return { value: sha256(links.join('\n')), detail: links };
  }
  if (mode === 'text') {
    const text = html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return sha256(text);
  }
  throw new Error(`Unknown fingerprint mode ${mode}`);
}

export async function fetchWithRetry(url, { fetchImpl = fetch, retries = 3, timeoutMs = 20000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status < 500 && response.status !== 429) break; // 4xx other than 429 will not improve on retry
    } catch (e) {
      lastError = e;
    }
    if (attempt < retries) await sleep(1000 * 2 ** (attempt - 1));
  }
  throw lastError;
}

/** @returns {Promise<Array<{id, url, status: 'unchanged'|'drift'|'unpinned'|'inconclusive', pinned, current, detail}>>} */
export async function checkSources(lock, options = {}) {
  const results = [];
  for (const source of lock.sources) {
    const url = source.currentUrl ?? source.url;
    const mode = source.mode ?? 'sha256';
    const pinned = source.sha256 ?? null;
    const result = { id: source.id, url, mode, pinned, current: null, status: 'inconclusive', detail: '' };
    try {
      const body = await fetchWithRetry(url, options);
      const fp = fingerprint(mode, body);
      result.current = typeof fp === 'string' ? fp : fp.value;
      if (fp.detail) result.links = fp.detail;
      if (!pinned) result.status = 'unpinned';
      else result.status = result.current === pinned ? 'unchanged' : 'drift';
    } catch (e) {
      result.detail = `Could not download: ${e.message}. This is inconclusive, not "unchanged".`;
    }
    results.push(result);
  }
  return results;
}

export function summarize(results, lock) {
  const icon = { unchanged: 'OK', drift: 'DRIFT', unpinned: 'UNPINNED', inconclusive: 'INCONCLUSIVE' };
  const lines = [
    '# SRD Drift Check',
    '',
    `Pins last reviewed: ${lock.lastReviewed}`,
    '',
    '| Source | Status | Mode | Pinned | Current | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.id} | ${icon[r.status]} | ${r.mode} | ${r.pinned ? r.pinned.slice(0, 12) : '-'} | ${r.current ? r.current.slice(0, 12) : '-'} | ${r.detail || r.url} |`),
    '',
  ];
  if (results.some((r) => r.status === 'drift')) {
    lines.push(
      '## Next steps',
      '',
      '1. Review the upstream diff. Old Gus often makes editorial changes, so a hash change does not mean game rules changed.',
      '2. Run `npm run import:og -- <checkout> --check` to see which data files would change.',
      '3. Update curation, data and tests as needed, then refresh `data/srd-sources.lock.json` with a review note.',
      '4. If the license (DPCGL) changed, read the new terms and update the attribution before the next release.',
      '',
    );
  }
  return lines.join('\n');
}

async function main() {
  const strict = process.argv.includes('--strict');
  const lockPath = fileURLToPath(new URL('../data/srd-sources.lock.json', import.meta.url));
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const results = await checkSources(lock);
  const summary = summarize(results, lock);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (process.argv.includes('--print-current')) {
    for (const r of results) console.log(`${r.id}\t${r.mode}\t${r.current ?? '(unavailable)'}${r.links ? `\t${r.links.join(' ')}` : ''}`);
  }
  for (const r of results.filter((x) => x.status === 'inconclusive' || x.status === 'unpinned')) {
    console.log(`::warning title=SRD Drift Check (${r.id})::${r.status}: ${r.detail || 'no approved pin yet'}`);
  }
  if (results.some((r) => r.status === 'drift')) {
    for (const r of results.filter((x) => x.status === 'drift')) console.log(`::error title=SRD drift (${r.id})::${r.url} changed: ${r.pinned} -> ${r.current}`);
    process.exit(1);
  }
  if (strict && results.some((r) => r.status !== 'unchanged')) process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`SRD Drift Check could not run: ${e.message}`);
    process.exit(2);
  });
}
