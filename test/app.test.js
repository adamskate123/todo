// Tests for app.js -- run with:  node test/app.test.js
const {
  test, assert, assertEqual, report, loadApp,
} = require("./harness");


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

// --- views and undo ---------------------------------------------------------
function seeded() {
  return loadApp(EVENING, [
    { id: "t1", title: "due today", priority: "high", category: "work",
      dueDate: "2026-09-08", dueTime: "09:00", completed: false,
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
      deleted: false },
    { id: "t2", title: "due later", priority: "low", category: "home",
      dueDate: "2026-09-11", dueTime: "", completed: false,
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
      deleted: false },
  ]);
}

test("only the active view is rendered", () => {
  const { api, elements } = seeded();
  api.setActiveView("today");
  assert(elements.get("#today-schedule").children.length > 0, "today view should be built");
  assertEqual(elements.get("#task-list").children.length, 0, "the list view should not be built");

  api.setActiveView("all");
  assert(elements.get("#task-list").children.length > 0, "list view should be built on demand");
});

test("tab counts reflect today and the coming week", () => {
  const { api, elements } = seeded();
  api.renderCounts();
  assertEqual(elements.get("#today-count").textContent, "1");
  assertEqual(elements.get("#week-count").textContent, "2");
});

test("counts are blank rather than zero when nothing is due", () => {
  const { api, elements } = loadApp(EVENING);
  api.renderCounts();
  assertEqual(elements.get("#today-count").textContent, "");
  assertEqual(elements.get("#week-count").textContent, "");
});

test("undo restores a deleted task", () => {
  const { api } = seeded();
  api.deleteTask("t1");
  assertEqual(api.liveTasks().length, 1);

  api.showUndo("Deleted", ["t1"]);
  api.undoDelete();
  assertEqual(api.liveTasks().length, 2, "the task should come back");
  const restored = api.getTasks().find((x) => x.id === "t1");
  assertEqual(restored.deleted, false);
});

test("an undone delete outranks the tombstone on another device", () => {
  const { api } = seeded();
  api.deleteTask("t1");
  const tombstone = api.getTasks().find((x) => x.id === "t1");

  api.showUndo("Deleted", ["t1"]);
  api.undoDelete();
  const restored = api.getTasks().find((x) => x.id === "t1");

  assert(Date.parse(restored.updatedAt) >= Date.parse(tombstone.updatedAt),
    "the restore must not look older than the delete it reverses");
  const merged = api.mergeTaskLists([restored], [tombstone]);
  assertEqual(merged[0].deleted, false, "restore should win the merge");
});

test("clear completed can be undone", () => {
  const { api } = seeded();
  api.updateTask("t1", { completed: true });
  api.updateTask("t2", { completed: true });
  api.handleClearCompleted();
  assertEqual(api.liveTasks().length, 0);

  api.undoDelete();
  assertEqual(api.liveTasks().length, 2, "both cleared tasks should return");
});

test("clear completed does nothing when there is nothing completed", () => {
  const { api, elements } = seeded();
  const toast = elements.get("#toast");
  toast.hidden = true; // as the markup ships it
  api.handleClearCompleted();
  assertEqual(api.liveTasks().length, 2);
  assertEqual(toast.hidden, true, "no undo should be offered when nothing changed");
});

// --- seasonal theme ---------------------------------------------------------
test("seasons follow the meteorological calendar", () => {
  const { api } = loadApp(EVENING);
  const expected = [
    "winter", "winter", "spring", "spring", "spring", "summer",
    "summer", "summer", "autumn", "autumn", "autumn", "winter",
  ];
  expected.forEach((season, index) => {
    assertEqual(api.seasonForDate(new Date(2026, index, 15)), season, `month index ${index}`);
  });
});

test("season boundaries land on the right side", () => {
  const { api } = loadApp(EVENING);
  assertEqual(api.seasonForDate(new Date(2026, 1, 28)), "winter", "end of February");
  assertEqual(api.seasonForDate(new Date(2026, 2, 1)), "spring", "start of March");
  assertEqual(api.seasonForDate(new Date(2026, 10, 30)), "autumn", "end of November");
  assertEqual(api.seasonForDate(new Date(2026, 11, 1)), "winter", "start of December");
});

