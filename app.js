const STORAGE_KEY = "todo.tasks";

// --- Storage schema --------------------------------------------------------
// v1 stored a bare array of tasks. v2 stores { version, tasks } and gives every
// task an updatedAt plus a soft-delete flag, which is what makes cross-device
// merging possible at all.
// These must stay above the `let tasks = loadTasks()` call below: loadTasks()
// reads them, and a `const` referenced before its initializer throws.
const SCHEMA_VERSION = 2;
const TOMBSTONE_RETENTION_DAYS = 90;

// Form elements
const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const taskNotes = document.querySelector("#task-notes");
const taskPriority = document.querySelector("#task-priority");
const taskCategory = document.querySelector("#task-category");
const taskTag = document.querySelector("#task-tag");
const taskDueDate = document.querySelector("#task-due-date");
const taskDueTime = document.querySelector("#task-due-time");
const taskRecurrence = document.querySelector("#task-recurrence");

// Display elements
const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const searchInput = document.querySelector("#search-input");
const filterButtons = document.querySelectorAll(".filter");
const categoryFilterButtons = document.querySelectorAll(".category-filter");
const clearCompletedButton = document.querySelector("#clear-completed");

// Quick capture
const quickCaptureInput = document.querySelector("#quick-capture-input");
const quickCaptureBtn = document.querySelector("#quick-capture-btn");
const floatingQuickAddBtn = document.querySelector("#floating-quick-add");

// Templates
const templateButtons = document.querySelectorAll(".template-btn");

// Markdown
const markdownArea = document.querySelector("#markdown-area");
const exportMarkdownButton = document.querySelector("#export-markdown");
const importMarkdownButton = document.querySelector("#import-markdown");
const copyMarkdownButton = document.querySelector("#copy-markdown");

// JSON Export/Import
const exportJsonButton = document.querySelector("#export-json");
const importJsonButton = document.querySelector("#import-json-btn");
const importJsonFile = document.querySelector("#import-json-file");

// Calendar Integration
const exportCalendarButton = document.querySelector("#export-calendar");
const todaySchedule = document.querySelector("#today-schedule");
const todayCount = document.querySelector("#today-count");
const weekView = document.querySelector("#week-view");

// Date filter
const calendarDate = document.querySelector("#calendar-date");
const clearDateFilterButton = document.querySelector("#clear-date-filter");

// View tabs
const tabButtons = document.querySelectorAll(".tab");
const viewPanels = document.querySelectorAll(".view");
const weekCount = document.querySelector("#week-count");

// Season
const seasonChip = document.querySelector("#season-chip");

// Undo toast
const toast = document.querySelector("#toast");
const toastMessage = document.querySelector("#toast-message");
const toastAction = document.querySelector("#toast-action");

// Edit modal
const editModal = document.querySelector("#edit-modal");
const editForm = document.querySelector("#edit-form");
const closeModalBtn = document.querySelector("#close-modal");
const cancelEditBtn = document.querySelector("#cancel-edit");
const editTitle = document.querySelector("#edit-title");
const editNotes = document.querySelector("#edit-notes");
const editPriority = document.querySelector("#edit-priority");
const editCategory = document.querySelector("#edit-category");
const editTag = document.querySelector("#edit-tag");
const editDueDate = document.querySelector("#edit-due-date");
const editDueTime = document.querySelector("#edit-due-time");
const editRecurrence = document.querySelector("#edit-recurrence");

// State
let tasks = loadTasks();
let activeFilter = "all";
let activeView = "today";
let activeCategory = "";
let activeDate = "";
let currentEditingTaskId = null;

// Task templates
const TEMPLATES = {
  "patient-referral": {
    title: "New Patient Referral",
    notes: "Review referral, Schedule initial consultation, Prepare case history",
    priority: "high",
    category: "clinical",
    tag: "#patient",
  },
  "research-review": {
    title: "Research Paper Review",
    notes: "Read abstract, Review methodology, Analyze results, Write summary",
    priority: "medium",
    category: "research",
    tag: "#paper",
  },
  "conference-prep": {
    title: "Conference Preparation",
    notes: "Prepare abstract, Create presentation slides, Rehearse talk, Book travel",
    priority: "medium",
    category: "research",
    tag: "#conference",
  },
  "family-event": {
    title: "Family Event",
    notes: "Plan activity, Confirm schedules, Make arrangements",
    priority: "low",
    category: "home",
    tag: "#family",
  },
};

function generateId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- Local calendar dates --------------------------------------------------
// toISOString() returns a UTC date. Using it to answer "what day is it" shifts
// the calendar day for anyone not on UTC -- e.g. after ~8pm US Eastern it
// reports tomorrow, so "Today's Schedule" silently showed the wrong day every
// evening. Every *calendar date* (dueDate, today, the week grid) goes through
// these helpers. Point-in-time stamps (createdAt/updatedAt) stay ISO/UTC.
function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function todayString() {
  return toLocalDateString(new Date());
}

// Build an element without going through innerHTML, so task titles can never
// be parsed as markup.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function normalizeTask(task) {
  const createdAt = task.createdAt || new Date().toISOString();
  return {
    notes: "",
    tag: "",
    dueDate: "",
    dueTime: "",
    recurrence: "",
    priority: "medium",
    category: "work",
    completed: false,
    ...task,
    createdAt,
    // Pre-v2 tasks have no updatedAt. Seeding it from createdAt keeps them from
    // looking newer than they are during a merge.
    updatedAt: task.updatedAt || createdAt,
    deleted: task.deleted === true,
  };
}

