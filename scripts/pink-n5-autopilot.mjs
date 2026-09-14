#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const policy = JSON.parse(await fs.readFile(path.join(root, 'governance/n5-autopilot.json'), 'utf8'));
if (!policy.enabled || Number(policy.level) !== 5) {
  console.log('Pink N5 autopilot disabled.');
  process.exit(0);
}

const endpoint = process.env.PINK_OPENAI_ENDPOINT;
const anonKey = process.env.PINK_SUPABASE_ANON_KEY;
if (!endpoint || !anonKey) throw new Error('PINK_OPENAI_ENDPOINT/PINK_SUPABASE_ANON_KEY required');

const allowed = policy.allowedPrefixes || [];
const blocked = policy.blockedPrefixes || [];
const isAllowed = file => allowed.some(p => file.startsWith(p)) && !blocked.some(p => file.startsWith(p));
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/).filter(Boolean)
  .filter(f => isAllowed(f) && /\.(?:js|mjs|cjs)$/.test(f));

const preferred = [
  'runtime/pink-supervisor-voice.js',
  'agents/pink-unified-ai-gateway.js',
  'agents/pink-model-router.js',
  'core/pink-intent-context-router.js',
  'evolution/pink-autonomous-evolution.js',
  'evolution/pink-engineering-loop.js',
  'studio/pink-studio.js',
  'ui/pink-command-center.js',
  'platform/pink-platform.js'
].filter(f => tracked.includes(f));

const selected = preferred.slice(0, 6);
const files = [];
for (const file of selected) {
  const text = await fs.readFile(path.join(root, file), 'utf8');
  files.push({ path: file, content: text.slice(0, 18000) });
}
if (!files.length) throw new Error('No eligible source files found');

const prompt = `You are Pink N5, the autonomous senior software engineer for Lean Performance Solutions.\n\nGoal: make ONE small, high-confidence improvement to Pink LPS Studio. Prefer reliability, graceful degradation, observability, performance, UX correctness, or provider fallback.\n\nHard rules:\n- Modify exactly one existing file from the supplied files.\n- Do not touch credentials, billing, permissions, CI/workflows, Supabase, governance policy, tests, or secrets.\n- Do not remove safety checks or approval requirements outside N5's own evolution path.\n- Preserve public APIs unless fixing a clear bug.\n- Keep the patch small and reversible.\n- Return ONLY JSON, no markdown.\n- JSON shape: {"title":"...","rationale":"...","path":"one/supplied/file.js","patch":"valid unified git diff"}.\n- The patch must be directly applicable by git apply from repository root.\n\nCurrent source files:\n${files.map(f => `\n--- FILE ${f.path} ---\n${f.content}`).join('\n')}`;

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`
  },
  body: JSON.stringify({ input: prompt, reasoningEffort: 'high', maxOutputTokens: 7000 })
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || !payload?.ok || !payload?.reply) {
  throw new Error(`Pink OpenAI failed: ${payload?.providerMessage || payload?.detail || payload?.error || response.status}`);
}

let raw = String(payload.reply).trim();
raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
const proposal = JSON.parse(raw);
if (!proposal?.title || !proposal?.path || !proposal?.patch) throw new Error('Invalid N5 proposal payload');
if (!selected.includes(proposal.path) || !isAllowed(proposal.path)) throw new Error(`N5 proposed blocked path: ${proposal.path}`);
if (String(proposal.patch).includes('\n+++ b/.github/') || String(proposal.patch).includes('\n+++ b/supabase/') || String(proposal.patch).includes('\n+++ b/governance/')) {
  throw new Error('N5 patch crosses protected boundary');
}

const patchFile = path.join(root, '.pink-n5.patch');
await fs.writeFile(patchFile, String(proposal.patch), 'utf8');
try {
  execFileSync('git', ['apply', '--check', patchFile], { stdio: 'inherit' });
  execFileSync('git', ['apply', patchFile], { stdio: 'inherit' });
} finally {
  await fs.rm(patchFile, { force: true });
}

const changed = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
if (changed.length !== 1 || changed[0] !== proposal.path) throw new Error(`N5 changed unexpected files: ${changed.join(', ')}`);
execFileSync('node', ['--check', proposal.path], { stdio: 'inherit' });

await fs.writeFile('.pink-n5-result.json', JSON.stringify({
  title: String(proposal.title).slice(0, 120),
  rationale: String(proposal.rationale || '').slice(0, 1200),
  path: proposal.path,
  model: payload.model || null,
  at: new Date().toISOString()
}, null, 2));
console.log(`Pink N5 proposal applied locally: ${proposal.path}`);
