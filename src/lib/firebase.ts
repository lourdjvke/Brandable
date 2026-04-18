import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDsbMHJNEO2JbPvlwvpYJ_t-bymK-4vrsU",
  authDomain: "swift-edit.firebaseapp.com",
  databaseURL: "https://swift-edit-default-rtdb.firebaseio.com",
  projectId: "swift-edit",
  storageBucket: "swift-edit.appspot.com",
  messagingSenderId: "380297811976",
  appId: "1:380297811976:web:a3ad6ea34518f0739f19bd",
  measurementId: "G-1MX9VBMT9L"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});
