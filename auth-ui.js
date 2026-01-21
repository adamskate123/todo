import { initializeFirebase, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut } from './auth.js';

// Initialize Firebase on page load
document.addEventListener('DOMContentLoaded', () => {
  const firebaseEnabled = initializeFirebase();

  if (!firebaseEnabled) {
    // Firebase not configured, show offline mode
    showOfflineMode();
  }

  setupAuthUI();
});

function setupAuthUI() {
  // Form toggle
  const showSignup = document.getElementById('show-signup');
  const showSignin = document.getElementById('show-signin');
  const signinForm = document.getElementById('signin-form');
  const signupForm = document.getElementById('signup-form');
  const useOffline = document.getElementById('use-offline');

  showSignup?.addEventListener('click', (e) => {
    e.preventDefault();
    signinForm.classList.remove('active');
    signupForm.classList.add('active');
    clearAuthError();
  });

  showSignin?.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.classList.remove('active');
    signinForm.classList.add('active');
    clearAuthError();
  });

  useOffline?.addEventListener('click', (e) => {
    e.preventDefault();
    showOfflineMode();
  });

  // Sign in with email
  const signinEmailForm = document.getElementById('signin-email-form');
  signinEmailForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signin-email').value;
    const password = document.getElementById('signin-password').value;

    showAuthLoading('Signing in...');

    const result = await signInWithEmail(email, password);

    if (result.success) {
      clearAuthError();
    } else {
      showAuthError(result.error);
    }
  });

  // Sign up with email
  const signupEmailForm = document.getElementById('signup-email-form');
  signupEmailForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-password-confirm').value;

    if (password !== confirmPassword) {
      showAuthError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      showAuthError('Password must be at least 6 characters');
      return;
    }

    showAuthLoading('Creating account...');

    const result = await signUpWithEmail(email, password);

    if (result.success) {
      clearAuthError();
    } else {
      showAuthError(result.error);
    }
  });

  // Google sign in
  const googleSigninBtn = document.getElementById('google-signin-btn');
  const googleSignupBtn = document.getElementById('google-signup-btn');

  googleSigninBtn?.addEventListener('click', async () => {
    showAuthLoading('Signing in with Google...');
    const result = await signInWithGoogle();

    if (result.success) {
      clearAuthError();
    } else {
      showAuthError(result.error);
    }
  });

  googleSignupBtn?.addEventListener('click', async () => {
    showAuthLoading('Signing up with Google...');
    const result = await signInWithGoogle();

    if (result.success) {
      clearAuthError();
    } else {
      showAuthError(result.error);
    }
  });

  // Sign out
  const signOutBtn = document.getElementById('sign-out-btn');
  signOutBtn?.addEventListener('click', async () => {
    const result = await signOut();
    if (!result.success) {
      console.error('Sign out error:', result.error);
    }
  });
}

function showAuthError(message) {
  const errorDiv = document.getElementById('auth-error');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

function clearAuthError() {
  const errorDiv = document.getElementById('auth-error');
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }
}

function showAuthLoading(message) {
  const errorDiv = document.getElementById('auth-error');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.style.color = 'var(--primary)';
  }
}

function showOfflineMode() {
  // Hide auth container, show app
  const authContainer = document.getElementById('auth-container');
  const appContainer = document.getElementById('app-container');

  if (authContainer && appContainer) {
    authContainer.style.display = 'none';
    appContainer.style.display = 'block';

    // Show offline indicator
    const syncStatus = document.getElementById('sync-status');
    const userEmail = document.getElementById('user-email');
    const signOutBtn = document.getElementById('sign-out-btn');

    if (syncStatus) {
      syncStatus.textContent = 'Offline Mode';
      syncStatus.className = 'sync-status offline';
    }

    if (userEmail) {
      userEmail.textContent = 'Guest';
    }

    if (signOutBtn) {
      signOutBtn.style.display = 'none';
    }

    // Dispatch event for app.js
    window.dispatchEvent(new CustomEvent('offlineMode'));
  }
}
