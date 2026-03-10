# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please do **not** open a public issue.

Instead, email: **security@[your-domain]** with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

You will receive a response within 72 hours.

## Scope

- The app runs entirely locally — no data is sent to external servers
- AI models are downloaded from HuggingFace Hub over HTTPS
- The backend API listens only on `127.0.0.1:8765` (localhost only)
