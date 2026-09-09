// Tests for sync.js -- run with:  node test/sync.test.js
const { test, assert, assertEqual, report, loadAppWithSync } = require("./harness");

const NOW = "2026-09-09T00:30:00Z";

function task(id, category, title, updatedAt) {
  return {
    id, title, category, notes: "", priority: "medium", tag: "",
    dueDate: "", dueTime: "", recurrence: "", completed: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: updatedAt || "2026-09-01T00:00:00.000Z",
    deleted: false,
  };
}

// A fetch stub that serves one in-memory file and records what was written.
function makeGitHub() {
  const state = { file: null, sha: null, puts: [], gets: 0 };
  const fetchImpl = async (url, options) => {
    const opts = options || {};
    if (!opts.method || opts.method === "GET") {
      state.gets++;
      if (!state.file) {
        return { ok: false, status: 404, json: async () => ({ message: "Not Found" }) };
      }
      return {
        ok: true, status: 200,
        json: async () => ({
          content: Buffer.from(state.file, "utf8").toString("base64"),
          sha: state.sha,
        }),
      };
    }
    if (opts.method === "PUT") {
      const body = JSON.parse(opts.body);
      const decoded = Buffer.from(body.content, "base64").toString("utf8");
      state.puts.push(decoded);
      state.file = decoded;
      state.sha = "sha-" + state.puts.length;
      return { ok: true, status: 200, json: async () => ({ content: { sha: state.sha } }) };
    }
    throw new Error("unexpected method " + opts.method);
  };
  return { state, fetchImpl };
}

// --- category scoping ------------------------------------------------------
test("syncableTasks drops clinical tasks", () => {
  const { sync } = loadAppWithSync(NOW);
  const out = sync._internals.syncableTasks([
    task("a", "work", "grant deadline"),
    task("b", "clinical", "call family re: MRI"),
    task("c", "home", "school pickup"),
  ]);
  assertEqual(out.length, 2);
  assert(!out.some((t) => t.category === "clinical"), "no clinical task may be syncable");
});

test("mergeWithRemote keeps local clinical tasks that were never uploaded", () => {
  const { sync } = loadAppWithSync(NOW);
  const local = [task("a", "work", "grant"), task("c", "clinical", "patient callback")];
  const merged = sync._internals.mergeWithRemote(local, [task("b", "home", "groceries")]);
  const ids = merged.map((t) => t.id).sort();
  assertEqual(ids.join(","), "a,b,c");
  assertEqual(merged.find((t) => t.id === "c").title, "patient callback");
});

test("a task reclassified as clinical is not restored from the remote copy", () => {
  const { sync } = loadAppWithSync(NOW);
  // Locally it is now clinical and newer; the remote still has the old work copy.
  const local = [task("x", "clinical", "now confidential", "2026-09-05T00:00:00.000Z")];
  const remote = [task("x", "work", "old public copy", "2026-09-02T00:00:00.000Z")];
  const merged = sync._internals.mergeWithRemote(local, remote);
  assertEqual(merged.length, 1);
  assertEqual(merged[0].category, "clinical");
  assertEqual(merged[0].title, "now confidential");
});

// --- crypto ----------------------------------------------------------------
test("encrypt/decrypt round-trips", async () => {
  const { sync } = loadAppWithSync(NOW);
  const { deriveKey, encryptJson, decryptJson } = sync._internals;
  const salt = new Uint8Array(16).fill(7);
  const key = await deriveKey("correct horse battery staple", salt);
  const envelope = await encryptJson(key, salt, { version: 2, tasks: [task("a", "work", "hello")] });
  const back = await decryptJson(key, envelope);
  assertEqual(back.tasks[0].title, "hello");
});

test("the envelope carries no plaintext", async () => {
  const { sync } = loadAppWithSync(NOW);
  const { deriveKey, encryptJson } = sync._internals;
  const salt = new Uint8Array(16).fill(3);
  const key = await deriveKey("pw", salt);
  const envelope = await encryptJson(key, salt, { tasks: [task("a", "work", "UNIQUE_MARKER_STRING")] });
  assert(
    JSON.stringify(envelope).indexOf("UNIQUE_MARKER_STRING") === -1,
    "task text must not appear anywhere in the uploaded envelope"
  );
});

test("a wrong passphrase gives a clear error rather than corrupt data", async () => {
  const { sync } = loadAppWithSync(NOW);
  const { deriveKey, encryptJson, decryptJson } = sync._internals;
  const salt = new Uint8Array(16).fill(1);
  const good = await deriveKey("right", salt);
  const bad = await deriveKey("wrong", salt);
  const envelope = await encryptJson(good, salt, { tasks: [] });
  let message = "";
  try {
    await decryptJson(bad, envelope);
  } catch (error) {
    message = error.message;
  }
  assert(/passphrase/i.test(message), `expected a passphrase error, got: ${message}`);
});

