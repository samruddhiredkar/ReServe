import {initializeApp} from 'firebase/app'
import {getAuth} from 'firebase/auth'
import {getFirestore} from 'firebase/firestore'
const e=import.meta.env
const cfg={apiKey:e.VITE_FIREBASE_API_KEY,authDomain:e.VITE_FIREBASE_AUTH_DOMAIN,projectId:e.VITE_FIREBASE_PROJECT_ID,
 storageBucket:e.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:e.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:e.VITE_FIREBASE_APP_ID}
export const configured=Boolean(cfg.apiKey&&cfg.projectId&&cfg.appId)
const app=configured?initializeApp(cfg):null
export const auth=configured?getAuth(app):null
export const db=configured?getFirestore(app):null
