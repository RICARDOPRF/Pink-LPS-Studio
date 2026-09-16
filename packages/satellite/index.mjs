import { CapabilityState, makeId } from '../contracts/index.mjs';

export class SatelliteRegistry {
  constructor() { this.devices = new Map(); }
  register({ id = makeId('sat'), name, platform = 'unknown', capabilities = [] }) {
    const device = { id, name: name || id, platform, capabilities: new Set(capabilities), state: CapabilityState.AVAILABLE, connectedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
    this.devices.set(id, device); return this.snapshot(id);
  }
  heartbeat(id) { const d = this.devices.get(id); if (!d) throw new Error('satellite not found'); d.lastSeenAt = new Date().toISOString(); d.state = CapabilityState.AVAILABLE; return this.snapshot(id); }
  disconnect(id) { const d = this.devices.get(id); if (d) d.state = CapabilityState.UNAVAILABLE; return this.snapshot(id); }
  snapshot(id) { const d = this.devices.get(id); return d ? { ...d, capabilities: [...d.capabilities] } : null; }
  list() { return [...this.devices.keys()].map((id) => this.snapshot(id)); }
}

export const SATELLITE_CAPABILITIES = Object.freeze([
  'camera','microphone','screen','browser','desktop','files','terminal','notifications','gpu','local-models'
]);
