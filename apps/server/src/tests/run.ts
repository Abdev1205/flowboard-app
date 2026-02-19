
import fs from 'fs';
import path from 'path';

// Recursively find and require test files
function runTests(dir: string) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      runTests(fullPath);
    } else if (file.endsWith('.test.ts')) {
      // Ensure we don't import ourselves if named similarly (though unlikely)
      require(fullPath);
    }
  }
}

runTests(__dirname);
