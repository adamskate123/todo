const STORAGE_KEY = "todo.tasks";

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

// Calendar
const calendarDate = document.querySelector("#calendar-date");
const clearDateFilterButton = document.querySelector("#clear-date-filter");
const calendarList = document.querySelector("#calendar-list");
const calendarSummary = document.querySelector("#calendar-summary");
const calendarEmpty = document.querySelector("#calendar-empty");

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

function addTask({ title, notes, priority, category, tag, dueDate, dueTime, recurrence }) {
  if (!title.trim()) {
    return;
  }

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
    createdAt: new Date().toISOString(),
  };

  tasks.unshift(task);
  saveTasks();
  render();

  return task;
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
  const date = new Date(dateString);

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

  return date.toISOString().split('T')[0];
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

function render() {
  const visibleTasks = sortTasks(filterTasks(tasks));
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
    deleteButton.addEventListener("click", () => deleteTask(task.id));

    actions.append(editButton, deleteButton);

    listItem.append(checkbox, title, actions);
    taskList.append(listItem);
  });

  // Update task count with category breakdown
  const categoryStats = tasks.reduce((acc, task) => {
    acc[task.category] = (acc[task.category] || 0) + 1;
    return acc;
  }, {});

  let countText = `${tasks.length} task${tasks.length !== 1 ? "s" : ""}`;
  if (activeCategory) {
    const catCount = categoryStats[activeCategory] || 0;
    countText += ` (${catCount} ${activeCategory})`;
  }
  taskCount.textContent = countText;

  renderCalendar();
  renderTodaySchedule();
  renderWeekView();
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

    dueDate = targetDate.toISOString().split('T')[0];
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
    dueDate = targetDate.toISOString().split('T')[0];
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
    dueDate = targetDate.toISOString().split('T')[0];
    title = title.replace(dayMatch[0], "").trim();
  }
  // Handle "next week"
  else if (/\bnext\s+week\b/i.test(text)) {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    dueDate = nextWeek.toISOString().split('T')[0];
    title = title.replace(/\bnext\s+week\b/i, "").trim();
  }
  // Handle "tomorrow"
  else if (/\btomorrow\b/i.test(text)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dueDate = tomorrow.toISOString().split('T')[0];
    title = title.replace(/\btomorrow\b/i, "").trim();
  }
  // Handle "today"
  else if (/\btoday\b/i.test(text)) {
    dueDate = today.toISOString().split('T')[0];
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

function exportMarkdown() {
  const lines = tasks
    .slice()
    .reverse()
    .map((task) => {
      const checkbox = task.completed ? "- [x]" : "- [ ]";
      const notes = task.notes ? ` — ${task.notes}` : "";
      const tag = task.tag ? ` ${task.tag}` : "";
      const metaParts = [
        `priority: ${task.priority}`,
        `category: ${task.category}`,
      ];
      if (task.dueDate) {
        const dateTime = task.dueTime ? `${task.dueDate} ${task.dueTime}` : task.dueDate;
        metaParts.push(`due: ${dateTime}`);
      }
      if (task.recurrence) {
        metaParts.push(`recurrence: ${task.recurrence}`);
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
    const categoryPart = metadataParts.find((part) => part.toLowerCase().startsWith("category:"));
    const duePart = metadataParts.find((part) => part.toLowerCase().startsWith("due:"));
    const recurrencePart = metadataParts.find((part) => part.toLowerCase().startsWith("recurrence:"));

    const priority = priorityPart ? normalizePriority(priorityPart.split(":")[1].trim()) : "medium";
    const category = categoryPart ? normalizeCategory(categoryPart.split(":")[1].trim()) : "work";
    const recurrence = recurrencePart ? normalizeRecurrence(recurrencePart.split(":")[1].trim()) : "";

    let dueDate = "";
    let dueTime = "";
    if (duePart) {
      const dueValue = duePart.split(":")[1].trim();
      const [datePart, timePart] = dueValue.split(" ");
      dueDate = datePart;
      dueTime = timePart || "";
    }

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
      category,
      tag,
      dueDate,
      dueTime,
      recurrence,
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

function handleCategoryFilterClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }
  categoryFilterButtons.forEach((button) => button.classList.remove("active"));
  target.classList.add("active");
  activeCategory = target.dataset.category || "";
  render();
}

function renderCalendar() {
  const withDueDates = tasks
    .filter((task) => task.dueDate)
    .slice()
    .sort((a, b) => {
      const dateCompare = a.dueDate.localeCompare(b.dueDate);
      if (dateCompare !== 0) return dateCompare;
      return (a.dueTime || "").localeCompare(b.dueTime || "");
    });

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

    // Show time range if tasks have times
    const withTimes = dateTasks.filter(t => t.dueTime);
    if (withTimes.length > 0) {
      detail.textContent = `${dateTasks.length} task${dateTasks.length !== 1 ? "s" : ""} (${withTimes[0].dueTime}${withTimes.length > 1 ? '...' : ''})`;
    } else {
      detail.textContent = `${dateTasks.length} task${dateTasks.length !== 1 ? "s" : ""}`;
    }

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
searchInput.addEventListener("input", render);
clearCompletedButton.addEventListener("click", clearCompleted);
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
  render();
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
    version: "1.0"
  }, null, 2);

  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `medtodo-backup-${new Date().toISOString().split('T')[0]}.json`;
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
  const tasksWithDates = tasks.filter(task => task.dueDate && !task.completed);

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
  link.download = `medtodo-calendar-${new Date().toISOString().split('T')[0]}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  alert(`Exported ${tasksWithDates.length} tasks to calendar!\n\nOpen the downloaded .ics file to import into your calendar app.`);
}

// Get today's tasks sorted by time
function getTodaysTasks() {
  const today = new Date().toISOString().split('T')[0];
  return tasks
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

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    weekTasks[dateStr] = {
      dayName,
      tasks: tasks
        .filter(task => task.dueDate === dateStr && !task.completed)
        .sort((a, b) => (a.dueTime || '').localeCompare(b.dueTime || ''))
    };
  }

  return weekTasks;
}

// Render Today's Schedule
function renderTodaySchedule() {
  const todayTasks = getTodaysTasks();

  if (todayTasks.length === 0) {
    todaySchedule.innerHTML = '<p class="muted">No tasks scheduled for today.</p>';
    todayCount.textContent = '';
    return;
  }

  todayCount.textContent = `${todayTasks.length} task${todayTasks.length !== 1 ? 's' : ''}`;

  todaySchedule.innerHTML = todayTasks.map(task => `
    <div class="schedule-item">
      <span class="schedule-time">${task.dueTime || 'No time'}</span>
      <div class="schedule-task">
        <span class="schedule-title">${task.title}</span>
        <div class="schedule-meta">
          <span class="badge badge-${task.category}">${task.category}</span>
          <span class="badge badge-priority-${task.priority}">${task.priority}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// Render Week View
function renderWeekView() {
  const weekTasks = getWeekTasks();
  const entries = Object.entries(weekTasks);

  const hasAnyTasks = entries.some(([_, data]) => data.tasks.length > 0);

  if (!hasAnyTasks) {
    weekView.innerHTML = '<p class="muted">No tasks scheduled this week.</p>';
    return;
  }

  weekView.innerHTML = entries.map(([dateStr, data]) => {
    if (data.tasks.length === 0) {
      return `
        <div class="week-day">
          <div class="week-day-header">
            <span class="week-day-name">${data.dayName}</span>
            <span class="week-day-count muted">No tasks</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="week-day">
        <div class="week-day-header">
          <span class="week-day-name">${data.dayName}</span>
          <span class="week-day-count">${data.tasks.length} task${data.tasks.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="week-day-tasks">
          ${data.tasks.map(task => `
            <div class="week-task">
              <span class="week-task-time">${task.dueTime || '—'}</span>
              <span class="week-task-title">${task.title}</span>
              <span class="badge badge-priority-${task.priority}">${task.priority}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
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

// Initial render
render();
