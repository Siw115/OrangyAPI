# OrangyAPI

OrangyAPI is a small full-stack project for serving and browsing random orangutan photos.

It has two parts:

- `orangutan-api/`: an Express API that fetches orangutan photos from Pexels, caches them, and exposes a simple JSON API plus Swagger docs.
- `frontend/`: a React + Vite frontend that presents the images in a polished UI.

## Features

- Random orangutan photo endpoint
- Multi-image endpoint for frontend prefetching
- Cached image proxying through the API
- Swagger/OpenAPI docs available
- Animated React frontend
- Render deployment config
- GitHub Pages workflow for the frontend

## Project Structure

```text
.
|-- frontend/                # React frontend (Vite)
|-- orangutan-api/           # Express API
|-- .github/workflows/       # GitHub Actions
|-- render.yaml              # Render deployment config
`-- package.json             # Root helper scripts
```

## Requirements

- Node.js 20+ recommended
- npm
- A Pexels API key for the backend

## Environment Variables

### Backend

Create a `.env` file in `orangutan-api/`:

```env
PEXELS_API_KEY=your_pexels_api_key
PORT=3000
```

Notes:

- `PEXELS_API_KEY` is required.
- `PORT` is optional. The API defaults to `3000`.

### Frontend

The frontend can optionally use:

```env
VITE_API_URL=http://localhost:3000
```

If `VITE_API_URL` is not set, the frontend falls back to the hosted API URL.

## Installation

Install dependencies for both apps:

```bash
npm install
npm --prefix frontend install
npm --prefix orangutan-api install
```

If you only need one side, install dependencies in that folder only.

## Local Development

### Run the backend

From the repo root:

```bash
npm run backend
```

Or directly:

```bash
cd orangutan-api
npm start
```

The API runs on `http://localhost:3000` by default.

### Run the frontend

From the repo root:

```bash
npm run frontend
```

Or directly:

```bash
cd frontend
npm run dev
```

Vite will print the local dev URL in the terminal.

### Build the frontend

From the repo root:

```bash
npm run frontend:build
```

## Root Scripts

The root `package.json` contains convenience scripts:

- `npm run frontend`: starts the Vite dev server
- `npm run frontend:build`: builds the frontend
- `npm run backend`: starts the API server

## API Overview

Base URL in local development:

```text
http://localhost:3000
```

### Endpoints

- `GET /`: basic API metadata and route listing
- `GET /healthz`: health check endpoint
- `GET /docs`: Swagger UI
- `GET /docs/json`: simplified docs summary
- `GET /docs/openapi.json`: raw OpenAPI schema
- `GET /api/random-orangutan`: one random orangutan image
- `GET /api/orangutans?count=6`: multiple random orangutan images
- `GET /api/images/:photoId`: cached proxied image
- `GET /api/images/:photoId?variant=large`: large image variant
- `GET /api/images/:photoId?variant=thumbnail`: thumbnail variant
- `GET /api/refresh-cache`: refreshes the in-memory cache

### Example Response

`GET /api/random-orangutan`

```json
{
  "id": 1996333,
  "animal": "orangutan",
  "source": "Pexels",
  "title": "Orangutan in the jungle",
  "image": "http://localhost:3000/api/images/1996333",
  "imageLarge": "http://localhost:3000/api/images/1996333?variant=large",
  "thumbnail": "http://localhost:3000/api/images/1996333?variant=thumbnail",
  "photographer": "Jane Doe",
  "photographerUrl": "https://www.pexels.com/@example",
  "pexelsUrl": "https://www.pexels.com/photo/example",
  "avgColor": "#5A4A32"
}
```

## How the Backend Works

- The API searches Pexels using several orangutan-related terms.
- Matching results are normalized into a consistent shape.
- Results are stored in an in-memory cache.
- The cache is refreshed at startup and then every 6 hours.
- Image binaries are also cached by photo ID and variant to reduce repeat fetches.

Important implementation details:

- API responses for random image selection use `Cache-Control: no-store`.
- Proxied image responses use a long-lived cache header:
  `public, max-age=86400, stale-while-revalidate=604800`
- If the initial cache fill fails, the server still starts and retries on refresh.

## Frontend Notes

- Built with React and Vite
- Uses `framer-motion` for page and image animations
- Targets the API via `VITE_API_URL`
- Vite base path is configured as `/OrangyAPI/` for GitHub Pages builds

## Design Credits

- Author image created with `https://humation.app/avatar`
- Color palette inspired by `https://www.happyhues.co/`

## Deployment

### Render

`render.yaml` defines two services:

- `orangyapi`: Node web service for the backend
- `orangy-frontend`: static site for the frontend

The frontend Render service gets `VITE_API_URL` from the backend service hostname.

Backend Render requirements:

- Set `PEXELS_API_KEY` in Render

### GitHub Pages

The workflow at `.github/workflows/deploy-frontend-pages.yml`:

- installs frontend dependencies
- builds the frontend
- deploys `frontend/dist` to GitHub Pages

It uses `VITE_API_URL` from a GitHub Actions variable or secret if configured.

## Troubleshooting

### The frontend loads but images do not appear

Check:

- the backend is running
- `PEXELS_API_KEY` is valid
- `VITE_API_URL` points to the correct backend

### The API returns a cache error

The in-memory cache may be empty because Pexels fetches failed. Check backend logs for:

- missing API key
- request timeout
- upstream API errors

### Swagger docs

Swagger UI is available at:

```text
/docs
```

Raw OpenAPI JSON is available at:

```text
/docs/openapi.json
```

## License

No license is currently defined in the root project. The backend package currently uses `ISC`.
