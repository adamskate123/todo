# Cloud Storage Sync Guide

Simple cross-device sync using Dropbox, Google Drive, or iCloud - no technical setup required!

## How It Works

1. **Export** your tasks as a JSON backup file
2. **Save** the backup to your cloud storage folder (Dropbox/Google Drive/iCloud)
3. **Import** the backup on your other devices
4. Cloud storage automatically keeps the file in sync across all devices

## Step-by-Step Instructions

### Initial Setup (One-Time)

1. **Choose Your Cloud Storage:**
   - **Dropbox**: Free 2GB, works on all platforms
   - **Google Drive**: Free 15GB, best for Android users
   - **iCloud Drive**: Free 5GB, best for Mac/iPhone users

2. **Install Cloud Storage App:**
   - Download and install on all your devices
   - Sign in with the same account everywhere

3. **Create a Backup Folder:**
   - In your cloud storage, create a folder called `MedTodo Backups`
   - This folder will sync across all your devices

### Daily Usage

#### On Your First Device (e.g., Hospital Computer):

1. Open the MedTodo app
2. Scroll to "Cloud Storage Sync" section
3. Click **"Download Backup"**
4. Save the file to your cloud storage folder:
   - `Dropbox/MedTodo Backups/medtodo-backup-2024-01-21.json`
   - `Google Drive/MedTodo Backups/medtodo-backup-2024-01-21.json`
   - `iCloud Drive/MedTodo Backups/medtodo-backup-2024-01-21.json`

#### On Your Second Device (e.g., Phone):

1. Wait a few seconds for cloud storage to sync (usually instant)
2. Open the MedTodo app
3. Click **"Restore from Backup"**
4. Navigate to your cloud storage folder
5. Select the backup file you just created
6. Choose **"Merge"** to add new tasks, or **"Replace"** to overwrite

That's it! Your tasks are now synced.

## Usage Scenarios

### Scenario 1: End of Workday Sync

```
Hospital (5:00 PM):
1. Added 10 new patient tasks today
2. Click "Download Backup" → Save to Dropbox
3. Head home

Home (5:30 PM):
1. Open app on laptop
2. Click "Restore from Backup"
3. Select today's backup from Dropbox
4. Click "Merge" to add hospital tasks
5. All 10 tasks now appear!
```

### Scenario 2: Weekend Planning

```
Phone (Saturday morning):
1. Plan family activities
2. Add 5 home tasks
3. Download backup → Save to Google Drive

Tablet (Saturday afternoon):
1. Restore from backup
2. See all family tasks
3. Update with more details
4. Download new backup

Phone (Later):
1. Restore latest backup
2. See updated tasks
```

### Scenario 3: Multi-Device Workflow

```
Research Office Computer:
- Add research paper review tasks
- Export to iCloud Drive

iPhone (Between meetings):
- Import latest backup
- Review and complete some tasks
- Export updated version

Home Laptop (Evening):
- Import latest backup
- Continue working on tasks
```

## Best Practices

### Naming Convention

Use clear, dated filenames:
- ✅ `medtodo-backup-2024-01-21-morning.json`
- ✅ `medtodo-backup-2024-01-21-end-of-day.json`
- ❌ `backup.json` (too generic)
- ❌ `tasks1.json` (confusing)

### Backup Frequency

**Daily users:**
- Export at end of work day
- Export after adding important tasks

**Occasional users:**
- Export before switching devices
- Export after major task list updates

**Paranoid users:**
- Set a reminder to export daily
- Keep multiple dated backups

### Merge vs Replace

**Choose "Merge" when:**
- You've added tasks on both devices
- You want to combine task lists
- You're not sure (safer option)

**Choose "Replace" when:**
- One device has the master list
- You want to completely sync from one source
- You're restoring from a known good backup

## Automatic Sync Options

### Option 1: Browser Bookmark

Create a bookmark with:
1. Open app
2. Click "Download Backup"
3. Always save to same cloud folder
4. Do this every time you finish using the app

### Option 2: Daily Reminder

