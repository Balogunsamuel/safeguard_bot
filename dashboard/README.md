# Safeguard Bot Dashboard

React + Tailwind dashboard for visualizing Safeguard Bot data.

## Features

- 📊 Real-time dashboard overview
- 💎 Tracked tokens list with filtering
- 📈 Recent transactions view
- 🔄 Auto-refresh every 30 seconds
- 🔐 API key authentication

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Configuration

Create a `.env` file:

```env
VITE_API_URL=http://localhost:3000/api
```

## Deployment

### Build

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Deploy to Vercel

```bash
npm install -g vercel
vercel
```

### Deploy to Netlify

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

## API Key

You'll be prompted to enter your API key on first visit. This is the same key configured in your main application's `ADMIN_API_KEY` environment variable.

The key is stored in localStorage for convenience.
