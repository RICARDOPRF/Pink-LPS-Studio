import assert from 'node:assert/strict';
import { PinkSatelliteClient } from '../packages/satellite/client.mjs';

class MemoryStorage {
  constructor(){ this.map = new Map(); }
  getItem(k){ return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k,v){ this.map.set(k,String(v)); }
  removeItem(k){ this.map.delete(k); }
}

const calls = [];
const storage = new MemoryStorage();
const responses = [
  { ok:true, service:'pink-satellite', version:'1.0.0', deviceId:'dev-1', name:'Pink Satellite Windows', capabilities:[{id:'system.snapshot',state:'available',risk:'READ_ONLY'}] },
  { ok:true, sessionToken:'session-123', device:{deviceId:'dev-1',name:'Pink Satellite Windows',platform:'windows',capabilities:[{id:'system.snapshot',state:'available',risk:'READ_ONLY'}]} },
  { ok:true, capability:'system.snapshot', result:{platform:'Windows',deviceId:'dev-1'} },
  { ok:false, error:'local_approval_required', capability:'screen.capture', risk:'SENSITIVE_READ', __status:428 },
  { ok:true, approvalId:'apr-1', capability:'screen.capture', risk:'SENSITIVE_READ' },
  { ok:true, approvalToken:'approval-1', capability:'screen.capture' },
  { ok:true, capability:'screen.capture', result:{mime:'image/png',base64:'aGVsbG8=',bytes:5} },
];

const fetchImpl = async (url, options={}) => {
  calls.push({url,options});
  const payload = responses.shift();
  assert.ok(payload, `unexpected fetch ${url}`);
  const status = payload.__status || 200;
  const body = {...payload}; delete body.__status;
  return { ok: status >= 200 && status < 300, status, async json(){ return body; } };
};

const client = new PinkSatelliteClient({ endpoint:'http://127.0.0.1:8777', fetchImpl, storage });
const info = await client.probe();
assert.equal(info.service,'pink-satellite');
assert.equal(client.snapshot().paired,false);

const device = await client.pair('123456');
assert.equal(device.deviceId,'dev-1');
assert.equal(storage.getItem('pink.next.satellite.session'),'session-123');
assert.equal(client.snapshot().paired,true);

const system = await client.invoke('system.snapshot');
assert.equal(system.result.platform,'Windows');
assert.match(calls[2].options.headers.Authorization,/Bearer session-123/);

await assert.rejects(() => client.invoke('screen.capture'), (error) => error.status === 428 && error.payload.error === 'local_approval_required');
const request = await client.requestApproval('screen.capture');
assert.equal(request.approvalId,'apr-1');
const approval = await client.confirmApproval(request.approvalId,'654321');
assert.equal(approval.approvalToken,'approval-1');
const screen = await client.invoke('screen.capture',{}, {approvalToken:approval.approvalToken});
assert.equal(screen.result.mime,'image/png');
assert.equal(calls.at(-1).options.headers['X-Pink-Approval'],'approval-1');

client.disconnect();
assert.equal(storage.getItem('pink.next.satellite.session'),null);
assert.equal(client.snapshot().paired,false);

console.log('Pink Satellite browser client contracts: PASS');
