// Tests for the Obsidian plugin's storage adapter -- run with:
//   node test/plugin.test.js
//
// Loads the built bundle with `obsidian` stubbed, so it exercises the artefact
// that actually ships rather than the source it was assembled from.
const path = require("path");
const Module = require("module");
const { test, assert, assertEqual, report } = require("./harness");

// --- load the bundle against a stubbed Obsidian --------------------------
const OBSIDIAN_STUB = {
  Plugin: class Plugin {}, ItemView: class ItemView {},
  PluginSettingTab: class PluginSettingTab {}, Setting: class Setting {},
  Notice: class Notice {},
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "obsidian") return "obsidian-stub";
  return originalResolve.call(this, request, ...rest);
};
require.cache["obsidian-stub"] = {
  id: "obsidian-stub", filename: "obsidian-stub", loaded: true, exports: OBSIDIAN_STUB,
};

const localStore = new Map();
global.window = {
  localStorage: {
    getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
    setItem: (k, v) => localStore.set(k, String(v)),
    removeItem: (k) => localStore.delete(k),
  },
  setTimeout: () => 0,
  clearTimeout: () => {},
};
global.document = {
  querySelector: () => null,
  createElement: () => ({ style: {}, classList: { contains: () => false } }),
  body: null,
};

const plugin = require(path.join(__dirname, "..", "obsidian-plugin", "main.js"));
const { createVaultStorage, isPrivate, TASKS_KEY } = plugin.__internals;

// --- fakes ----------------------------------------------------------------
function fakeVault() {
  const files = new Map();
  return {
    files,
    getName: () => "TestVault",
    getAbstractFileByPath: (p) => (files.has(p) ? { path: p, extension: "md" } : null),
    read: async (f) => files.get(f.path),
    modify: async (f, body) => { files.set(f.path, body); },
    create: async (p, body) => { files.set(p, body); },
  };
}

function fakePlugin(vault) {
  return {
    app: { vault },
    settings: { tasksPath: "Tasks.md" },
    suppressReload: false,
  };
}

function task(id, title, category, extra) {
  return Object.assign({
    id, title, category, notes: "", priority: "medium", tag: "",
    dueDate: "", dueTime: "", recurrence: "", completed: false,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z",
    deleted: false,
  }, extra || {});
}

async function withTasks(tasks) {
  localStore.clear();
  const vault = fakeVault();
  const p = fakePlugin(vault);
  const storage = await createVaultStorage(p);
  storage.setItem(TASKS_KEY, JSON.stringify({ version: 2, tasks }));
  await storage.flushNow();
  return { vault, plugin: p, storage, note: vault.files.get("Tasks.md") || "" };
}

// --- the guarantee --------------------------------------------------------
test("clinical tasks are never written to the vault note", async () => {
  const { note } = await withTasks([
    task("w1", "PUBLIC_GRANT_DEADLINE", "work"),
    task("c1", "PATIENT_NAME_CONFIDENTIAL", "clinical"),
  ]);
  assert(note.includes("PUBLIC_GRANT_DEADLINE"), "the work task should be in the note");
  assert(!note.includes("PATIENT_NAME_CONFIDENTIAL"),
    "a clinical task must never reach the vault");
});

test("clinical tasks are kept in device-local storage instead", async () => {
  await withTasks([
    task("w1", "public", "work"),
    task("c1", "PATIENT_NAME_CONFIDENTIAL", "clinical"),
  ]);
  const local = JSON.parse(localStore.get("medtodo.local:TestVault"));
  assertEqual(local.length, 1);
  assertEqual(local[0].title, "PATIENT_NAME_CONFIDENTIAL");
});

test("device-local storage is keyed outside the vault folder", () => {
  const keys = [...localStore.keys()];
  assert(keys.every((k) => k.startsWith("medtodo.local")),
    "keys should be plugin-owned localStorage, not vault paths: " + keys.join(", "));
});

test("every private category is excluded", () => {
  assertEqual(isPrivate(task("a", "x", "clinical")), true);
  ["work", "home", "research", "teaching"].forEach((category) => {
    assertEqual(isPrivate(task("a", "x", category)), false, category + " should sync");
  });
});

