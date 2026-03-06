require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const app = express();
const PORT = process.env.PORT || 3000;

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
    image: photo.src.large2x || photo.src.large || photo.src.medium,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    pexelsUrl: photo.url,
    avgColor: photo.avg_color
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

  console.log(`Cached ${orangutanCache.length} orangutan photos`);
}

function getRandomFromCache() {
  if (!orangutanCache.length) {
    throw new Error("Cache is empty");
  }

  const randomIndex = Math.floor(Math.random() * orangutanCache.length);
  return orangutanCache[randomIndex];
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
    res.json(photo);
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
    res.json({
      count,
      images: shuffled.slice(0, count)
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get orangutan images",
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
  try {
    await fillCache();

    setInterval(async () => {
      try {
        await fillCache();
      } catch (error) {
        console.error("Cache refresh failed:", error.message);
      }
    }, 6 * 60 * 60 * 1000);

    app.listen(PORT, () => {
      console.log(`OrangyAPI running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
  }
}

startServer();
