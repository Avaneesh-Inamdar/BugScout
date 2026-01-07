const admin = require('firebase-admin');

// Get the storage bucket (Firebase Admin should be initialized in firestoreService.js)
let bucket;
let useFirebaseStorage = false;

try {
  // Use default bucket from project
  bucket = admin.storage().bucket('gdg-hackathon-6fc99.firebasestorage.app');
  useFirebaseStorage = true;
  console.log('Connected to Firebase Storage');
} catch (e) {
  console.warn('Firebase Storage not available, using local fallback:', e.message);
}

// Local fallback
const fs = require('fs');
const path = require('path');
const SCREENSHOTS_DIR = path.join(__dirname, '../../screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function uploadScreenshot(filename, buffer) {
  if (useFirebaseStorage && bucket) {
    try {
      const file = bucket.file(`screenshots/${filename}`);
      
      await file.save(buffer, {
        contentType: 'image/png',
        metadata: {
          cacheControl: 'public, max-age=31536000'
        }
      });
      
      await file.makePublic();
      
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/screenshots/${filename}`;
      console.log('Screenshot uploaded to Firebase Storage:', publicUrl);
      return publicUrl;
    } catch (e) {
      console.warn('Firebase Storage upload failed, using local:', e.message);
    }
  }
  
  // Local fallback
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  const dir = path.dirname(filePath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, buffer);
  return `/screenshots/${filename}`;
}

async function getScreenshot(filename) {
  if (useFirebaseStorage && bucket) {
    try {
      const file = bucket.file(`screenshots/${filename}`);
      const [exists] = await file.exists();
      
      if (!exists) return null;
      
      const [buffer] = await file.download();
      return buffer;
    } catch (e) {
      console.warn('Firebase Storage download failed, trying local:', e.message);
    }
  }
  
  // Local fallback
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath);
  }
  return null;
}

async function deleteScreenshot(filename) {
  if (useFirebaseStorage && bucket) {
    try {
      const file = bucket.file(`screenshots/${filename}`);
      await file.delete();
      return true;
    } catch (e) {
      console.warn('Firebase Storage delete failed:', e.message);
    }
  }
  
  // Local fallback
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return true;
}

module.exports = { uploadScreenshot, getScreenshot, deleteScreenshot };
