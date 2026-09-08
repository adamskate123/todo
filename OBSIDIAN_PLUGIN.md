# Running MedTodo inside Obsidian

The plugin puts the app in an Obsidian pane and stores your tasks as an ordinary
checklist note in your vault.

## What lives where, and why

**Non-clinical tasks** are written to a note in your vault (`Tasks.md` by
default) as a normal Obsidian checklist:

```markdown
- [ ] Draft R01 specific aims #grant (due: 2026-09-11 09:00, priority: high, category: research) <!--medtodo {"id":"…"}-->
```

They are ordinary notes, so they are searchable, linkable, and visible to
Dataview. You can edit the lines by hand — the title, checkbox, tag and the
metadata in parentheses are all read back. The trailing comment holds the id and
timestamps; leave it alone and a task keeps its identity across edits.

**Clinical tasks are never written to the vault.** They are kept in Obsidian's
own storage, which lives in the application's data directory *outside* the vault
folder, so vault sync never sees them. This is the same guarantee the web app
makes, for the same reason.

> **On iCloud Drive:** whatever is in the vault syncs however your vault syncs.
> iCloud Drive is only end-to-end encrypted when **Advanced Data Protection** is
> enabled on your Apple account (Settings → your name → iCloud → Advanced Data
> Protection). Worth turning on regardless of this plugin.

The GitHub sync from the web app is **not** bundled here. Inside Obsidian your
vault is the sync mechanism, so a second one would just be more to maintain.

## Installing

1. Build the plugin (only needed if you changed the source):

   ```bash
   npm run build:plugin
   ```

2. Copy the `obsidian-plugin` folder into your vault, renamed to `medtodo`:

   ```
   <your vault>/.obsidian/plugins/medtodo/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```

   `.obsidian` is a hidden folder. On macOS press <kbd>Cmd</kbd> +
   <kbd>Shift</kbd> + <kbd>.</kbd> in Finder to show hidden files.

3. In Obsidian: **Settings → Community plugins**. Turn off **Restricted mode**
   if it is on, then click **Reload plugins** and enable **MedTodo**.

4. Open it with the checkmark in the left ribbon, or from the command palette
   (<kbd>Cmd</kbd> + <kbd>P</kbd>) with **MedTodo: Open tasks**.

The plugin is not in the community plugin directory, so it installs by hand like
this. That also means Obsidian will not auto-update it — recopy the folder after
a rebuild.

## Everyday use

The pane works exactly like the web app: quick capture, the Today / Week / All
tabs, templates, undo, and the seasonal backdrop.

Changes you make in the pane are written to the tasks note a moment later.
Changes made to the note — by hand, or arriving from another device through
iCloud — are picked up and the pane refreshes itself.

## Things worth knowing

**Conflicts are file-level, not task-level.** The web app's GitHub sync merges
task by task. A vault note is just a file, so if you edit tasks on two devices at
once, iCloud resolves it the way it resolves any note conflict — one version
wins, or you get a conflict copy. This is how every other note in your vault
already behaves.

**The note is generated.** The plugin rewrites it whenever tasks change. Prose
you add outside the checklist lines will not survive; keep notes about tasks in
the task's own notes field, or in a different file.

**Mobile works.** The plugin is not desktop-only and uses no Node APIs, so it
runs in Obsidian on iOS. If you use it on both your Mac and your phone, you may
not need the web app or its GitHub sync at all.

## Editing the source

The plugin shares its code with the web app. `obsidian-plugin/main.js` is
generated — do not edit it.

| File | Role |
| --- | --- |
| `ui.js` | The markup, shared by the page and the plugin |
| `app.js` | The app itself, as `createMedTodoApp({ root, storage })` |
| `todo-markdown.js` | The checklist format, both directions |
| `obsidian-plugin/plugin-src.js` | The only Obsidian-specific code |
| `tools/build-plugin.js` | Concatenates the above and scopes the CSS |

`tools/build-plugin.js` is a concatenator, not a bundler: no dependencies, no
transpiling. It also rewrites every CSS selector to sit under `.medtodo-root`,
which matters — rules like `button { … }` would otherwise restyle the whole
Obsidian interface. A test fails the build if any rule escapes that scope, and
another fails if the committed bundle has drifted from its sources.
