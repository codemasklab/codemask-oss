const fs = require('fs');
const path = require('path');

// Copy UI files and grammars to dist
const sourceDir = path.join(__dirname, '..', 'app');
const destDir = path.join(__dirname, '..', 'dist', 'app');

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Copy UI files
const uiSourceDir = path.join(sourceDir, 'ui');
const uiDestDir = path.join(destDir, 'ui');

if (!fs.existsSync(uiDestDir)) {
  fs.mkdirSync(uiDestDir, { recursive: true });
}

const filesToCopy = ['index.html', 'app.css'];
const imageExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'];

filesToCopy.forEach(file => {
  const sourcePath = path.join(uiSourceDir, file);
  const destPath = path.join(uiDestDir, file);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied ${file} to dist/app/ui/`);
  } else {
    console.warn(`Warning: ${file} not found at ${sourcePath}`);
  }
});

// Copy logo and other image files
if (fs.existsSync(uiSourceDir)) {
  const uiFiles = fs.readdirSync(uiSourceDir);
  uiFiles.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    if (imageExtensions.includes(ext)) {
      const sourcePath = path.join(uiSourceDir, file);
      const destPath = path.join(uiDestDir, file);
      if (fs.statSync(sourcePath).isFile()) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied ${file} to dist/app/ui/`);
      }
    }
  });
}

// Copy grammars folder
const grammarsSourceDir = path.join(sourceDir, 'grammars');
const grammarsDestDir = path.join(destDir, 'grammars');

if (fs.existsSync(grammarsSourceDir)) {
  if (!fs.existsSync(grammarsDestDir)) {
    fs.mkdirSync(grammarsDestDir, { recursive: true });
  }
  
  const grammarFiles = fs.readdirSync(grammarsSourceDir);
  grammarFiles.forEach(file => {
    const sourcePath = path.join(grammarsSourceDir, file);
    const destPath = path.join(grammarsDestDir, file);
    
    if (fs.statSync(sourcePath).isFile() && file.endsWith('.wasm')) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied ${file} to dist/app/grammars/`);
    }
  });
} else {
  console.warn(`Warning: grammars directory not found at ${grammarsSourceDir}`);
}

// Copy Monaco Editor assets to dist
const monacoSourceDir = path.join(__dirname, '..', 'node_modules', 'monaco-editor');
const monacoDestDir = path.join(__dirname, '..', 'dist', 'app', 'ui', 'monaco');

if (fs.existsSync(monacoSourceDir)) {
  // Copy Monaco's min directory (contains editor files)
  const monacoMinDir = path.join(monacoSourceDir, 'min');
  if (fs.existsSync(monacoMinDir)) {
    // Copy all files from min directory
    function copyDir(src, dest) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
    
    copyDir(monacoMinDir, path.join(monacoDestDir, 'min'));
    console.log('Copied Monaco Editor assets to dist/app/ui/monaco/');
  }
}

console.log('Assets copied successfully!');