test("a pinned season overrides the calendar", () => {
  const { api } = loadApp(EVENING);
  const midsummer = new Date(2026, 6, 4);
  assertEqual(api.resolveSeason("auto", midsummer), "summer");
  assertEqual(api.resolveSeason("winter", midsummer), "winter");
  assertEqual(api.resolveSeason("nonsense", midsummer), "summer", "junk falls back to the calendar");
});

test("applySeason marks the document and labels the chip", () => {
  const { api, elements, context } = loadApp(EVENING);
  assertEqual(api.applySeason(), "autumn", "September should be autumn");
  assertEqual(context.document.documentElement.dataset.season, "autumn");
  assertEqual(elements.get("#season-chip").textContent, "🍂 Autumn");
});

test("the chip cycles through the seasons and back to automatic", () => {
  const { api, store } = loadApp(EVENING);
  const seen = [];
  for (let i = 0; i < 5; i++) {
    api.cycleSeason();
    seen.push(store.get("todo.season"));
  }
  assertEqual(seen.join(","), "spring,summer,autumn,winter,auto");
});

test("a stored season wins over the calendar on load", () => {
  const { api, store, context } = loadApp(EVENING);
  store.set("todo.season", "winter");
  assertEqual(api.applySeason(), "winter");
  assertEqual(context.document.documentElement.dataset.season, "winter");
});

// --- Obsidian markdown round trip -------------------------------------------
function markdownFixture(tasks) {
  const app = loadApp(EVENING, tasks);
  app.api.exportMarkdown();
  return { app, markdown: app.elements.get("#markdown-area").value };
}

function makeTask(overrides) {
  return Object.assign({
    id: "t1", title: "A task", notes: "", priority: "medium", category: "work",
    tag: "", dueDate: "", dueTime: "", recurrence: "", completed: false,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z",
    deleted: false,
  }, overrides);
}

test("a title containing an em dash survives the round trip", () => {
  // The old parser split on " — " and truncated the title at the dash.
  const { markdown } = markdownFixture([
    makeTask({ title: "Clinic — new patient consults", category: "clinical" }),
  ]);
  const back = loadApp(EVENING).api.parseMarkdown(markdown);
  assertEqual(back.length, 1);
  assertEqual(back[0].title, "Clinic — new patient consults");
  assertEqual(back[0].notes, "", "the tail of the title must not become notes");
});

test("a due time keeps its minutes", () => {
  // "due: 2026-09-11 14:00" used to be cut at the first colon, leaving "14".
  const { markdown } = markdownFixture([
    makeTask({ title: "Grant call", dueDate: "2026-09-11", dueTime: "14:30" }),
  ]);
  const back = loadApp(EVENING).api.parseMarkdown(markdown)[0];
  assertEqual(back.dueDate, "2026-09-11");
  assertEqual(back.dueTime, "14:30");
});

test("notes round-trip on their own line", () => {
  const { markdown } = markdownFixture([
    makeTask({ title: "Call family", notes: "ask re: meds (levetiracetam), then chart" }),
  ]);
  const back = loadApp(EVENING).api.parseMarkdown(markdown)[0];
  assertEqual(back.notes, "ask re: meds (levetiracetam), then chart");
  assertEqual(back.title, "Call family");
});

test("a tag is not stripped out of the middle of a title", () => {
  const { markdown } = markdownFixture([
    makeTask({ title: "Follow up on #3 from rounds", tag: "#clinic" }),
  ]);
  const back = loadApp(EVENING).api.parseMarkdown(markdown)[0];
  assertEqual(back.title, "Follow up on #3 from rounds");
  assertEqual(back.tag, "#clinic");
});

test("a title ending in brackets is not mistaken for metadata", () => {
  const { markdown } = markdownFixture([
    makeTask({ title: "Review protocol (draft)", category: "research" }),
  ]);
  const back = loadApp(EVENING).api.parseMarkdown(markdown)[0];
  assertEqual(back.title, "Review protocol (draft)");
  assertEqual(back.category, "research", "the real metadata should still be read");
});

