const STORAGE_KEY = "todo.tasks";

const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const taskNotes = document.querySelector("#task-notes");
const taskPriority = document.querySelector("#task-priority");
const taskTag = document.querySelector("#task-tag");
const taskDueDate = document.querySelector("#task-due-date");
const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const searchInput = document.querySelector("#search-input");
const filterButtons = document.querySelectorAll(".filter");
const clearCompletedButton = document.querySelector("#clear-completed");
const markdownArea = document.querySelector("#markdown-area");
const exportMarkdownButton = document.querySelector("#export-markdown");
const importMarkdownButton = document.querySelector("#import-markdown");
const copyMarkdownButton = document.querySelector("#copy-markdown");
const calendarDate = document.querySelector("#calendar-date");
const clearDateFilterButton = document.querySelector("#clear-date-filter");
const calendarList = document.querySelector("#calendar-list");
const calendarSummary = document.querySelector("#calendar-summary");
const calendarEmpty = document.querySelector("#calendar-empty");

let tasks = loadTasks();
let activeFilter = "all";
let activeDate = "";

function generateId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadTasks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Unable to parse saved tasks", error);
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function addTask({ title, notes, priority, tag, dueDate }) {
  if (!title.trim()) {
    return;
  }
  tasks.unshift({
    id: generateId(),
    title,
    notes,
    priority,
    tag,
    dueDate,
    completed: false,
    createdAt: new Date().toISOString(),
  });
  saveTasks();
  render();
}

function updateTask(id, updates) {
  tasks = tasks.map((task) => (task.id === id ? { ...task, ...updates } : task));
  saveTasks();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  render();
}

function clearCompleted() {
  tasks = tasks.filter((task) => !task.completed);
  saveTasks();
  render();
}

function filterTasks(list) {
  const search = searchInput.value.trim().toLowerCase();
  return list.filter((task) => {
    const matchesDate = !activeDate || task.dueDate === activeDate;
    const matchesSearch =
      !search ||
      [task.title, task.notes, task.tag]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(search));
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "active" && !task.completed) ||
      (activeFilter === "completed" && task.completed);
    return matchesDate && matchesSearch && matchesFilter;
  });
}

