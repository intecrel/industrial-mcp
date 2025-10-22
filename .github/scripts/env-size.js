// Save as .github/scripts/env-size.js
const { Buffer } = require('buffer');

const entries = Object.entries(process.env).map(([k, v]) => {
  const val = v ?? '';
  // size as key=value bytes (approx how providers count)
  const sizeBytes = Buffer.byteLength(`${k}=${val}`, 'utf8');
  return { key: k, sizeBytes };
});

entries.sort((a, b) => b.sizeBytes - a.sizeBytes);

const total = entries.reduce((s, e) => s + e.sizeBytes, 0);

console.log(`Total env size: ${(total / 1024).toFixed(2)} KB (${total} bytes)`);
console.log('Top env vars by size:');
entries.slice(0, 50).forEach((e, i) => {
  console.log(`${i + 1}. ${e.key} — ${e.sizeBytes} bytes`);
});

if (total > 64 * 1024) {
  console.error('ERROR: Total environment size exceeds 64KB');
  process.exit(2);
}