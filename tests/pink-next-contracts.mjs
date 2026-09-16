import assert from 'node:assert/strict';
import { TaskRuntime } from '../packages/task-runtime/index.mjs';
import { ConstraintRegister, ApprovalBroker, calculateRisk } from '../packages/security/index.mjs';
import { LayeredMemory } from '../packages/memory/index.mjs';
import { MemoryLayer, RiskLevel, CapabilityState } from '../packages/contracts/index.mjs';
import { ToolRegistry } from '../packages/tools/index.mjs';
import { SkillRegistry, discoverSkillCandidates } from '../packages/skills/index.mjs';
import { TraceStore, compareVariants } from '../packages/observability/index.mjs';
import { EvolutionEngine, EVOLUTION_POLICY } from '../packages/evolution/index.mjs';
import { SelfModel } from '../packages/self-model/index.mjs';
import { PulseEngine } from '../packages/pulse/index.mjs';
import { evaluateCutoverReadiness } from '../packages/migration/index.mjs';

const fakeStorage = (()=>{ const m=new Map(); return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}; })();
const tasks = new TaskRuntime({ storage:fakeStorage });
const task = tasks.create({ goal:'Auditar Pink', plan:['mapear','testar'] });
assert.equal(task.status,'queued');
tasks.start(task.id);
let updated = tasks.completeStep(task.id,{type:'test',source:'unit',summary:'mapa validado'});
assert.equal(updated.currentStep,1);
updated = tasks.pause(task.id,'human');
assert.equal(updated.status,'paused');
updated = tasks.resume(task.id);
assert.equal(updated.status,'running');
updated = tasks.completeStep(task.id,{type:'test',source:'unit',summary:'teste validado'});
assert.equal(updated.status,'completed');
assert.ok(tasks.get(task.id).checkpoints.length >= 3);

const constraints = new ConstraintRegister();
assert.equal(constraints.evaluate('merge this branch into main').allowed,false);
assert.equal(constraints.evaluate('deploy to production').allowed,false);
assert.equal(constraints.evaluate('read project status').allowed,true);
assert.equal(calculateRisk({manifest:1,host:3,payload:2,sourceTrust:1}),3);

const approvals = new ApprovalBroker();
const token = approvals.issue({ capability:'github.write',risk:RiskLevel.HIGH,scope:{repo:'pink'} });
assert.ok(token?.id);
assert.equal(approvals.consume(token.id,{capability:'github.write',scope:{repo:'pink'}}).ok,true);
assert.equal(approvals.consume(token.id,{capability:'github.write',scope:{repo:'pink'}}).ok,false);

const memory = new LayeredMemory();
memory.remember({layer:MemoryLayer.PERSISTENT,text:'NO EVIDENCE NO CLAIM',importance:1,type:'principle'});
memory.remember({layer:MemoryLayer.PROJECTS,text:'Pink LPS Studio',importance:.8,type:'project'});
assert.equal(memory.recall('evidence claim',{limit:1})[0].type,'principle');
assert.match(memory.digest('Pink'),/Pink LPS Studio/);

const tools = new ToolRegistry();
tools.register({id:'camera.open',title:'Camera',description:'Open camera',state:CapabilityState.AVAILABLE,tags:['vision']}, async()=>({ok:true}));
tools.register({id:'github.status',title:'GitHub Status',description:'Read CI',state:CapabilityState.AVAILABLE,readOnly:true,tags:['github','ci']}, async()=>({ok:true}));
assert.equal(tools.search('github ci')[0].id,'github.status');
assert.deepEqual(await tools.invoke('camera.open',{}),{ok:true});

const skills = new SkillRegistry();
const skill = skills.register({id:'ci-recovery',name:'CI Recovery',steps:[{tool:'github.status'}]});
assert.equal(skill.id,'ci-recovery');
const repeated = [{id:'1',events:[{type:'tool',name:'a'},{type:'tool',name:'b'}]},{id:'2',events:[{type:'tool',name:'a'},{type:'tool',name:'b'}]},{id:'3',events:[{type:'tool',name:'a'},{type:'tool',name:'b'}]}];
assert.equal(discoverSkillCandidates(repeated)[0].occurrences,3);

const traces = new TraceStore();
for(let i=0;i<3;i++){ const t=traces.start({variant:'baseline'}); t.startedAt-=100; traces.event(t,'tool',{name:'x'}); traces.finish(t,{success:true}); }
for(let i=0;i<3;i++){ const t=traces.start({variant:'candidate'}); t.startedAt-=50; traces.finish(t,{success:true}); }
const comparison = compareVariants(traces.list());
assert.equal(comparison.evidenceSufficient,true);
assert.ok(comparison.delta.latencyMs < 0);
assert.ok(comparison.delta.toolCalls < 0);

const evolution = new EvolutionEngine();
const candidate=evolution.propose({problem:'too many tool calls',hypothesis:'create skill',evidence:['trace-1']});
assert.equal(candidate.approvedForEvolution,false);
assert.equal(EVOLUTION_POLICY.canMergeMain,false);
evolution.approve(candidate.id);
const evaluated=evolution.attachBenchmark(candidate.id,traces.list());
assert.equal(evaluated.benchmark.evidenceSufficient,true);
assert.equal(evolution.readyForDraftPr(candidate.id),true);

const selfModel=new SelfModel({promotionThreshold:3});
selfModel.observe('evidence','Require evidence'); selfModel.observe('evidence','Require evidence'); selfModel.observe('evidence','Require evidence');
assert.match(selfModel.compact(),/Require evidence/);

const pulse=new PulseEngine();
pulse.propose({title:'Review failure',reason:'Repeated failure',risk:'LOW'});
pulse.propose({title:'Danger',reason:'Critical action',risk:'CRITICAL'});
assert.equal(pulse.tick().length,1);

const cutover=evaluateCutoverReadiness({functionalParity:true,browserSmoke:true,behavioralEvals:true,securityReview:true,dataCompatibility:true,rollbackPlan:true,explicitHumanApproval:false});
assert.equal(cutover.ready,false);
assert.ok(cutover.failed.includes('explicitHumanApproval'));

console.log('Pink Next contracts: PASS');
