const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const fs = require('fs');
const path = require('path');

/**
 * Compare two screenshots and generate a diff image
 * Returns diff percentage and path to diff image
 */
async function compareScreenshots(img1Path, img2Path, outputPath) {
  try {
    // Read images
    const img1Buffer = await readImage(img1Path);
    const img2Buffer = await readImage(img2Path);

    const img1 = PNG.sync.read(img1Buffer);
    const img2 = PNG.sync.read(img2Buffer);

    // Ensure same dimensions (resize to smaller if needed)
    const width = Math.min(img1.width, img2.width);
    const height = Math.min(img1.height, img2.height);

    // Create diff image
    const diff = new PNG({ width, height });

    // Compare pixels
    const numDiffPixels = pixelmatch(
      cropImage(img1, width, height),
      cropImage(img2, width, height),
      diff.data,
      width,
      height,
      { 
        threshold: 0.1,  // Sensitivity (0 = exact, 1 = lenient)
        includeAA: false, // Ignore anti-aliasing differences
        alpha: 0.1        // Blend factor for unchanged pixels
      }
    );

    // Calculate diff percentage
    const totalPixels = width * height;
    const diffPercent = ((numDiffPixels / totalPixels) * 100).toFixed(2);

    // Save diff image
    const diffBuffer = PNG.sync.write(diff);
    await saveImage(outputPath, diffBuffer);

    return {
      diffPercent: parseFloat(diffPercent),
      diffPixels: numDiffPixels,
      totalPixels,
      width,
      height,
      diffImagePath: outputPath,
      hasDifferences: numDiffPixels > 0
    };
  } catch (error) {
    console.error('Visual diff error:', error);
    throw error;
  }
}

/**
 * Crop image data to specified dimensions
 */
function cropImage(img, width, height) {
  if (img.width === width && img.height === height) {
    return img.data;
  }

  const cropped = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * img.width + x) * 4;
      const dstIdx = (y * width + x) * 4;
      cropped[dstIdx] = img.data[srcIdx];
      cropped[dstIdx + 1] = img.data[srcIdx + 1];
      cropped[dstIdx + 2] = img.data[srcIdx + 2];
      cropped[dstIdx + 3] = img.data[srcIdx + 3];
    }
  }
  return cropped;
}

/**
 * Read image from local path or URL
 */
async function readImage(imagePath) {
  // If it's a URL path (starts with /screenshots), convert to local path
  if (imagePath.startsWith('/screenshots')) {
    const localPath = path.join(__dirname, '../..', imagePath);
    return fs.promises.readFile(localPath);
  }
  
  // If it's already a local path
  if (fs.existsSync(imagePath)) {
    return fs.promises.readFile(imagePath);
  }

  throw new Error(`Image not found: ${imagePath}`);
}

/**
 * Save image to local path
 */
async function saveImage(outputPath, buffer) {
  const dir = path.dirname(outputPath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(outputPath, buffer);
}

/**
 * Compare all before/after screenshots in a test run
 */
async function compareTestRun(testRun) {
  const results = [];

  for (const test of testRun.tests) {
    if (!test.screenshots || test.screenshots.length < 2) continue;

    // Find before and after screenshots
    const beforeShot = test.screenshots.find(s => s.includes('_before_'));
    const afterShot = test.screenshots.find(s => s.includes('_after_'));

    if (!beforeShot || !afterShot) continue;

    try {
      // Generate diff output path
      const diffFilename = `${testRun.id}/${test.id}_diff_${Date.now()}.png`;
      const diffOutputPath = path.join(__dirname, '../../screenshots', diffFilename);

      const comparison = await compareScreenshots(beforeShot, afterShot, diffOutputPath);

      results.push({
        testId: test.id,
        testName: test.name,
        beforeImage: beforeShot,
        afterImage: afterShot,
        diffImage: `/screenshots/${diffFilename}`,
        ...comparison,
        status: comparison.diffPercent > 5 ? 'changed' : 'unchanged'
      });
    } catch (error) {
      console.error(`Failed to compare screenshots for test ${test.id}:`, error.message);
      results.push({
        testId: test.id,
        testName: test.name,
        error: error.message,
        status: 'error'
      });
    }
  }

  return results;
}

module.exports = { compareScreenshots, compareTestRun };
