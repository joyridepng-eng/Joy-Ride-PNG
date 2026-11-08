const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.dirname(require.resolve('../package.json'));
const source = fs.readFileSync(
  path.join(root, 'components/telemetry-sync-notice.tsx'), 'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
});

function harness() {
  let now = 1000000000;
  let cursor = 0;
  let retryCount = 0;
  let status = { event: 'idle', pending: null, updatedAt: now };
  const auth = {
    session: { driver: { id: 'synthetic-driver' } },
    isLoading: false,
  };
  const state = [];
  const effects = [];
  const pendingEffects = [];
  const listeners = new Set();
  const timers = new Map();
  let timerSequence = 0;

  function useState(initial) {
    const index = cursor++;
    if (!(index in state)) {
      state[index] = typeof initial === 'function' ? initial() : initial;
    }
    return [state[index], value => {
      state[index] = typeof value === 'function'
        ? value(state[index]) : value;
    }];
  }

  function useRef(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = { current: initial };
    return state[index];
  }

  function useEffect(work, dependencies) {
    const index = cursor++;
    const previous = effects[index];
    if (!previous || dependencies.some(
      (value, position) => value !== previous.dependencies[position],
    )) {
      pendingEffects.push(() => {
        if (previous?.cleanup) previous.cleanup();
        effects[index] = {
          dependencies: [...dependencies],
          cleanup: work(),
        };
      });
    }
  }

  function jsx(type, props) { return { type, props }; }
  class ClockDate extends Date {
    static now() { return now; }
  }

  const service = {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      listener(status);
      return () => listeners.delete(listener);
    },
    retryQueue() { retryCount++; },
  };

  const modules = {
    react: { useState, useEffect, useRef },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      Pressable: 'Pressable', Text: 'Text', View: 'View',
      StyleSheet: { create: value => value },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/contexts/driver-auth-context': { useDriverAuth: () => auth },
    '@/services/offline-telemetry': { offlineTelemetryService: service },
  };

  const moduleObject = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module: moduleObject,
    exports: moduleObject.exports,
    Date: ClockDate,
    require(name) {
      if (!(name in modules)) throw new Error('Unexpected dependency');
      return modules[name];
    },
    setTimeout(callback, milliseconds) {
      const id = ++timerSequence;
      timers.set(id, { callback, at: now + milliseconds });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  }, { filename: 'telemetry-sync-notice.js' });

  const Component = moduleObject.exports.default;
  function render() {
    cursor = 0;
    const result = Component();
    for (const effect of pendingEffects.splice(0)) effect();
    return result;
  }

  function update(event) {
    status = { event, pending: 2, updatedAt: now };
    for (const listener of listeners) listener(status);
  }

  function advance(milliseconds) {
    now += milliseconds;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) {
        timers.delete(id);
        timer.callback();
      }
    }
  }

  function dispose() {
    for (const effect of effects) {
      if (effect?.cleanup) effect.cleanup();
    }
  }

  return {
    auth, render, update, advance, dispose,
    retries: () => retryCount,
    subscriptions: () => listeners.size,
    timers: () => timers.size,
  };
}

function find(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = find(child, type);
    if (match) return match;
  }
  return null;
}

function text(node) {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (!node || typeof node !== 'object') return '';
  const children = node.props?.children;
  return (Array.isArray(children) ? children : [children])
    .map(text).join(' ');
}

let passed = 0;
let current = 'Preparing warning checks';

function test(name, work) {
  current = name;
  const h = harness();
  try {
    h.render();
    work(h);
    passed++;
    console.log('PASS:', name);
  } finally {
    h.dispose();
  }
}

try {
  test('No warning for an unauthenticated user', h => {
    h.update('needs-attention');
    h.auth.session = null;
    assert.equal(h.render(), null);
  });

  test('No warning while authentication is loading', h => {
    h.update('needs-attention');
    h.auth.isLoading = true;
    assert.equal(h.render(), null);
  });

  test('Healthy and recovered states hide the warning', h => {
    for (const event of ['idle', 'queued', 'delivered']) {
      h.update(event);
      assert.equal(h.render(), null);
    }
  });

  test('Retrying explains that automatic retries are running', h => {
    h.update('retrying');
    const view = h.render();
    assert.match(text(view), /Automatic retries are running/);
    assert.equal(find(view, 'Pressable'), null);
  });

  test('Exhausted retries show an accessible manual retry', h => {
    h.update('needs-attention');
    const button = find(h.render(), 'Pressable');
    assert.ok(button);
    assert.equal(button.props.accessibilityRole, 'button');
    assert.equal(button.props.accessibilityLabel,
      'Retry location history sync');
  });

  test('Full storage warning explains that new points cannot be saved', h => {
    h.update('queue-full');
    assert.match(text(h.render()), /New points cannot be saved/);
  });

  test('Storage failure displays a distinct warning', h => {
    h.update('storage-error');
    assert.match(text(h.render()), /could not be read or saved/);
  });

  test('Rapid repeated taps trigger only one retry', h => {
    h.update('needs-attention');
    const button = find(h.render(), 'Pressable');
    button.props.onPress();
    button.props.onPress();
    assert.equal(h.retries(), 1);
    assert.equal(find(h.render(), 'Pressable').props.disabled, true);
  });

  test('Manual retry becomes available after thirty seconds', h => {
    h.update('needs-attention');
    find(h.render(), 'Pressable').props.onPress();
    h.render();
    h.advance(29999);
    assert.equal(find(h.render(), 'Pressable').props.disabled, true);
    h.advance(1);
    const button = find(h.render(), 'Pressable');
    assert.equal(button.props.disabled, false);
    button.props.onPress();
    assert.equal(h.retries(), 2);
  });

  test('Successful recovery removes a previous warning', h => {
    h.update('needs-attention');
    assert.ok(h.render());
    h.update('delivered');
    assert.equal(h.render(), null);
  });

  test('Warning text contains no customer or authentication values', h => {
    for (const event of [
      'retrying', 'needs-attention', 'queue-full', 'storage-error',
    ]) {
      h.update(event);
      const content = text(h.render());
      assert.doesNotMatch(content,
        /synthetic-driver|Bearer|accessToken|latitude|longitude/);
    }
  });

  test('Unmount removes subscription and retry timer', h => {
    h.update('needs-attention');
    find(h.render(), 'Pressable').props.onPress();
    h.render();
    assert.equal(h.subscriptions(), 1);
    assert.equal(h.timers(), 1);
    h.dispose();
    assert.equal(h.subscriptions(), 0);
    assert.equal(h.timers(), 0);
  });

  console.log('Passed telemetry warning checks:', passed);
  console.log('Actual component tested with simulated hooks and time.');
} catch {
  console.log('STOP: Warning regression case:', current);
  console.log('Passed checks:', passed);
  console.log('Raw errors withheld.');
  process.exitCode = 1;
}
