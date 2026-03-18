# Orangutan API

Express API for serving random orangutan photos from Pexels, Pixabay, and Unsplash with an in-memory metadata cache and proxied image endpoints.

## Requirements

- Node.js 20 or newer
- npm
- A valid Pexels API key, Pixabay API key, or Unsplash access key

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env`.

3. Set at least one provider key in `.env` (`PEXELS_API_KEY`, `PIXABAY_API_KEY`, and/or `UNSPLASH_ACCESS_KEY`).

4. Start the API:

```bash
npm start
```

The service listens on `http://localhost:3000` by default.

## Environment Variables

`PEXELS_API_KEY`

- Optional (if `PIXABAY_API_KEY` is set).
- Used for all Pexels API requests.

`PIXABAY_API_KEY`

- Optional (if `PEXELS_API_KEY` is set).
- Used for all Pixabay API requests.

`UNSPLASH_ACCESS_KEY`

- Optional (if `PEXELS_API_KEY` or `PIXABAY_API_KEY` is set).
- Used for all Unsplash API requests.

At least one provider key is required. The server exits on startup if all are missing.

`PORT`

- Optional.
- Defaults to `3000`.

## Scripts

`npm start`

- Starts the production server.

`npm run dev`

- Starts the server in watch mode.

`npm run check`

- Runs a syntax check on `server.js`.

## API Routes

`GET /`

- Returns API metadata and route shortcuts.

`GET /healthz`

- Returns `{ "status": "ok" }`.

`GET /docs`

- Swagger UI for the API.

`GET /docs/openapi.json`

- Raw OpenAPI document.

`GET /docs/json`

- Compact JSON summary of cache status and key endpoints.

`GET /api/random-orangutan`

- Returns one random cached orangutan photo.

`GET /api/orangutans?count=6`

- Returns up to 24 cached orangutan photos.

`GET /api/images/:photoId`

- Returns the proxied image binary for a cached photo.

`GET /api/refresh-cache`

- Forces an immediate metadata refresh from enabled providers.

## Error Behavior

The API returns structured JSON errors:

```json
{
  "error": "Service unavailable",
  "code": "EMPTY_TREE",
  "details": "Tree is empty"
}
```

Common codes:

- `EMPTY_TREE`: the cache is temporarily empty, returned with HTTP `503`
- `IMAGE_FETCH_FAILED`: random image endpoint failed, returned with HTTP `500`
- `IMAGE_LIST_FETCH_FAILED`: list endpoint failed, returned with HTTP `500`

## Caching Notes

- The photo metadata cache is filled on startup before the server begins accepting requests.
- Refreshes run every 6 hours.
- If a refresh fetches zero matching photos, the existing cache is preserved.
- Proxied image binaries are cached separately for 24 hours.

## Developer Notes

- The API is JSON-first; image URLs point back to this service instead of directly exposing provider asset URLs.
- Swagger docs are generated in-process from the route definitions in `server.js`.
- If startup fails, check the logs first for missing credentials, provider timeouts, or upstream failures.
