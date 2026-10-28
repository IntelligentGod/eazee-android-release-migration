import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth, Auth } from 'firebase/auth';
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: 'AIzaSyAdaTlWqxllQsM6Lhp9BW22FHVsCdvClFA',
  authDomain: 'eazee-app.firebaseapp.com',
  projectId: 'eazee-app',
  storageBucket: 'eazee-app.firebasestorage.app',
  messagingSenderId: '66318687320',
  appId: '1:66318687320:web:3cff72e718954c9ed9fe2d',
};

// Initialize Primary App
let app: FirebaseApp;
const existingApps = getApps();
if (existingApps.length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  // If apps exist, get the default app.
  app = getApp();
}

// Initialize Primary Auth with Persistence
let auth: Auth;
try {
  // Initialize auth with persistence settings.
  // This configures the auth service for the 'app' instance.
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error: any) {
  if (error.code === 'auth/already-initialized') {
    // This can happen with hot reloading. Get the existing auth instance.
    auth = getAuth(app);
  } else {
    // For other errors, log them.
    console.error("Firebase Auth initialization error:", error);
    auth = getAuth(app); // Fallback, persistence may not be configured.
  }
}

export default app;
export { auth };
