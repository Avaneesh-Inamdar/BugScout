// Production Storage Service using Firebase Storage
// Rename to storageService.js for production

const admin = require('firebase-admin');

// Ensure Firebase is initialized (done in firestoreService)
const bucket = admin.storage().bucket();

async function uploadScreenshot(filename, buffer) {
  const file = bucket.file(`screenshots/${filename}`);
  
  await file.save(buffer, {
    contentType: 'image/png',
    metadata: {
      cacheControl: 'public, max-age=31536000'
    }
  });
  
  await file.makePublic();
  
  return `https://storage.googleapis.com/${bucket.name}/screenshots/${filename}`;
}

async function getScreenshot(filename) {
  const file = bucket.file(`screenshots/${filename}`);
  const [exists] = await file.exists();
  
  if (!exists) return null;
  
  const [buffer] = await file.download();
  return buffer;
}

async function deleteScreenshot(filename) {
  const file = bucket.file(`screenshots/${filename}`);
  await file.delete();
  return true;
}

module.exports = { uploadScreenshot, getScreenshot, deleteScreenshot };
