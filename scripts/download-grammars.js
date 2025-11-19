const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

const GRAMMARS_DIR = path.join(__dirname, '..', 'app', 'grammars');

// Grammar definitions - ONLY Python for open source version
const GRAMMARS = [
  { 
    name: 'tree-sitter-python.wasm',
    packages: ['@tree-sitter/python', 'tree-sitter-python'],
    wasmPaths: [
      'tree-sitter-python.wasm',
      'tree_sitter_python_binding.wasm',
      'bindings/node/tree-sitter-python.wasm'
    ]
  }
];

function findWasmInPackage(packageName, wasmPaths) {
  const nodeModulesDir = path.join(__dirname, '..', 'node_modules');
  const packageDir = path.join(nodeModulesDir, packageName);
  
  if (!fs.existsSync(packageDir)) {
    return null;
  }
  
  // Search for WASM file in package
  for (const wasmPath of wasmPaths) {
    const fullPath = path.join(packageDir, wasmPath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  
  // Search recursively in package directory
  function searchRecursive(dir, filename) {
    if (!fs.existsSync(dir)) return null;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        const found = searchRecursive(fullPath, filename);
        if (found) return found;
      } else if (file === filename || file.endsWith('.wasm')) {
        // Check if this matches our target
        if (file.includes(filename.replace('.wasm', '').replace(/-/g, '_')) || file === filename) {
          return fullPath;
        }
      }
    }
    return null;
  }
  
  // Try to find any .wasm file that matches
  const targetName = wasmPaths[0].replace('.wasm', '');
  return searchRecursive(packageDir, targetName + '.wasm');
}

function findWasmInTreeSitterWasms(grammarName) {
  const nodeModulesDir = path.join(__dirname, '..', 'node_modules');
  const wasmsPackageDir = path.join(nodeModulesDir, 'tree-sitter-wasms');
  
  if (!fs.existsSync(wasmsPackageDir)) {
    return null;
  }
  
  // Check common locations in tree-sitter-wasms
  const possiblePaths = [
    path.join(wasmsPackageDir, 'out', grammarName),
    path.join(wasmsPackageDir, 'wasms', grammarName),
    path.join(wasmsPackageDir, grammarName)
  ];
  
  for (const wasmPath of possiblePaths) {
    if (fs.existsSync(wasmPath)) {
      return wasmPath;
    }
  }
  
  // Search recursively
  function searchRecursive(dir, filename) {
    if (!fs.existsSync(dir)) return null;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        const found = searchRecursive(fullPath, filename);
        if (found) return found;
      } else if (file === filename) {
        return fullPath;
      }
    }
    return null;
  }
  
  return searchRecursive(wasmsPackageDir, grammarName);
}

// GitHub release URLs for pre-built WASM files - ONLY Python
const GITHUB_WASM_URLS = {
  'tree-sitter-python': {
    repo: 'tree-sitter/tree-sitter-python',
    wasmPath: 'tree-sitter-python.wasm'
  }
};

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(err);
    });
  });
}

async function getLatestRelease(repo) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    https.get(url, {
      headers: {
        'User-Agent': 'CodeMask-Grammar-Downloader'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          resolve(release.tag_name);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function downloadFromGitHub(grammarName) {
  const config = GITHUB_WASM_URLS[grammarName];
  if (!config) {
    return false;
  }
  
  try {
    console.log(`Fetching latest release for ${config.repo}...`);
    const tag = await getLatestRelease(config.repo);
    const url = `https://github.com/${config.repo}/releases/download/${tag}/${config.wasmPath}`;
    const destPath = path.join(GRAMMARS_DIR, config.wasmPath);
    
    console.log(`Downloading ${config.wasmPath} from GitHub...`);
    await downloadFile(url, destPath);
    console.log(`✅ Downloaded ${config.wasmPath}`);
    return true;
  } catch (error) {
    console.error(`Failed to download from GitHub: ${error.message}`);
    return false;
  }
}

async function downloadGrammar(grammar) {
  const destPath = path.join(GRAMMARS_DIR, grammar.name);
  
  // Skip if already exists
  if (fs.existsSync(destPath)) {
    console.log(`✓ ${grammar.name} already exists, skipping`);
    return true;
  }
  
  console.log(`\n📦 Processing ${grammar.name}...`);
  
  // Try to find in node_modules packages
  for (const packageName of grammar.packages) {
    const wasmPath = findWasmInPackage(packageName, grammar.wasmPaths);
    if (wasmPath) {
      console.log(`  Found in ${packageName}`);
      fs.copyFileSync(wasmPath, destPath);
      console.log(`✅ Copied ${grammar.name}`);
      return true;
    }
  }
  
  // Try tree-sitter-wasms package
  const wasmPath = findWasmInTreeSitterWasms(grammar.name);
  if (wasmPath) {
    console.log(`  Found in tree-sitter-wasms`);
    fs.copyFileSync(wasmPath, destPath);
    console.log(`✅ Copied ${grammar.name}`);
    return true;
  }
  
  // Try downloading from GitHub releases
  const grammarKey = grammar.name.replace('.wasm', '');
  if (GITHUB_WASM_URLS[grammarKey]) {
    const downloaded = await downloadFromGitHub(grammarKey);
    if (downloaded) {
      return true;
    }
  }
  
  console.warn(`⚠️  Could not find ${grammar.name}`);
  return false;
}

async function main() {
  // Ensure grammars directory exists
  if (!fs.existsSync(GRAMMARS_DIR)) {
    fs.mkdirSync(GRAMMARS_DIR, { recursive: true });
  }
  
  console.log('🚀 Downloading Tree-sitter grammars (Python only - Open Source version)...\n');
  
  let successCount = 0;
  for (const grammar of GRAMMARS) {
    const success = await downloadGrammar(grammar);
    if (success) {
      successCount++;
    }
  }
  
  console.log(`\n✅ Completed: ${successCount}/${GRAMMARS.length} grammars downloaded`);
  
  if (successCount < GRAMMARS.length) {
    console.warn('\n⚠️  Some grammars could not be downloaded.');
    console.warn('   You may need to install the tree-sitter packages manually:');
    console.warn('   npm install tree-sitter-python');
    process.exit(1);
  }
}

main().catch(console.error);

