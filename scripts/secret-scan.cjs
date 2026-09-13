#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const EXTENSIONS = new Set(['.js','.mjs','.cjs','.json','.html','.css','.md','.sql','.yml','.yaml','.webmanifest','.txt']);
const IGNORE_DIRS = new Set(['.git','node_modules','dist','build','coverage']);
const FIXTURE_MARKER = 'pink-secret-scan-fixture';
const findings = [];

const rules = [
  ['github-token', /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ['openai-style-key', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{30,}\b/g]
];

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch (_) { return null; }
}

function inspectJwt(file, lineNumber, token) {
  const payload = decodeJwtPayload(token);
  if (!payload) return;
  if (payload.role === 'service_role') findings.push({ file, line: lineNumber, rule: 'supabase-service-role-jwt' });
}

function inspectFile(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    // Only an explicitly marked synthetic fixture line may bypass matching.
    // Tests remain scanned normally, so an accidental real secret elsewhere still fails CI.
    if (line.includes(FIXTURE_MARKER)) return;
    for (const [name, regex] of rules) {
      regex.lastIndex = 0;
      if (regex.test(line)) findings.push({ file: rel, line: index + 1, rule: name });
    }
    for (const token of line.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g) || []) inspectJwt(rel, index + 1, token);
    if (/\b(?:PASSWORD|PRIVATE_KEY|SERVICE_ROLE_KEY|API_SECRET|CLIENT_SECRET)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(line)) {
      findings.push({ file: rel, line: index + 1, rule: 'sensitive-assignment' });
    }
  });
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (EXTENSIONS.has(path.extname(entry.name)) || entry.name === 'Dockerfile') inspectFile(full);
  }
}

walk(ROOT);

if (findings.length) {
  console.error('Secret scan FAILED');
  for (const finding of findings) console.error(`${finding.file}:${finding.line} ${finding.rule}`);
  process.exit(1);
}
console.log('Secret scan: OK — no private credential patterns detected.');
