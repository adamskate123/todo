// Tests for app.js. No dependencies, no build step -- run with:
//   node test/app.test.js
//
// app.js is a plain browser script, so it is evaluated inside a vm against a
// minimal DOM stub and a frozen clock. That keeps the tests honest: they
// exercise the real shipping file rather than a copy of its logic.

// Pin the zone before anything constructs a Date. Several of these tests exist
// specifically to catch UTC-vs-local drift, which is invisible when the host
// happens to run in UTC.
process.env.TZ = "America/New_York";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// --- tiny test runner ------------------------------------------------------
let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push({ name, error });
  }
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
    window: { prompt: () => null, confirm: () => true, alert: () => {} },
    alert: () => {},
    confirm: () => true,
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    Blob: class {},
    FileReader: class {},
  };
  context.globalThis = context;

  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  // Re-export the internals under test from app.js's own top-level scope.
  const epilogue = `
    globalThis.__api = {
      toLocalDateString, parseLocalDate, todayString, normalizeTask,
      mergeTaskLists, liveTasks, getTodaysTasks, getWeekTasks,
      addTask, deleteTask, updateTask, clearCompleted,
      renderTodaySchedule, renderWeekView, calculateNextDate,
      setTasks: (t) => { tasks = t; },
      getTasks: () => tasks,
    };
  `;
  vm.createContext(context);
  vm.runInContext(source + epilogue, context);
  return { api: context.__api, elements, store };
}

// 2026-09-09T00:30:00Z is 2026-09-08 20:30 in New York -- the exact window
// where the old UTC-based code rolled over to the wrong calendar day.
const EVENING = "2026-09-09T00:30:00Z";

// --- calendar-date correctness ---------------------------------------------
test("toLocalDateString uses the local day, not the UTC day", () => {
  const { api } = loadApp(EVENING);
  const d = new Date(EVENING);
  assertEqual(d.toISOString().split("T")[0], "2026-09-09", "precondition: UTC has rolled over");
  assertEqual(api.toLocalDateString(d), "2026-09-08", "local calendar date");
});

test("todayString reports the local day during the evening UTC rollover", () => {
  const { api } = loadApp(EVENING);
  assertEqual(api.todayString(), "2026-09-08");
});

test("getTodaysTasks finds tasks due today at 8:30pm local", () => {
  const { api } = loadApp(EVENING);
  api.addTask({
    title: "Evening chart review",
    notes: "",
    priority: "high",
    category: "work",
    tag: "",
    dueDate: "2026-09-08",
    dueTime: "21:00",
    recurrence: "",
  });
  const todays = api.getTodaysTasks();
  assertEqual(todays.length, 1, "task due today should appear in Today's Schedule");
  assertEqual(todays[0].title, "Evening chart review");
});

test("getWeekTasks starts on the local day", () => {
  const { api } = loadApp(EVENING);
  assertEqual(Object.keys(api.getWeekTasks())[0], "2026-09-08");
});

test("calculateNextDate advances without drifting a day", () => {
  const { api } = loadApp(EVENING);
  assertEqual(api.calculateNextDate("2026-09-08", "daily"), "2026-09-09");
  assertEqual(api.calculateNextDate("2026-09-08", "weekly"), "2026-09-15");
  assertEqual(api.calculateNextDate("2026-09-30", "monthly"), "2026-10-30");
});

// --- soft delete / sync-readiness ------------------------------------------
test("addTask stamps updatedAt alongside createdAt", () => {
  const { api } = loadApp(EVENING);
  const task = api.addTask({
    title: "x", notes: "", priority: "low", category: "home",
    tag: "", dueDate: "", dueTime: "", recurrence: "",
  });
  assert(task.updatedAt, "updatedAt must be set");
  assertEqual(task.updatedAt, task.createdAt);
  assertEqual(task.deleted, false);
});

test("deleteTask leaves a tombstone instead of dropping the task", () => {
  const { api } = loadApp(EVENING);
  const task = api.addTask({
    title: "delete me", notes: "", priority: "low", category: "home",
    tag: "", dueDate: "", dueTime: "", recurrence: "",
  });
  api.deleteTask(task.id);

  assertEqual(api.liveTasks().length, 0, "deleted task must not be visible");
  const raw = api.getTasks();
  assertEqual(raw.length, 1, "tombstone must be retained for sync");
  assertEqual(raw[0].deleted, true);
  assert(raw[0].deletedAt, "deletedAt must be recorded");
});

test("clearCompleted tombstones rather than erases", () => {
  const { api } = loadApp(EVENING);
  const task = api.addTask({
    title: "done", notes: "", priority: "low", category: "home",
    tag: "", dueDate: "", dueTime: "", recurrence: "",
  });
  api.updateTask(task.id, { completed: true });
  api.clearCompleted();
  assertEqual(api.liveTasks().length, 0);
  assertEqual(api.getTasks()[0].deleted, true);
});

test("normalizeTask backfills updatedAt for pre-v2 tasks", () => {
  const { api } = loadApp(EVENING);
  const migrated = api.normalizeTask({
    id: "old", title: "legacy", createdAt: "2026-01-01T00:00:00.000Z",
  });
  assertEqual(migrated.updatedAt, "2026-01-01T00:00:00.000Z");
  assertEqual(migrated.deleted, false);
});

