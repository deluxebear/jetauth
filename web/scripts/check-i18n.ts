#!/usr/bin/env tsx
// Fails with non-zero exit if en.ts and zh.ts have differing key sets.
import en from "../src/locales/en";
import zh from "../src/locales/zh";

const enKeys = new Set(Object.keys(en));
const zhKeys = new Set(Object.keys(zh));

const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k)).sort();
const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k)).sort();

if (missingInZh.length === 0 && missingInEn.length === 0) {
  console.log(`✓ i18n parity: ${enKeys.size} keys across en and zh`);
  process.exit(0);
}

console.error("✗ i18n key mismatch detected.\n");
if (missingInZh.length) {
  console.error(`Missing in zh.ts (${missingInZh.length}):`);
  for (const k of missingInZh) console.error(`  - ${k}`);
}
if (missingInEn.length) {
  console.error(`\nMissing in en.ts (${missingInEn.length}):`);
  for (const k of missingInEn) console.error(`  - ${k}`);
}
process.exit(1);
