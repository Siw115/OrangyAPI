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
    description: "Random orangutan image API powered by Pexels, with cached image proxying and a simple JSON-first interface.",
    contact: {
      name: "OrangyAPI Maintainer",
      url: "https://github.com/Siw115/OrangyAPI"
    },
    license: {
      name: "ISC",
      url: "https://opensource.org/licenses/ISC"
    }
  },
  servers: [
    {
      url: process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`
    }
  ],
  externalDocs: {
    description: "Project repository",
    url: "https://github.com/Siw115/OrangyAPI"
  },
  tags: [
    { name: "General" },
    { name: "Orangutans" },
    { name: "Images" }
  ],
  components: {
    schemas: {
      Photo: {
        type: "object",
        description: "Normalized orangutan photo metadata returned by the API.",
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
        },
        required: ["id", "animal", "source", "title", "image", "imageLarge", "thumbnail"]
      },
      ApiInfo: {
        type: "object",
        description: "Top-level API metadata returned from the root endpoint.",
        properties: {
          name: { type: "string", example: "OrangyAPI" },
          message: { type: "string", example: "Welcome to OrangyAPI" },
          endpoints: {
            type: "object",
            properties: {
              docs: { type: "string", example: "/docs" },
              openApiJson: { type: "string", example: "/docs/openapi.json" },
              docsJson: { type: "string", example: "/docs/json" },
              random: { type: "string", example: "/api/random-orangutan" },
              many: { type: "string", example: "/api/orangutans?count=12" },
              refresh: { type: "string", example: "/api/refresh-cache" }
            }
          }
        }
      },
      HealthResponse: {
        type: "object",
        description: "Simple health check response.",
        properties: {
          status: { type: "string", example: "ok" }
        }
      },
      DocsSummary: {
        type: "object",
        description: "Compact JSON summary of cache state and key routes.",
        properties: {
          name: { type: "string", example: "OrangyAPI" },
          source: { type: "string", example: "Pexels" },
          cacheSize: { type: "integer", example: 120 },
          lastUpdated: { type: "string", format: "date-time", nullable: true },
          endpoints: {
            type: "object",
            additionalProperties: { type: "string" }
          }
        }
      },
      PhotoListResponse: {
        type: "object",
        description: "Collection of random orangutan photos.",
        properties: {
          count: { type: "integer", example: 6 },
          images: {
            type: "array",
            items: { $ref: "#/components/schemas/Photo" }
          }
        }
      },
      RefreshResponse: {
        type: "object",
        description: "Response returned after a manual cache refresh.",
        properties: {
          message: { type: "string", example: "Cache refreshed" },
          cacheSize: { type: "integer", example: 120 },
          lastUpdated: { type: "string", format: "date-time" }
        }
      },
      ErrorResponse: {
        type: "object",
        description: "Standard error payload returned by the API.",
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
        description: "Returns the service name and a quick route index for the main public endpoints.",
        responses: {
          200: {
            description: "API metadata and routes",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiInfo" },
                examples: {
                  default: {
                    summary: "Root API response",
                    value: {
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
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/healthz": {
      get: {
        tags: ["General"],
        summary: "Health check",
        description: "Lightweight endpoint for uptime checks and deployment health probes.",
        responses: {
          200: {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                examples: {
                  default: {
                    value: { status: "ok" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/docs/json": {
      get: {
        tags: ["General"],
        summary: "Simple docs summary",
        description: "Returns a compact JSON summary of the API, current cache size, and when the cache was last updated.",
        responses: {
          200: {
            description: "Basic API docs and cache info",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DocsSummary" },
                examples: {
                  default: {
                    value: {
                      name: "OrangyAPI",
                      source: "Pexels",
                      cacheSize: 120,
                      lastUpdated: "2026-03-11T12:34:56.000Z",
                      endpoints: {
                        "/api/random-orangutan": "Get one random orangutan photo",
                        "/api/orangutans?count=12": "Get multiple random orangutan photos",
                        "/api/refresh-cache": "Refresh the photo cache manually"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/docs/openapi.json": {
      get: {
        tags: ["General"],
        summary: "Raw OpenAPI schema",
        description: "Returns the OpenAPI document used to power the Swagger UI.",
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
        description: "Returns one random photo from the in-memory orangutan cache. The image URLs point back to this API's proxied image endpoints.",
        responses: {
          200: {
            description: "Random orangutan image object",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Photo" },
                examples: {
                  default: {
                    value: {
                      id: 1996333,
                      animal: "orangutan",
                      source: "Pexels",
                      title: "Orangutan in the jungle",
                      image: "http://localhost:3000/api/images/1996333",
                      imageLarge: "http://localhost:3000/api/images/1996333?variant=large",
                      thumbnail: "http://localhost:3000/api/images/1996333?variant=thumbnail",
                      photographer: "Jane Doe",
                      photographerUrl: "https://www.pexels.com/@example",
                      pexelsUrl: "https://www.pexels.com/photo/example",
                      avgColor: "#5A4A32"
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
    "/api/orangutans": {
      get: {
        tags: ["Orangutans"],
        summary: "Get multiple random orangutan photos",
        description: "Returns up to 24 shuffled orangutan photos from the current cache. Useful for prefetching or gallery-style clients.",
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
                schema: { $ref: "#/components/schemas/PhotoListResponse" },
                examples: {
                  default: {
                    value: {
                      count: 2,
                      images: [
                        {
                          id: 1996333,
                          animal: "orangutan",
                          source: "Pexels",
                          title: "Orangutan in the jungle",
                          image: "http://localhost:3000/api/images/1996333",
                          imageLarge: "http://localhost:3000/api/images/1996333?variant=large",
                          thumbnail: "http://localhost:3000/api/images/1996333?variant=thumbnail",
                          photographer: "Jane Doe",
                          photographerUrl: "https://www.pexels.com/@example",
                          pexelsUrl: "https://www.pexels.com/photo/example",
                          avgColor: "#5A4A32"
                        },
                        {
                          id: 2889499,
                          animal: "orangutan",
                          source: "Pexels",
                          title: "Baby orangutan portrait",
                          image: "http://localhost:3000/api/images/2889499",
                          imageLarge: "http://localhost:3000/api/images/2889499?variant=large",
                          thumbnail: "http://localhost:3000/api/images/2889499?variant=thumbnail",
                          photographer: "John Doe",
                          photographerUrl: "https://www.pexels.com/@john",
                          pexelsUrl: "https://www.pexels.com/photo/example-2",
                          avgColor: "#7A5F40"
                        }
                      ]
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
    "/api/images/{photoId}": {
      get: {
        tags: ["Images"],
        summary: "Get a cached image asset by photo ID",
        description: "Returns the proxied image binary for the requested cached orangutan photo.",
        parameters: [
          {
            name: "photoId",
            in: "path",
            required: true,
            description: "Photo ID returned by one of the orangutan endpoints",
            schema: {
              type: "integer",
              example: 1996333
            }
          },
          {
            name: "variant",
            in: "query",
            required: false,
            description: "Select the returned image size variant. Omit for the default image.",
            schema: {
              type: "string",
              enum: ["large", "thumbnail"]
            }
          }
        ],
        responses: {
          200: {
            description: "Image binary response",
            content: {
              "image/jpeg": {
                schema: {
                  type: "string",
                  format: "binary"
                }
              },
              "image/png": {
                schema: {
                  type: "string",
                  format: "binary"
                }
              },
              "image/webp": {
                schema: {
                  type: "string",
                  format: "binary"
                }
              }
            }
          },
          404: {
            description: "Image not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          502: {
            description: "Upstream image fetch failed",
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
        description: "Forces the backend to refill its in-memory orangutan cache immediately.",
        responses: {
          200: {
            description: "Cache refreshed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RefreshResponse" },
                examples: {
                  default: {
                    value: {
                      message: "Cache refreshed",
                      cacheSize: 120,
                      lastUpdated: "2026-03-11T12:34:56.000Z"
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
