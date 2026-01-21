# Firebase Setup Guide

This guide will walk you through setting up Firebase for cross-device sync in your MedTodo app.

## Why Firebase?

Firebase provides:
- ✅ **Real-time sync** across all your devices
- ✅ **Offline support** - works without internet, syncs when back online
- ✅ **Free tier** - plenty for personal use (50K reads, 20K writes per day)
- ✅ **Secure** - your tasks are protected by authentication
- ✅ **Automatic backups** - your data is stored in the cloud

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter project name: `medtodo` (or any name you prefer)
4. Click **Continue**
5. Disable Google Analytics (optional, not needed for this app)
6. Click **Create project**
7. Wait for project creation to complete
8. Click **Continue**

## Step 2: Register Your Web App

1. In the Firebase console, click the **Web icon** (`</>`) to add a web app
2. Enter app nickname: `MedTodo Web App`
3. **Check** "Also set up Firebase Hosting" (optional, but recommended)
4. Click **Register app**
5. You'll see Firebase SDK configuration code - **keep this page open**

## Step 3: Update Configuration File

1. In your code, open `firebase-config.js`
2. Replace the placeholder values with your Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",  // Copy from Firebase console
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

3. Save the file

## Step 4: Enable Authentication

1. In Firebase console, go to **Build** → **Authentication**
2. Click **Get started**
3. Under "Sign-in method" tab, enable:

### Email/Password
- Click **Email/Password**
- Toggle **Enable** to ON
- Click **Save**

### Google Sign-In (Recommended)
- Click **Google**
- Toggle **Enable** to ON
- Select your project support email
- Click **Save**

## Step 5: Create Firestore Database

1. In Firebase console, go to **Build** → **Firestore Database**
2. Click **Create database**
3. Select **Start in production mode**
4. Click **Next**
5. Choose a Cloud Firestore location (select closest to you):
   - `us-central1` (United States)
   - `europe-west1` (Belgium)
   - `asia-southeast1` (Singapore)
6. Click **Enable**

## Step 6: Set Up Security Rules

1. Once Firestore is created, click on the **Rules** tab
2. Replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own tasks
    match /users/{userId}/tasks/{taskId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Prevent access to other users' data
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Click **Publish**

**What these rules do:**
- Users can only read/write their own tasks
- Tasks are stored under `/users/{userId}/tasks/{taskId}`
- Unauthenticated users cannot access any data
- Users cannot access each other's tasks

## Step 7: Deploy Your App

### Option A: GitHub Pages (Current Setup)
1. Commit all changes including `firebase-config.js`
2. Push to GitHub
3. Merge your PR to main branch
4. GitHub Pages will automatically deploy

### Option B: Firebase Hosting (Recommended)
1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize Firebase in your project:
   ```bash
   firebase init
   ```
   - Select **Hosting**
   - Choose your Firebase project
   - Public directory: `.` (current directory)
   - Configure as single-page app: **Yes**
   - Don't overwrite index.html: **No**

4. Deploy:
   ```bash
   firebase deploy
   ```

5. Your app will be live at: `https://your-project.web.app`

## Step 8: Test the Sync

1. Open your app in a browser
2. Sign up with email/password or Google
3. Add a few tasks
4. Open the app in another browser (or device)
5. Sign in with the same account
6. You should see your tasks synced!
7. Add/edit/delete tasks on one device
8. Watch them update in real-time on the other device

## Troubleshooting

### "Firebase not configured" error
- Make sure you updated `firebase-config.js` with your actual Firebase config values
- Check that you saved the file
- Clear browser cache and reload

### "Permission denied" error
- Check Firestore security rules are set correctly
- Make sure you're signed in
- Verify the rules were published in Firebase console

### Tasks not syncing
- Check browser console for errors
- Verify you're signed in on both devices with the same account
- Check internet connection
- Look for sync status indicator (should show "✓ Synced")

### "Auth domain not whitelisted" error
- Go to Firebase console → Authentication → Settings → Authorized domains
- Add your domain (e.g., `your-username.github.io`)

## Usage Tips

### First Sign In
- When you first sign in, any existing local tasks will be synced to Firebase
- From then on, Firebase is the source of truth

### Offline Mode
- If you want to use the app without signing in, click "Continue without account (offline only)"
- Your tasks will be saved locally but won't sync across devices
- You can sign in later and your local tasks will be synced

### Multiple Devices
- Sign in with the same account on all your devices
- Tasks will automatically sync in real-time
- Changes on one device instantly appear on others

### Data Privacy
- Your tasks are encrypted in transit (HTTPS)
- Only you can access your tasks (Firebase security rules)
- No one else, including the app developer, can read your tasks

## Cost

Firebase free tier includes:
- 50,000 reads per day
- 20,000 writes per day
- 1 GB storage
- 10 GB/month bandwidth

For personal use, you'll likely never exceed this. Even with 100 tasks and checking the app 10 times per day on 3 devices, you'd use:
- ~3,000 reads/day
- ~100 writes/day

## Need Help?

If you encounter issues:
1. Check the browser console for errors (F12 → Console tab)
2. Verify all steps above were completed
3. Check Firebase console for authentication/Firestore errors
4. Ensure you're using a modern browser (Chrome, Firefox, Safari, Edge)

## Next Steps

Once Firebase is working:
- ✅ Try the app on multiple devices
- ✅ Test offline mode (airplane mode)
- ✅ Explore Firebase console to see your data
- ✅ Consider adding more security rules if needed

Happy syncing! 🎉
