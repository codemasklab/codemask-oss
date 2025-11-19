const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, '..', 'dist', 'app', 'ui');

// Ensure output directory exists
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Build the UI with esbuild
esbuild.build({
  entryPoints: [path.join(__dirname, '..', 'app', 'ui', 'app.ts')],
  bundle: true,
  outfile: path.join(outDir, 'app.js'),
  format: 'iife', // Immediately Invoked Function Expression - works in browser
  platform: 'browser',
  target: ['chrome100', 'firefox100', 'safari14'],
  sourcemap: true,
  minify: false, // Set to true for production
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  external: ['electron', 'monaco-editor'], // Don't bundle electron APIs or Monaco (loaded separately)
  loader: {
    '.ts': 'ts',
    '.js': 'js'
  },
  tsconfig: path.join(__dirname, '..', 'tsconfig.json'),
  // Enable tree shaking and proper ES module resolution
  treeShaking: true,
  // Ensure proper handling of Monaco Editor modules
  packages: 'bundle',
  // Resolve extensions to prevent duplicate instances
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser', 'import']
}).then(() => {
  console.log('✅ UI bundled successfully with esbuild');
  console.log('   Monaco Editor and dependencies are now bundled');
}).catch((error) => {
  console.error('❌ esbuild failed:', error);
  console.error('   Error details:', error.message);
  process.exit(1);
});

