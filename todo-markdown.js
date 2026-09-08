// The vault format: an ordinary Obsidian checklist that also round-trips the
// fields the app needs.
//
//   - [ ] Draft R01 aims #grant (due: 2026-09-11 09:00, priority: high, category: research) <!--medtodo {"id":"..."}-->
//
// Everything before the parenthesis is what a human reads and may edit by hand;
// edits to the title, tag, checkbox and metadata are all picked back up. The
// trailing HTML comment carries only what a person would not want to maintain
// (id and timestamps) and does not render in Obsidian.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MedTodoMarkdown = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const META_KEYS = ["due", "priority", "category", "every", "recurrence"];

  // Anchored at end of line so a title may contain anything, including
  // parentheses, "#", or an em dash -- the old splitter broke on those.
  const COMMENT_RE = /\s*<!--\s*medtodo\s*(\{.*\})\s*-->\s*$/;
  const META_RE = /\s*\(([^()]*)\)\s*$/;
  const TAG_RE = /\s(#[\w-]+)\s*$/;
  const CHECKBOX_RE = /^\s*[-*]\s*\[([ xX])\]\s?/;

  // JSON lives inside an HTML comment, so it must never contain "-->".
  // Escaping every ">" makes that impossible and stays valid JSON.
  function encodeJson(value) {
    return JSON.stringify(value).replace(/>/g, "\\u003e");
  }

  function looksLikeMetadata(text) {
    const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return false;
    // Only treat a trailing parenthesis as metadata when every part is a known
    // key, so a title like "Review protocol (draft)" survives intact.
    return parts.every((part) => {
      const key = part.split(":")[0].trim().toLowerCase();
      return META_KEYS.includes(key) && part.includes(":");
    });
  }

  function parseMetadata(text) {
    const out = {};
    text.split(",").forEach((part) => {
      const index = part.indexOf(":");
      if (index === -1) return;
      const key = part.slice(0, index).trim().toLowerCase();
      out[key] = part.slice(index + 1).trim();
    });
    return out;
  }

  function serializeTask(task) {
    const checkbox = task.completed ? "- [x]" : "- [ ]";
    const meta = [];
    if (task.dueDate) {
      meta.push(`due: ${task.dueDate}${task.dueTime ? " " + task.dueTime : ""}`);
    }
    if (task.priority && task.priority !== "medium") {
      meta.push(`priority: ${task.priority}`);
    }
    if (task.category) meta.push(`category: ${task.category}`);
    if (task.recurrence) meta.push(`every: ${task.recurrence}`);

    const hidden = {
      id: task.id,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
    // Notes ride in the comment so they cannot collide with the metadata
    // parenthesis or the tag.
    if (task.notes) hidden.notes = task.notes;

    return [
      checkbox,
      " ",
      task.title,
      task.tag ? " " + task.tag : "",
      meta.length ? ` (${meta.join(", ")})` : "",
      ` <!--medtodo ${encodeJson(hidden)}-->`,
    ].join("");
  }

  function serializeTasks(tasks) {
    return tasks.map(serializeTask).join("\n");
  }

  function parseTaskLine(line) {
    const checkbox = CHECKBOX_RE.exec(line);
    if (!checkbox) return null;

    const completed = checkbox[1].toLowerCase() === "x";
    let rest = line.slice(checkbox[0].length);

    let hidden = {};
    const comment = COMMENT_RE.exec(rest);
    if (comment) {
      try {
        hidden = JSON.parse(comment[1]) || {};
      } catch (error) {
        hidden = {};
      }
      rest = rest.slice(0, comment.index);
    }

    let meta = {};
    const metaMatch = META_RE.exec(rest);
    if (metaMatch && looksLikeMetadata(metaMatch[1])) {
      meta = parseMetadata(metaMatch[1]);
      rest = rest.slice(0, metaMatch.index);
    }

    let tag = "";
    const tagMatch = TAG_RE.exec(rest);
    if (tagMatch) {
      tag = tagMatch[1];
      rest = rest.slice(0, tagMatch.index);
    }

    let title = rest.trim();
    let legacyNotes = "";
    // The pre-v2 format wrote "Title — notes" with no trailing comment. Only
    // apply that split when there is no comment, so a title containing an em
    // dash is left alone in the current format.
    if (!comment && title.includes(" \u2014 ")) {
      const parts = title.split(" \u2014 ");
      title = parts[0].trim();
      legacyNotes = parts.slice(1).join(" \u2014 ").trim();
    }
    if (!title) return null;

    let dueDate = "";
    let dueTime = "";
    if (meta.due) {
      const [datePart, timePart] = meta.due.split(/\s+/);
      dueDate = datePart || "";
      dueTime = timePart || "";
    }

    return {
      id: hidden.id || "",
      title,
      notes: hidden.notes || legacyNotes,
      priority: meta.priority || "medium",
      category: meta.category || "work",
      tag,
      dueDate,
      dueTime,
      recurrence: meta.every || meta.recurrence || "",
      completed,
      createdAt: hidden.createdAt || "",
      updatedAt: hidden.updatedAt || "",
      deleted: false,
    };
  }

  function parseTasks(markdown) {
    if (!markdown) return [];
    return markdown
      .split(/\r?\n/)
      .map(parseTaskLine)
      .filter(Boolean);
  }

  return { serializeTask, serializeTasks, parseTaskLine, parseTasks };
});
