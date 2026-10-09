// The drift checker is tested with a fake fetch: normal CI never contacts upstream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkSources, fetchWithRetry, fingerprint, summarize } from '../tools/check-srd-drift.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const ok = (body) => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(body).buffer });
const status = (code) => ({ ok: false, status: code, arrayBuffer: async () => new ArrayBuffer(0) });
const noSleep = { sleep: async () => {} };

test('detects unchanged, drifted, unpinned and unreachable sources', async () => {
  const lock = {
    lastReviewed: '2026-10-09',
    sources: [
      { id: 'same', currentUrl: 'https://x/same', sha256: sha('A'), mode: 'sha256' },
      { id: 'changed', currentUrl: 'https://x/changed', sha256: sha('A'), mode: 'sha256' },
      { id: 'new', currentUrl: 'https://x/new', sha256: null, mode: 'sha256' },
      { id: 'blocked', currentUrl: 'https://x/blocked', sha256: sha('A'), mode: 'sha256' },
    ],
  };
  const pages = { 'https://x/same': ok('A'), 'https://x/changed': ok('B'), 'https://x/new': ok('C'), 'https://x/blocked': status(403) };
  const results = await checkSources(lock, { fetchImpl: async (url) => pages[url], ...noSleep });
  assert.deepEqual(results.map((r) => r.status), ['unchanged', 'drift', 'unpinned', 'inconclusive']);
  assert.match(results[3].detail, /inconclusive, not "unchanged"/);
  const md = summarize(results, lock);
  assert.match(md, /\| changed \| DRIFT \|/);
  assert.match(md, /## Next steps/);
});

test('pdf-links mode treats a changed download pointer as drift but ignores other page changes', () => {
  const a = '<a href="/srd/SRD-2.0.pdf">SRD</a><script>nonce=1</script>';
  const b = '<p>new banner</p><a href="/srd/SRD-2.0.pdf">SRD</a><script>nonce=2</script>';
  const c = '<a href="/srd/SRD-2.1.pdf">SRD</a>';
  assert.equal(fingerprint('pdf-links', a).value, fingerprint('pdf-links', b).value);
  assert.notEqual(fingerprint('pdf-links', a).value, fingerprint('pdf-links', c).value);
  assert.equal(fingerprint('text', '<p>Hi</p><script>x()</script>'), fingerprint('text', '<div> Hi </div>'));
});

test('retries server errors with backoff, but not client errors', async () => {
  let calls = 0;
  const flaky = async () => (++calls < 3 ? status(503) : ok('done'));
  assert.equal((await fetchWithRetry('u', { fetchImpl: flaky, ...noSleep })).toString(), 'done');
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(fetchWithRetry('u', { fetchImpl: async () => { calls++; return status(404); }, ...noSleep }), /HTTP 404/);
  assert.equal(calls, 1);
  await assert.rejects(fetchWithRetry('u', { fetchImpl: async () => { throw new Error('ENOTFOUND'); }, retries: 2, ...noSleep }), /ENOTFOUND/);
});
