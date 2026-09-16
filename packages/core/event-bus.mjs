export class PinkEventBus {
  #listeners = new Map();

  on(type, handler) {
    if (!type || typeof handler !== 'function') throw new TypeError('type and handler required');
    const set = this.#listeners.get(type) || new Set();
    set.add(handler);
    this.#listeners.set(type, set);
    return () => this.off(type, handler);
  }

  once(type, handler) {
    const off = this.on(type, (payload) => { off(); handler(payload); });
    return off;
  }

  off(type, handler) {
    const set = this.#listeners.get(type);
    if (!set) return false;
    const deleted = set.delete(handler);
    if (!set.size) this.#listeners.delete(type);
    return deleted;
  }

  emit(type, payload) {
    const handlers = [...(this.#listeners.get(type) || [])];
    for (const handler of handlers) {
      try { handler(payload); } catch (error) {
        if (type !== 'runtime:error') this.emit('runtime:error', { source: type, error });
      }
    }
    return handlers.length;
  }

  clear() { this.#listeners.clear(); }
}

export const eventBus = new PinkEventBus();