// --- end to end ------------------------------------------------------------
test("connect uploads work tasks but never clinical ones", async () => {
  const { state, fetchImpl } = makeGitHub();
  const { sync, api } = loadAppWithSync(NOW, [
    task("w1", "work", "PUBLIC_GRANT_DEADLINE"),
    task("c1", "clinical", "PATIENT_NAME_CONFIDENTIAL"),
  ], fetchImpl);

  const ok = await sync.connect({
    owner: "someone", repo: "medtodo-sync", token: "github_pat_x",
    passphrase: "shared passphrase",
  });
  assert(ok, "connect should succeed: " + JSON.stringify(sync.getStatus()));
  assert(state.puts.length >= 1, "something should have been uploaded");

  const uploaded = state.puts[state.puts.length - 1];
  assert(uploaded.indexOf("PATIENT_NAME_CONFIDENTIAL") === -1,
    "clinical task text must never appear in the upload");
  assert(uploaded.indexOf("PUBLIC_GRANT_DEADLINE") === -1,
    "even syncable task text must be ciphertext, not plaintext");

  // Decrypt what was actually stored and confirm the split.
  const envelope = JSON.parse(uploaded);
  const { deriveKey, decryptJson, base64ToBytes } = sync._internals;
  const key = await deriveKey("shared passphrase", base64ToBytes(envelope.kdf.salt));
  const payload = await decryptJson(key, envelope);
  const titles = payload.tasks.map((t) => t.title);
  assertEqual(titles.length, 1, "only the non-clinical task should be uploaded");
  assertEqual(titles[0], "PUBLIC_GRANT_DEADLINE");

  // The clinical task is still present locally.
  assert(api.getTasks().some((t) => t.title === "PATIENT_NAME_CONFIDENTIAL"),
    "clinical task must remain on the device");
});

test("a second device merges remote tasks without losing its own clinical ones", async () => {
  const { state, fetchImpl } = makeGitHub();

  // Device A publishes a work task.
  const deviceA = loadAppWithSync(NOW, [task("w1", "work", "from device A")], fetchImpl);
  await deviceA.sync.connect({
    owner: "someone", repo: "medtodo-sync", token: "t", passphrase: "pw",
  });
  assert(state.file, "device A should have published");

  // Device B starts with only a local clinical task.
  const deviceB = loadAppWithSync(NOW, [task("c1", "clinical", "B private note")], fetchImpl);
  await deviceB.sync.connect({
    owner: "someone", repo: "medtodo-sync", token: "t", passphrase: "pw",
  });

  const titles = deviceB.api.getTasks().map((t) => t.title).sort();
  assertEqual(titles.join("|"), "B private note|from device A",
    "device B should gain A's task and keep its own clinical one");

  // And B's clinical task still never reached the server.
  const envelope = JSON.parse(state.file);
  const { deriveKey, decryptJson, base64ToBytes } = deviceB.sync._internals;
  const key = await deriveKey("pw", base64ToBytes(envelope.kdf.salt));
  const payload = await decryptJson(key, envelope);
  assert(!payload.tasks.some((t) => t.category === "clinical"),
    "no clinical task may ever reach the server");
});

test("a mismatched passphrase on a second device is refused", async () => {
  const { fetchImpl } = makeGitHub();
  const deviceA = loadAppWithSync(NOW, [task("w1", "work", "a")], fetchImpl);
  await deviceA.sync.connect({
    owner: "o", repo: "r", token: "t", passphrase: "correct",
  });

  const deviceB = loadAppWithSync(NOW, [], fetchImpl);
  const ok = await deviceB.sync.connect({
    owner: "o", repo: "r", token: "t", passphrase: "different",
  });
  assertEqual(ok, false, "connecting with the wrong passphrase must fail");
  assert(/passphrase/i.test(deviceB.sync.getStatus().message),
    "the failure should name the passphrase: " + deviceB.sync.getStatus().message);
});

test("deletions propagate instead of resurrecting", async () => {
  const { state, fetchImpl } = makeGitHub();
  const deviceA = loadAppWithSync(NOW, [task("w1", "work", "shared task")], fetchImpl);
  await deviceA.sync.connect({ owner: "o", repo: "r", token: "t", passphrase: "pw" });

  // Device A deletes it, then syncs.
  deviceA.api.deleteTask("w1");
  await deviceA.sync.runSync({ interactive: true });

  // Device B still holds the old live copy and syncs.
  const deviceB = loadAppWithSync(NOW, [task("w1", "work", "shared task")], fetchImpl);
  await deviceB.sync.connect({ owner: "o", repo: "r", token: "t", passphrase: "pw" });

  assertEqual(deviceB.api.liveTasks().length, 0,
    "a task deleted on another device must not come back");
  assert(state.file, "remote should still exist");
});

