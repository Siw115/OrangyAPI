require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const IMAGE_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

app.set("trust proxy", true);
app.use(cors());

const pexels = axios.create({
  baseURL: "https://api.pexels.com/v1",
  headers: {
    Authorization: process.env.PEXELS_API_KEY
  },
  timeout: 10000
});

let orangutanCache = [];
let lastUpdated = null;
const imageBinaryCache = new Map();
const pendingImageFetches = new Map();

const SEARCH_TERMS = [
  "orangutan",
  "baby orangutan",
  "bornean orangutan",
  "sumatran orangutan",
  "orangutan jungle"
];

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "OrangyAPI",
    version: "1.0.0",
    description: "Random orangutan image API powered by Pexels"
  },
  servers: [
    {
      url: process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`
    }
  ],
  tags: [
    { name: "General" },
    { name: "Orangutans" }
  ],
  components: {
    schemas: {
      Photo: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1996333 },
          animal: { type: "string", example: "orangutan" },
          source: { type: "string", example: "Pexels" },
          title: { type: "string", example: "Orangutan in the jungle" },
          image: { type: "string", format: "uri" },
          imageLarge: { type: "string", format: "uri" },
          thumbnail: { type: "string", format: "uri" },
          photographer: { type: "string", example: "Jane Doe" },
          photographerUrl: { type: "string", format: "uri" },
          pexelsUrl: { type: "string", format: "uri" },
          avgColor: { type: "string", example: "#5A4A32" }
        }
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "string" }
        }
      }
    }
  },
  paths: {
    "/": {
      get: {
        tags: ["General"],
        summary: "API information",
        responses: {
          200: {
            description: "API metadata and routes"
          }
        }
      }
    },
    "/docs/json": {
      get: {
        tags: ["General"],
        summary: "Simple docs summary",
        responses: {
          200: {
            description: "Basic API docs and cache info"
          }
        }
      }
    },
    "/docs/openapi.json": {
      get: {
        tags: ["General"],
        summary: "Raw OpenAPI schema",
        responses: {
          200: {
            description: "OpenAPI document"
          }
        }
      }
    },
    "/api/random-orangutan": {
      get: {
        tags: ["Orangutans"],
        summary: "Get one random orangutan photo",
        responses: {
          200: {
            description: "Random orangutan image object",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Photo" }
              }
            }
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/orangutans": {
      get: {
        tags: ["Orangutans"],
        summary: "Get multiple random orangutan photos",
        parameters: [
          {
            name: "count",
            in: "query",
            description: "Number of images to return (max 24)",
            schema: {
              type: "integer",
              default: 6,
              minimum: 1,
              maximum: 24
            }
          }
        ],
        responses: {
          200: {
            description: "Random orangutan image collection",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    count: { type: "integer" },
                    images: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Photo" }
                    }
                  }
                }
              }
            }
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/refresh-cache": {
      get: {
        tags: ["Orangutans"],
        summary: "Refresh cached Pexels results",
        responses: {
          200: {
            description: "Cache refreshed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Cache refreshed" },
                    cacheSize: { type: "integer", example: 120 },
                    lastUpdated: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    }
  }
};

const swaggerSpec = swaggerJsdoc({
  definition: swaggerDefinition,
  apis: []
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/docs/openapi.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

async function searchPexels(query, page = 1, perPage = 80) {
  const response = await pexels.get("/search", {
    params: {
      query,
      page,
      per_page: perPage
    }
  });

  return response.data.photos || [];
}

function normalizePhoto(photo) {
  return {
    id: photo.id,
    animal: "orangutan",
    source: "Pexels",
    title: photo.alt || "Orangutan",
    image: photo.src.large || photo.src.medium || photo.src.small,
    imageLarge: photo.src.large2x || photo.src.large || photo.src.medium,
    thumbnail: photo.src.medium || photo.src.small || photo.src.tiny,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    pexelsUrl: photo.url,
    avgColor: photo.avg_color,
    imageSource: photo.src.large || photo.src.medium || photo.src.small,
    imageLargeSource: photo.src.large2x || photo.src.large || photo.src.medium,
    thumbnailSource: photo.src.medium || photo.src.small || photo.src.tiny
  };
}

function getBaseUrl(req) {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
}

function toPublicPhoto(photo, req) {
  const baseUrl = getBaseUrl(req);

  return {
    id: photo.id,
    animal: photo.animal,
    source: photo.source,
    title: photo.title,
    image: `${baseUrl}/api/images/${photo.id}`,
    imageLarge: `${baseUrl}/api/images/${photo.id}?variant=large`,
    thumbnail: `${baseUrl}/api/images/${photo.id}?variant=thumbnail`,
    photographer: photo.photographer,
    photographerUrl: photo.photographerUrl,
    pexelsUrl: photo.pexelsUrl,
    avgColor: photo.avgColor
  };
}

function looksLikeOrangutan(photo) {
  const text = `${photo.alt || ""} ${photo.url || ""}`.toLowerCase();

  return (
    text.includes("orangutan") ||
    text.includes("bornean") ||
    text.includes("sumatran")
  );
}

async function fillCache() {
  const collected = [];
  const seenIds = new Set();

  for (const term of SEARCH_TERMS) {
    for (let page = 1; page <= 3; page++) {
      const photos = await searchPexels(term, page, 80);

      for (const photo of photos) {
        if (!seenIds.has(photo.id) && looksLikeOrangutan(photo)) {
          seenIds.add(photo.id);
          collected.push(normalizePhoto(photo));
        }
      }
    }
  }

  if (collected.length < 20) {
    for (const term of SEARCH_TERMS) {
      const photos = await searchPexels(term, 1, 80);

      for (const photo of photos) {
        if (!seenIds.has(photo.id)) {
          seenIds.add(photo.id);
          collected.push(normalizePhoto(photo));
        }
      }
    }
  }

  orangutanCache = collected;
  lastUpdated = new Date().toISOString();
  const validIds = new Set(collected.map((photo) => String(photo.id)));

  for (const cacheKey of imageBinaryCache.keys()) {
    const [photoId] = cacheKey.split(":");
    if (!validIds.has(photoId)) {
      imageBinaryCache.delete(cacheKey);
    }
  }

  console.log(`Cached ${orangutanCache.length} orangutan photos`);
}

async function refreshCacheSafe(context = "scheduled refresh") {
  try {
    await fillCache();
  } catch (error) {
    console.error(`${context} failed:`, error.message);
  }
}

function getRandomFromCache() {
  if (!orangutanCache.length) {
    throw new Error("Cache is empty");
  }

  const randomIndex = Math.floor(Math.random() * orangutanCache.length);
  return orangutanCache[randomIndex];
}

function getPhotoById(photoId) {
  return orangutanCache.find((photo) => String(photo.id) === String(photoId));
}

function getVariantSource(photo, variant) {
  if (variant === "large") {
    return photo.imageLargeSource || photo.imageSource;
  }

  if (variant === "thumbnail") {
    return photo.thumbnailSource || photo.imageSource;
  }

  return photo.imageSource;
}

async function getCachedImageAsset(photo, variant) {
  const cacheKey = `${photo.id}:${variant}`;
  const existing = imageBinaryCache.get(cacheKey);

  if (existing && existing.expiresAt > Date.now()) {
    return existing;
  }

  const pending = pendingImageFetches.get(cacheKey);
  if (pending) {
    return pending;
  }

  const sourceUrl = getVariantSource(photo, variant);

  if (!sourceUrl) {
    throw new Error("Image source is missing");
  }

  const request = axios.get(sourceUrl, {
    responseType: "arraybuffer",
    timeout: 15000
  }).then((response) => {
    const asset = {
      buffer: Buffer.from(response.data),
      contentType: response.headers["content-type"] || "image/jpeg",
      expiresAt: Date.now() + IMAGE_CACHE_TTL_MS
    };

    imageBinaryCache.set(cacheKey, asset);
    return asset;
  }).finally(() => {
    pendingImageFetches.delete(cacheKey);
  });

  pendingImageFetches.set(cacheKey, request);
  return request;
}

app.get("/", (req, res) => {
  res.json({
    name: "OrangyAPI",
    message: "Welcome to OrangyAPI",
    endpoints: {
      docs: "/docs",
      openApiJson: "/docs/openapi.json",
      docsJson: "/docs/json",
      random: "/api/random-orangutan",
      many: "/api/orangutans?count=12",
      refresh: "/api/refresh-cache"
    }
  });
});

app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/docs/json", (req, res) => {
  res.json({
    name: "OrangyAPI",
    source: "Pexels",
    cacheSize: orangutanCache.length,
    lastUpdated,
    endpoints: {
      "/api/random-orangutan": "Get one random orangutan photo",
      "/api/orangutans?count=12": "Get multiple random orangutan photos",
      "/api/refresh-cache": "Refresh the photo cache manually"
    }
  });
});

app.get("/api/random-orangutan", (req, res) => {
  try {
    const photo = getRandomFromCache();
    res.setHeader("Cache-Control", "no-store");
    res.json(toPublicPhoto(photo, req));
  } catch (error) {
    res.status(500).json({
      error: "Failed to get orangutan image",
      details: error.message
    });
  }
});

app.get("/api/orangutans", (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count, 10) || 6, 24);

    if (!orangutanCache.length) {
      throw new Error("Cache is empty");
    }

    const shuffled = [...orangutanCache].sort(() => Math.random() - 0.5);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      count,
      images: shuffled.slice(0, count).map((photo) => toPublicPhoto(photo, req))
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get orangutan images",
      details: error.message
    });
  }
});

app.get("/api/images/:photoId", async (req, res) => {
  try {
    const photo = getPhotoById(req.params.photoId);

    if (!photo) {
      return res.status(404).json({ error: "Image not found" });
    }

    const variant = req.query.variant === "large" || req.query.variant === "thumbnail"
      ? req.query.variant
      : "default";
    const asset = await getCachedImageAsset(photo, variant);

    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Cache-Control", IMAGE_CACHE_CONTROL);
    res.send(asset.buffer);
  } catch (error) {
    res.status(502).json({
      error: "Failed to load image",
      details: error.message
    });
  }
});

app.get("/api/refresh-cache", async (req, res) => {
  try {
    await fillCache();
    res.json({
      message: "Cache refreshed",
      cacheSize: orangutanCache.length,
      lastUpdated
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to refresh cache",
      details: error.message
    });
  }
});

async function startServer() {
  app.listen(PORT, () => {
    console.log(`OrangyAPI running at http://localhost:${PORT}`);
  });

  await refreshCacheSafe("Initial cache fill");

  setInterval(() => {
    refreshCacheSafe("Cache refresh");
  }, 6 * 60 * 60 * 1000);
}

startServer();
