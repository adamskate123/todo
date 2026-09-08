// Shared test harness. No dependencies, no build step.
//
// app.js and sync.js are plain browser scripts, so they are evaluated inside a
// vm against a minimal DOM stub and a frozen clock. The tests therefore
// exercise the real shipping files rather than a copy of their logic.

// Pin the zone before anything constructs a Date. Several tests exist
// specifically to catch UTC-vs-local drift, which is invisible when the host
// happens to run in UTC.
process.env.TZ = "America/New_York";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// --- tiny test runner ------------------------------------------------------
let passed = 0;
const failures = [];
const queued = [];

// Tests are queued and run one at a time by report(). Running async tests
// concurrently let them interfere through shared module state, which produced
// failures that had nothing to do with the code under test.
function test(name, fn) {
  queued.push({ name, fn });
}

async function report() {
  for (const { name, fn } of queued) {
    try {
      await fn();
      passed++;
    } catch (error) {
      failures.push({ name, error });
    }
  }
  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  failures.forEach(({ name, error }) => {
    console.log(`  FAIL  ${name}\n        ${String(error.message || error).replace(/\n/g, "\n        ")}\n`);
  });
  process.exitCode = failures.length ? 1 : 0;
}

function assert(cond, message) {
  if (!cond) throw new Error(message || "assertion failed");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || "values differ"}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
}

// --- DOM stub --------------------------------------------------------------
class StubElement {
  constructor(tag = "div") {
    this.tagName = tag;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.hidden = false;
    this.style = {};
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  append(...nodes) {
    nodes.forEach((n) => this.children.push(n));
  }
  appendChild(node) {
    this.children.push(node);
    return node;
  }
  removeChild(node) {
    this.children = this.children.filter((c) => c !== node);
    return node;
  }
  replaceChildren(...nodes) {
    this.children = [...nodes];
  }
  addEventListener() {}
  removeEventListener() {}
  setAttribute(name, value) {
    this.attributes = this.attributes || {};
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return (this.attributes || {})[name] || null;
  }
  scrollIntoView() {}
  focus() {}
  click() {}
  reset() {}
  querySelector() {
    return new StubElement();
  }
  // Depth-first search by class name, for asserting on rendered output.
  find(className) {
    for (const child of this.children) {
      if (!(child instanceof StubElement)) continue;
      if (child.className.split(" ").includes(className)) return child;
      const nested = child.find(className);
      if (nested) return nested;
    }
    return null;
  }
  findAll(className, out = []) {
    for (const child of this.children) {
      if (!(child instanceof StubElement)) continue;
      if (child.className.split(" ").includes(className)) out.push(child);
      child.findAll(className, out);
    }
    return out;
  }
}

// A Date whose zero-arg constructor and .now() are pinned, so "today" is
// deterministic no matter when the suite runs.
function frozenDateAt(iso) {
  const Real = Date;
  const fixed = new Real(iso).getTime();
  return class extends Real {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() {
      return fixed;
    }
  };
}

function makeContext(nowIso, elements, store) {
  let idCounter = 0;
  const context = {
    console,
    Date: frozenDateAt(nowIso),
    Map, Set, JSON, Array, Object, Number, String, Boolean, Math,
    isNaN, parseInt, parseFloat, Promise, Error, RegExp,
    crypto: { randomUUID: () => `id-${++idCounter}` },
    setTimeout: (fn, ms) => {
      const timer = setTimeout(fn, ms);
      if (timer && typeof timer.unref === "function") timer.unref();
      return timer;
    },
    clearTimeout,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    document: {
      querySelector(sel) {
        if (!elements.has(sel)) elements.set(sel, new StubElement());
        return elements.get(sel);
      },
      querySelectorAll: () => [],
      createElement: (tag) => new StubElement(tag),
      documentElement: new StubElement("html"),
      body: new StubElement("body"),
      addEventListener() {},
      removeEventListener() {},
    },
    alert: () => {},
    confirm: () => true,
    prompt: () => null,
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    Blob: class {},
    FileReader: class {},
  };
  context.globalThis = context;
  // `window` is the global object, exactly as in a browser.
  context.window = context;
  return context;
}

// Creates the app against stub DOM and storage. `seededTasks` may be an array of
// tasks or a raw storage string (to exercise legacy or corrupt payloads).
function loadApp(nowIso, seededTasks) {
  const elements = new Map();
  const store = new Map();
  if (typeof seededTasks === "string") {
    store.set("todo.tasks", seededTasks);
  } else if (seededTasks) {
    store.set("todo.tasks", JSON.stringify({ version: 2, tasks: seededTasks }));
  }

  const context = makeContext(nowIso, elements, store);
  vm.createContext(context);
  // app.js uses the shared markdown module, so it has to be in scope first --
  // the page loads it via a script tag ahead of app.js for the same reason.
  ["todo-markdown.js", "app.js"].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  });

  // The container the app mounts against. Lookups are memoised so tests can
  // assert on the same element the app rendered into.
  const root = {
    dataset: {},
    querySelector(sel) {
      if (!elements.has(sel)) elements.set(sel, new StubElement());
      return elements.get(sel);
    },
    querySelectorAll: () => [],
  };

  const api = context.createMedTodoApp({ root, storage: context.localStorage });
  return { api, elements, store, context, root };
}

// Evaluate sync.js in the same context so the sync layer runs against the real
// store rather than a stand-in.
function loadAppWithSync(nowIso, seededTasks, fetchImpl) {
  const app = loadApp(nowIso, seededTasks);
  const context = app.context;
  context.fetch = fetchImpl || (() => Promise.reject(new Error("no fetch stub")));
  context.btoa = (s) => Buffer.from(s, "binary").toString("base64");
  context.atob = (s) => Buffer.from(s, "base64").toString("binary");
  context.TextEncoder = TextEncoder;
  context.TextDecoder = TextDecoder;
  context.crypto = require("crypto").webcrypto;
  context.navigator.onLine = true;
  context.addEventListener = () => {};

  const source = fs.readFileSync(path.join(__dirname, "..", "sync.js"), "utf8");
  vm.runInContext(source, context);
  const sync = context.MedTodoSync;
  // Key derivation is deliberately expensive in production; tests would spend
  // minutes on it. The iteration count is config, not logic under test.
  if (sync) sync._internals.__setDefaultIterations(1000);
  return { ...app, sync };
}

module.exports = {
  test, assert, assertEqual, report, StubElement, frozenDateAt,
  loadApp, loadAppWithSync,
};