Set a phone reminder:
- **Time**: End of your workday
- **Action**: "Export MedTodo backup to Dropbox"
- Takes 5 seconds to do

### Option 3: Multiple Backups

Keep 7 days of backups:
- Monday backup, Tuesday backup, etc.
- Delete old ones weekly
- Always have recent backup available

## Troubleshooting

### "Can't find my backup file"

**Check:**
- Is cloud storage app installed?
- Is cloud storage actively syncing? (check the app)
- Did you save to the correct folder?
- Did you wait for sync to complete? (usually 5-30 seconds)

**Solution:**
- Open cloud storage app
- Manually sync/refresh
- Look in "Recent files"
- Check the folder you saved to

### "Backup not updating on other device"

**Check:**
- Is the device online?
- Is cloud storage running?
- Check "last modified" date on the file

**Solution:**
- Force sync in cloud storage app
- Wait 1-2 minutes
- Restart cloud storage app if needed

### "Accidentally replaced all my tasks"

**Solution:**
- Look for an older backup in your cloud folder
- Most cloud storage keeps deleted files for 30 days
- Restore from yesterday's backup

### "Tasks appearing twice after merge"

**Why:** Merged the same backup twice

**Solution:**
- Tasks have unique IDs, so true duplicates won't occur
- If you see similar tasks, one is older
- Delete the older ones manually

## Comparison: Cloud Storage vs Firebase

### Cloud Storage (Current Setup):

✅ **Pros:**
- No setup required
- Works with services you already use
- No account creation needed
- Simple and transparent
- You control your data
- Works offline (local storage)

❌ **Cons:**
- Manual export/import required
- Not instant/real-time
- Requires a few clicks to sync

### Firebase (Automated Sync):

✅ **Pros:**
- Automatic real-time sync
- No manual export/import
- Instant updates across devices

❌ **Cons:**
- Requires Firebase account setup
- More technical configuration
- Needs authentication
- Depends on external service

## Tips & Tricks

### Tip 1: Sync Before Important Tasks

Before adding critical patient tasks:
1. Import latest backup first
2. Then add your new tasks
3. Export immediately after

### Tip 2: Use Descriptive Backup Names

Include context in filename:
```
medtodo-2024-01-21-10-patients-clinic-day.json
medtodo-2024-01-21-research-deadlines.json
```

### Tip 3: Keep a Master Backup

Once a week, create a "master" backup:
- `medtodo-master-2024-week-03.json`
- Store in a safe location
- Use if something goes wrong

### Tip 4: Sync Checklist

Print and post this near your computer:
```
☐ Added tasks today?
☐ Download backup
☐ Saved to cloud folder
☐ Synced on phone?
```

### Tip 5: Travel Mode

Before traveling:
1. Download latest backup to phone
2. Save a copy to email (backup of backup)
3. Work offline during travel
4. Merge changes when back online

## Cost

**Cloud Storage:**
- Dropbox: Free (2GB) or $12/month (2TB)
- Google Drive: Free (15GB) or $2/month (100GB)
- iCloud: Free (5GB) or $1/month (50GB)

**For This App:**
- Backup files are tiny (usually < 100KB even with 1000 tasks)
- Free tier is more than enough
- One year of daily backups = ~36MB

## Security

Your tasks are safe because:
- Cloud storage uses encryption
- Files are private to your account
- No one else can access your backups
- You can enable 2-factor authentication on cloud accounts

## Getting Help

If you need assistance:
1. Check that cloud storage is properly syncing other files
2. Try exporting a new backup
3. Verify the file is actually in your cloud folder
4. Check file size (should be > 0 KB)

## Quick Reference

| Action | Steps |
|--------|-------|
| **Export** | Cloud Storage Sync → Download Backup → Save to cloud folder |
| **Import** | Cloud Storage Sync → Restore from Backup → Select file → Choose Merge/Replace |
| **Sync All Devices** | Export from one device → Import on all others |

---

**Remember**: The more often you export/import, the more in-sync your devices will be. Make it a habit!

Happy syncing! 🎉
