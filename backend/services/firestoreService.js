const admin = require('firebase-admin');

// Initialize Firebase Admin with project config
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'gdg-hackathon-6fc99',
    credential: admin.credential.applicationDefault()
  });
}

let db;
let useFirestore = false;

try {
  db = admin.firestore();
  useFirestore = true;
  console.log('Connected to Firestore');
} catch (e) {
  console.warn('Firestore not available, using in-memory storage');
}

// Fallback in-memory store
const memoryStore = new Map();
const COLLECTION = 'testRuns';

async function saveTestRun(testRun) {
  if (useFirestore) {
    try {
      await db.collection(COLLECTION).doc(testRun.id).set(testRun);
      return testRun;
    } catch (e) {
      console.warn('Firestore save failed, using memory:', e.message);
    }
  }
  memoryStore.set(testRun.id, testRun);
  return testRun;
}

async function getTestRun(id) {
  if (useFirestore) {
    try {
      const doc = await db.collection(COLLECTION).doc(id).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (e) {
      console.warn('Firestore get failed, using memory:', e.message);
    }
  }
  return memoryStore.get(id) || null;
}

async function getAllTestRuns() {
  if (useFirestore) {
    try {
      const snapshot = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(50).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.warn('Firestore getAll failed, using memory:', e.message);
    }
  }
  return Array.from(memoryStore.values()).sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

async function updateTestRun(id, updates) {
  if (useFirestore) {
    try {
      await db.collection(COLLECTION).doc(id).update(updates);
      return getTestRun(id);
    } catch (e) {
      console.warn('Firestore update failed, using memory:', e.message);
    }
  }
  const existing = memoryStore.get(id);
  if (existing) {
    const updated = { ...existing, ...updates };
    memoryStore.set(id, updated);
    return updated;
  }
  return null;
}

async function deleteTestRun(id) {
  if (useFirestore) {
    try {
      await db.collection(COLLECTION).doc(id).delete();
      return true;
    } catch (e) {
      console.warn('Firestore delete failed, using memory:', e.message);
    }
  }
  memoryStore.delete(id);
  return true;
}

module.exports = { saveTestRun, getTestRun, getAllTestRuns, updateTestRun, deleteTestRun };
