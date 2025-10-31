# Tinfoil Chat

**Live at:** [chat.tinfoil.sh](https://chat.tinfoil.sh)

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Setup

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

## Scripts

| Command          | Description               |
| ---------------- | ------------------------- |
| `npm run dev`    | Start development server  |
| `npm run build`  | Create production build   |
| `npm run start`  | Start production server   |
| `npm run lint`   | Lint codebase             |
| `npm run format` | Format code with Prettier |

## Built With

- **[Next.js 15](https://nextjs.org/)** - React framework
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety
- **[Tailwind CSS](https://tailwindcss.com/)** - Styling
- **[Radix UI](https://www.radix-ui.com/)** - Accessible components

## Security Architecture

Tinfoil Chat ensures your messages reach a verified Trusted Execution Environment (TEE) through a multi-layered security approach:

### Browser-to-TEE Communication

Since browsers cannot perform TLS certificate pinning or inspect certificate chains, we use **EHBP (Encrypted HTTP Body Protocol)** with **HPKE encryption** (RFC 9180):

1. **Attestation Verification**: Before sending any data, the client verifies the remote enclave using WebAssembly-based attestation
2. **Key Binding**: The verifier returns the enclave's expected HPKE public key after successful attestation
3. **End-to-End Encryption**: Messages are encrypted directly to the verified enclave's public key before transmission
4. **Hardware Validation**: The enclave runs in a secure TEE with cryptographically verified code integrity

This approach provides security guarantees equivalent to TLS pinning while working within browser constraints. Only the attested enclave possessing the corresponding private key can decrypt your messages.

### Verification Steps

The chat interface shows real-time verification status for:

- **Hardware Attestation**: Confirms the model runs in a genuine secure enclave
- **Code Integrity**: Verifies the enclave is running unmodified, audited code
- **Chat Security**: Validates measurements match expected values

Learn more about the security model:

- [Tinfoil Node SDK Documentation](https://docs.tinfoil.sh/sdk/node-sdk)
- [EHBP Protocol Details](https://docs.tinfoil.sh/resources/ehbp)

## Reporting Vulnerabilities

Please report security vulnerabilities by either:

- Emailing [security@tinfoil.sh](mailto:security@tinfoil.sh)

- Opening an issue on GitHub on this repository

We aim to respond to security reports within 24 hours and will keep you updated on our progress.
