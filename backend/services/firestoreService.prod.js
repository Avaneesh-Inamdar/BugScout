// Production Firestore Service
// Rename to firestoreService.js and configure Firebase credentials

const admin = require('firebase-admin');

// Initialize Firebase Admin
// Option 1: Use GOOGLE_APPLICATION_CREDENTIALS env var
// Option 2: Pass service account directly
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const db = admin.firestore();
const COLLECTION = 'testRuns';

async function saveTestRun(testRun) {
  await db.collection(COLLECTION).doc(testRun.id).set(testRun);
  return testRun;
}

async function getTestRun(id) {
  const doc = await db.collection(COLLECTION).doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getAllTestRuns() {
  const snapshot = await db.collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function updateTestRun(id, updates) {
  await db.collection(COLLECTION).doc(id).update(updates);
  return getTestRun(id);
}

async function deleteTestRun(id) {
  await db.collection(COLLECTION).doc(id).delete();
  return true;
}

module.exports = { saveTestRun, getTestRun, getAllTestRuns, updateTestRun, deleteTestRun };
