# Tinfoil Chat

A secure, verifiable AI chat interface with cryptographic verification of AI models.

## Prerequisites

- Node.js 18+
- npm
- Clerk account
- Access to Tinfoil API

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/your-org/tinfoil-chat.git
   cd tinfoil-chat
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.local
   ```

   Update `.env.local`:

   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_key
   CLERK_SECRET_KEY=your_secret
   NEXT_PUBLIC_API_BASE_URL=https://api.tinfoil.sh
   ```

3. **Run**
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run start` - Production server
- `npm run lint` - Lint code
- `npm run format` - Format code

## Tech Stack

- Next.js 15
- TypeScript
- Tailwind CSS
- Clerk (auth)
- Radix UI

## Support

Open an issue on GitHub or contact support@tinfoil.sh.
