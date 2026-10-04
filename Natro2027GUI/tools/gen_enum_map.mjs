// =============================================================================
// Natro2027GUI - tools\gen_enum_map.mjs
// -----------------------------------------------------------------------------
// Regenerates bridge\enum_map.ahk from the upstream enum files. The upstream
// lib\enum\EnumStr.ahk / EnumInt.ahk are POSITIONAL (1-based arr) and can change
// on any version bump, so the indices are never hand-maintained.
//
// Run from the repo root:
//     node Natro2027GUI\tools\gen_enum_map.mjs
//
// Emits: Natro2027GUI\bridge\enum_map.ahk
// -----------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));      // ...\Natro2027GUI\tools
const guiDir = resolve(here, '..');                        // ...\Natro2027GUI
const rootDir = resolve(here, '..', '..');                 // ...\NatroMacro

const strSrc = join(rootDir, 'lib', 'enum', 'EnumStr.ahk');
const intSrc = join(rootDir, 'lib', 'enum', 'EnumInt.ahk');
const outPath = join(guiDir, 'bridge', 'enum_map.ahk');
const logPath = join(guiDir, 'runtime', 'gen_enum_map.log');

const lines = [];
function log(s) { lines.push(s); console.log(s); }

function extractNames(path) {
  const text = readFileSync(path, 'utf8');
  // Every double-quoted token in these files is a setting name or an intentional
  // empty placeholder (""). Use `*` (not `+`) so empty slots are captured too:
  // EnumInt.ahk has two empty placeholders at indices 62 and 224 that MUST stay
  // in place or every later index shifts. The "; N" comments contain no quotes.
  const names = [];
  const re = /"([^"]*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) names.push(m[1]);
  return names;
}

const strNames = extractNames(strSrc);
const intNames = extractNames(intSrc);

const strEmpty = strNames.filter((n) => n === '').length;
const intEmpty = intNames.filter((n) => n === '').length;
const intEmptyIdx = intNames.map((n, i) => (n === '' ? i + 1 : 0)).filter(Boolean);

log(`EnumStr.ahk -> ${strNames.length} names (${strEmpty} empty placeholders)`);
log(`EnumInt.ahk -> ${intNames.length} names (${intEmpty} empty placeholders at 1-based ${intEmptyIdx.join(', ')})`);
if (strNames.length !== 81) log(`WARNING: EnumStr.ahk has ${strNames.length} names (expected 81) - upstream changed?`);
if (intNames.length !== 368) log(`WARNING: EnumInt.ahk has ${intNames.length} names (expected 368) - upstream changed?`);

const sections = ['Boost','Collect','Gather','Planters','Quests','Settings','Status','Blender','Shrine'];
const secList = sections.map((s) => `"${s}"`).join(',');

const emitName = (name, isLast) => `        "${name}"${isLast ? '' : ','}`;

const out = [];
out.push('; =============================================================================');
out.push('; Natro2027GUI - bridge\\enum_map.ahk');
out.push('; GENERATED FILE - DO NOT EDIT BY HAND.');
out.push(`; Source  : lib\\enum\\EnumStr.ahk (${strNames.length} entries)`);
out.push(`;           lib\\enum\\EnumInt.ahk (${intNames.length} entries)`);
out.push('; Regenerate: node Natro2027GUI\\tools\\gen_enum_map.mjs');
out.push('; These indices are POSITIONAL (1-based) into the upstream arr, consumed by the');
out.push('; 0x5552 (int) / 0x5553 (str) settings bus. If a name is missing at runtime the');
out.push('; bridge fails loudly rather than posting a dead message.');
out.push('; =============================================================================');
out.push('');
out.push('#Requires AutoHotkey v2.0');
out.push('');
out.push('class EnumMap {');
out.push('    ; Sections for the 0x5553 string message (1-based), from upstream nm_setGlobalStr.');
out.push(`    static Sections := [${secList}]`);
out.push('');
out.push('    ; EnumStr.ahk, 1-based: Str[1] = "webhook"');
out.push('    static Str := [');
strNames.forEach((n, i) => out.push(emitName(n, i === strNames.length - 1)));
out.push('    ]');
out.push('');
out.push('    ; EnumInt.ahk, 1-based: Int[1] = "discordMode"');
out.push('    static Int := [');
intNames.forEach((n, i) => out.push(emitName(n, i === intNames.length - 1)));
out.push('    ]');
out.push('}');
out.push('');

const content = out.join('\r\n');
mkdirSync(join(guiDir, 'runtime'), { recursive: true });
writeFileSync(outPath, content, 'utf8');
writeFileSync(logPath, lines.join('\r\n') + '\r\n', 'utf8');

// Self-check: first/last names must survive.
const regen = readFileSync(outPath, 'utf8');
const ok = (s) => regen.includes(s);
const checks = [
  ok(`"${strNames[0]}"`), ok(`"${strNames[strNames.length - 1]}"`),
  ok(`"${intNames[0]}"`), ok(`"${intNames[intNames.length - 1]}"`),
];
log(`self-check first/last: str=${checks[0]}/${checks[1]} int=${checks[2]}/${checks[3]}`);
log(`wrote ${outPath} (${content.length} bytes)`);
if (checks.every(Boolean)) {
  log('RESULT: PASS');
} else {
  log('RESULT: FAIL - self-check failed');
  process.exit(1);
}
