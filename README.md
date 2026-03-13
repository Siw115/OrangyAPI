# OrangyAPI

OrangyAPI is a small full-stack project for serving and browsing random orangutan photos.

The repository contains two apps:

- `orangutan-api/`: Express API that fetches orangutan photos from Pexels, caches metadata in memory, and exposes JSON plus Swagger docs
- `frontend/`: React + Vite frontend that consumes the API

## Repo Structure

```text
.
|-- frontend/
|-- orangutan-api/
|-- render.yaml
`-- package.json
```

## Requirements

- Node.js 20 or newer
- npm
- A Pexels API key for the backend

## Install

From the repo root:

```bash
npm install
npm --prefix frontend install
npm --prefix orangutan-api install
```

## Local Development

### Backend

From the repo root:

```bash
npm run backend
```

Or from the backend folder:

```bash
node server.js
```

Backend setup details, environment variables, and API behavior are documented in [orangutan-api/README.md](/c:/Users/siwan/Documents/OrangyAPI/orangutan-api/README.md).

### Frontend

From the repo root:

```bash
npm run frontend
```

The frontend optionally uses:

```env
VITE_API_URL=http://localhost:3000
```

If `VITE_API_URL` is not set, the frontend falls back to the hosted API URL defined in the app.

## Root Scripts

- `npm run backend`: starts the API
- `npm run frontend`: starts the Vite dev server
- `npm run frontend:build`: builds the frontend

## API Summary

Local backend base URL:

```text
http://localhost:3000
```

Main routes:

- `GET /`
- `GET /healthz`
- `GET /docs`
- `GET /docs/openapi.json`
- `GET /docs/json`
- `GET /api/random-orangutan`
- `GET /api/orangutans?count=6`
- `GET /api/images/:photoId`
- `GET /api/refresh-cache`

If the API cache is temporarily unavailable, the orangutan endpoints return HTTP `503` with a structured error such as:

```json
{
  "error": "Service unavailable",
  "code": "EMPTY_TREE",
  "details": "Tree is empty"
}
```

## Deployment

`render.yaml` defines:

- `orangyapi`: Node web service for the backend
- `orangy-frontend`: static site for the frontend

Backend deployment requires `PEXELS_API_KEY`.

## Developer Readiness Notes

- The backend now fails fast if `PEXELS_API_KEY` is missing.
- The API fills its initial cache before accepting traffic.
- A failed refresh does not replace the existing cache with an empty one.
- Backend-specific onboarding lives in [orangutan-api/README.md](/c:/Users/siwan/Documents/OrangyAPI/orangutan-api/README.md).

## License

No root license file is currently defined. The backend package currently declares `ISC`.
