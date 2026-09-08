// ===== Obsidian shell =========================================================
// Everything above this line is the shared app, byte-identical to what the web
// page loads. This file is the only Obsidian-specific code.

const { Plugin, ItemView, PluginSettingTab, Setting, Notice } = require("obsidian");

const VIEW_TYPE = "medtodo-view";
const TASKS_KEY = "todo.tasks";
const DEFAULT_SETTINGS = { tasksPath: "Tasks.md" };

// Categories that must never be written into the vault. The vault syncs
// (iCloud, Obsidian Sync, Dropbox...), and whether that is end-to-end encrypted
// is not something this plugin can know, so clinical tasks stay in Obsidian's
// own localStorage -- which lives in the application's data directory, outside
// the vault folder, and is therefore never picked up by vault sync.
const PRIVATE_CATEGORIES = ["clinical"];

const FILE_HEADER = [
  "---",
  "medtodo: tasks",
  "---",
  "",
  "> [!info] Managed by MedTodo",
  "> Edit these lines by hand if you like -- titles, checkboxes, tags and the",
  "> metadata in parentheses are all read back. The trailing comment holds ids",
  "> and timestamps; leave it alone and tasks keep their identity.",
  "",
].join("\n");

function isPrivate(task) {
  return PRIVATE_CATEGORIES.indexOf(task.category) !== -1;
}

// --- Storage -----------------------------------------------------------------
// The app asks for storage synchronously, so reads come from a cache primed
// before the view is created and writes are flushed to the vault in the
// background.
async function createVaultStorage(plugin) {
  const localKey = "medtodo.local:" + plugin.app.vault.getName();
  const cache = new Map();
  let flushTimer = null;

  function readLocal() {
    try {
      const raw = window.localStorage.getItem(localKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("MedTodo: could not read device-local tasks", error);
      return [];
    }
  }

  async function readVault() {
    const file = plugin.app.vault.getAbstractFileByPath(plugin.settings.tasksPath);
    if (!file || !("extension" in file)) return [];
    const text = await plugin.app.vault.read(file);
    return MedTodoMarkdown.parseTasks(text).map((task) => {
      // Lines typed by hand have no id yet.
      if (!task.id) {
        const now = new Date().toISOString();
        task.id = "md-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        task.createdAt = task.createdAt || now;
        task.updatedAt = task.updatedAt || now;
      }
      return task;
    });
  }

  async function prime() {
    const combined = (await readVault()).concat(readLocal());
    cache.set(TASKS_KEY, JSON.stringify({ version: 2, tasks: combined }));
  }

  async function flush() {
    const raw = cache.get(TASKS_KEY);
    if (!raw) return;
    let all = [];
    try {
      all = (JSON.parse(raw) || {}).tasks || [];
    } catch (error) {
      console.error("MedTodo: could not parse tasks before saving", error);
      return;
    }

    // Deleted tasks leave the note entirely -- a removed line is what a delete
    // looks like in a checklist. Their tombstones stay device-local so a delete
    // still wins over a stale copy the app may merge later.
    const forVault = all.filter((task) => !task.deleted && !isPrivate(task));
    const forDevice = all.filter((task) => task.deleted || isPrivate(task));

    try {
      window.localStorage.setItem(localKey, JSON.stringify(forDevice));
    } catch (error) {
      console.error("MedTodo: could not save device-local tasks", error);
    }

    const body = FILE_HEADER + MedTodoMarkdown.serializeTasks(forVault) + "\n";
    plugin.suppressReload = true;
    try {
      const file = plugin.app.vault.getAbstractFileByPath(plugin.settings.tasksPath);
      if (file && "extension" in file) {
        await plugin.app.vault.modify(file, body);
      } else {
        await plugin.app.vault.create(plugin.settings.tasksPath, body);
      }
    } catch (error) {
      new Notice("MedTodo could not write " + plugin.settings.tasksPath);
      console.error("MedTodo: vault write failed", error);
    } finally {
      // Let the vault's own change event settle before listening again.
      window.setTimeout(() => { plugin.suppressReload = false; }, 300);
    }
  }

  await prime();

  return {
    prime,
    flushNow: flush,
    getItem(key) {
      if (key === TASKS_KEY) return cache.has(key) ? cache.get(key) : null;
      return window.localStorage.getItem(localKey + ":" + key);
    },
    setItem(key, value) {
      if (key === TASKS_KEY) {
        cache.set(key, String(value));
        window.clearTimeout(flushTimer);
        flushTimer = window.setTimeout(flush, 400);
        return;
      }
      window.localStorage.setItem(localKey + ":" + key, String(value));
    },
  };
}

// --- View --------------------------------------------------------------------
class MedTodoView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.instance = null;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Tasks"; }
  getIcon() { return "checkmark"; }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    const root = container.createDiv({ cls: "medtodo-root" });
    MedTodoUI.mount(root);
    this.instance = createMedTodoApp({ root, storage: this.plugin.storage });
    this.plugin.views.add(this);
  }

  async onClose() {
    this.plugin.views.delete(this);
    if (this.instance) {
      this.instance.destroy();
      this.instance = null;
    }
  }

  // Called when the tasks note changes underneath us -- a hand edit, or another
  // device's copy arriving through vault sync.
  async refreshFromVault() {
    if (!this.instance) return;
    await this.plugin.storage.prime();
    const raw = this.plugin.storage.getItem(TASKS_KEY);
    try {
      this.instance.setTasks((JSON.parse(raw) || {}).tasks || []);
    } catch (error) {
      console.error("MedTodo: could not reload tasks", error);
    }
  }
}

