import firebaseConfig from './firebase-config.js';

// Firebase SDK will be loaded from CDN in index.html
let auth = null;
let db = null;
let currentUser = null;
let unsubscribeFromTasks = null;

// Initialize Firebase
export function initializeFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK not loaded. Running in offline-only mode.');
    return false;
  }

  try {
    // Check if config has been updated
    if (firebaseConfig.apiKey === 'YOUR_API_KEY') {
      console.warn('Firebase not configured. Please update firebase-config.js');
      return false;
    }

    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    // Enable offline persistence
    db.enablePersistence({ synchronizeTabs: true })
      .catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn('Persistence can only be enabled in one tab at a time.');
        } else if (err.code === 'unimplemented') {
          console.warn('Persistence not supported in this browser.');
        }
      });

    // Listen for auth state changes
    auth.onAuthStateChanged((user) => {
      currentUser = user;
      handleAuthStateChange(user);
    });

    return true;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return false;
  }
}

// Auth state change handler
function handleAuthStateChange(user) {
  const authContainer = document.getElementById('auth-container');
  const appContainer = document.getElementById('app-container');
  const userEmail = document.getElementById('user-email');

  if (user) {
    // User signed in
    authContainer.style.display = 'none';
    appContainer.style.display = 'block';
    if (userEmail) {
      userEmail.textContent = user.email;
    }

    // Start syncing tasks
    startTaskSync(user.uid);

    // Dispatch event for app.js to handle
    window.dispatchEvent(new CustomEvent('userSignedIn', { detail: { user } }));
  } else {
    // User signed out
    authContainer.style.display = 'flex';
    appContainer.style.display = 'none';

    // Stop syncing tasks
    stopTaskSync();

    // Dispatch event for app.js to handle
    window.dispatchEvent(new CustomEvent('userSignedOut'));
  }
}

// Sign in with email and password
export async function signInWithEmail(email, password) {
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Sign up with email and password
export async function signUpWithEmail(email, password) {
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Sign in with Google
export async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const userCredential = await auth.signInWithPopup(provider);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Sign out
export async function signOut() {
  try {
    await auth.signOut();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get current user
export function getCurrentUser() {
  return currentUser;
}

// Start syncing tasks from Firestore
function startTaskSync(userId) {
  if (!db) return;

  // Unsubscribe from previous listener if exists
  stopTaskSync();

  // Listen to real-time updates
  const tasksRef = db.collection('users').doc(userId).collection('tasks');

  unsubscribeFromTasks = tasksRef.onSnapshot((snapshot) => {
    const tasks = [];
    snapshot.forEach((doc) => {
      tasks.push({ id: doc.id, ...doc.data() });
    });

    // Dispatch event with synced tasks
    window.dispatchEvent(new CustomEvent('tasksSynced', { detail: { tasks } }));
  }, (error) => {
    console.error('Error syncing tasks:', error);
    showSyncError('Failed to sync tasks. Working offline.');
  });
}

// Stop syncing tasks
function stopTaskSync() {
  if (unsubscribeFromTasks) {
    unsubscribeFromTasks();
    unsubscribeFromTasks = null;
  }
}

// Save task to Firestore
export async function saveTaskToFirestore(task) {
  if (!db || !currentUser) return { success: false, error: 'Not authenticated' };

  try {
    const tasksRef = db.collection('users').doc(currentUser.uid).collection('tasks');

    if (task.id) {
      // Update existing task
      await tasksRef.doc(task.id).set(task, { merge: true });
    } else {
      // Create new task
      const docRef = await tasksRef.add(task);
      task.id = docRef.id;
    }

    return { success: true, task };
  } catch (error) {
    console.error('Error saving task:', error);
    return { success: false, error: error.message };
  }
}

// Delete task from Firestore
export async function deleteTaskFromFirestore(taskId) {
  if (!db || !currentUser) return { success: false, error: 'Not authenticated' };

  try {
    await db.collection('users').doc(currentUser.uid).collection('tasks').doc(taskId).delete();
    return { success: true };
  } catch (error) {
    console.error('Error deleting task:', error);
    return { success: false, error: error.message };
  }
}

// Batch update tasks to Firestore (for initial sync)
export async function syncLocalTasksToFirestore(tasks) {
  if (!db || !currentUser) return { success: false, error: 'Not authenticated' };

  try {
    const batch = db.batch();
    const tasksRef = db.collection('users').doc(currentUser.uid).collection('tasks');

    tasks.forEach((task) => {
      const docRef = task.id ? tasksRef.doc(task.id) : tasksRef.doc();
      batch.set(docRef, task, { merge: true });
    });

    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error('Error syncing tasks:', error);
    return { success: false, error: error.message };
  }
}

// Show sync status in UI
function showSyncError(message) {
  const syncStatus = document.getElementById('sync-status');
  if (syncStatus) {
    syncStatus.textContent = message;
    syncStatus.className = 'sync-status error';
    setTimeout(() => {
      syncStatus.textContent = '';
      syncStatus.className = 'sync-status';
    }, 5000);
  }
}

// Check if online
export function isOnline() {
  return navigator.onLine;
}

// Export auth object for direct access if needed
export { auth, db };