// --- merge semantics (the core of sync) ------------------------------------
test("mergeTaskLists keeps the newer edit", () => {
  const { api } = loadApp(EVENING);
  const merged = api.mergeTaskLists(
    [{ id: "a", title: "old", updatedAt: "2026-09-01T00:00:00.000Z" }],
    [{ id: "a", title: "new", updatedAt: "2026-09-05T00:00:00.000Z" }]
  );
  assertEqual(merged.length, 1);
  assertEqual(merged[0].title, "new");
});

test("mergeTaskLists does not resurrect a task deleted elsewhere", () => {
  const { api } = loadApp(EVENING);
  const merged = api.mergeTaskLists(
    [{ id: "a", title: "still here", updatedAt: "2026-09-01T00:00:00.000Z" }],
    [{ id: "a", title: "gone", deleted: true, deletedAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }]
  );
  assertEqual(merged.length, 1);
  assertEqual(merged[0].deleted, true, "a newer delete must win over an older copy");
});

test("mergeTaskLists lets a newer edit win over an older delete", () => {
  const { api } = loadApp(EVENING);
  const merged = api.mergeTaskLists(
    [{ id: "a", title: "revived", updatedAt: "2026-09-10T00:00:00.000Z" }],
    [{ id: "a", deleted: true, deletedAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }]
  );
  assertEqual(merged[0].deleted, false);
  assertEqual(merged[0].title, "revived");
});

test("mergeTaskLists unions tasks that exist on only one side", () => {
  const { api } = loadApp(EVENING);
  const merged = api.mergeTaskLists(
    [{ id: "a", title: "mac", updatedAt: "2026-09-01T00:00:00.000Z" }],
    [{ id: "b", title: "phone", updatedAt: "2026-09-01T00:00:00.000Z" }]
  );
  assertEqual(merged.length, 2);
});

// --- rendering is markup-safe ----------------------------------------------
test("task titles are rendered as text, never parsed as HTML", () => {
  const { api, elements } = loadApp(EVENING);
  const nasty = '<img src=x onerror="steal()"> Review EEG <30Hz & bill';
  api.addTask({
    title: nasty, notes: "", priority: "high", category: "clinical",
    tag: "", dueDate: "2026-09-08", dueTime: "09:00", recurrence: "",
  });
  api.renderTodaySchedule();

  const title = elements.get("#today-schedule").find("schedule-title");
  assert(title, "a schedule-title node should have been rendered");
  assertEqual(title.textContent, nasty, "title must survive verbatim as text");
  assertEqual(title.children.length, 0, "title must contain no parsed child elements");
});

test("week view renders titles as text too", () => {
  const { api, elements } = loadApp(EVENING);
  const nasty = "<script>alert(1)</script>";
  api.addTask({
    title: nasty, notes: "", priority: "low", category: "home",
    tag: "", dueDate: "2026-09-10", dueTime: "", recurrence: "",
  });
  api.renderWeekView();

  const titles = elements.get("#week-view").findAll("week-task-title");
  assertEqual(titles.length, 1);
  assertEqual(titles[0].textContent, nasty);
  assertEqual(titles[0].children.length, 0);
});

// --- startup with existing data --------------------------------------------
test("tasks already in storage survive app startup", () => {
  const { api } = loadApp(EVENING, [
    { id: "kept", title: "existing task", priority: "high", category: "work",
      dueDate: "2026-09-08", dueTime: "09:00", completed: false,
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
      deleted: false },
  ]);
  assertEqual(api.getTasks().length, 1, "stored tasks must load, not silently vanish");
  assertEqual(api.liveTasks()[0].title, "existing task");
  assertEqual(api.getTodaysTasks().length, 1);
});

test("a v1 bare-array payload migrates on load", () => {
  const { api } = loadApp(EVENING, JSON.stringify([
    { id: "v1", title: "legacy task", priority: "medium", category: "work",
      dueDate: "", dueTime: "", completed: false,
      createdAt: "2026-01-01T00:00:00.000Z" },
  ]));
  const loaded = api.getTasks();
  assertEqual(loaded.length, 1, "v1 array must still load");
  assertEqual(loaded[0].title, "legacy task");
  assertEqual(loaded[0].updatedAt, "2026-01-01T00:00:00.000Z", "updatedAt seeded from createdAt");
  assertEqual(loaded[0].deleted, false);
});

test("tombstones past the retention window are dropped on load", () => {
  const { api } = loadApp(EVENING, [
    { id: "old", title: "long gone", createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-02T00:00:00.000Z", deleted: true,
      deletedAt: "2025-01-02T00:00:00.000Z" },
    { id: "recent", title: "just deleted", createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z", deleted: true,
      deletedAt: "2026-09-05T00:00:00.000Z" },
  ]);
  const ids = api.getTasks().map((t) => t.id);
  assert(!ids.includes("old"), "expired tombstone should be purged");
  assert(ids.includes("recent"), "recent tombstone must be retained for sync");
});

test("unreadable storage is preserved instead of being overwritten", () => {
  const { api, store } = loadApp(EVENING, "{ this is not json");
  assertEqual(api.getTasks().length, 0);
  const backups = [...store.keys()].filter((k) => k.startsWith("todo.tasks.corrupt."));
  assertEqual(backups.length, 1, "a copy of the unreadable value should be kept");
  assertEqual(store.get(backups[0]), "{ this is not json");
});

// --- report ----------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed\n`);
failures.forEach(({ name, error }) => {
  console.log(`  FAIL  ${name}\n        ${error.message.replace(/\n/g, "\n        ")}\n`);
});
process.exit(failures.length ? 1 : 0);