// Deleted tasks are kept as tombstones so a delete on one device wins over a
// stale copy on another instead of the task reappearing. They are dropped once
// every device has certainly seen the deletion.
function purgeOldTombstones(list) {
  const cutoff = Date.now() - TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return list.filter((task) => {
    if (!task.deleted) return true;
    const at = Date.parse(task.deletedAt || task.updatedAt || "");
    return Number.isNaN(at) || at > cutoff;
  });
}

function loadTasks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && Array.isArray(parsed.tasks)
      ? parsed.tasks
      : [];
    return purgeOldTombstones(list.map(normalizeTask));
  } catch (error) {
    // Returning [] here means the next saveTasks() would overwrite whatever is
    // in storage, so keep a copy of the unreadable value first.
    console.error("Unable to read saved tasks; preserving a copy", error);
    try {
      localStorage.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, raw);
    } catch (nested) {
      console.error("Could not preserve unreadable tasks", nested);
    }
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: SCHEMA_VERSION, tasks })
  );
  // Debounced; a no-op until sync is configured.
  if (window.MedTodoSync) {
    window.MedTodoSync.scheduleAutosync();
  }
}

// Everything the user should actually see. Tombstones stay in `tasks` for sync
// but must never reach the UI.
function liveTasks() {
  return tasks.filter((task) => !task.deleted);
}

// Merge two task lists by id: newest updatedAt wins. A deletion is just a
// tombstone with a timestamp, so it competes on the same footing as an edit.
function mergeTaskLists(mine, theirs) {
  const byId = new Map();
  mine.map(normalizeTask).forEach((task) => byId.set(task.id, task));
  theirs.map(normalizeTask).forEach((incoming) => {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, incoming);
      return;
    }
    const mineAt = Date.parse(existing.updatedAt) || 0;
    const theirsAt = Date.parse(incoming.updatedAt) || 0;
    byId.set(incoming.id, theirsAt > mineAt ? incoming : existing);
  });
  return Array.from(byId.values());
}

function addTask({ title, notes, priority, category, tag, dueDate, dueTime, recurrence }) {
  if (!title.trim()) {
    return;
  }

  const now = new Date().toISOString();
  const task = {
    id: generateId(),
    title: title.trim(),
    notes: notes.trim(),
    priority,
    category,
    tag: tag.trim(),
    dueDate,
    dueTime: dueTime || "",
    recurrence: recurrence || "",
    completed: false,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };

  tasks.unshift(task);
  saveTasks();
  render();

  return task;
}

function updateTask(id, updates) {
  const now = new Date().toISOString();
  tasks = tasks.map((task) =>
    task.id === id ? { ...task, ...updates, updatedAt: now } : task
  );
  saveTasks();
  render();
}

function deleteTask(id) {
  const now = new Date().toISOString();
  tasks = tasks.map((task) =>
    task.id === id
      ? { ...task, deleted: true, deletedAt: now, updatedAt: now }
      : task
  );
  saveTasks();
  render();
}

function clearCompleted() {
  const now = new Date().toISOString();
  tasks = tasks.map((task) =>
    task.completed && !task.deleted
      ? { ...task, deleted: true, deletedAt: now, updatedAt: now }
      : task
  );
  saveTasks();
  render();
}

function completeTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  // Mark as completed
  updateTask(id, { completed: true });

  // If recurring, create next occurrence
  if (task.recurrence && task.dueDate) {
    const nextDate = calculateNextDate(task.dueDate, task.recurrence);
    if (nextDate) {
      addTask({
        title: task.title,
        notes: task.notes,
        priority: task.priority,
        category: task.category,
        tag: task.tag,
        dueDate: nextDate,
        dueTime: task.dueTime,
        recurrence: task.recurrence,
      });
    }
  }
}

function calculateNextDate(dateString, recurrence) {
  const date = parseLocalDate(dateString);

  switch (recurrence) {
    case "daily":
      date.setDate(date.getDate() + 1);
      break;
    case "weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    default:
      return null;
  }

  return toLocalDateString(date);
}

function filterTasks(list) {
  const search = searchInput.value.trim().toLowerCase();
  return list.filter((task) => {
    const matchesDate = !activeDate || task.dueDate === activeDate;
    const matchesSearch =
      !search ||
      [task.title, task.notes, task.tag, task.category]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(search));
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "active" && !task.completed) ||
      (activeFilter === "completed" && task.completed);
    const matchesCategory = !activeCategory || task.category === activeCategory;
    return matchesDate && matchesSearch && matchesFilter && matchesCategory;
  });
}

