import assert from 'node:assert/strict';
import { PlanningFlow, SandboxPolicy, PermissionProfile } from '../packages/agentic-runtime/index.mjs';
import { AgentRole } from '../packages/agents/index.mjs';
import { RiskLevel } from '../packages/contracts/index.mjs';

const flow = new PlanningFlow().build('Pesquise na web, implemente no GitHub e rode Playwright com revisão de segurança');
assert.ok(flow.some((x) => x.role === AgentRole.RESEARCH));
assert.ok(flow.some((x) => x.role === AgentRole.DEVELOPER));
assert.ok(flow.some((x) => x.role === AgentRole.QA));
assert.ok(flow.some((x) => x.role === AgentRole.SECURITY));

const observer = new SandboxPolicy({ profile:PermissionProfile.OBSERVER });
assert.equal(observer.evaluate({ role:AgentRole.RESEARCH, risk:RiskLevel.READ_ONLY }).allowed, true);
assert.equal(observer.evaluate({ role:AgentRole.DEVELOPER, risk:RiskLevel.LOW }).allowed, false);

const developer = new SandboxPolicy({ profile:PermissionProfile.DEVELOPER });
assert.equal(developer.evaluate({ role:AgentRole.DEVELOPER, risk:RiskLevel.MEDIUM }).allowed, true);
assert.equal(developer.evaluate({ role:AgentRole.SECURITY, risk:RiskLevel.MEDIUM }).allowed, false);

console.log('Pink Next agentic governance contracts: PASS');
