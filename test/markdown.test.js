// Tests for todo-markdown.js -- run with:  node test/markdown.test.js
// This module is plain CommonJS, so it is required directly rather than run in
// a vm.
const { test, assert, assertEqual, report } = require("./harness");
const md = require("../todo-markdown.js");

function task(overrides) {
  return Object.assign({
    id: "t1", title: "A task", notes: "", priority: "medium", category: "work",
    tag: "", dueDate: "", dueTime: "", recurrence: "", completed: false,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z",
    deleted: false,
  }, overrides);
}

const FIELDS = ["id", "title", "notes", "priority", "category", "tag",
                "dueDate", "dueTime", "recurrence", "completed",
                "createdAt", "updatedAt"];

function assertRoundTrip(original, label) {
  const line = md.serializeTask(original);
  const back = md.parseTaskLine(line);
  assert(back, `${label}: line should parse\n    ${line}`);
  FIELDS.forEach((field) => {
    assertEqual(back[field], original[field], `${label}: ${field}\n    line: ${line}`);
  });
}

test("a plain task round-trips", () => {
  assertRoundTrip(task({ title: "Sign EEG reports" }), "plain");
});

test("every field round-trips", () => {
  assertRoundTrip(task({
    title: "Draft R01 aims", notes: "call back, then chart", priority: "high",
    category: "research", tag: "#grant", dueDate: "2026-09-11", dueTime: "09:00",
    recurrence: "weekly", completed: true,
  }), "full");
});

test("titles with characters that broke the old parser round-trip", () => {
  [
    "Review EEG <30Hz findings",
    "Chart review & billing",
    "Discuss plan — with the family",
    "Review protocol (draft)",
    "Weigh options (a) and (b)",
    "Follow up re: #3 on the list",
    'Ask about "the other" study',
    "Case 5 [pending]",
  ].forEach((title) => assertRoundTrip(task({ title }), title));
});

test("a title ending in parentheses is not mistaken for metadata", () => {
  const line = md.serializeTask(task({ title: "Review protocol (draft)", category: "work" }));
  const back = md.parseTaskLine(line);
  assertEqual(back.title, "Review protocol (draft)");
  assertEqual(back.category, "work");
});

test("a title containing an em dash survives the current format", () => {
  // The pre-v2 parser split on " — " and lost everything after it.
  const original = task({ title: "Clinic — new patient consults", notes: "bring films" });
  assertRoundTrip(original, "em dash");
});

test("notes containing commas and parentheses survive", () => {
  assertRoundTrip(task({
    title: "Call family", notes: "ask re: meds (levetiracetam), then chart",
  }), "punctuated notes");
});

test("the hidden comment can never terminate early", () => {
  const line = md.serializeTask(task({ notes: "look at --> this", title: "x --> y" }));
  const marker = line.indexOf("<!--medtodo");
  const body = line.slice(marker, line.length - 3);
  assert(!body.includes("-->"), "the comment body must not contain a terminator");
  assertEqual(md.parseTaskLine(line).notes, "look at --> this");
});

test("checked and unchecked boxes are read correctly", () => {
  assertEqual(md.parseTaskLine("- [x] Done <!--medtodo {}-->").completed, true);
  assertEqual(md.parseTaskLine("- [X] Done <!--medtodo {}-->").completed, true);
  assertEqual(md.parseTaskLine("- [ ] Not done <!--medtodo {}-->").completed, false);
});

test("non-task lines are ignored", () => {
  const doc = [
    "# My tasks",
    "",
    "Some prose about the week.",
    "- [ ] A real task <!--medtodo {\"id\":\"a\"}-->",
    "- not a checkbox",
    "",
  ].join("\n");
  const parsed = md.parseTasks(doc);
  assertEqual(parsed.length, 1);
  assertEqual(parsed[0].title, "A real task");
});

test("a hand-written checklist with no metadata still imports", () => {
  const parsed = md.parseTasks("- [ ] Buy milk\n- [x] Call the school");
  assertEqual(parsed.length, 2);
  assertEqual(parsed[0].title, "Buy milk");
  assertEqual(parsed[0].priority, "medium", "should fall back to a sane default");
  assertEqual(parsed[0].category, "work");
  assertEqual(parsed[1].completed, true);
});

test("hand edits to the visible part are picked up", () => {
  const line = md.serializeTask(task({ id: "keep-me", title: "Old title" }));
  const edited = line.replace("Old title", "New title after hand edit");
  const back = md.parseTaskLine(edited);
  assertEqual(back.title, "New title after hand edit");
  assertEqual(back.id, "keep-me", "the identity should survive a hand edit");
});

test("the pre-v2 export format still imports", () => {
  const legacy = "- [x] Call Dr. Smith — bring the MRI disc #urgent " +
                 "(priority: high, category: clinical, due: 2026-09-11 14:00, recurrence: weekly)";
  const t = md.parseTaskLine(legacy);
  assertEqual(t.title, "Call Dr. Smith");
  assertEqual(t.notes, "bring the MRI disc");
  assertEqual(t.tag, "#urgent");
  assertEqual(t.priority, "high");
  assertEqual(t.category, "clinical");
  assertEqual(t.dueDate, "2026-09-11");
  assertEqual(t.dueTime, "14:00");
  assertEqual(t.recurrence, "weekly");
  assertEqual(t.completed, true);
});

test("a whole document round-trips", () => {
  const tasks = [
    task({ id: "a", title: "Clinic — consults", category: "clinical", priority: "high", dueDate: "2026-09-08", dueTime: "08:30" }),
    task({ id: "b", title: "Soccer pickup (Tuesdays)", category: "home", tag: "#family", recurrence: "weekly" }),
    task({ id: "c", title: "Manuscript revisions", category: "research", completed: true, notes: "co-authors, then submit" }),
  ];
  const parsed = md.parseTasks(md.serializeTasks(tasks));
  assertEqual(parsed.length, 3);
  tasks.forEach((original, i) => {
    FIELDS.forEach((f) => assertEqual(parsed[i][f], original[f], `task ${i} ${f}`));
  });
});

report();