function sortTasks(list) {
  return list.slice().sort((a, b) => {
    // Sort by date first
    if (a.dueDate && b.dueDate) {
      const dateCompare = a.dueDate.localeCompare(b.dueDate);
      if (dateCompare !== 0) return dateCompare;

      // If same date, sort by time
      if (a.dueTime && b.dueTime) {
        return a.dueTime.localeCompare(b.dueTime);
      }
      if (a.dueTime) return -1;
      if (b.dueTime) return 1;
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;

    // No dates, sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

function renderTaskList() {
  const visibleTasks = sortTasks(filterTasks(liveTasks()));
  taskList.innerHTML = "";

  visibleTasks.forEach((task) => {
    const listItem = document.createElement("li");
    listItem.className = `task${task.completed ? " completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        completeTask(task.id);
      } else {
        updateTask(task.id, { completed: false });
      }
    });

    const title = document.createElement("div");
    title.className = "task__title";

    const titleText = document.createElement("span");
    titleText.textContent = task.title;

    const notesText = document.createElement("small");
    notesText.textContent = task.notes || "No notes";
    notesText.className = "muted";

    const meta = document.createElement("div");
    meta.className = "task__meta";

    const category = document.createElement("span");
    category.className = `badge badge-${task.category}`;
    category.textContent = task.category ? `${task.category.charAt(0).toUpperCase() + task.category.slice(1)}` : "No category";

    const priority = document.createElement("span");
    priority.className = `badge badge-priority-${task.priority}`;
    priority.textContent = `Priority: ${task.priority}`;

    const tag = document.createElement("span");
    tag.className = "badge";
    tag.textContent = task.tag ? `${task.tag}` : "No tag";

    const dueDate = document.createElement("span");
    dueDate.className = "badge";
    if (task.dueDate) {
      const dateText = task.dueTime ? `${task.dueDate} ${task.dueTime}` : task.dueDate;
      dueDate.textContent = `Due: ${dateText}`;
    } else {
      dueDate.textContent = "No due date";
    }

    if (task.recurrence) {
      const recurrence = document.createElement("span");
      recurrence.className = "badge badge-recurrence";
      recurrence.textContent = `↻ ${task.recurrence}`;
      meta.append(recurrence);
    }

    meta.append(category, priority, tag, dueDate);
    title.append(titleText, notesText, meta);

    const actions = document.createElement("div");
    actions.className = "task__actions";

    const editButton = document.createElement("button");
    editButton.className = "secondary";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => startEdit(task));

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      deleteTask(task.id);
      showUndo(`Deleted "${task.title}"`, [task.id]);
    });

    actions.append(editButton, deleteButton);

    listItem.append(checkbox, title, actions);
    taskList.append(listItem);
  });

}

function renderCounts() {
  const counted = liveTasks();
  const categoryStats = counted.reduce((acc, task) => {
    acc[task.category] = (acc[task.category] || 0) + 1;
    return acc;
  }, {});

  let countText = `${counted.length} task${counted.length !== 1 ? "s" : ""}`;
  if (activeCategory) {
    const catCount = categoryStats[activeCategory] || 0;
    countText += ` (${catCount} ${activeCategory})`;
  }
  taskCount.textContent = countText;

  const todayTotal = getTodaysTasks().length;
  todayCount.textContent = todayTotal ? String(todayTotal) : "";

  const weekTotal = Object.values(getWeekTasks())
    .reduce((sum, day) => sum + day.tasks.length, 0);
  if (weekCount) weekCount.textContent = weekTotal ? String(weekTotal) : "";
}

// Only the visible panel is rebuilt. Searching used to re-render every view on
// each keystroke, which is what made large lists feel sluggish.
function render() {
  renderCounts();
  if (activeView === "today") {
    renderTodaySchedule();
  } else if (activeView === "week") {
    renderWeekView();
  } else {
    renderTaskList();
  }
}

function setActiveView(view) {
  activeView = view;
  tabButtons.forEach((button) => {
    const selected = button.dataset.view === view;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  viewPanels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== view;
  });
  render();
}

function startEdit(task) {
  currentEditingTaskId = task.id;

  // Populate the form
  editTitle.value = task.title;
  editNotes.value = task.notes || "";
  editPriority.value = task.priority;
  editCategory.value = task.category;
  editTag.value = task.tag || "";
  editDueDate.value = task.dueDate || "";
  editDueTime.value = task.dueTime || "";
  editRecurrence.value = task.recurrence || "";

  // Show the modal
  editModal.style.display = "flex";
  editTitle.focus();
}

function closeEditModal() {
  editModal.style.display = "none";
  currentEditingTaskId = null;
  editForm.reset();
}

function handleEditSubmit(event) {
  event.preventDefault();

  if (!currentEditingTaskId) return;

  updateTask(currentEditingTaskId, {
    title: editTitle.value.trim(),
    notes: editNotes.value.trim(),
    priority: editPriority.value,
    category: editCategory.value,
    tag: editTag.value.trim(),
    dueDate: editDueDate.value,
    dueTime: editDueTime.value,
    recurrence: editRecurrence.value,
  });

  closeEditModal();
}

function normalizePriority(value) {
  const cleaned = value.toLowerCase();
  if (["low", "medium", "high"].includes(cleaned)) {
    return cleaned;
  }
  return "medium";
}

function normalizeCategory(value) {
  const cleaned = value.toLowerCase();
  if (["work", "home", "research", "clinical", "teaching"].includes(cleaned)) {
    return cleaned;
  }
  return "work";
}

function normalizeRecurrence(value) {
  const cleaned = value.toLowerCase();
  if (["daily", "weekly", "monthly"].includes(cleaned)) {
    return cleaned;
  }
  return "";
}

function parseQuickCapture(text) {
  let title = text;
  let priority = "medium";
  let category = "work";
  let tag = "";
  let dueDate = "";
  let dueTime = "";
  let notes = "";

  // Extract notes (notes:something or note:something)
  const notesMatch = text.match(/notes?:\s*([^#!]+?)(?=\s+(?:#|!|category:|$))/i);
  if (notesMatch) {
    notes = notesMatch[1].trim();
    title = title.replace(notesMatch[0], "").trim();
  }

  // Extract priority (!high, !medium, !low, or !! for high, ! for medium)
  const priorityMatch = text.match(/!(high|medium|low)|!!+|!/i);
  if (priorityMatch) {
    if (priorityMatch[0] === "!!!") {
      priority = "high";
    } else if (priorityMatch[0] === "!!") {
      priority = "high";
    } else if (priorityMatch[0] === "!") {
      priority = "medium";
    } else {
      priority = priorityMatch[1].toLowerCase();
    }
    title = title.replace(priorityMatch[0], "").trim();
  }

  // Extract category (category:work, or just category name at end)
  const categoryMatch = text.match(/category:\s*(work|home|research|clinical|teaching)/i);
  if (categoryMatch) {
    category = categoryMatch[1].toLowerCase();
    title = title.replace(categoryMatch[0], "").trim();
  } else {
    // Check for category name without prefix at the end
    const implicitCategoryMatch = text.match(/\b(work|home|research|clinical|teaching)\s*$/i);
    if (implicitCategoryMatch) {
      category = implicitCategoryMatch[1].toLowerCase();
      title = title.replace(implicitCategoryMatch[0], "").trim();
    }
  }

  // Extract tag (#something)
  const tagMatch = text.match(/#\w[\w-]*/);
  if (tagMatch) {
    tag = tagMatch[0];
    title = title.replace(tagMatch[0], "").trim();
  }

  // Extract time (improved: 2pm, 2:30pm, 14:00, 8a, 8p, "at 9a", etc.)
  // Match time with optional "at" preposition
  const timeMatch = text.match(/(?:at\s+)?(?:(\d{1,2})(?::(\d{2}))?\s*([ap]m?|AM?|PM?)\b|(\d{1,2}):(\d{2})\b)/i);
  if (timeMatch) {
    let hours, minutes, meridiem;

    if (timeMatch[4]) {
      // Matched HH:MM without meridiem (e.g., "14:00")
      hours = parseInt(timeMatch[4]);
      minutes = timeMatch[5];
      meridiem = null;
    } else {
      // Matched with optional meridiem
      hours = parseInt(timeMatch[1]);
      minutes = timeMatch[2] || "00";
      meridiem = timeMatch[3]?.toLowerCase();

      // Normalize "a" to "am" and "p" to "pm"
      if (meridiem === "a") meridiem = "am";
      if (meridiem === "p") meridiem = "pm";
    }

    // Only process as time if it makes sense (1-12 with am/pm, or 0-23 without)
    const isValidTime = (meridiem && hours >= 1 && hours <= 12) ||
                        (!meridiem && hours >= 0 && hours <= 23);

    if (isValidTime) {
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;

      dueTime = `${hours.toString().padStart(2, "0")}:${minutes}`;
      // Remove the entire match including "at" if present
      title = title.replace(timeMatch[0], "").trim();
    }
  }

  // Extract date (enhanced natural language)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Handle "in X days/weeks"
  const inDaysMatch = text.match(/\bin\s+(\d+)\s+(day|days|week|weeks)\b/i);
  if (inDaysMatch) {
    const num = parseInt(inDaysMatch[1]);
    const unit = inDaysMatch[2].toLowerCase();
    const targetDate = new Date(today);

    if (unit.startsWith('day')) {
      targetDate.setDate(targetDate.getDate() + num);
    } else if (unit.startsWith('week')) {
      targetDate.setDate(targetDate.getDate() + (num * 7));
    }

    dueDate = toLocalDateString(targetDate);
    title = title.replace(inDaysMatch[0], "").trim();
  }
  // Handle "next [day]" (e.g., "next monday", "next friday")
  else if (text.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)) {
    const dayMatch = text.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const targetDayName = dayMatch[1].toLowerCase();
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDayIndex = daysOfWeek.indexOf(targetDayName);
    const currentDayIndex = today.getDay();

    let daysUntil = targetDayIndex - currentDayIndex;
    if (daysUntil <= 0) daysUntil += 7; // Next week

    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysUntil);
    dueDate = toLocalDateString(targetDate);
    title = title.replace(dayMatch[0], "").trim();
  }
  // Handle day names (next occurrence)
  else if (text.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)) {
    const dayMatch = text.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const targetDayName = dayMatch[1].toLowerCase();
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDayIndex = daysOfWeek.indexOf(targetDayName);
    const currentDayIndex = today.getDay();

    let daysUntil = targetDayIndex - currentDayIndex;
    if (daysUntil <= 0) daysUntil += 7; // If today or past, go to next week

    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysUntil);
    dueDate = toLocalDateString(targetDate);
    title = title.replace(dayMatch[0], "").trim();
  }
  // Handle "next week"
  else if (/\bnext\s+week\b/i.test(text)) {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    dueDate = toLocalDateString(nextWeek);
    title = title.replace(/\bnext\s+week\b/i, "").trim();
  }
  // Handle "tomorrow"
  else if (/\btomorrow\b/i.test(text)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dueDate = toLocalDateString(tomorrow);
    title = title.replace(/\btomorrow\b/i, "").trim();
  }
  // Handle "today"
  else if (/\btoday\b/i.test(text)) {
    dueDate = toLocalDateString(today);
    title = title.replace(/\btoday\b/i, "").trim();
  }
  // Handle YYYY-MM-DD format
  else {
    const dateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (dateMatch) {
      dueDate = dateMatch[0];
      title = title.replace(dateMatch[0], "").trim();
    }
  }

  return {
    title: title.trim(),
    priority,
    category,
    tag,
    dueDate,
    dueTime,
    notes,
  };
}

function handleQuickCapture() {
  const text = quickCaptureInput.value.trim();
  if (!text) return;

  const parsed = parseQuickCapture(text);
  addTask({
    title: parsed.title,
    notes: parsed.notes || "",
    priority: parsed.priority,
    category: parsed.category,
    tag: parsed.tag,
    dueDate: parsed.dueDate,
    dueTime: parsed.dueTime,
    recurrence: "",
  });

  quickCaptureInput.value = "";
}

function applyTemplate(templateName) {
  const template = TEMPLATES[templateName];
  if (!template) return;

  taskInput.value = template.title;
  taskNotes.value = template.notes;
  taskPriority.value = template.priority;
  taskCategory.value = template.category;
  taskTag.value = template.tag;

  // Scroll to form
  taskForm.scrollIntoView({ behavior: "smooth", block: "start" });
  taskInput.focus();
}

// --- Obsidian markdown ------------------------------------------------------
// Notes sit on an indented continuation line rather than after a dash on the
// task line. The old " — " separator was ambiguous: a title containing an em
// dash ("Clinic — new patient consults") was split at the wrong place, so the
// title was truncated and the rest of it became the notes.
const MARKDOWN_META_KEYS = ["priority", "category", "due", "recurrence"];
const MARKDOWN_TASK_RE = /^\s*[-*] \[([ xX])\]\s*/;
// Anchored at end of line, and unable to cross a nested parenthesis, so the
// metadata block is found even when the title itself ends in brackets.
const MARKDOWN_META_RE = /\(([^()]*)\)\s*$/;
// Only a tag at the very end is treated as one, so a "#" inside a title stays.
const MARKDOWN_TAG_RE = /\s(#[\w-]+)\s*$/;

function exportMarkdown() {
  const lines = [];
  liveTasks()
    .slice()
    .reverse()
    .forEach((task) => {
      const checkbox = task.completed ? "- [x]" : "- [ ]";
      const tag = task.tag ? ` ${task.tag}` : "";
      const metaParts = [
        `priority: ${task.priority}`,
        `category: ${task.category}`,
      ];
      if (task.dueDate) {
        metaParts.push(
          `due: ${task.dueTime ? `${task.dueDate} ${task.dueTime}` : task.dueDate}`
        );
      }
      if (task.recurrence) {
        metaParts.push(`recurrence: ${task.recurrence}`);
      }
      lines.push(`${checkbox} ${task.title}${tag} (${metaParts.join(", ")})`);
      if (task.notes) {
        // Indented, so Obsidian renders it as part of the list item.
        task.notes.split(/\r?\n/).forEach((note) => lines.push(`      ${note}`));
      }
    });
  markdownArea.value = lines.join("\n");
}

// A trailing parenthesis counts as metadata only when every part is a known
// key, so a title like "Review protocol (draft)" is left intact.
function parseMarkdownMetadata(text) {
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    return null;
  }
  const recognised = parts.every((part) => {
    const colon = part.indexOf(":");
    return colon > 0 &&
      MARKDOWN_META_KEYS.includes(part.slice(0, colon).trim().toLowerCase());
  });
  if (!recognised) {
    return null;
  }
  const meta = {};
  parts.forEach((part) => {
    const colon = part.indexOf(":");
    meta[part.slice(0, colon).trim().toLowerCase()] = part.slice(colon + 1).trim();
  });
  return meta;
}

function parseMarkdownTaskLine(line) {
  const checkbox = MARKDOWN_TASK_RE.exec(line);
  if (!checkbox) {
    return null;
  }
  let rest = line.slice(checkbox[0].length);

  let meta = {};
  const metaMatch = MARKDOWN_META_RE.exec(rest);
  if (metaMatch) {
    const parsed = parseMarkdownMetadata(metaMatch[1]);
    if (parsed) {
      meta = parsed;
      rest = rest.slice(0, metaMatch.index);
    }
  }

  let tag = "";
  const tagMatch = MARKDOWN_TAG_RE.exec(rest);
  if (tagMatch) {
    tag = tagMatch[1];
    rest = rest.slice(0, tagMatch.index);
  }

  const title = rest.trim();
  if (!title) {
    return null;
  }

  let dueDate = "";
  let dueTime = "";
  if (meta.due) {
    // Split on whitespace, not ":" -- "due: 2026-09-11 14:00" used to be cut at
    // the first colon, which turned 14:00 into 14 and dropped the minutes.
    const [datePart, timePart] = meta.due.split(/\s+/);
    dueDate = datePart || "";
    dueTime = timePart || "";
  }

  const now = new Date().toISOString();
  return normalizeTask({
    id: generateId(),
    title,
    notes: "",
    priority: meta.priority ? normalizePriority(meta.priority) : "medium",
    category: meta.category ? normalizeCategory(meta.category) : "work",
    tag,
    dueDate,
    dueTime,
    recurrence: meta.recurrence ? normalizeRecurrence(meta.recurrence) : "",
    completed: checkbox[1].toLowerCase() === "x",
    createdAt: now,
    updatedAt: now,
  });
}

function parseMarkdown(text) {
  const imported = [];
  text.split(/\r?\n/).forEach((line) => {
    const task = parseMarkdownTaskLine(line);
    if (task) {
      imported.push(task);
      return;
    }
    // Only an *indented* line following a task is that task's notes, which is
    // what markdown requires for a list continuation anyway. Unindented prose
    // around the checklist is left alone rather than swallowed into a task.
    const trimmed = line.trim();
    if (trimmed && imported.length && /^\s/.test(line)) {
      const current = imported[imported.length - 1];
      current.notes = current.notes ? `${current.notes}\n${trimmed}` : trimmed;
    }
  });
  return imported;
}

function importMarkdown() {
  const text = markdownArea.value.trim();
  if (!text) {
    return;
  }
  const imported = parseMarkdown(text);
  if (!imported.length) {
    return;
  }

  // Re-importing your own export should not double every task. The markdown
  // carries no ids, so identity here is title plus due date and time -- two
  // genuinely different tasks agreeing on all three is unlikely, and the cost
  // of being wrong is a task you have to add again rather than a silent loss.
  const identity = (task) =>
    [task.title, task.dueDate, task.dueTime].join("\u0000");
  const seen = new Set(liveTasks().map(identity));
  const fresh = imported.filter((task) => {
    const key = identity(task);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  if (!fresh.length) {
    return;
  }
  tasks = [...fresh, ...tasks];
  saveTasks();
  render();
}

function copyMarkdown() {
  if (!markdownArea.value.trim()) {
    exportMarkdown();
  }
  navigator.clipboard.writeText(markdownArea.value).catch((error) => {
    console.warn("Unable to copy", error);
  });
}

function handleFilterClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }
  filterButtons.forEach((button) => button.classList.remove("active"));
  target.classList.add("active");
  activeFilter = target.dataset.filter || "all";
  setActiveView("all");
}

function handleCategoryFilterClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }
  categoryFilterButtons.forEach((button) => button.classList.remove("active"));
  target.classList.add("active");
  activeCategory = target.dataset.category || "";
  setActiveView("all");
}


// --- Undo -------------------------------------------------------------------
// Deletes are tombstones rather than removals, so undo is just clearing the
// flag. A new updatedAt makes the restore win over the delete on other devices.
let undoIds = [];
let undoTimer = null;

function showUndo(message, ids) {
  if (!toast) return;
  undoIds = ids;
  toastMessage.textContent = message;
  toast.hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, 8000);
}

function hideUndo() {
  if (!toast) return;
  toast.hidden = true;
  undoIds = [];
}

function undoDelete() {
  if (!undoIds.length) return;
  const now = new Date().toISOString();
  const ids = new Set(undoIds);
  tasks = tasks.map((task) =>
    ids.has(task.id)
      ? { ...task, deleted: false, deletedAt: "", updatedAt: now }
      : task
  );
  saveTasks();
  render();
  hideUndo();
}

function handleClearCompleted() {
  const ids = liveTasks().filter((task) => task.completed).map((task) => task.id);
  if (!ids.length) return;
  clearCompleted();
  showUndo(`Cleared ${ids.length} completed task${ids.length !== 1 ? "s" : ""}`, ids);
}

// Event listeners
taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addTask({
    title: taskInput.value.trim(),
    notes: taskNotes.value.trim(),
    priority: taskPriority.value,
    category: taskCategory.value,
    tag: taskTag.value.trim(),
    dueDate: taskDueDate.value,
    dueTime: taskDueTime.value,
    recurrence: taskRecurrence.value,
  });
  taskForm.reset();
  taskPriority.value = "medium";
  taskCategory.value = "work";
});

filterButtons.forEach((button) => button.addEventListener("click", handleFilterClick));
categoryFilterButtons.forEach((button) => button.addEventListener("click", handleCategoryFilterClick));
clearCompletedButton.addEventListener("click", handleClearCompleted);

// View tabs
tabButtons.forEach((button) =>
  button.addEventListener("click", () => setActiveView(button.dataset.view))
);

// Searching re-renders on a short delay rather than on every keystroke.
let searchTimer = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 150);
});

if (toastAction) toastAction.addEventListener("click", undoDelete);
exportMarkdownButton.addEventListener("click", exportMarkdown);
importMarkdownButton.addEventListener("click", importMarkdown);
copyMarkdownButton.addEventListener("click", copyMarkdown);

// JSON export/import
exportJsonButton.addEventListener("click", exportJson);
importJsonButton.addEventListener("click", () => importJsonFile.click());
importJsonFile.addEventListener("change", importJson);

// Quick capture
quickCaptureBtn.addEventListener("click", handleQuickCapture);
quickCaptureInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    handleQuickCapture();
  }
});

// Floating quick add button
floatingQuickAddBtn.addEventListener("click", () => {
  quickCaptureInput.focus();
  quickCaptureInput.scrollIntoView({ behavior: "smooth", block: "center" });
});

// Templates
templateButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const template = button.dataset.template;
    applyTemplate(template);
  });
});

// Calendar
calendarDate.addEventListener("change", () => {
  activeDate = calendarDate.value;
  setActiveView("all");
});
clearDateFilterButton.addEventListener("click", () => {
  activeDate = "";
  calendarDate.value = "";
  render();
});

// JSON Export/Import Functions
function exportJson() {
  const dataStr = JSON.stringify({
    tasks: tasks,
    exportDate: new Date().toISOString(),
    version: SCHEMA_VERSION
  }, null, 2);

  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `medtodo-backup-${todayString()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (data.tasks && Array.isArray(data.tasks)) {
        // Ask user if they want to merge or replace
        const shouldMerge = confirm(
          `Found ${data.tasks.length} tasks in backup.\n\n` +
          `Click OK to MERGE with existing tasks (${tasks.length}).\n` +
          `Click Cancel to REPLACE all existing tasks.`
        );

        if (shouldMerge) {
          // Merge: Add imported tasks, avoiding duplicates by ID
          const existingIds = new Set(tasks.map(t => t.id));
          const newTasks = data.tasks.filter(t => !existingIds.has(t.id));
          tasks = [...tasks, ...newTasks];
        } else {
          // Replace: Use imported tasks
          tasks = data.tasks;
        }

        saveTasks();
        render();
        alert(`Successfully imported ${data.tasks.length} tasks!`);
      } else {
        alert('Invalid backup file format.');
      }
    } catch (error) {
      alert('Error reading backup file: ' + error.message);
    }

    // Reset file input
    event.target.value = '';
  };

  reader.readAsText(file);
}

// ICS Calendar Export
function exportToCalendar() {
  const tasksWithDates = liveTasks().filter(task => task.dueDate && !task.completed);

  if (tasksWithDates.length === 0) {
    alert('No tasks with due dates to export.\n\nAdd due dates to tasks first, then export to calendar.');
    return;
  }

  // Generate ICS file content
  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MedTodo//Medical Professional Todo List//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:MedTodo Tasks',
    'X-WR-TIMEZONE:UTC'
  ];

  tasksWithDates.forEach(task => {
    const eventId = task.id.replace(/-/g, '');
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    // Parse due date and time
    const dueDateTime = task.dueTime
      ? new Date(`${task.dueDate}T${task.dueTime}`)
      : new Date(`${task.dueDate}T09:00:00`); // Default to 9 AM if no time

    const dtstart = dueDateTime.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    // End time: 1 hour after start for tasks with time, all-day for tasks without
    const dtend = task.dueTime
      ? new Date(dueDateTime.getTime() + 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
      : new Date(dueDateTime.getTime() + 24 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    // Build description
    let description = task.notes || task.title;
    if (task.category) description += `\\nCategory: ${task.category}`;
    if (task.tag) description += `\\nTag: ${task.tag}`;
    if (task.priority) description += `\\nPriority: ${task.priority}`;

    // Escape special characters
    description = description.replace(/\n/g, '\\n').replace(/,/g, '\\,');
    const summary = task.title.replace(/,/g, '\\,').replace(/;/g, '\\;');

    // Add event
    icsContent.push('BEGIN:VEVENT');
    icsContent.push(`UID:${eventId}@medtodo`);
    icsContent.push(`DTSTAMP:${now}`);
    icsContent.push(`DTSTART:${dtstart}`);
    icsContent.push(`DTEND:${dtend}`);
    icsContent.push(`SUMMARY:${summary}`);
    icsContent.push(`DESCRIPTION:${description}`);
    icsContent.push(`PRIORITY:${task.priority === 'high' ? '1' : task.priority === 'medium' ? '5' : '9'}`);
    icsContent.push(`CATEGORIES:${task.category || 'Task'}`);

    // Add alarm for high priority tasks (15 minutes before)
    if (task.priority === 'high' && task.dueTime) {
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-PT15M');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Reminder: ${summary}`);
      icsContent.push('END:VALARM');
    }

    icsContent.push('END:VEVENT');
  });

  icsContent.push('END:VCALENDAR');

  // Create and download file
  const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `medtodo-calendar-${todayString()}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  alert(`Exported ${tasksWithDates.length} tasks to calendar!\n\nOpen the downloaded .ics file to import into your calendar app.`);
}

// Get today's tasks sorted by time
function getTodaysTasks() {
  const today = todayString();
  return liveTasks()
    .filter(task => task.dueDate === today && !task.completed)
    .sort((a, b) => {
      if (a.dueTime && b.dueTime) {
        return a.dueTime.localeCompare(b.dueTime);
      }
      if (a.dueTime) return -1;
      if (b.dueTime) return 1;
      return 0;
    });
}

// Get week's tasks grouped by day
function getWeekTasks() {
  const today = new Date();
  const weekTasks = {};
  const live = liveTasks();

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = toLocalDateString(date);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    weekTasks[dateStr] = {
      dayName,
      tasks: live
        .filter(task => task.dueDate === dateStr && !task.completed)
        .sort((a, b) => (a.dueTime || '').localeCompare(b.dueTime || ''))
    };
  }

  return weekTasks;
}

// Render Today's Schedule
function renderTodaySchedule() {
  const todayTasks = getTodaysTasks();
  todaySchedule.replaceChildren();

  if (todayTasks.length === 0) {
    todaySchedule.append(el("p", "muted", "No tasks scheduled for today."));
    return;
  }

  todayTasks.forEach((task) => {
    const item = el("div", "schedule-item");
    item.append(el("span", "schedule-time", task.dueTime || "No time"));

    const body = el("div", "schedule-task");
    body.append(el("span", "schedule-title", task.title));

    const meta = el("div", "schedule-meta");
    if (task.category) {
      meta.append(el("span", `badge badge-${task.category}`, task.category));
    }
    if (task.priority) {
      meta.append(el("span", `badge badge-priority-${task.priority}`, task.priority));
    }
    body.append(meta);
    item.append(body);

    todaySchedule.append(item);
  });
}

// Render Week View
function renderWeekView() {
  const entries = Object.entries(getWeekTasks());
  weekView.replaceChildren();

  if (!entries.some(([, data]) => data.tasks.length > 0)) {
    weekView.append(el("p", "muted", "No tasks scheduled this week."));
    return;
  }

  entries.forEach(([, data]) => {
    const day = el("div", "week-day");
    const header = el("div", "week-day-header");
    header.append(el("span", "week-day-name", data.dayName));

    if (data.tasks.length === 0) {
      header.append(el("span", "week-day-count muted", "No tasks"));
      day.append(header);
      weekView.append(day);
      return;
    }

    header.append(
      el(
        "span",
        "week-day-count",
        `${data.tasks.length} task${data.tasks.length !== 1 ? "s" : ""}`
      )
    );
    day.append(header);

    const list = el("div", "week-day-tasks");
    data.tasks.forEach((task) => {
      const row = el("div", "week-task");
      row.append(el("span", "week-task-time", task.dueTime || "—"));
      row.append(el("span", "week-task-title", task.title));
      row.append(
        el("span", `badge badge-priority-${task.priority}`, task.priority)
      );
      list.append(row);
    });
    day.append(list);

    weekView.append(day);
  });
}

// Calendar export event listener
exportCalendarButton.addEventListener("click", exportToCalendar);

// Edit modal event listeners
editForm.addEventListener("submit", handleEditSubmit);
closeModalBtn.addEventListener("click", closeEditModal);
cancelEditBtn.addEventListener("click", closeEditModal);

// Close modal when clicking outside
editModal.addEventListener("click", (e) => {
  if (e.target === editModal) {
    closeEditModal();
  }
});

// Close modal on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editModal.style.display === "flex") {
    closeEditModal();
  }
});

// Bridge for sync.js, which is loaded after this file. `tasks` is a module-level
// `let`, so it is not reachable from another script without an explicit accessor.
window.MedTodoStore = {
  getTasks: () => tasks,
  setTasks(next) {
    tasks = next.map(normalizeTask);
    saveTasks();
    render();
  },
  mergeTaskLists,
  normalizeTask,
};

// --- Seasonal theme ---------------------------------------------------------
// Meteorological seasons, northern hemisphere. The chip in the header cycles
// through Auto and the four seasons, so anyone south of the equator (or just
// bored of the current one) can pin whichever they like.
const SEASON_KEY = "todo.season";
const SEASONS = ["spring", "summer", "autumn", "winter"];
const SEASON_LABELS = {
  spring: "🌸 Spring",
  summer: "☀️ Summer",
  autumn: "🍂 Autumn",
  winter: "❄️ Winter",
};
const SEASON_THEME_COLORS = {
  spring: "#7fb069",
  summer: "#f0a830",
  autumn: "#c96a2b",
  winter: "#5b8db8",
};

function seasonForDate(date) {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

function loadSeasonPreference() {
  try {
    const stored = localStorage.getItem(SEASON_KEY);
    return stored === "auto" || SEASONS.includes(stored) ? stored : "auto";
  } catch (error) {
    return "auto";
  }
}

function resolveSeason(preference, date) {
  return SEASONS.includes(preference) ? preference : seasonForDate(date);
}

function applySeason() {
  const preference = loadSeasonPreference();
  const season = resolveSeason(preference, new Date());
  const pinned = preference !== "auto";

  document.documentElement.dataset.season = season;

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", SEASON_THEME_COLORS[season]);

  if (seasonChip) {
    seasonChip.textContent = SEASON_LABELS[season];
    seasonChip.classList.toggle("season-chip--pinned", pinned);
    seasonChip.title = pinned
      ? `Season pinned to ${season}. Click to change; keep clicking to return to automatic.`
      : `${SEASON_LABELS[season].split(" ")[1]}, following the calendar. Click to pick a different one.`;
  }
  return season;
}

function cycleSeason() {
  const order = ["auto"].concat(SEASONS);
  const next = order[(order.indexOf(loadSeasonPreference()) + 1) % order.length];
  try {
    localStorage.setItem(SEASON_KEY, next);
  } catch (error) {
    console.warn("Unable to save season preference", error);
  }
  applySeason();
}

if (seasonChip) seasonChip.addEventListener("click", cycleSeason);
applySeason();

// Initial render
setActiveView(activeView);

