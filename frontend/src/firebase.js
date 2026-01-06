// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDoosXYEyQ6pMfT1AaZheMF8YJ4420RaeI",
  authDomain: "gdg-hackathon-6fc99.firebaseapp.com",
  projectId: "gdg-hackathon-6fc99",
  storageBucket: "gdg-hackathon-6fc99.firebasestorage.app",
  messagingSenderId: "146683331060",
  appId: "1:146683331060:web:a9d2d066fa0485efcfb9a1",
  measurementId: "G-KZB9JXC1WQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { analytics };
export default app;
