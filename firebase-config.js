// Firebase Configuration
// IMPORTANT: Replace these with your own Firebase project credentials
// Get them from: https://console.firebase.google.com/
<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyDLZ5zc91Aj_07DIJA2nZ946I8A1K6V8NQ",
    authDomain: "todo-app-8466f.firebaseapp.com",
    projectId: "todo-app-8466f",
    storageBucket: "todo-app-8466f.firebasestorage.app",
    messagingSenderId: "1011391481429",
    appId: "1:1011391481429:web:99cde3df7de89cbe9336dc",
    measurementId: "G-8YCKCF3J4W"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>

// Instructions to set up Firebase:
// 1. Go to https://console.firebase.google.com/
// 2. Click "Add project" or select existing project
// 3. Follow the setup wizard
// 4. Click "Add app" → Web (</>) icon
// 5. Register your app with a nickname (e.g., "MedTodo")
// 6. Copy the config values above and replace them here
// 7. Enable Authentication:
//    - Go to Authentication → Sign-in method
//    - Enable "Email/Password"
//    - Enable "Google" (optional but recommended)
// 8. Enable Firestore Database:
//    - Go to Firestore Database → Create database
//    - Start in "production mode"
//    - Choose a location close to you
// 9. Set up Firestore Security Rules:
//    Go to Firestore → Rules and paste:
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /users/{userId}/tasks/{taskId} {
//          allow read, write: if request.auth != null && request.auth.uid == userId;
//        }
//      }
//    }
//
// This ensures users can only access their own tasks.

export default firebaseConfig;
