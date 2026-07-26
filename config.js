// ===========================================================
// Dream TopUp - Admin Panel Configuration
// Tailwind theme + Firebase project settings & initialization
// Load this file AFTER the Tailwind CDN & Firebase compat SDKs,
// and BEFORE script.js
// ===========================================================

// --- Tailwind Custom Theme (dark admin colors, font) ---
tailwind.config = {
    theme: {
        extend: {
            colors: {
                dark: {
                    bg: '#09090B',
                    panel: '#18181A',
                    border: '#27272A'
                },
                orange: {
                    500: '#F49E0B',
                    600: '#D98A00',
                    hover: '#FFB640'
                }
            },
            fontFamily: {
                sans: ['Poppins', 'sans-serif'],
            }
        }
    }
}

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: ""
};

// Initialize Firebase App
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

// Shared Firebase Service Instances
// (These are used globally across script.js)
const db = firebase.firestore();   // Firestore Database
const auth = firebase.auth();      // Authentication
