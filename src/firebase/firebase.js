
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD-L301odCQZoBJBRKsSHiInXaV-_qbgAc",
  authDomain: "skillloop-7637f.firebaseapp.com",
  projectId: "skillloop-7637f",
  storageBucket: "skillloop-7637f.firebasestorage.app",
  messagingSenderId: "29534414682",
  appId: "1:29534414682:web:95d34eb6b5029e49e2f563"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
