const assert = require('node:assert');
const fs = require('node:fs');

const sql = fs.readFileSync('supabase/migrations/202609130143_pink_avatar_validation_gate.sql', 'utf8');

assert.match(sql, /validation_status text not null default 'pending'/, 'validation status column missing');
assert.match(sql, /rig_profile text not null default 'unknown'/, 'rig profile column missing');
assert.match(sql, /capabilities jsonb not null default '\{\}'::jsonb/, 'capability metadata column missing');
assert.match(sql, /validation_status in \('pending','approved','rejected'\)/, 'validation status constraint missing');
assert.match(sql, /rig_profile in \('unknown','static','humanoid','facial','facial-humanoid'\)/, 'rig profile constraint missing');
assert.match(sql, /not is_active or \([\s\S]*validation_status = 'approved'[\s\S]*rig_profile = 'facial-humanoid'/, 'active asset gate missing');
assert.match(sql, /Public can read validated active Pink avatar/, 'validated public read policy missing');
assert.match(sql, /create or replace function public\.activate_pink_avatar_asset/, 'atomic activation function missing');
assert.match(sql, /revoke all on function public\.activate_pink_avatar_asset\(uuid\) from public, anon, authenticated/, 'activation function must not be browser-callable');
assert.match(sql, /grant execute on function public\.activate_pink_avatar_asset\(uuid\) to service_role/, 'trusted activation path missing');

console.log('Pink avatar validation gate contract: OK');
