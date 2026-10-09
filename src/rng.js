// Seeded pseudo-random number generation. All game randomness flows through an
// Rng instance created here so that identical inputs + seed + data version give
// identical characters. Never call Math.random() elsewhere (a test enforces it).

// cyrb128: hashes a string seed into four 32-bit state words.
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

// sfc32: small, fast, well-distributed 128-bit-state generator.
function sfc32(a, b, c, d) {
  return function next() {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function createRng(seed) {
  if (seed === undefined || seed === null || String(seed).length === 0) {
    throw new Error('createRng requires a non-empty seed');
  }
  const next = sfc32(...cyrb128(String(seed)));
  for (let i = 0; i < 12; i++) next(); // discard warm-up outputs

  const rng = {
    seed: String(seed),
    next,
    /** Integer in [min, max], inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(list) {
      if (!list.length) throw new Error('rng.pick called with an empty list');
      return list[Math.floor(next() * list.length)];
    },
    /** Picks one item; weightOf(item) must be >= 0 and at least one weight > 0. */
    weighted(list, weightOf) {
      const weights = list.map((item) => Math.max(0, weightOf(item)));
      const total = weights.reduce((a, b) => a + b, 0);
      if (!(total > 0)) throw new Error('rng.weighted called with no positive weights');
      let roll = next() * total;
      for (let i = 0; i < list.length; i++) {
        roll -= weights[i];
        if (roll < 0) return list[i];
      }
      return list[list.length - 1];
    },
    /** k distinct items, chosen by weight without replacement, in draw order. */
    weightedSample(list, k, weightOf = () => 1) {
      if (k > list.length) throw new Error(`Cannot sample ${k} items from ${list.length}`);
      const pool = [...list];
      const out = [];
      while (out.length < k) {
        const item = rng.weighted(pool, weightOf);
        out.push(item);
        pool.splice(pool.indexOf(item), 1);
      }
      return out;
    },
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return rng;
}

/** Unpredictable default seed (browser and Node both expose Web Crypto). */
export function randomSeed() {
  const words = new Uint32Array(2);
  globalThis.crypto.getRandomValues(words);
  return Array.from(words, (w) => w.toString(36).padStart(7, '0')).join('');
}
