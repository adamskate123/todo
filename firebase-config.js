// Firebase Configuration
// IMPORTANT: Replace these with your own Firebase project credentials
// Get them from: https://console.firebase.google.com/
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

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
