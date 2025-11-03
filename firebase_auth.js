/**
 * Firebase Authentication Module for Chrome Extension
 * Handles Google OAuth login and token management
 */

// Firebase configuration (replace with your actual config)
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

class FirebaseAuthManager {
  constructor() {
    this.currentUser = null;
    this.authStateListeners = [];
  }

  /**
   * Initialize Firebase and check auth state
   */
  async initialize() {
    try {
      // Import Firebase from CDN (in manifest, add this to content_security_policy)
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase SDK not loaded');
      }

      // Initialize Firebase if not already done
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }

      // Set up auth state listener
      firebase.auth().onAuthStateChanged((user) => {
        this.currentUser = user;
        this.notifyAuthStateChange(user);
        
        if (user) {
          this.saveUserToStorage(user);
        } else {
          this.clearUserFromStorage();
        }
      });

      // Try to restore session
      const savedUser = await this.getUserFromStorage();
      if (savedUser) {
        this.currentUser = savedUser;
      }

      return this.currentUser;
    } catch (error) {
      console.error('Firebase initialization error:', error);
      throw error;
    }
  }

  /**
   * Sign in with Google OAuth
   */
  async signInWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');

      // For Chrome extension, we need to use signInWithPopup
      const result = await firebase.auth().signInWithPopup(provider);
      const user = result.user;
      
      // Get ID token for backend authentication
      const idToken = await user.getIdToken();
      
      // Store token
      await this.saveTokenToStorage(idToken);
      
      // Register user in backend
      await this.registerUserInBackend(user, idToken);
      
      return {
        user,
        token: idToken
      };
    } catch (error) {
      console.error('Sign in error:', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Sign out current user
   */
  async signOut() {
    try {
      await firebase.auth().signOut();
      await this.clearUserFromStorage();
      this.currentUser = null;
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  /**
   * Get current ID token (refreshes if expired)
   */
  async getIdToken(forceRefresh = false) {
    try {
      const user = firebase.auth().currentUser;
      if (!user) {
        throw new Error('No user signed in');
      }
      
      return await user.getIdToken(forceRefresh);
    } catch (error) {
      console.error('Get token error:', error);
      throw error;
    }
  }

  /**
   * Register/update user in backend database
   */
  async registerUserInBackend(user, idToken) {
    try {
      const response = await fetch('http://localhost:5000/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          firebase_uid: user.uid,
          email: user.email,
          display_name: user.displayName,
          photo_url: user.photoURL
        })
      });

      if (!response.ok) {
        throw new Error('Failed to register user in backend');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Backend registration error:', error);
      // Don't throw - allow user to continue even if backend sync fails
      return null;
    }
  }

  /**
   * Check if user can analyze more tickets
   */
  async checkUsageLimit() {
    try {
      const idToken = await this.getIdToken();
      
      const response = await fetch('http://localhost:5000/usage/check', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to check usage limit');
      }

      const data = await response.json();
      return {
        canAnalyze: data.can_analyze,
        remaining: data.remaining_tickets,
        limit: data.monthly_limit,
        tier: data.subscription_tier
      };
    } catch (error) {
      console.error('Usage check error:', error);
      // Default to allowing analysis if check fails
      return { canAnalyze: true, remaining: 0, limit: 0, tier: 'free' };
    }
  }

  /**
   * Save user to Chrome storage
   */
  async saveUserToStorage(user) {
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    };

    return new Promise((resolve) => {
      chrome.storage.local.set({ user: userData }, resolve);
    });
  }

  /**
   * Get user from Chrome storage
   */
  async getUserFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['user'], (result) => {
        resolve(result.user || null);
      });
    });
  }

  /**
   * Save token to Chrome storage
   */
  async saveTokenToStorage(token) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ idToken: token }, resolve);
    });
  }

  /**
   * Get token from Chrome storage
   */
  async getTokenFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['idToken'], (result) => {
        resolve(result.idToken || null);
      });
    });
  }

  /**
   * Clear user data from storage
   */
  async clearUserFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(['user', 'idToken'], resolve);
    });
  }

  /**
   * Add auth state change listener
   */
  onAuthStateChanged(callback) {
    this.authStateListeners.push(callback);
    
    // Immediately call with current state
    if (this.currentUser !== null) {
      callback(this.currentUser);
    }
  }

  /**
   * Notify all listeners of auth state change
   */
  notifyAuthStateChange(user) {
    this.authStateListeners.forEach(callback => {
      try {
        callback(user);
      } catch (error) {
        console.error('Auth state listener error:', error);
      }
    });
  }

  /**
   * Get current user info
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Check if user is signed in
   */
  isSignedIn() {
    return this.currentUser !== null;
  }
}

// Export singleton instance
const authManager = new FirebaseAuthManager();

// Auto-initialize when script loads
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    authManager.initialize().catch(console.error);
  });
}

// Make available globally
if (typeof window !== 'undefined') {
  window.authManager = authManager;
}

export default authManager;
