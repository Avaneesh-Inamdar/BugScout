const fs = require('fs');
const path = require('path');

// Local storage for development
// Replace with Firebase Storage or GCS for production
const SCREENSHOTS_DIR = path.join(__dirname, '../../screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function uploadScreenshot(filename, buffer) {
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  const dir = path.dirname(filePath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, buffer);
  
  // Return local URL for development
  return `/screenshots/${filename}`;
  
  // Production with Firebase Storage:
  // const bucket = admin.storage().bucket();
  // const file = bucket.file(`screenshots/${filename}`);
  // await file.save(buffer, { contentType: 'image/png' });
  // await file.makePublic();
  // return `https://storage.googleapis.com/${bucket.name}/screenshots/${filename}`;
}

async function getScreenshot(filename) {
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath);
  }
  return null;
}

module.exports = { uploadScreenshot, getScreenshot };
