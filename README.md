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

| Command | Description |
|---------|------------|
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Lint codebase |
| `npm run format` | Format code with Prettier |

## Built With

- **[Next.js 15](https://nextjs.org/)** - React framework
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety
- **[Tailwind CSS](https://tailwindcss.com/)** - Styling
- **[Radix UI](https://www.radix-ui.com/)** - Accessible components


## Reporting Vulnerabilities

Please report security vulnerabilities by either:

- Emailing [security@tinfoil.sh](mailto:security@tinfoil.sh)

- Opening an issue on GitHub on this repository

We aim to respond to security reports within 24 hours and will keep you updated on our progress.
