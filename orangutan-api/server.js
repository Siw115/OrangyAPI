require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const http = require("http");
const https = require("https");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const IMAGE_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const PREWARM_IMAGE_COUNT = 12;
const PREWARM_CONCURRENCY = 3;
const WARMUP_RETRY_DELAY_MS = 30000;

app.set("trust proxy", true);
app.use(cors());

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const pexels = axios.create({
  baseURL: "https://api.pexels.com/v1",
  headers: {
    Authorization: process.env.PEXELS_API_KEY
  },
  timeout: 10000,
  proxy: false,
  httpAgent,
  httpsAgent
});

const pixabay = axios.create({
  baseURL: "https://pixabay.com/api",
  timeout: 10000,
  proxy: false,
  httpAgent,
  httpsAgent
});

const unsplash = axios.create({
  baseURL: "https://api.unsplash.com",
  headers: {
    Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY || ""}`
  },
  timeout: 10000,
  proxy: false,
  httpAgent,
  httpsAgent
});

const imageFetchClient = axios.create({
  timeout: 15000,
  proxy: false,
  httpAgent,
  httpsAgent
});

let orangutanCache = [];
let lastUpdated = null;
const imageBinaryCache = new Map();
const pendingImageFetches = new Map();
let cacheWarmupInProgress = false;
let startupWarmupError = null;
const bootTimestamp = Date.now();

const WARMUP_MESSAGES = [
  "The orangutans are grooming the API cables. Give them a sec.",
  "Jungle servers are waking up. Bananas are being allocated.",
  "Warming up tree routes for premium branch-to-branch latency.",
  "Our orangutan curator is picking the best photos right now."
];

const SEARCH_TERMS = [
  "orangutan",
  "baby orangutan",
  "bornean orangutan",
  "sumatran orangutan",
  "orangutan jungle"
];

const ORANGUTAN_INCLUDE_TERMS = [
  "orangutan",
  "orang utan",
  "bornean orangutan",
  "sumatran orangutan"
];

const PRIMATE_EXCLUDE_TERMS = [
  "monkey",
  "ape",
  "chimp",
  "chimpanzee",
  "gorilla",
  "baboon",
  "macaque",
  "gibbon",
  "lemur",
  "capuchin",
  "mandrill",
  "marmoset",
  "tarsier",
  "langur"
];

function getEnabledProviders() {
  const providers = [];

  if (process.env.PEXELS_API_KEY) {
    providers.push("Pexels");
  }

  if (process.env.PIXABAY_API_KEY) {
    providers.push("Pixabay");
  }

  if (process.env.UNSPLASH_ACCESS_KEY) {
    providers.push("Unsplash");
  }

  return providers;
}

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "OrangyAPI",
    version: "1.0.0",
    description: "Random orangutan image API powered by Pexels, Pixabay, and Unsplash, with cached image proxying and a simple JSON-first interface.",
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
        description: "Normalized orangutan photo metadata returned by the API (from Pexels, Pixabay, or Unsplash).",
        properties: {
          id: {
            oneOf: [
              { type: "integer" },
              { type: "string" }
            ],
            example: "u_abc123"
          },
          animal: { type: "string", example: "orangutan" },
          source: { type: "string", example: "Unsplash" },
          title: { type: "string", example: "Orangutan in the jungle" },
          image: { type: "string", format: "uri" },
          imageLarge: { type: "string", format: "uri" },
          thumbnail: { type: "string", format: "uri" },
          photographer: { type: "string", example: "Jane Doe" },
          photographerUrl: { type: "string", format: "uri" },
          pexelsUrl: {
            type: "string",
            format: "uri",
            description: "Legacy source page URL field kept for backwards compatibility."
          },
          sourceUrl: { type: "string", format: "uri" },
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
          source: { type: "string", example: "Pexels, Pixabay, Unsplash" },
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
          code: { type: "string" },
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
                      source: "Pexels, Pixabay, Unsplash",
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
                      sourceUrl: "https://www.pexels.com/photo/example",
                      avgColor: "#5A4A32"
                    }
                  }
                }
              }
            }
          },
          503: {
            description: "Cache is temporarily unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  emptyTree: {
                    value: {
                      error: "Service unavailable",
                      code: "EMPTY_TREE",
                      details: "Tree is empty"
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
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  serverError: {
                    value: {
                      error: "Failed to get orangutan image",
                      code: "IMAGE_FETCH_FAILED",
                      details: "Unexpected error"
                    }
                  }
                }
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
                          sourceUrl: "https://www.pexels.com/photo/example",
                          avgColor: "#5A4A32"
                        },
                        {
                          id: -2889499,
                          animal: "orangutan",
                          source: "Pixabay",
                          title: "Baby orangutan portrait",
                          image: "http://localhost:3000/api/images/-2889499",
                          imageLarge: "http://localhost:3000/api/images/-2889499?variant=large",
                          thumbnail: "http://localhost:3000/api/images/-2889499?variant=thumbnail",
                          photographer: "John Doe",
                          photographerUrl: "https://cdn.pixabay.com/user/2020/07/03/10-00-00-00_250x250.jpg",
                          pexelsUrl: "https://pixabay.com/photos/orangutan-monkey-primate-2889499/",
                          sourceUrl: "https://pixabay.com/photos/orangutan-monkey-primate-2889499/",
                          avgColor: "#7A5F40"
                        }
                      ]
                    }
                  }
                }
              }
            }
          },
          503: {
            description: "Cache is temporarily unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  emptyTree: {
                    value: {
                      error: "Service unavailable",
                      code: "EMPTY_TREE",
                      details: "Tree is empty"
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
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  serverError: {
                    value: {
                      error: "Failed to get orangutan images",
                      code: "IMAGE_LIST_FETCH_FAILED",
                      details: "Unexpected error"
                    }
                  }
                }
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
                type: "string",
                example: "u_abc123"
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
        summary: "Refresh cached provider results",
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
  if (!process.env.PEXELS_API_KEY) {
    return [];
  }

  const response = await pexels.get("/search", {
    params: {
      query,
      page,
      per_page: perPage
    }
  });

  return response.data.photos || [];
}

async function searchPixabay(query, page = 1, perPage = 80) {
  if (!process.env.PIXABAY_API_KEY) {
    return [];
  }

  const response = await pixabay.get("/", {
    params: {
      key: process.env.PIXABAY_API_KEY,
      q: query,
      page,
      per_page: perPage,
      image_type: "photo",
      safesearch: true
    }
  });

  return response.data.hits || [];
}

async function searchUnsplash(query, page = 1, perPage = 30) {
  if (!process.env.UNSPLASH_ACCESS_KEY) {
    return [];
  }

  const response = await unsplash.get("/search/photos", {
    params: {
      query,
      page,
      per_page: Math.min(perPage, 30),
      content_filter: "high"
    }
  });

  return response.data.results || [];
}

function normalizePexelsPhoto(photo) {
  return {
    id: photo.id,
    animal: "orangutan",
    source: "Pexels",
    title: photo.alt || "Orangutan",
    image: photo.src.medium || photo.src.large || photo.src.small,
    imageLarge: photo.src.large2x || photo.src.large || photo.src.medium,
    thumbnail: photo.src.medium || photo.src.small || photo.src.tiny,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    pexelsUrl: photo.url,
    sourceUrl: photo.url,
    avgColor: photo.avg_color,
    imageSource: photo.src.medium || photo.src.large || photo.src.small,
    imageLargeSource: photo.src.large2x || photo.src.large || photo.src.medium,
    thumbnailSource: photo.src.medium || photo.src.small || photo.src.tiny
  };
}

function normalizePixabayPhoto(photo) {
  return {
    id: -Math.abs(photo.id),
    animal: "orangutan",
    source: "Pixabay",
    title: (photo.tags || "Orangutan").split(",")[0].trim() || "Orangutan",
    image: photo.webformatURL || photo.largeImageURL || photo.previewURL,
    imageLarge: photo.largeImageURL || photo.webformatURL || photo.previewURL,
    thumbnail: photo.previewURL || photo.webformatURL || photo.largeImageURL,
    photographer: photo.user,
    photographerUrl: photo.userImageURL || undefined,
    pexelsUrl: photo.pageURL,
    sourceUrl: photo.pageURL,
    avgColor: undefined,
    imageSource: photo.webformatURL || photo.largeImageURL || photo.previewURL,
    imageLargeSource: photo.largeImageURL || photo.webformatURL || photo.previewURL,
    thumbnailSource: photo.previewURL || photo.webformatURL || photo.largeImageURL
  };
}

function normalizeUnsplashPhoto(photo) {
  return {
    id: `u_${photo.id}`,
    animal: "orangutan",
    source: "Unsplash",
    title: photo.description || photo.alt_description || "Orangutan",
    image: photo.urls?.regular || photo.urls?.small || photo.urls?.thumb,
    imageLarge: photo.urls?.full || photo.urls?.regular || photo.urls?.small,
    thumbnail: photo.urls?.thumb || photo.urls?.small || photo.urls?.regular,
    photographer: photo.user?.name,
    photographerUrl: photo.user?.links?.html,
    pexelsUrl: photo.links?.html,
    sourceUrl: photo.links?.html,
    avgColor: photo.color,
    imageSource: photo.urls?.regular || photo.urls?.small || photo.urls?.thumb,
    imageLargeSource: photo.urls?.full || photo.urls?.regular || photo.urls?.small,
    thumbnailSource: photo.urls?.thumb || photo.urls?.small || photo.urls?.regular
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
    sourceUrl: photo.sourceUrl || photo.pexelsUrl,
    avgColor: photo.avgColor
  };
}

function looksLikeOrangutanPexels(photo) {
  const text = `${photo.alt || ""}`.toLowerCase();
  const hasInclude = ORANGUTAN_INCLUDE_TERMS.some((term) => text.includes(term));
  const hasExclude = PRIMATE_EXCLUDE_TERMS.some((term) => text.includes(term));

  return hasInclude && !hasExclude;
}

function looksLikeOrangutanPixabay(photo) {
  const tags = String(photo.tags || "").toLowerCase();
  const hasInclude = ORANGUTAN_INCLUDE_TERMS.some((term) => tags.includes(term));
  const hasExclude = PRIMATE_EXCLUDE_TERMS.some((term) => tags.includes(term));

  return hasInclude && !hasExclude;
}

function looksLikeOrangutanUnsplash(photo) {
  const tagText = Array.isArray(photo.tags)
    ? photo.tags.map((tag) => String(tag?.title || tag || "")).join(" ")
    : "";
  const text = `${photo.description || ""} ${photo.alt_description || ""} ${photo.slug || ""} ${tagText}`.toLowerCase();
  const hasInclude = ORANGUTAN_INCLUDE_TERMS.some((term) => text.includes(term));
  const hasExclude = PRIMATE_EXCLUDE_TERMS.some((term) => text.includes(term));

  return hasInclude && !hasExclude;
}

async function safeSearch(providerName, searchFn) {
  try {
    return await searchFn();
  } catch (error) {
    console.warn(`${providerName} search failed: ${error.message}`);
    return [];
  }
}

async function fillCache() {
  const collected = [];
  const seenIds = new Set();

  for (const term of SEARCH_TERMS) {
    for (let page = 1; page <= 3; page++) {
      const [pexelsPhotos, pixabayPhotos, unsplashPhotos] = await Promise.all([
        safeSearch("Pexels", () => searchPexels(term, page, 80)),
        safeSearch("Pixabay", () => searchPixabay(term, page, 80)),
        safeSearch("Unsplash", () => searchUnsplash(term, page, 30))
      ]);

      for (const photo of pexelsPhotos) {
        const normalized = normalizePexelsPhoto(photo);
        const seenKey = String(normalized.id);
        if (!seenIds.has(seenKey) && looksLikeOrangutanPexels(photo)) {
          seenIds.add(seenKey);
          collected.push(normalized);
        }
      }

      for (const photo of pixabayPhotos) {
        const normalized = normalizePixabayPhoto(photo);
        const seenKey = String(normalized.id);
        if (!seenIds.has(seenKey) && looksLikeOrangutanPixabay(photo)) {
          seenIds.add(seenKey);
          collected.push(normalized);
        }
      }

      for (const photo of unsplashPhotos) {
        const normalized = normalizeUnsplashPhoto(photo);
        const seenKey = String(normalized.id);
        if (!seenIds.has(seenKey) && looksLikeOrangutanUnsplash(photo)) {
          seenIds.add(seenKey);
          collected.push(normalized);
        }
      }
    }
  }

  if (collected.length < 20) {
    for (const term of SEARCH_TERMS) {
      const [pexelsPhotos, pixabayPhotos, unsplashPhotos] = await Promise.all([
        safeSearch("Pexels", () => searchPexels(term, 1, 80)),
        safeSearch("Pixabay", () => searchPixabay(term, 1, 80)),
        safeSearch("Unsplash", () => searchUnsplash(term, 1, 30))
      ]);

      for (const photo of pexelsPhotos) {
        const normalized = normalizePexelsPhoto(photo);
        const seenKey = String(normalized.id);
        if (!seenIds.has(seenKey) && looksLikeOrangutanPexels(photo)) {
          seenIds.add(seenKey);
          collected.push(normalized);
        }
      }

      for (const photo of pixabayPhotos) {
        const normalized = normalizePixabayPhoto(photo);
        const seenKey = String(normalized.id);
        if (!seenIds.has(seenKey) && looksLikeOrangutanPixabay(photo)) {
          seenIds.add(seenKey);
          collected.push(normalized);
        }
      }

      for (const photo of unsplashPhotos) {
        const normalized = normalizeUnsplashPhoto(photo);
        const seenKey = String(normalized.id);
        if (!seenIds.has(seenKey) && looksLikeOrangutanUnsplash(photo)) {
          seenIds.add(seenKey);
          collected.push(normalized);
        }
      }
    }
  }

  if (!collected.length) {
    throw new Error("No orangutan photos were returned from enabled providers");
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

async function prewarmImageCache(limit = PREWARM_IMAGE_COUNT) {
  if (!orangutanCache.length) {
    return;
  }

  const photoSample = [...orangutanCache]
    .sort(() => Math.random() - 0.5)
    .slice(0, limit);
  const queue = [...photoSample];
  const workers = Array.from({ length: PREWARM_CONCURRENCY }, async () => {
    while (queue.length) {
      const nextPhoto = queue.shift();
      if (!nextPhoto) {
        return;
      }

      try {
        await getCachedImageAsset(nextPhoto, "default");
      } catch (error) {
        console.warn(`Image prewarm failed for ${nextPhoto.id}: ${error.message}`);
      }
    }
  });

  await Promise.all(workers);
}

async function refreshCacheSafe(context = "scheduled refresh") {
  try {
    await fillCache();
    startupWarmupError = null;
    prewarmImageCache().catch((error) => {
      console.warn(`Prewarm after ${context} failed: ${error.message}`);
    });
  } catch (error) {
    console.error(`${context} failed:`, error.message);
  }
}

function getWarmupState() {
  const warmupUptimeSeconds = Math.floor((Date.now() - bootTimestamp) / 1000);
  const messageIndex = warmupUptimeSeconds % WARMUP_MESSAGES.length;

  return {
    warmingUp: true,
    message: WARMUP_MESSAGES[messageIndex],
    uptimeSeconds: warmupUptimeSeconds,
    retryAfterSeconds: 15,
    docs: "/docs"
  };
}

async function warmCacheInBackground() {
  if (cacheWarmupInProgress || orangutanCache.length) {
    return;
  }

  cacheWarmupInProgress = true;

  try {
    await fillCache();
    startupWarmupError = null;
    prewarmImageCache().catch((error) => {
      console.warn(`Initial image prewarm failed: ${error.message}`);
    });
  } catch (error) {
    startupWarmupError = error.message;
    console.error("Initial cache warmup failed:", error.message);
  } finally {
    cacheWarmupInProgress = false;
  }
}

async function listenWithFallback(startPort, maxAttempts = 6) {
  let port = Number(startPort) || 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
          console.log(`OrangyAPI running at http://localhost:${port}`);
          resolve(server);
        });

        server.on("error", (error) => {
          server.close(() => {});
          reject(error);
        });
      });

      return;
    } catch (error) {
      if (error.code !== "EADDRINUSE") {
        throw error;
      }

      const nextPort = port + 1;
      console.warn(`Port ${port} is busy, retrying on ${nextPort}...`);
      port = nextPort;
    }
  }

  throw new Error(`Could not find an open port after ${maxAttempts} attempts`);
}

