import { eventBus } from '../core/event-bus.mjs';
import { TaskRuntime } from '../task-runtime/index.mjs';
import { LayeredMemory } from '../memory/index.mjs';
import { ContextCompiler } from '../context/index.mjs';
import { createLegacyCapabilityCatalog } from '../tools/index.mjs';
import { SkillRegistry } from '../skills/index.mjs';
import { TraceStore } from '../observability/index.mjs';
import { constraints, approvals } from '../security/index.mjs';
import { PinkSupervisor } from '../agents/index.mjs';
import { AgenticExecutionKernel } from '../agentic-runtime/index.mjs';
import { createDefaultGuardrails } from '../guardrails/index.mjs';
import { HandoffBroker } from '../handoffs/index.mjs';
import { MultiAgentOrchestrator } from '../orchestrator/index.mjs';
import { EvolutionEngine } from '../evolution/index.mjs';
import { SatelliteRegistry } from '../satellite/index.mjs';
import { PinkSatelliteClient } from '../satellite/client.mjs';
import { createLegacyCloudAdapter } from '../adapters/legacy-cloud.mjs';
import { ProjectBrainRegistry } from '../project-brain/index.mjs';
import { GraphitiProjectBrainAdapter } from '../project-brain/graphiti-adapter.mjs';
import { PinkTrainingStudio } from '../model-lab/index.mjs';
import { MiniMindAdapter } from '../model-lab/minimind-adapter.mjs';
import { PinkAgentLearningStudio } from '../agent-learning/index.mjs';
import { AgentLightningAdapter } from '../agent-learning/agent-lightning-adapter.mjs';
import { createPinkOSFoundation } from '../os-foundation/index.mjs';

export function createPinkNextRuntime({ config = {}, storage = null, satelliteStorage = globalThis.sessionStorage } = {}) {
  const taskRuntime = new TaskRuntime({ storage });
  const memory = new LayeredMemory();
  const contextCompiler = new ContextCompiler();
  const tools = createLegacyCapabilityCatalog(config);
  const skills = new SkillRegistry();
  const traces = new TraceStore();
  const satellites = new SatelliteRegistry();
  const satellite = new PinkSatelliteClient({ storage: satelliteStorage });
  const cloud = createLegacyCloudAdapter(config);
  const security = { constraints, approvals };
  const guardrails = createDefaultGuardrails();
  const handoffs = new HandoffBroker({ guardrails, traces });
  const supervisor = new PinkSupervisor({ taskRuntime, tools, contextCompiler, memory, security, traces });
  const agentic = new AgenticExecutionKernel({ taskRuntime, tools, security, traces, contextCompiler, memory, guardrails, handoffs });
  const orchestrator = new MultiAgentOrchestrator({ agentic, handoffs, traces, taskRuntime });
  const evolution = new EvolutionEngine({ traces });
  const projectBrains = new ProjectBrainRegistry();
  projectBrains.registerAdapter('graphiti', new GraphitiProjectBrainAdapter());
  const modelLab = new PinkTrainingStudio();
  modelLab.registerAdapter('minimind', new MiniMindAdapter());
  const agentLearning = new PinkAgentLearningStudio();
  agentLearning.registerAdapter('agent-lightning', new AgentLightningAdapter());
  const os = createPinkOSFoundation();

  async function restoreSatellite() {
    const device = await satellite.restore();
    if (device?.deviceId) {
      satellites.register({ id: device.deviceId, name: device.name, platform: device.platform, capabilities: (device.capabilities || []).filter((x) => x.state === 'available').map((x) => x.id) });
      eventBus.emit('pinknext:satellite-connected', { deviceId: device.deviceId });
    }
    return device;
  }

  async function pairSatellite(code) {
    const device = await satellite.pair(code);
    if (device?.deviceId) {
      satellites.register({ id: device.deviceId, name: device.name, platform: device.platform, capabilities: (device.capabilities || []).filter((x) => x.state === 'available').map((x) => x.id) });
      eventBus.emit('pinknext:satellite-connected', { deviceId: device.deviceId });
    }
    return device;
  }

  function disconnectSatellite() {
    const deviceId = satellite.device?.deviceId;
    satellite.disconnect();
    if (deviceId) satellites.disconnect(deviceId);
    eventBus.emit('pinknext:satellite-disconnected', { deviceId: deviceId || null });
  }

  const runtime = {
    version: 'next-0.9.0', eventBus, taskRuntime, memory, contextCompiler, tools, skills, traces, satellites, satellite, cloud, security, guardrails, handoffs, supervisor, agentic, orchestrator, evolution, projectBrains, modelLab, agentLearning, os,
    restoreSatellite, pairSatellite, disconnectSatellite,
    snapshot() {
      return {
        version: this.version,
        cloudConfigured: cloud.configured,
        tasks: taskRuntime.list(),
        capabilities: tools.list(),
        skills: skills.list(),
        satellites: satellites.list(),
        satellite: satellite.snapshot(),
        handoffs: handoffs.snapshot(),
        guardrails: guardrails.snapshot(),
        agenticProfile: agentic.sandbox.profile,
        orchestration: orchestrator.snapshot(),
        projectBrains: projectBrains.snapshot(),
        modelLab: modelLab.snapshot(),
        agentLearning: agentLearning.snapshot(),
        os: os.snapshot(),
        evolution: evolution.list()
      };
    }
  };
  eventBus.emit('pinknext:ready', runtime.snapshot());
  return runtime;
}
