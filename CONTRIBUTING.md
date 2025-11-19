# Contributing to CodeMask OSS

Thank you for your interest in contributing to CodeMask OSS! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [GitHub Issues](https://github.com/codemasklab/codemask/issues)
2. If not, create a new issue with:
   - A clear, descriptive title
   - Steps to reproduce the bug
   - Expected behavior
   - Actual behavior
   - Screenshots (if applicable)
   - Environment details (OS, Node.js version, etc.)

### Suggesting Features

1. Check if the feature has already been suggested
2. Create a new issue with:
   - A clear, descriptive title
   - Detailed description of the feature
   - Use cases and examples
   - Potential implementation approach (if you have ideas)

### Pull Requests

1. **Fork the repository** and create a new branch from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:
   - Follow the existing code style
   - Add tests for new features
   - Update documentation as needed
   - Keep commits focused and atomic

3. **Test your changes**:
   ```bash
   npm run build
   npm test
   npm start  # Test the application manually
   ```

4. **Commit your changes**:
   ```bash
   git commit -m "Add: description of your change"
   ```
   Use clear, descriptive commit messages.

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**:
   - Provide a clear description of your changes
   - Reference any related issues
   - Wait for review and address feedback

## Development Setup

1. **Clone your fork**:
   ```bash
   git clone https://github.com/codemasklab/codemask.git
   cd codemask-oss
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

4. **Run in development mode**:
   ```bash
   npm run dev
   ```

## Code Style

- **TypeScript**: Follow the existing code style
- **Indentation**: 2 spaces
- **Naming**: 
  - Functions/variables: `camelCase`
  - Classes: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
- **Comments**: Add comments for complex logic
- **Formatting**: Use the project's ESLint/Prettier configuration (if available)

## Project Structure

```
codemask-oss/
├── app/              # Electron application
│   ├── main.ts      # Main process
│   ├── preload.ts   # IPC bridge
│   └── ui/          # Renderer process UI
├── core/            # Core business logic
│   ├── code/        # Code masking (Python only)
│   ├── text/        # Text masking
│   └── mapping/     # Token generation & storage
├── scripts/         # Build scripts
└── test/            # Tests
```

## Important Notes

### Open Source Limitations

This is the **open-source version** that supports:
- ✅ Python code masking
- ✅ Text mode masking

**Do NOT** add support for other languages (JavaScript, TypeScript, Java, Go, etc.) in this repository. Those features are part of the commercial version.

### What You Can Contribute

- Bug fixes
- Performance improvements
- UI/UX enhancements
- Documentation improvements
- Test coverage
- Python-specific improvements
- Text masking improvements
- Security enhancements
- Accessibility improvements

### What NOT to Contribute

- Support for languages other than Python
- Features that would conflict with the commercial version
- Code that removes or bypasses the Python-only limitation

## Testing

- Write tests for new features
- Ensure all existing tests pass
- Test on multiple platforms if possible (Windows, macOS, Linux)

## Documentation

- Update README.md if you add features
- Add JSDoc comments for new functions/classes
- Update this CONTRIBUTING.md if you change contribution guidelines

## Questions?

- Open a [GitHub Discussion](https://github.com/codemasklab/codemask/discussions)
- Check existing issues and discussions

Thank you for contributing to CodeMask OSS! 🎉

