import { eventBus } from '../core/event-bus.mjs';
import { TaskRuntime } from '../task-runtime/index.mjs';
import { LayeredMemory } from '../memory/index.mjs';
import { ContextCompiler } from '../context/index.mjs';
import { createLegacyCapabilityCatalog } from '../tools/index.mjs';
import { SkillRegistry } from '../skills/index.mjs';
import { TraceStore } from '../observability/index.mjs';
import { constraints, approvals } from '../security/index.mjs';
import { PinkSupervisor } from '../agents/index.mjs';
import { EvolutionEngine } from '../evolution/index.mjs';
import { SatelliteRegistry } from '../satellite/index.mjs';

export function createPinkNextRuntime({ config = {}, storage = null } = {}) {
  const taskRuntime = new TaskRuntime({ storage });
  const memory = new LayeredMemory();
  const contextCompiler = new ContextCompiler();
  const tools = createLegacyCapabilityCatalog(config);
  const skills = new SkillRegistry();
  const traces = new TraceStore();
  const satellites = new SatelliteRegistry();
  const security = { constraints, approvals };
  const supervisor = new PinkSupervisor({ taskRuntime, tools, contextCompiler, memory, security, traces });
  const evolution = new EvolutionEngine({ traces });

  const runtime = {
    version: 'next-0.1.0', eventBus, taskRuntime, memory, contextCompiler, tools, skills, traces, satellites, security, supervisor, evolution,
    snapshot() {
      return {
        version: this.version,
        tasks: taskRuntime.list(),
        capabilities: tools.list(),
        skills: skills.list(),
        satellites: satellites.list(),
        evolution: evolution.list()
      };
    }
  };
  eventBus.emit('pinknext:ready', runtime.snapshot());
  return runtime;
}