function render() {
  const visibleTasks = filterTasks(tasks);
  taskList.innerHTML = "";

  visibleTasks.forEach((task) => {
    const listItem = document.createElement("li");
    listItem.className = `task${task.completed ? " completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.addEventListener("change", () => {
      updateTask(task.id, { completed: checkbox.checked });
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

    const priority = document.createElement("span");
    priority.className = "badge";
    priority.textContent = `Priority: ${task.priority}`;

    const tag = document.createElement("span");
    tag.className = "badge";
    tag.textContent = task.tag ? `Tag: ${task.tag}` : "No tag";

    const dueDate = document.createElement("span");
    dueDate.className = "badge";
    dueDate.textContent = task.dueDate ? `Due: ${task.dueDate}` : "No due date";

    meta.append(priority, tag, dueDate);
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
    deleteButton.addEventListener("click", () => deleteTask(task.id));

    actions.append(editButton, deleteButton);

    listItem.append(checkbox, title, actions);
    taskList.append(listItem);
  });

  taskCount.textContent = `${tasks.length} task${tasks.length !== 1 ? "s" : ""}`;
  renderCalendar();
}

function startEdit(task) {
  const newTitle = window.prompt("Update task title", task.title);
  if (!newTitle) {
    return;
  }
  const newNotes = window.prompt("Update notes", task.notes || "") ?? task.notes;
  const newPriority = window.prompt("Update priority (low, medium, high)", task.priority) || task.priority;
  const newTag = window.prompt("Update tag", task.tag || "") ?? task.tag;
  const newDueDate =
    window.prompt("Update due date (YYYY-MM-DD)", task.dueDate || "") ?? task.dueDate;

  updateTask(task.id, {
    title: newTitle.trim(),
    notes: newNotes.trim(),
    priority: normalizePriority(newPriority),
    tag: newTag.trim(),
    dueDate: newDueDate.trim(),
  });
}

function normalizePriority(value) {
  const cleaned = value.toLowerCase();
  if (["low", "medium", "high"].includes(cleaned)) {
    return cleaned;
  }
  return "medium";
}

function exportMarkdown() {
  const lines = tasks
    .slice()
    .reverse()
    .map((task) => {
      const checkbox = task.completed ? "- [x]" : "- [ ]";
      const notes = task.notes ? ` — ${task.notes}` : "";
      const tag = task.tag ? ` ${task.tag}` : "";
      const metaParts = [`priority: ${task.priority}`];
      if (task.dueDate) {
        metaParts.push(`due: ${task.dueDate}`);
      }
      const metadata = ` (${metaParts.join(", ")})`;
      return `${checkbox} ${task.title}${notes}${tag}${metadata}`;
    });
  markdownArea.value = lines.join("\n");
}

function importMarkdown() {
  const text = markdownArea.value.trim();
  if (!text) {
    return;
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const imported = lines.map((line) => {
    const completed = line.startsWith("- [x]") || line.startsWith("- [X]");
    const content = line.replace(/^\s*- \[[ xX]\]\s*/, "");

    const metadataMatch = content.match(/\(([^)]+)\)$/);
    const metadata = metadataMatch ? metadataMatch[1] : "";
    const metadataParts = metadata.split(",").map((part) => part.trim());
    const priorityPart = metadataParts.find((part) => part.toLowerCase().startsWith("priority:"));
    const duePart = metadataParts.find((part) => part.toLowerCase().startsWith("due:"));
    const priority = priorityPart ? normalizePriority(priorityPart.split(":")[1].trim()) : "medium";
    const dueDate = duePart ? duePart.split(":")[1].trim() : "";
    const contentWithoutMetadata = metadataMatch ? content.replace(metadataMatch[0], "").trim() : content;

    const tagMatch = contentWithoutMetadata.match(/#\w[\w-]*/);
    const tag = tagMatch ? tagMatch[0] : "";

    const [titlePart, notesPart] = contentWithoutMetadata.split(" — ");
    const title = (titlePart || "Untitled").replace(tag, "").trim();
    const notes = notesPart ? notesPart.trim() : "";

    return {
      id: generateId(),
      title,
      notes,
      priority,
      tag,
      dueDate,
      completed,
      createdAt: new Date().toISOString(),
    };
  });

  tasks = [...imported, ...tasks];
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
  render();
}

function renderCalendar() {
  const withDueDates = tasks
    .filter((task) => task.dueDate)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  calendarEmpty.style.display = withDueDates.length ? "none" : "block";
  const upcoming = withDueDates.reduce((acc, task) => {
    acc[task.dueDate] = acc[task.dueDate] || [];
    acc[task.dueDate].push(task);
    return acc;
  }, {});

  calendarList.innerHTML = "";

  Object.entries(upcoming).forEach(([date, dateTasks]) => {
    const item = document.createElement("li");
    const title = document.createElement("span");
    title.textContent = date;
    const detail = document.createElement("small");
    detail.textContent = `${dateTasks.length} task${dateTasks.length !== 1 ? "s" : ""}`;
    item.append(title, detail);
    item.addEventListener("click", () => {
      activeDate = date;
      calendarDate.value = date;
      render();
    });
    calendarList.append(item);
  });

  if (!activeDate) {
    calendarSummary.textContent = "No date selected.";
  } else {
    const count = tasks.filter((task) => task.dueDate === activeDate).length;
    calendarSummary.textContent = `Showing ${count} task${count !== 1 ? "s" : ""} due on ${activeDate}.`;
  }
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addTask({
    title: taskInput.value.trim(),
    notes: taskNotes.value.trim(),
    priority: taskPriority.value,
    tag: taskTag.value.trim(),
    dueDate: taskDueDate.value,
  });
  taskForm.reset();
  taskPriority.value = "medium";
});

filterButtons.forEach((button) => button.addEventListener("click", handleFilterClick));
searchInput.addEventListener("input", render);
clearCompletedButton.addEventListener("click", clearCompleted);
exportMarkdownButton.addEventListener("click", exportMarkdown);
importMarkdownButton.addEventListener("click", importMarkdown);
copyMarkdownButton.addEventListener("click", copyMarkdown);
calendarDate.addEventListener("change", () => {
  activeDate = calendarDate.value;
  render();
});
clearDateFilterButton.addEventListener("click", () => {
  activeDate = "";
  calendarDate.value = "";
  render();
});

render();
