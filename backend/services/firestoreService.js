const admin = require('firebase-admin');

// Initialize Firebase Admin with project config
if (!admin.apps.length) {
  let credential;
  
  // Option 1: Service account JSON string from env var (for Render/cloud deployment)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    credential = admin.credential.cert(serviceAccount);
  } 
  // Option 2: Service account file path
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = admin.credential.applicationDefault();
  }
  // Option 3: Default credentials (for local dev with gcloud auth)
  else {
    credential = admin.credential.applicationDefault();
  }

  admin.initializeApp({
    projectId: 'gdg-hackathon-6fc99',
    credential
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
const shareLinksStore = new Map();
const COLLECTION = 'testRuns';
const SHARES_COLLECTION = 'sharedReports';

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

async function getAllTestRuns(userId = null) {
  if (useFirestore) {
    try {
      let query = db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(50);
      if (userId) {
        query = db.collection(COLLECTION).where('userId', '==', userId).orderBy('createdAt', 'desc').limit(50);
      }
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.warn('Firestore getAll failed, using memory:', e.message);
    }
  }
  let runs = Array.from(memoryStore.values());
  if (userId) {
    runs = runs.filter(r => r.userId === userId);
  }
  return runs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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

// Share link functions
async function createShareLink(shareData) {
  if (useFirestore) {
    try {
      await db.collection(SHARES_COLLECTION).doc(shareData.shareId).set(shareData);
      return shareData;
    } catch (e) {
      console.warn('Firestore share save failed, using memory:', e.message);
    }
  }
  shareLinksStore.set(shareData.shareId, shareData);
  return shareData;
}

async function getShareLink(shareId) {
  if (useFirestore) {
    try {
      const doc = await db.collection(SHARES_COLLECTION).doc(shareId).get();
      return doc.exists ? { shareId: doc.id, ...doc.data() } : null;
    } catch (e) {
      console.warn('Firestore share get failed, using memory:', e.message);
    }
  }
  return shareLinksStore.get(shareId) || null;
}

async function getSharesByTestRun(testRunId) {
  if (useFirestore) {
    try {
      const snapshot = await db.collection(SHARES_COLLECTION)
        .where('testRunId', '==', testRunId)
        .get();
      return snapshot.docs.map(doc => ({ shareId: doc.id, ...doc.data() }));
    } catch (e) {
      console.warn('Firestore shares query failed, using memory:', e.message);
    }
  }
  return Array.from(shareLinksStore.values()).filter(s => s.testRunId === testRunId);
}

async function deleteShareLink(shareId) {
  if (useFirestore) {
    try {
      await db.collection(SHARES_COLLECTION).doc(shareId).delete();
      return true;
    } catch (e) {
      console.warn('Firestore share delete failed, using memory:', e.message);
    }
  }
  shareLinksStore.delete(shareId);
  return true;
}

async function deleteTestRunsWithoutUser() {
  let deletedCount = 0;
  if (useFirestore) {
    try {
      // Get all test runs without userId
      const snapshot = await db.collection(COLLECTION).where('userId', '==', null).get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        deletedCount++;
      });
      
      // Also get ones where userId field doesn't exist
      const snapshot2 = await db.collection(COLLECTION).get();
      snapshot2.docs.forEach(doc => {
        const data = doc.data();
        if (!data.userId) {
          batch.delete(doc.ref);
          deletedCount++;
        }
      });
      
      await batch.commit();
      console.log(`Deleted ${deletedCount} old test runs without userId`);
      return deletedCount;
    } catch (e) {
      console.warn('Firestore cleanup failed:', e.message);
    }
  }
  // Memory store cleanup
  for (const [id, run] of memoryStore) {
    if (!run.userId) {
      memoryStore.delete(id);
      deletedCount++;
    }
  }
  return deletedCount;
}

module.exports = { 
  saveTestRun, 
  getTestRun, 
  getAllTestRuns, 
  updateTestRun, 
  deleteTestRun,
  createShareLink,
  getShareLink,
  getSharesByTestRun,
  deleteShareLink,
  deleteTestRunsWithoutUser
};
