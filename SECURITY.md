# Security Policy

## Supported Versions

We actively support security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability, please follow these steps:

### 1. **Do NOT** create a public GitHub issue

Security vulnerabilities should be reported privately to prevent exploitation.

### 2. Email Security Team

Please email security details to: **security@codemasklab.com** (or create a private security advisory on GitHub)

Include the following information:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

### 3. Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity (see below)

### 4. Disclosure Policy

We follow a **coordinated disclosure** approach:
- We will acknowledge receipt of your report
- We will work with you to understand and resolve the issue
- We will notify you when the vulnerability is fixed
- We will credit you in the security advisory (unless you prefer to remain anonymous)

### 5. Severity Levels

| Severity | Description | Response Time |
|----------|-------------|---------------|
| **Critical** | Remote code execution, data breach, authentication bypass | 24-48 hours |
| **High** | Significant data exposure, privilege escalation | 1 week |
| **Medium** | Information disclosure, denial of service | 2-4 weeks |
| **Low** | Minor information leakage, best practice violations | Next release |

## Security Best Practices

### For Users

1. **Keep the application updated** - Always use the latest version
2. **Review your mapping store** - The encrypted mapping store is stored locally:
   - Linux/macOS: `~/.codemask/mapping-store.encrypted`
   - Windows: `%APPDATA%\codemask\mapping-store.encrypted`
3. **Use strong namespaces** - Use unique, strong namespace names for different projects
4. **Backup your mappings** - If you need to restore mappings, keep backups of the mapping store
5. **Verify downloads** - Check SHA256 checksums when downloading releases

### For Developers

1. **Never commit secrets** - Review code before committing
2. **Use secure dependencies** - Keep dependencies updated
3. **Follow secure coding practices** - Validate inputs, sanitize outputs
4. **Review pull requests** - Security review for all PRs

## Known Security Considerations

### Local-First Architecture

CodeMask is designed as a **local-first** application:
- All processing happens on your machine
- No data is sent to external servers
- Mappings are encrypted and stored locally
- Encryption keys are stored in OS keychain

### Encryption

- **Algorithm**: AES-256-GCM
- **Key Storage**: OS keychain (libsecret on Linux, Keychain on macOS, Credential Manager on Windows)
- **Mapping Store**: Encrypted file stored locally

### Limitations

- The mapping store is only as secure as your OS keychain
- If the keychain is compromised, mappings can be decrypted
- Backups of the mapping store should be treated as sensitive data

## Security Updates

Security updates will be:
- Released as patch versions (e.g., 1.0.0 → 1.0.1)
- Documented in release notes
- Tagged with security labels on GitHub

## Credits

We appreciate responsible disclosure and will credit security researchers who help improve CodeMask's security.

## Questions?

For security-related questions, please create a private security advisory on GitHub or email the repository maintainers.

For general questions, use [GitHub Discussions](https://github.com/codemasklab/codemask/discussions).

