const fs = require('fs');
const path = require('path');

// Local storage for screenshots
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
  return `/screenshots/${filename}`;
}

async function getScreenshot(filename) {
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath);
  }
  return null;
}

async function deleteScreenshot(filename) {
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return true;
}

module.exports = { uploadScreenshot, getScreenshot, deleteScreenshot };
