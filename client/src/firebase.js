import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyAQwOBG3dpsEzxvm5AFmhWQMjwOpVySfTo",
  authDomain: "aulaviva-8e167.firebaseapp.com",
  projectId: "aulaviva-8e167",
  storageBucket: "aulaviva-8e167.firebasestorage.app",
  messagingSenderId: "2583012680",
  appId: "1:2583012680:web:5eedade8dc3450babdbf7d"
}

const app = initializeApp(firebaseConfig)
const db   = getFirestore(app)
const auth = getAuth(app)

export { db, auth }
