// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBSdic1jKQ5nRUD8Ub_2S7TiHeZciicEQA",
  authDomain: "meetstandaard-api.firebaseapp.com",
  projectId: "meetstandaard-api",
  storageBucket: "meetstandaard-api.appspot.com",
  messagingSenderId: "108016772116",
  appId: "1:108016772116:web:a6558b366285596f7f3301"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const functions = getFunctions(app);
const auth = getAuth(app);

export { db, functions, auth };



