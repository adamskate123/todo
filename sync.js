// Encrypted cross-device sync.
//
// Design, and the reasoning behind it:
//
//   * Tasks stay local-first. localStorage remains the working copy and the app
//     is fully usable offline; sync is something that happens on top.
//   * Everything is encrypted in the browser before it is uploaded. GitHub only
//     ever holds ciphertext it cannot read.
//   * Tasks in a private category (clinical) are never uploaded at all. The
//     safest patient data is the data that never leaves the machine.
//
// What the encryption does and does not protect: it protects the data at rest
// on GitHub and in transit. It does not protect against someone using your
// already-unlocked device, who could simply open the app.

(function () {
  "use strict";

  const SETTINGS_KEY = "todo.sync.settings";
  const PAYLOAD_VERSION = 1;
  const PBKDF2_ITERATIONS = 600000; // OWASP guidance for PBKDF2-HMAC-SHA256
  const REMOTE_PATH = "tasks.json.enc";
  const AUTOSYNC_DEBOUNCE_MS = 8000;

  // Categories that must never be uploaded.
  const PRIVATE_CATEGORIES = ["clinical"];

  // ---------------------------------------------------------------- encoding
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(text) {
    const binary = atob(String(text).replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // ---------------------------------------------------------------- crypto
  function subtle() {
    // Web Crypto is only exposed in a secure context (https, or localhost).
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error(
        "Encryption is unavailable here. The app must be served over https."
      );
    }
    return window.crypto.subtle;
  }

  // Overridable so the test suite can run without paying for 600k rounds on
  // every derivation. Production always uses PBKDF2_ITERATIONS.
  let defaultIterations = PBKDF2_ITERATIONS;

  async function deriveKey(passphrase, saltBytes, iterations) {
    const base = await subtle().importKey(
      "raw",
      encoder.encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return subtle().deriveKey(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: iterations || defaultIterations,
        hash: "SHA-256",
      },
      base,
      { name: "AES-GCM", length: 256 },
      true, // extractable, so the derived key can be cached for this device
      ["encrypt", "decrypt"]
    );
  }

  async function exportKey(key) {
    return bytesToBase64(new Uint8Array(await subtle().exportKey("raw", key)));
  }

  async function importKey(base64) {
    return subtle().importKey(
      "raw",
      base64ToBytes(base64),
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptJson(key, saltBytes, value, iterations) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle().encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(JSON.stringify(value))
    );
    return {
      version: PAYLOAD_VERSION,
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: iterations || defaultIterations,
        salt: bytesToBase64(saltBytes),
      },
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(ciphertext)),
    };
  }

  async function decryptJson(key, envelope) {
    let plaintext;
    try {
      plaintext = await subtle().decrypt(
        { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
        key,
        base64ToBytes(envelope.data)
      );
    } catch (error) {
      // AES-GCM is authenticated, so this is the wrong key or altered data.
      throw new Error(
        "Could not decrypt the synced data. The passphrase does not match the one used on your other device."
      );
    }
    return JSON.parse(decoder.decode(plaintext));
  }

  // ---------------------------------------------------------------- settings
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn("Unable to read sync settings", error);
      return null;
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function clearSettings() {
    localStorage.removeItem(SETTINGS_KEY);
  }

  // ---------------------------------------------------------------- GitHub
  function apiUrl(settings) {
    return `https://api.github.com/repos/${encodeURIComponent(
      settings.owner
    )}/${encodeURIComponent(settings.repo)}/contents/${REMOTE_PATH}`;
  }

  function authHeaders(settings) {
    return {
      Authorization: `Bearer ${settings.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  function describeHttpError(response, body) {
    if (response.status === 401) {
      return "GitHub rejected the token. It may have expired or been revoked.";
    }
    if (response.status === 403) {
      return "GitHub refused the request. Check the token has Contents: Read and write on this repository.";
    }
    if (response.status === 404) {
      return "Repository not found. Check the owner and repository name, and that the token can see it.";
    }
    const detail = body && body.message ? ` (${body.message})` : "";
    return `GitHub returned ${response.status}${detail}.`;
  }

  // Returns { envelope, sha } or null when nothing has been pushed yet.
  async function fetchRemote(settings) {
    const response = await fetch(`${apiUrl(settings)}?ref=${encodeURIComponent(settings.branch || "main")}`, {
      headers: authHeaders(settings),
      cache: "no-store",
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      let body = null;
      try { body = await response.json(); } catch (e) { /* no body */ }
      throw new Error(describeHttpError(response, body));
    }

    const payload = await response.json();
    const text = decoder.decode(base64ToBytes(payload.content || ""));
    return { envelope: JSON.parse(text), sha: payload.sha };
  }

  async function pushRemote(settings, envelope, sha) {
    const body = {
      message: `Sync tasks (${new Date().toISOString()})`,
      content: bytesToBase64(encoder.encode(JSON.stringify(envelope, null, 2))),
      branch: settings.branch || "main",
    };
    if (sha) body.sha = sha;

    const response = await fetch(apiUrl(settings), {
      method: "PUT",
      headers: { ...authHeaders(settings), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch (e) { /* no body */ }
      // 409 means someone else pushed between our read and our write.
      if (response.status === 409) {
        const conflict = new Error("Remote changed during sync.");
        conflict.isConflict = true;
        throw conflict;
      }
      throw new Error(describeHttpError(response, payload));
    }
    const result = await response.json();
    return result.content ? result.content.sha : undefined;
  }

  // ---------------------------------------------------------------- merging
  // A stable representation of a task list, used to tell whether anything
  // actually changed. Fields are listed explicitly and rows sorted by id, so
  // neither key order nor merge order can make an identical set look different.
  function canonicalize(list) {
    return JSON.stringify(
      list
        .slice()
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((task) => [
          task.id, task.title, task.notes, task.priority, task.category,
          task.tag, task.dueDate, task.dueTime, task.recurrence,
          Boolean(task.completed), Boolean(task.deleted), task.updatedAt,
        ])
    );
  }

  function isPrivate(task) {
    return PRIVATE_CATEGORIES.indexOf(task.category) !== -1;
  }

  function syncableTasks(list) {
    return list.filter((task) => !isPrivate(task));
  }

  // Combine what this device has with what the remote holds. Private tasks are
  // local truth: they are excluded from the upload, and a stale remote copy of
  // a task that has since been reclassified as private is discarded.
  function mergeWithRemote(localAll, remoteTasks) {
    const store = window.MedTodoStore;
    const privateOnes = localAll.filter(isPrivate);
    const merged = store.mergeTaskLists(syncableTasks(localAll), remoteTasks || []);
    const byId = new Map(merged.map((task) => [task.id, task]));
    privateOnes.forEach((task) => byId.set(task.id, task));
    return Array.from(byId.values());
  }

  // ---------------------------------------------------------------- state
  let status = { state: "idle", message: "" };
  let cachedKey = null;
  let syncing = false;
  // Writing merged tasks back goes through saveTasks(), which asks for another
  // autosync. Without this guard each sync scheduled the next one and the app
  // uploaded forever on the debounce interval.
  let applyingRemote = false;
  let autosyncTimer = null;
  const listeners = [];

  function setStatus(state, message) {
    status = { state, message };
    listeners.forEach((fn) => fn(status));
  }

  // Write merged tasks back without letting the resulting save schedule another
  // sync.
  function applyRemote(store, merged) {
    applyingRemote = true;
    try {
      store.setTasks(merged);
    } finally {
      applyingRemote = false;
    }
  }

  function describeSynced(store) {
    const held = store.getTasks().filter(isPrivate).length;
    return (
      `Synced ${new Date().toLocaleTimeString()}` +
      (held ? ` · ${held} clinical task${held !== 1 ? "s" : ""} kept on this device` : "")
    );
  }

  async function keyFor(settings, saltBytes) {
    const saltB64 = bytesToBase64(saltBytes);
    if (cachedKey && settings.saltB64 === saltB64 && settings.keyB64) {
      return cachedKey;
    }
    if (settings.keyB64 && settings.saltB64 === saltB64) {
      cachedKey = await importKey(settings.keyB64);
      return cachedKey;
    }
    throw new Error(
      "This device needs the passphrase for the existing synced data. Enter it in the sync settings below."
    );
  }

  // ---------------------------------------------------------------- sync run
  async function runSync(options) {
    const opts = options || {};
    const settings = loadSettings();
    if (!settings || !settings.token) {
      if (opts.interactive) setStatus("error", "Sync is not set up yet.");
      return;
    }
    if (syncing) return;
    syncing = true;
    setStatus("syncing", "Syncing…");

    try {
      const store = window.MedTodoStore;
      let remote = await fetchRemote(settings);

      // Establish the key. The salt lives with the remote payload so every
      // device derives the same key from the same passphrase.
      let saltBytes;
      if (remote) {
        saltBytes = base64ToBytes(remote.envelope.kdf.salt);
      } else if (settings.saltB64) {
        saltBytes = base64ToBytes(settings.saltB64);
      } else {
        saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
      }
      const key = await keyFor(settings, saltBytes);

      const remoteTasks = remote
        ? (await decryptJson(key, remote.envelope)).tasks || []
        : [];

      const merged = mergeWithRemote(store.getTasks(), remoteTasks);
      applyRemote(store, merged);

      const outgoing = syncableTasks(merged);
      // Nothing to say? Then say nothing. Every upload is a commit, and the
      // random IV means re-encrypting identical data still looks like a change
      // to the server, so this has to be decided before encrypting.
      if (remote && canonicalize(outgoing) === canonicalize(remoteTasks)) {
        settings.saltB64 = bytesToBase64(saltBytes);
        settings.lastSyncedAt = new Date().toISOString();
        saveSettings(settings);
        setStatus("ok", describeSynced(store));
        return;
      }

      const iterations = settings.iterations || defaultIterations;
      const envelope = await encryptJson(key, saltBytes, {
        version: 2,
        tasks: outgoing,
      }, iterations);

      try {
        await pushRemote(settings, envelope, remote ? remote.sha : undefined);
      } catch (error) {
        if (!error.isConflict) throw error;
        // Another device wrote first. Re-read, merge again, push once more.
        remote = await fetchRemote(settings);
        const retryTasks = remote
          ? (await decryptJson(key, remote.envelope)).tasks || []
          : [];
        const remerged = mergeWithRemote(store.getTasks(), retryTasks);
        applyRemote(store, remerged);
        const retryEnvelope = await encryptJson(key, saltBytes, {
          version: 2,
          tasks: syncableTasks(remerged),
        }, iterations);
        await pushRemote(settings, retryEnvelope, remote ? remote.sha : undefined);
      }

      settings.saltB64 = bytesToBase64(saltBytes);
      settings.lastSyncedAt = new Date().toISOString();
      saveSettings(settings);

      setStatus("ok", describeSynced(store));
    } catch (error) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setStatus(
        "error",
        offline
          ? "Offline. Your tasks are saved on this device and will sync later."
          : error.message || String(error)
      );
    } finally {
      syncing = false;
    }
  }

  function scheduleAutosync() {
    if (applyingRemote) return;
    if (!loadSettings()) return;
    clearTimeout(autosyncTimer);
    autosyncTimer = setTimeout(() => runSync({ interactive: false }), AUTOSYNC_DEBOUNCE_MS);
  }

  // Connect this device: derive and cache the key, then do a first sync.
  async function connect({ owner, repo, branch, token, passphrase }) {
    if (!owner || !repo || !token || !passphrase) {
      setStatus("error", "Fill in every field to connect.");
      return false;
    }
    setStatus("syncing", "Connecting…");
    try {
      const settings = { owner, repo, branch: branch || "main", token };
      // If a payload already exists, adopt its salt so the derived key matches
      // the other device. Otherwise start a new one.
      const remote = await fetchRemote(settings);
      const saltBytes = remote
        ? base64ToBytes(remote.envelope.kdf.salt)
        : window.crypto.getRandomValues(new Uint8Array(16));

      const iterations = remote && remote.envelope.kdf && remote.envelope.kdf.iterations
        ? remote.envelope.kdf.iterations
        : defaultIterations;
      const key = await deriveKey(passphrase, saltBytes, iterations);
      // Fail fast on a wrong passphrase rather than silently forking the data.
      if (remote) await decryptJson(key, remote.envelope);

      cachedKey = key;
      settings.iterations = iterations;
      settings.saltB64 = bytesToBase64(saltBytes);
      settings.keyB64 = await exportKey(key);
      saveSettings(settings);

      await runSync({ interactive: true });
      // runSync reports failures through status rather than throwing, so a
      // failed first sync must not be reported here as a successful connect.
      return status.state !== "error";
    } catch (error) {
      setStatus("error", error.message || String(error));
      return false;
    }
  }

  function disconnect() {
    cachedKey = null;
    clearSettings();
    setStatus("idle", "Disconnected. The token and key were removed from this device.");
  }

  window.MedTodoSync = {
    connect,
    disconnect,
    runSync,
    scheduleAutosync,
    loadSettings,
    getStatus: () => status,
    onStatus: (fn) => { listeners.push(fn); fn(status); },
    // exposed for tests
    _internals: {
      mergeWithRemote, syncableTasks, isPrivate,
      encryptJson, decryptJson, deriveKey, bytesToBase64, base64ToBytes,
      // Test-only: keeps the suite from paying 600k rounds per derivation.
      __setDefaultIterations: (n) => { defaultIterations = n; },
    },
  };
})();

// ---------------------------------------------------------------------------
// UI wiring. Kept separate from the logic above so the sync core stays testable
// without a DOM.
(function () {
  "use strict";

  const sync = window.MedTodoSync;
  if (!sync) return;

  const card = document.querySelector("#sync-card");
  if (!card) return;

  const statusEl = document.querySelector("#sync-status");
  const setupEl = document.querySelector("#sync-setup");
  const connectedEl = document.querySelector("#sync-connected");
  const targetEl = document.querySelector("#sync-target");

  const ownerInput = document.querySelector("#sync-owner");
  const repoInput = document.querySelector("#sync-repo");
  const tokenInput = document.querySelector("#sync-token");
  const passphraseInput = document.querySelector("#sync-passphrase");

  const connectBtn = document.querySelector("#sync-connect");
  const syncNowBtn = document.querySelector("#sync-now");
  const disconnectBtn = document.querySelector("#sync-disconnect");

  function refreshMode() {
    const settings = sync.loadSettings();
    const connected = Boolean(settings && settings.token);
    setupEl.hidden = connected;
    connectedEl.hidden = !connected;
    if (connected) {
      const when = settings.lastSyncedAt
        ? new Date(settings.lastSyncedAt).toLocaleString()
        : "not yet";
      targetEl.textContent = `Syncing with ${settings.owner}/${settings.repo} · last sync: ${when}`;
    }
  }

  sync.onStatus((status) => {
    statusEl.textContent = status.message || "";
    statusEl.className = `sync-status sync-status--${status.state}`;
  });

  connectBtn.addEventListener("click", async () => {
    connectBtn.disabled = true;
    const ok = await sync.connect({
      owner: ownerInput.value.trim(),
      repo: repoInput.value.trim(),
      token: tokenInput.value.trim(),
      passphrase: passphraseInput.value,
    });
    connectBtn.disabled = false;
    if (ok) {
      // Don't leave the secrets sitting in the form fields.
      tokenInput.value = "";
      passphraseInput.value = "";
      refreshMode();
    }
  });

  syncNowBtn.addEventListener("click", () => sync.runSync({ interactive: true }));

  disconnectBtn.addEventListener("click", () => {
    const settings = sync.loadSettings();
    const where = settings ? `${settings.owner}/${settings.repo}` : "the server";
    const confirmed = window.confirm(
      `Disconnect this device?\n\nThe access token and encryption key will be removed from this browser. ` +
        `Your tasks stay on this device, and the synced copy in ${where} is left untouched.`
    );
    if (!confirmed) return;
    sync.disconnect();
    refreshMode();
  });

  // Pick up changes made on another device when returning to the app.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sync.runSync({ interactive: false });
  });
  window.addEventListener("online", () => sync.runSync({ interactive: false }));

  refreshMode();
  sync.onStatus(refreshMode);

  // Reconcile with the server on startup. A no-op until sync is configured.
  sync.runSync({ interactive: false });
})();