// --- Settings ----------------------------------------------------------------
class MedTodoSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Tasks note")
      .setDesc("Path inside the vault where tasks are stored as a checklist.")
      .addText((text) =>
        text
          .setPlaceholder("Tasks.md")
          .setValue(this.plugin.settings.tasksPath)
          .onChange(async (value) => {
            this.plugin.settings.tasksPath = value.trim() || DEFAULT_SETTINGS.tasksPath;
            await this.plugin.saveSettings();
          })
      );

    const note = containerEl.createEl("div", { cls: "setting-item-description" });
    note.createEl("p", {
      text:
        "Tasks in the Clinical category are never written to this note. They are " +
        "kept in Obsidian's own storage, which lives outside the vault folder and " +
        "is not picked up by vault sync.",
    });
    note.createEl("p", {
      text:
        "Everything else in the note syncs however your vault syncs. If that is " +
        "iCloud Drive, it is only end-to-end encrypted when Advanced Data " +
        "Protection is enabled on your Apple account.",
    });
  }
}

// --- Plugin ------------------------------------------------------------------
module.exports = class MedTodoPlugin extends Plugin {
  async onload() {
    this.views = new Set();
    this.suppressReload = false;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.storage = await createVaultStorage(this);

    this.registerView(VIEW_TYPE, (leaf) => new MedTodoView(leaf, this));
    this.addRibbonIcon("checkmark", "Open tasks", () => this.activateView());
    this.addCommand({
      id: "open-tasks",
      name: "Open tasks",
      callback: () => this.activateView(),
    });
    this.addSettingTab(new MedTodoSettingTab(this.app, this));

    // Pick up hand edits and copies arriving from other devices.
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (this.suppressReload) return;
        if (file.path !== this.settings.tasksPath) return;
        this.views.forEach((view) => view.refreshFromVault());
      })
    );
  }

  async onunload() {
    // Make sure a pending debounced write is not lost on the way out.
    if (this.storage) await this.storage.flushNow();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
};

// Exposed for the test suite. Not part of the plugin's surface in Obsidian.
module.exports.__internals = { createVaultStorage, isPrivate, FILE_HEADER, TASKS_KEY };
