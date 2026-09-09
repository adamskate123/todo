# Medical Professional Todo List

A versatile, mobile-first Progressive Web App (PWA) designed for busy professionals who need to balance work and home life. Originally built for academic child neurologists, this app helps you manage clinical tasks, research projects, teaching responsibilities, and personal commitments all in one place.

## ✨ Key Features

### Phase 1: Mobile Optimization
- **Progressive Web App (PWA)**: Install on your phone like a native app, works offline
- **Time-Based Tasks**: Add specific times to your tasks (e.g., "2:00 PM - Patient consultation")
- **Floating Quick Add Button**: Tap the "+" button from anywhere to quickly add tasks
- **Mobile-Responsive Design**: Optimized for touch interactions and small screens

### Phase 2: Work-Life Balance Features
- **Category System**: Organize tasks into Work, Home, Research, Clinical, and Teaching categories
- **Recurring Tasks**: Set tasks to repeat daily, weekly, or monthly
- **Task Templates**: Pre-configured templates for common tasks:
  - New Patient Referral
  - Research Paper Review
  - Conference Preparation
  - Family Event
- **Quick Capture**: Smart parsing for fast task entry (see Quick Capture section below)

### Core Features
- **Priority Levels**: High, Medium, Low with color-coded badges
- **Due Dates & Times**: Schedule tasks with both dates and specific times
- **Tags**: Custom tags for additional organization (e.g., #urgent, #patient)
- **Calendar View**: See all upcoming tasks organized by date
- **Search & Filter**: Find tasks by keyword, category, status, or date
- **Obsidian Integration**: Export/import Markdown checklists for note-taking sync

## 📝 Obsidian markdown

**Export to Markdown** writes a checklist you can paste into an Obsidian note;
**Import from Markdown** reads one back. Notes sit on an indented line beneath
their task, so a title may contain anything — em dashes, brackets, `#` — without
confusing the parser.

```markdown
- [ ] Clinic — new patient consults #clinic (priority: high, category: clinical, due: 2026-09-09 08:30)
      bring films, then chart
```

Re-importing your own export is a no-op rather than a duplicate: since the
markdown carries no ids, a task is considered the same when its title, due date
and due time all match.

## 🍂 Seasons

The backdrop changes with the calendar — blossoms in spring, warm sun in summer,
falling leaves in autumn, snowflakes in winter — using meteorological seasons
(spring starts 1 March, and so on) in the **northern hemisphere**.

The chip in the header shows the current season. Click it to cycle through the
four seasons and back to automatic; a pinned season is outlined and remembered
on that device. Southern-hemisphere users can just pin the opposite season.

Only the page backdrop and one accent colour change. Priority, category, and
button colours stay fixed, so nothing that carries meaning shifts with the time
of year. The artwork is inline SVG in the stylesheet — no image downloads, and
it works offline. There is no animation.

## 🔢 Version badge

A small version badge sits next to the title. It is rendered from `APP_VERSION`
inside `app.js`, so if the number changes you know the browser loaded the new
file rather than a cached copy — which is the usual question after a deploy.

The service worker builds its cache name from the same constant, so one bump
both invalidates the cache and updates what you see. `package.json` carries it
too, and a test fails if the three ever disagree.

To release: change `APP_VERSION` in `app.js`, `service-worker.js` and
`package.json`, then run `npm test` — it will tell you if you missed one.

## 🗓 The main view

The app opens on **Schedule**, with three tabs:

- **Today** — what is due today, in time order, with a count on the tab
- **Week** — the next seven days, grouped by day
- **All** — the full list with search, status and category filters, and a
  jump-to-date control

Everything else — the full add-task form, templates, calendar export, Obsidian,
and manual backup — is tucked into collapsible sections below, so the daily view
is the first thing on screen rather than the sixth.

Deleting a task, or clearing completed ones, shows an **Undo** for a few
seconds. Deletes are tombstones rather than removals, so undo is exact and the
restore also wins on your other devices.

## 🔄 Device Sync

Tasks are stored locally and can sync across your devices. The app encrypts them
in the browser before uploading, so the server only ever holds ciphertext.

**Tasks in the Clinical category are never uploaded** — they stay only on the
device that created them.

See **[SYNC_SETUP.md](SYNC_SETUP.md)** for step-by-step setup (about five
minutes, once).

> The encryption protects data at rest on the server. It does not protect
> against someone using your already-unlocked device. GitHub does not sign
> Business Associate Agreements; check with your institution's privacy office
> before syncing anything patient-identifiable.

## 🧪 Tests

No dependencies and no build step:

```bash
npm test          # or: node test/app.test.js && node test/sync.test.js
```

The suites evaluate the real `app.js` and `sync.js` against a DOM stub and a
frozen clock, so they exercise the shipping files rather than copies of their
logic. They cover local-vs-UTC date handling, merge and tombstone semantics,
markup-safe rendering, and the guarantee that clinical tasks never reach the
network.

## 🚀 Quick Start

### Installation Options

#### Option 1: Install as PWA (Recommended for Mobile)
1. Open the app in your mobile browser
2. Look for "Add to Home Screen" or "Install" prompt
3. Follow the prompts to install
4. Launch from your home screen like any other app

#### Option 2: GitHub Pages (Web Access)
1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Select your branch (e.g., `main`) and root directory
4. Save and visit the provided URL
5. Bookmark on your devices for easy access

#### Option 3: Local Development
1. Clone the repository
2. Open `index.html` in a modern browser
3. No build process or dependencies required!

## 📱 Using the App

### Adding Tasks

**Standard Form:**
1. Fill in task title (required)
2. Add optional notes
3. Select priority (Low/Medium/High)
4. Choose category (Work/Home/Research/Clinical/Teaching)
5. Add a tag (e.g., #urgent)
6. Set due date and time
7. Choose recurrence if needed
8. Click "Add task"

**Quick Capture (Smart Parsing):**
Type everything in one line and let the app parse it for you!

Examples:
- `Call Dr. Smith tomorrow 2pm #urgent !high category:clinical`
- `Review paper today 9am category:research !medium`
- `Family dinner Friday 6:30pm category:home !low #family`

**Smart Parsing Rules:**
- `!high`, `!medium`, `!low` → Sets priority
- `#tag` → Adds a tag
- `category:clinical` → Sets category
- `tomorrow`, `today` → Sets date
- `2pm`, `14:00`, `2:30pm` → Sets time

### Task Templates

Click a template button to auto-fill the form with common task patterns:
- **New Patient Referral**: Pre-configured for clinical workflow
- **Research Paper Review**: Includes standard review steps
- **Conference Prep**: All preparation tasks included
- **Family Event**: Personal activity planning

### Filtering & Organization

**By Status:**
- All: Show everything
- Active: Only incomplete tasks
- Completed: Only finished tasks

**By Category:**
- Click any category badge to filter
- One-click to view only Clinical, Home, Research, etc.

**By Date:**
- Use the calendar sidebar
- Click any date to see tasks due that day
- Clear filter to see all tasks again

**Search:**
- Search across titles, notes, tags, and categories
- Real-time filtering as you type

### Recurring Tasks

When you mark a recurring task as complete:
1. The current task is marked done
2. A new task is automatically created for the next occurrence
3. All details (notes, priority, category) are preserved

Perfect for:
- Weekly clinic days
- Monthly research meetings
- Regular family activities
- Daily medication reviews

### Calendar View

The sidebar calendar shows:
- All tasks with due dates
- Tasks grouped by date
- Time information when available
- Task count per day
- Click any date to filter tasks

### Obsidian Integration

**Export to Markdown:**
1. Click "Export to Markdown"
2. Copy the generated checklist
3. Paste into your Obsidian note

**Import from Markdown:**
1. Copy checklist from Obsidian
2. Paste into the text area
3. Click "Import from Markdown"
4. Tasks appear in your app

**Markdown Format:**
```markdown
- [ ] Task title — notes #tag (priority: high, category: clinical, due: 2024-01-20 14:00, recurrence: weekly)
```

## 🎨 Category Colors

- **Work**: Blue - Professional tasks and meetings
- **Home**: Red - Personal and family activities
- **Research**: Purple - Academic and research work
- **Clinical**: Teal - Patient care and clinical duties
- **Teaching**: Orange - Educational responsibilities

## 📊 Task Organization Strategy

For busy medical professionals, we recommend:

### Daily View
1. Use calendar sidebar to see today's tasks
2. Filter by "Active" to focus on incomplete items
3. Quick capture new tasks as they come up

### Weekly Planning
1. Use category filters to review each area of life
2. Set recurring tasks for regular commitments
3. Use templates for common task types

### On-the-Go
1. Use the floating "+" button for quick adds
2. Quick capture with smart parsing (no forms!)
3. PWA install for offline access

## 🔧 Technical Details

- **Storage**: localStorage (client-side, no server required)
- **Offline**: Service worker caches all files
- **Sync**: Manual export/import via Markdown
- **Framework**: Vanilla JavaScript (no dependencies)
- **Size**: Lightweight, fast loading

## 🌐 Browser Support

- Chrome/Edge 90+
- Safari 14+
- Firefox 88+
- Mobile browsers (iOS Safari, Chrome Android)

## 📝 Data Management

### Backup Your Data
1. Click "Export to Markdown"
2. Save the markdown file
3. Store in cloud storage or Obsidian

### Clear Data
- Clear completed tasks with the "Clear completed" button
- To reset everything: Clear browser localStorage for the site

## 🤝 Contributing

This is an open-source project. Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Fork and customize for your needs

## 📄 License

Open source - use and modify as needed!

---

**Built for medical professionals who balance clinical care, research, teaching, and family life.**