// --- key-derivation settings -----------------------------------------------
test("the shipped iteration count meets current guidance", () => {
  const source = require("fs").readFileSync(
    require("path").join(__dirname, "..", "sync.js"), "utf8");
  const match = source.match(/const PBKDF2_ITERATIONS = (\d+);/);
  assert(match, "PBKDF2_ITERATIONS should be declared");
  assert(Number(match[1]) >= 600000,
    `PBKDF2 iterations must stay at or above 600000, found ${match[1]}`);
});

test("a vault opens with the iteration count it was created with", async () => {
  const { state, fetchImpl } = makeGitHub();

  // Device A publishes using 1000 rounds.
  const deviceA = loadAppWithSync(NOW, [task("w1", "work", "shared")], fetchImpl);
  deviceA.sync._internals.__setDefaultIterations(1000);
  await deviceA.sync.connect({ owner: "o", repo: "r", token: "t", passphrase: "pw" });
  assertEqual(JSON.parse(state.file).kdf.iterations, 1000);

  // Device B defaults to a different count and must still adopt the stored one.
  const deviceB = loadAppWithSync(NOW, [], fetchImpl);
  deviceB.sync._internals.__setDefaultIterations(5000);
  const ok = await deviceB.sync.connect({ owner: "o", repo: "r", token: "t", passphrase: "pw" });
  assert(ok, "device B should open the vault: " + deviceB.sync.getStatus().message);
  assert(deviceB.api.getTasks().some((x) => x.title === "shared"),
    "device B should have received the task");
});

// --- the app must go quiet when nothing has changed ------------------------
test("applying a sync result does not schedule another sync", async () => {
  const { fetchImpl } = makeGitHub();
  const app = loadAppWithSync(NOW, [task("w1", "work", "a task")], fetchImpl);
  await app.sync.connect({ owner: "o", repo: "r", token: "t", passphrase: "pw" });

  // Writing merged tasks back calls saveTasks(), which asks for an autosync.
  // Left unguarded, every sync queued the next one and the app uploaded forever.
  const delays = [];
  const realSetTimeout = app.context.setTimeout;
  app.context.setTimeout = (fn, ms) => {
    delays.push(ms);
    return realSetTimeout(fn, ms);
  };

  await app.sync.runSync({ interactive: true });
  assert(!delays.includes(8000),
    "a sync must not queue another autosync; timers scheduled: " + delays.join(", "));
});

test("syncing unchanged tasks does not upload again", async () => {
  const { state, fetchImpl } = makeGitHub();
  const app = loadAppWithSync(NOW, [task("w1", "work", "a task")], fetchImpl);
  await app.sync.connect({ owner: "o", repo: "r", token: "t", passphrase: "pw" });
  const afterConnect = state.puts.length;
  assertEqual(afterConnect, 1, "connecting should publish once");

  await app.sync.runSync({ interactive: true });
  await app.sync.runSync({ interactive: true });
  assertEqual(state.puts.length, afterConnect,
    "identical data must not be re-uploaded -- every upload is a commit");
});

test("a real change is still uploaded", async () => {
  const { state, fetchImpl } = makeGitHub();
  const app = loadAppWithSync(NOW, [task("w1", "work", "a task")], fetchImpl);
  await app.sync.connect({ owner: "o", repo: "r", token: "t", passphrase: "pw" });
  const before = state.puts.length;

  app.api.addTask({
    title: "Something new", notes: "", priority: "high", category: "work",
    tag: "", dueDate: "", dueTime: "", recurrence: "",
  });
  await app.sync.runSync({ interactive: true });
  assertEqual(state.puts.length, before + 1, "a genuine edit should publish");
});

test("a deletion counts as a change", async () => {
  const { state, fetchImpl } = makeGitHub();
  const app = loadAppWithSync(NOW, [task("w1", "work", "a task")], fetchImpl);
  await app.sync.connect({ owner: "o", repo: "r", token: "t", passphrase: "pw" });
  const before = state.puts.length;

  app.api.deleteTask("w1");
  await app.sync.runSync({ interactive: true });
  assertEqual(state.puts.length, before + 1, "a delete must reach the other devices");
});

test("a clinical-only change never causes an upload", async () => {
  const { state, fetchImpl } = makeGitHub();
  const app = loadAppWithSync(NOW, [task("w1", "work", "a task")], fetchImpl);
  await app.sync.connect({ owner: "o", repo: "r", token: "t", passphrase: "pw" });
  const before = state.puts.length;

  app.api.addTask({
    title: "Patient callback", notes: "", priority: "high", category: "clinical",
    tag: "", dueDate: "", dueTime: "", recurrence: "",
  });
  await app.sync.runSync({ interactive: true });
  assertEqual(state.puts.length, before,
    "a clinical task changes nothing the server should see");
});

report();