// --- round trip -----------------------------------------------------------
test("both sides come back together on reload", async () => {
  const { storage } = await withTasks([
    task("w1", "Grant deadline", "research", { dueDate: "2026-09-11", dueTime: "09:00" }),
    task("h1", "Soccer pickup", "home", { tag: "#family" }),
    task("c1", "Patient callback", "clinical"),
  ]);
  await storage.prime();
  const reloaded = JSON.parse(storage.getItem(TASKS_KEY)).tasks;
  const titles = reloaded.map((t) => t.title).sort();
  assertEqual(titles.join("|"), "Grant deadline|Patient callback|Soccer pickup");
  const grant = reloaded.find((t) => t.title === "Grant deadline");
  assertEqual(grant.dueDate, "2026-09-11");
  assertEqual(grant.dueTime, "09:00");
  assertEqual(grant.id, "w1", "identity should survive the note round trip");
});

test("a deleted task leaves the note but keeps a local tombstone", async () => {
  const { note } = await withTasks([
    task("w1", "Still here", "work"),
    task("w2", "Removed task", "work", {
      deleted: true, deletedAt: "2026-09-05T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z",
    }),
  ]);
  assert(note.includes("Still here"));
  assert(!note.includes("Removed task"), "a deleted task should not be in the checklist");

  const local = JSON.parse(localStore.get("medtodo.local:TestVault"));
  assertEqual(local.length, 1);
  assertEqual(local[0].id, "w2");
  assertEqual(local[0].deleted, true, "the tombstone must be retained");
});

test("the note is a usable Obsidian checklist", async () => {
  const { note } = await withTasks([
    task("w1", "Draft aims", "research", { dueDate: "2026-09-11", priority: "high" }),
  ]);
  assert(note.includes("- [ ] Draft aims"), "should be a real checkbox line");
  assert(note.includes("due: 2026-09-11"), "human-readable metadata");
  assert(note.startsWith("---"), "should carry frontmatter");
});

test("hand-written lines are adopted and given an identity", async () => {
  localStore.clear();
  const vault = fakeVault();
  vault.files.set("Tasks.md", "- [ ] Typed straight into the note\n");
  const storage = await createVaultStorage(fakePlugin(vault));
  const tasks = JSON.parse(storage.getItem(TASKS_KEY)).tasks;
  assertEqual(tasks.length, 1);
  assertEqual(tasks[0].title, "Typed straight into the note");
  assert(tasks[0].id, "a hand-written line should be given an id");
  assert(tasks[0].createdAt, "and a created timestamp");
});

test("keys other than tasks stay device-local too", async () => {
  localStore.clear();
  const vault = fakeVault();
  const storage = await createVaultStorage(fakePlugin(vault));
  storage.setItem("todo.season", "winter");
  assertEqual(storage.getItem("todo.season"), "winter");
  assertEqual(vault.files.size, 0, "a preference must not create a vault file");
});

// --- the bundle is generated, so it must not drift from its sources --------
test("the committed bundle matches a fresh build", () => {
  const fs = require("fs");
  const { execFileSync } = require("child_process");
  const repo = path.join(__dirname, "..");
  const mainPath = path.join(repo, "obsidian-plugin", "main.js");
  const cssPath = path.join(repo, "obsidian-plugin", "styles.css");
  const beforeMain = fs.readFileSync(mainPath, "utf8");
  const beforeCss = fs.readFileSync(cssPath, "utf8");

  execFileSync(process.execPath, [path.join(repo, "tools", "build-plugin.js")], { cwd: repo });

  assertEqual(fs.readFileSync(mainPath, "utf8"), beforeMain,
    "main.js is stale -- run: npm run build:plugin");
  assertEqual(fs.readFileSync(cssPath, "utf8"), beforeCss,
    "styles.css is stale -- run: npm run build:plugin");
});

test("no plugin stylesheet rule can escape the container", () => {
  const fs = require("fs");
  const css = fs.readFileSync(path.join(__dirname, "..", "obsidian-plugin", "styles.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const leaks = [];
  let depth = 0, buffer = "", inKeyframes = false;
  for (const ch of css) {
    if (ch === "{") {
      const prelude = buffer.trim();
      buffer = "";
      if (depth === 0 && prelude.startsWith("@")) {
        inKeyframes = /^@(-\w+-)?keyframes/.test(prelude);
      } else if (!inKeyframes) {
        prelude.split(",").map((s) => s.trim()).filter(Boolean).forEach((sel) => {
          if (!sel.includes(".medtodo-root")) leaks.push(sel);
        });
      }
      depth++;
    } else if (ch === "}") {
      buffer = "";
      depth--;
      if (depth === 0) inKeyframes = false;
    } else {
      buffer += ch;
    }
  }
  assertEqual(leaks.length, 0,
    "these rules would restyle Obsidian itself: " + leaks.slice(0, 5).join(" | "));
});

report();