test("every field survives a full round trip", () => {
  const original = makeTask({
    title: "Draft R01 aims — specific aims page", notes: "co-authors, then submit",
    priority: "high", category: "research", tag: "#grant",
    dueDate: "2026-09-11", dueTime: "09:05", recurrence: "weekly", completed: true,
  });
  const { markdown } = markdownFixture([original]);
  const back = loadApp(EVENING).api.parseMarkdown(markdown)[0];
  ["title", "notes", "priority", "category", "tag", "dueDate", "dueTime",
   "recurrence", "completed"].forEach((field) => {
    assertEqual(back[field], original[field], field + "\n    markdown: " + markdown);
  });
});

test("deleted tasks are not exported", () => {
  const { markdown } = markdownFixture([
    makeTask({ id: "a", title: "Still here" }),
    makeTask({ id: "b", title: "TOMBSTONE_CANARY", deleted: true,
               deletedAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }),
  ]);
  assert(markdown.includes("Still here"));
  assert(!markdown.includes("TOMBSTONE_CANARY"), "a deleted task must not be exported");
});

test("imported tasks are normalized so sync can merge them", () => {
  const back = loadApp(EVENING).api.parseMarkdown("- [ ] Typed by hand");
  assertEqual(back.length, 1);
  assert(back[0].id, "should be given an id");
  assert(back[0].updatedAt, "should carry updatedAt or a later merge cannot order it");
  assertEqual(back[0].deleted, false);
});

test("a hand-written checklist imports with sane defaults", () => {
  const back = loadApp(EVENING).api.parseMarkdown("- [ ] Buy milk\n- [x] Call the school");
  assertEqual(back.length, 2);
  assertEqual(back[0].title, "Buy milk");
  assertEqual(back[0].priority, "medium");
  assertEqual(back[0].category, "work");
  assertEqual(back[1].completed, true);
});

test("prose around the checklist is ignored, not turned into tasks", () => {
  const doc = [
    "# This week",
    "",
    "- [ ] A real task (priority: high, category: work)",
    "      with a note",
    "",
    "Some closing prose.",
  ].join("\n");
  const back = loadApp(EVENING).api.parseMarkdown(doc);
  assertEqual(back.length, 1, "only the checkbox line is a task");
  assertEqual(back[0].notes, "with a note");
});

test("importMarkdown adds the parsed tasks to the list", () => {
  const app = loadApp(EVENING, [makeTask({ id: "existing", title: "Already here" })]);
  app.elements.get("#markdown-area").value =
    "- [ ] From the note (priority: low, category: home)";
  app.api.importMarkdown();
  const titles = app.api.liveTasks().map((t) => t.title).sort();
  assertEqual(titles.join(" | "), "Already here | From the note");
});

test("re-importing an export does not duplicate tasks", () => {
  const app = loadApp(EVENING, [
    makeTask({ id: "a", title: "Clinic — consults", dueDate: "2026-09-08", dueTime: "08:30" }),
    makeTask({ id: "b", title: "Soccer pickup", dueDate: "2026-09-08", dueTime: "17:30" }),
  ]);
  app.api.exportMarkdown();
  const markdown = app.elements.get("#markdown-area").value;

  app.elements.get("#markdown-area").value = markdown;
  app.api.importMarkdown();
  assertEqual(app.api.liveTasks().length, 2, "importing your own export should be a no-op");

  app.api.importMarkdown();
  assertEqual(app.api.liveTasks().length, 2, "and still a no-op the second time");
});

test("a genuinely new task in the markdown is still imported", () => {
  const app = loadApp(EVENING, [
    makeTask({ id: "a", title: "Existing", dueDate: "2026-09-08", dueTime: "08:30" }),
  ]);
  app.elements.get("#markdown-area").value = [
    "- [ ] Existing (priority: medium, category: work, due: 2026-09-08 08:30)",
    "- [ ] Brand new (priority: high, category: home)",
  ].join("\n");
  app.api.importMarkdown();
  const titles = app.api.liveTasks().map((x) => x.title).sort();
  assertEqual(titles.join(" | "), "Brand new | Existing");
});

test("same title at a different time is treated as a different task", () => {
  const app = loadApp(EVENING, [
    makeTask({ id: "a", title: "Ward round", dueDate: "2026-09-08", dueTime: "08:00" }),
  ]);
  app.elements.get("#markdown-area").value =
    "- [ ] Ward round (priority: medium, category: work, due: 2026-09-08 16:00)";
  app.api.importMarkdown();
  assertEqual(app.api.liveTasks().length, 2, "a second round that day is a real task");
});

report();
