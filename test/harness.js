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
const pending = [];

// Tests may be sync or async; async ones are collected and awaited by report().
function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      pending.push(
        result.then(
          () => { passed++; },
          (error) => { failures.push({ name, error }); }
        )
      );
    } else {
      passed++;
    }
  } catch (error) {
    failures.push({ name, error });
  }
}

async function report() {
  await Promise.all(pending);
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
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  append(...nodes) {
    nodes.forEach((n) => this.children.push(n));
  }
  replaceChildren(...nodes) {
    this.children = [...nodes];
  }
  addEventListener() {}
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

function loadApp(nowIso, seededTasks) {
  const elements = new Map();
  const store = new Map();
  if (typeof seededTasks === "string") {
    store.set("todo.tasks", seededTasks);
  } else if (seededTasks) {
    store.set("todo.tasks", JSON.stringify({ version: 2, tasks: seededTasks }));
  }
  let idCounter = 0;

  const context = {
    console,
    Date: frozenDateAt(nowIso),
    Map,
    Set,
    JSON,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Math,
    isNaN,
    parseInt,
    parseFloat,
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
      addEventListener() {},
      body: new StubElement(),
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

  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  // Re-export the internals under test from app.js's own top-level scope.
  const epilogue = `
    globalThis.__api = {
      toLocalDateString, parseLocalDate, todayString, normalizeTask,
      mergeTaskLists, liveTasks, getTodaysTasks, getWeekTasks,
      addTask, deleteTask, updateTask, clearCompleted,
      renderTodaySchedule, renderWeekView, calculateNextDate,
      renderTaskList, renderCounts, setActiveView, undoDelete, showUndo,
      handleClearCompleted,
      getActiveView: () => activeView,
      setTasks: (t) => { tasks = t; },
      getTasks: () => tasks,
    };
  `;
  vm.createContext(context);
  vm.runInContext(source + epilogue, context);
  return { api: context.__api, elements, store, context };
}

// Evaluate sync.js in the same context as app.js so the sync layer runs
// against the real store rather than a stand-in.
function loadAppWithSync(nowIso, seededTasks, fetchImpl) {
  const app = loadApp(nowIso, seededTasks);
  const context = app.context;
  context.fetch = fetchImpl || (() => Promise.reject(new Error("no fetch stub")));
  context.btoa = (s) => Buffer.from(s, "binary").toString("base64");
  context.atob = (s) => Buffer.from(s, "base64").toString("binary");
  context.TextEncoder = TextEncoder;
  context.TextDecoder = TextDecoder;
  context.crypto = require("crypto").webCrypto || require("crypto").webcrypto;
  context.navigator = { onLine: true };
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
