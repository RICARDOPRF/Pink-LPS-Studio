const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'visual', 'pink-avatar-model-adapter.js'), 'utf8');
const events = [];
const stage = {};

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

const windowObject = {
  dispatchEvent(event) { events.push(event); },
};

const context = {
  window: windowObject,
  document: {
    querySelector(selector) {
      return selector === '#pinkStage' ? stage : null;
    }
  },
  CustomEvent: FakeCustomEvent,
  console,
  setTimeout,
  clearTimeout,
};
windowObject.window = windowObject;

vm.runInNewContext(source, context, { filename: 'pink-avatar-model-adapter.js' });

const adapter = windowObject.PinkAvatarModelAdapter;
assert(adapter, 'adapter should be exposed globally');
assert.strictEqual(adapter.version, '3.4.0');
assert.deepStrictEqual(Array.from(adapter.formats), ['glb', 'gltf', 'vrm']);
assert.strictEqual(typeof adapter.load, 'function');
assert(events.some(event => event.type === 'pinkavatar:adapter-ready'), 'adapter-ready event should be dispatched');

(async () => {
  await assert.rejects(() => adapter.load({}), /model URL is required/);
  await assert.rejects(
    () => adapter.load({ url: 'https://example.com/pink.fbx', format: 'fbx' }),
    /Unsupported Pink avatar format/
  );
  console.log('Pink model adapter contract OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
