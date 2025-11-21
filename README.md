# CodeMask OSS - Open Source Code & Text Masker

**Open Source Version** - Python and Text modes only

A standalone desktop application that masks sensitive identifiers and text before sending content to LLMs, with reversible unmasking. This is the open-source version that supports **Python code masking** and **text masking** only.

> **Note**: The commercial version supports additional languages (JavaScript, TypeScript, Java, Go, C++, Rust, Ruby, PHP, SQL, and more). This open-source version is limited to Python and Text modes to encourage adoption while maintaining a clear distinction from the commercial offering.

## Features

- **Python Code Mode**: AST-aware masking for Python code
  - Auto-mask all identifiers
  - Select-to-mask specific variables, functions, classes
  - Style-aware token generation (preserves snake_case, PascalCase, etc.)

- **Text Mode**: Free-form text masking
  - Select-to-mask words/phrases
  - Optional detectors for emails, URLs, UUIDs, phone numbers
  - Format-preserving masking (e.g., phone numbers masked as phone numbers)

- **Security**:
  - Opaque tokens (no substring of original appears)
  - Deterministic per namespace
  - Encrypted mapping store
  - OS keychain integration (via keytar)

- **Reversibility**: Full roundtrip support - unmask masked content to restore originals

## Installation

### Option 1: Download Pre-built Executables (Recommended)

**Download the latest release (v1.0.0) for your platform:**

- **Windows**: [Download .exe installer (x64)](https://github.com/codemasklab/codemask-oss/releases/download/v1.0.0/CodeMask-1.0.0-x64.exe)
- **macOS (Apple Silicon)**: [Download .dmg (ARM64)](https://github.com/codemasklab/codemask-oss/releases/download/v1.0.0/CodeMask-1.0.0-arm64.dmg)
- **macOS (Intel)**: [Download .dmg (x64)](https://github.com/codemasklab/codemask-oss/releases/download/v1.0.0/CodeMask-1.0.0-x64.dmg)
- **Linux (Debian/Ubuntu)**: [Download .deb package](https://github.com/codemasklab/codemask-oss/releases/download/v1.0.0/CodeMask-1.0.0-amd64.deb)
- **Linux (Universal)**: [Download AppImage](https://github.com/codemasklab/codemask-oss/releases/download/v1.0.0/CodeMask-1.0.0-x86_64.AppImage)

**View all releases**: [GitHub Releases](https://github.com/codemasklab/codemask-oss/releases)

### Option 2: Build from Source

If you prefer to build from source or want to contribute:

#### Prerequisites

1. **Node.js and npm**: Install Node.js 18+ and npm
   ```bash
   # On Ubuntu/Debian
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # On macOS
   brew install node
   
   # On Windows
   # Download from https://nodejs.org/
   ```

2. **System Dependencies for keytar**:
   ```bash
   # Linux (Ubuntu/Debian)
   sudo apt-get install -y libsecret-1-dev
   
   # macOS (usually pre-installed)
   # No additional steps needed
   
   # Windows
   # No additional steps needed
   ```

3. **Build Tools** (for native module compilation):
   ```bash
   # Linux
   sudo apt-get install -y build-essential python3
   
   # macOS
   xcode-select --install
   
   # Windows
   # Install Visual Studio Build Tools
   ```

#### Build Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/codemasklab/codemask-oss.git
   cd codemask-oss
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Run the application:
   ```bash
   npm start
   ```

## Development

- **Build**: `npm run build` - Compile TypeScript
- **Dev**: `npm run dev` - Build and run Electron app
- **Watch**: `npm run watch` - Watch mode for TypeScript compilation
- **Test**: `npm test` - Run test suite

## Usage

### Python Code Mode

1. Switch to **Code** mode
2. Paste your Python code in the Input pane
3. Choose:
   - **Auto-mask**: Masks all identifiers automatically
   - **Mask Selected**: Select identifiers from the Symbols panel or highlight in text, then click "Mask Selected"
4. Copy the masked output
5. After receiving LLM response, paste it back and click **Unmask** to restore originals

### Text Mode

1. Switch to **Text** mode
2. Paste your text in the Input pane
3. Select words/phrases to mask, or use detector buttons (Email, URL, UUID, Phone)
4. Click **Mask Selected**
5. Use **Unmask** to restore after receiving LLM response

### Namespace

Change the namespace to isolate mappings. Same namespace produces the same tokens for the same identifiers.

### Wipe Mapping

**Wipe Mapping** deletes all stored mappings and the encryption key. Use with caution - unmasking will not be possible after wiping.

## Architecture

- **Electron**: Desktop shell
- **TypeScript**: Core implementation
- **Tree-sitter**: AST parsing for Python code
- **keytar**: OS keychain integration
- **Node.js crypto**: Encryption (AES-256-GCM)
- **Monaco Editor**: Code editor UI

## File Structure

```
codemask-oss/
├── app/                 # Electron app
│   ├── main.ts         # Main process
│   ├── preload.ts      # IPC bridge
│   └── ui/             # UI files
│       ├── index.html
│       ├── app.css
│       └── app.ts
├── core/               # Core logic
│   ├── mapping/        # Token generation & storage
│   ├── code/           # Code masking engine (Python only)
│   └── text/           # Text masking
├── test/               # Tests
└── dist/               # Compiled output
```

## Token Format

Tokens are generated using HMAC-SHA256 → Base32 and rendered according to original style:
- `snake_case` → `v_6g9j2r41m5qk`
- `PascalCase` → `V6g9j2r41m5qk`
- `SCREAMING_SNAKE` → `V_6G9J2R41M5QK`

Text words use format: `MASKWORD_6G9J2R41M5QK`

## Security Notes

- Mappings are encrypted with AES-256-GCM
- Encryption key stored in OS keychain (libsecret on Linux, Keychain on macOS, Credential Manager on Windows)
- All processing is local-only
- No network requests made

## Limitations (Open Source Version)

This open-source version is intentionally limited to:
- **Python** code masking only
- **Text** mode masking

For support of additional languages (JavaScript, TypeScript, Java, Go, C++, Rust, Ruby, PHP, SQL, etc.), please refer to the commercial version.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Code of Conduct

Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before participating in our community.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Troubleshooting

### keytar build fails

**Linux**: Ensure `libsecret-1-dev` is installed:
```bash
sudo apt-get install -y libsecret-1-dev
```

**macOS**: Ensure Xcode Command Line Tools are installed:
```bash
xcode-select --install
```

**Windows**: Ensure Visual Studio Build Tools are installed.

### Tree-sitter parser fails

Ensure native modules compiled correctly:
```bash
npm rebuild
```

### Mapping store location

Mappings are stored at:
- **Linux/macOS**: `~/.codemask/mapping-store.encrypted`
- **Windows**: `%APPDATA%\codemask\mapping-store.encrypted`

## Support

- **Website**: [codemasklab.com](https://codemasklab.com)
- **Issues**: [GitHub Issues](https://github.com/codemasklab/codemask-oss/issues)
- **Discussions**: [GitHub Discussions](https://github.com/codemasklab/codemask-oss/discussions)

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Uses [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) for Python parsing
- Editor powered by [Monaco Editor](https://microsoft.github.io/monaco-editor/)

