# Tinfoil Chat

**Live at:** [chat.tinfoil.sh](https://chat.tinfoil.sh)

## Quick Start

1. **Clone and install**

   ```bash
   git clone https://github.com/tinfoilsh/tinfoil-chat.git
   cd tinfoil-chat
   npm install
   ```

2. **Environment setup**

   ```bash
   cp .env.example .env.local
   ```

   Configure your `.env.local` with the required keys:

   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_key
   CLERK_SECRET_KEY=your_clerk_secret
   NEXT_PUBLIC_API_BASE_URL=https://api.tinfoil.sh
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

## Built With

- **[Next.js 15](https://nextjs.org/)** - React framework
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety
- **[Tailwind CSS](https://tailwindcss.com/)** - Styling
- **[Radix UI](https://www.radix-ui.com/)** - Accessible components

## Security Architecture

Tinfoil Chat is designed to ensure that only the AI model inside a verified secure enclave can read your messages - not Tinfoil, not cloud providers, not network intermediaries.

### How it works

We use [EHBP (Encrypted HTTP Body Protocol)](https://docs.tinfoil.sh/resources/ehbp) with [HPKE encryption (RFC 9180)](https://www.rfc-editor.org/rfc/rfc9180.html) to secure messages in transit to the enclave. All data from the chat application running in the browser is encrypted with the HPKE key that is generated and lives only inside the secure enclave.

Before sending any message:

1. **Attestation Verification**: Your browser cryptographically verifies that the remote server is a genuine secure enclave running unmodified code via the [Wasm verifier](https://github.com/tinfoilsh/verifier).
2. **Key Exchange**: The verified enclave provides its HPKE public key
3. **End-to-End Encryption**: Messages are encrypted directly to the verified enclave's public key before transmission

This guarantees that only the attested enclave possessing the corresponding private key can decrypt your messages.

### Encrypted Chat Storage

Your saved chats are encrypted on your device using AES-GCM-256 encryption, with a key only you control. If you lose this key, your chat history cannot be recovered.

Learn more: [Private Chat Backups](https://tinfoil.sh/blog/2025-09-24-private-chat-backups-local-first)

### Verification Steps

The chat interface shows real-time verification status for:

- **Hardware Attestation**: Confirms genuine AMD SEV-SNP or Intel TDX enclave and genuine NVIDIA Hopper/Blackwell GPU
- **Code Integrity**: Verifies enclave runs the exact, unmodified code version matching the pinned code on Sigstore
- **Chat Security**: Validates measurements fetched from Sigstore match measurements fetched from enclave

Learn more about the security model:

- [Tinfoil JavaScript SDK Documentation](https://docs.tinfoil.sh/sdk/javascript-sdk)
- [EHBP Protocol Details](https://docs.tinfoil.sh/resources/ehbp)

## Reporting Vulnerabilities

Please report security vulnerabilities by either:

- Emailing [security@tinfoil.sh](mailto:security@tinfoil.sh)

- Opening an issue on GitHub on this repository

We aim to respond to security reports within 24 hours and will keep you updated on our progress.