function getRandomFromCache() {
  if (!orangutanCache.length) {
    throw new Error("Tree is empty");
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

  const request = imageFetchClient.get(sourceUrl, {
    responseType: "arraybuffer",
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
  const warmupState = !orangutanCache.length ? getWarmupState() : null;

  res.json({
    name: "OrangyAPI",
    message: warmupState
      ? "OrangyAPI is waking up"
      : "Welcome to OrangyAPI",
    status: warmupState ? "warming_up" : "ready",
    warmup: warmupState,
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
  if (!orangutanCache.length) {
    const warmupState = getWarmupState();
    return res.status(200).json({
      status: "warming_up",
      ...warmupState,
      details: startupWarmupError
        ? "Warmup had a recent error and will retry automatically"
        : "Service is healthy and warming cache"
    });
  }

  res.status(200).json({ status: "ok" });
});

app.get("/docs/json", (req, res) => {
  const warmupState = !orangutanCache.length ? getWarmupState() : null;

  res.json({
    name: "OrangyAPI",
    source: getEnabledProviders().join(", ") || "None",
    status: warmupState ? "warming_up" : "ready",
    cacheSize: orangutanCache.length,
    lastUpdated,
    warmup: warmupState,
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
    if (error.message === "Tree is empty") {
      const warmupState = getWarmupState();
      res.setHeader("Retry-After", String(warmupState.retryAfterSeconds));
      return res.status(503).json({
        error: "Service unavailable",
        code: "EMPTY_TREE",
        details: warmupState.message,
        warmup: warmupState
      });
    }

    res.status(500).json({
      error: "Failed to get orangutan image",
      code: "IMAGE_FETCH_FAILED",
      details: error.message
    });
  }
});

app.get("/api/orangutans", (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count, 10) || 6, 24);

    if (!orangutanCache.length) {
      throw new Error("Tree is empty");
    }

    const shuffled = [...orangutanCache].sort(() => Math.random() - 0.5);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      count,
      images: shuffled.slice(0, count).map((photo) => toPublicPhoto(photo, req))
    });
  } catch (error) {
    if (error.message === "Tree is empty") {
      const warmupState = getWarmupState();
      res.setHeader("Retry-After", String(warmupState.retryAfterSeconds));
      return res.status(503).json({
        error: "Service unavailable",
        code: "EMPTY_TREE",
        details: warmupState.message,
        warmup: warmupState
      });
    }

    res.status(500).json({
      error: "Failed to get orangutan images",
      code: "IMAGE_LIST_FETCH_FAILED",
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
  if (!process.env.PEXELS_API_KEY && !process.env.PIXABAY_API_KEY && !process.env.UNSPLASH_ACCESS_KEY) {
    console.error("Missing required environment variable: set PEXELS_API_KEY, PIXABAY_API_KEY, or UNSPLASH_ACCESS_KEY");
    process.exit(1);
  }

  await listenWithFallback(PORT);
  await warmCacheInBackground();

  setInterval(() => {
    if (!orangutanCache.length) {
      warmCacheInBackground();
    }
  }, WARMUP_RETRY_DELAY_MS);

  setInterval(() => {
    refreshCacheSafe("Cache refresh");
  }, 6 * 60 * 60 * 1000);
}

startServer();
