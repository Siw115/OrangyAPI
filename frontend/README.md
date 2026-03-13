# OrangyAPI Frontend

React + Vite frontend for browsing random orangutan photos served by the OrangyAPI backend.

## Requirements

- Node.js 20 or newer
- npm
- A running OrangyAPI backend

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Optionally create a local `.env` file and set:

```env
VITE_API_URL=http://localhost:3000
```

3. Start the dev server:

```bash
npm run dev
```

Vite prints the local URL in the terminal.

## Scripts

- `npm run dev`: starts the Vite development server
- `npm run build`: builds the production bundle
- `npm run preview`: previews the production build locally
- `npm run lint`: runs ESLint

## Environment Variables

`VITE_API_URL`

- Optional.
- Points the frontend at a specific backend.
- If omitted, the app falls back to the hosted API URL in `src/App.jsx`.

## Frontend Behavior

- The app fetches a batch of orangutan photos from `/api/orangutans`.
- One image is shown immediately and the rest are kept in a small client-side queue.
- Images are preloaded before being swapped into view to reduce visible flicker.
- The Swagger Docs button links to `${VITE_API_URL}/docs`.

## Build Notes

- `vite.config.js` uses `base: "/OrangyAPI/"`.
- That base path is suitable for GitHub Pages style hosting under `/OrangyAPI/`.
- If you deploy the frontend at the domain root, update the Vite base path accordingly.

## Troubleshooting

If the frontend loads but no images appear, check:

- the backend is running
- `VITE_API_URL` points to the correct backend
- the backend has a valid `PEXELS_API_KEY`
- the backend is not returning `503` with `EMPTY_TREE`
