import { useEffect, useState } from "react";
import "./App.css";

const RAW_API_URL = import.meta.env.VITE_API_URL || "https://orangyapi.onrender.com";
const API_BASE_URL = (RAW_API_URL.startsWith("http") ? RAW_API_URL : `https://${RAW_API_URL}`).replace(/\/$/, "");
const RETRY_DELAYS_MS = [600, 1400];
const PREFETCH_BATCH_SIZE = 6;

export default function App() {
  const [image, setImage] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [pexelsUrl, setPexelsUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoQueue, setPhotoQueue] = useState([]);

  const preloadImage = async (url) => {
    if (!url) return;
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = reject;
      img.decoding = "async";
      img.src = url;
    });
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchOrangutanBatch = async () => {
    let lastError = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/orangutans?count=${PREFETCH_BATCH_SIZE}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.details || data.error || "Something went wrong");
        }

        return data.images || [];
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length) {
          await wait(RETRY_DELAYS_MS[attempt]);
        }
      }
    }

    throw lastError || new Error("Failed to fetch");
  };

  const applyPhoto = async (photo) => {
    if (!photo?.image) {
      throw new Error("Missing image");
    }

    setImageLoading(true);
    await preloadImage(photo.image);
    setImage(photo.image);
    setTitle(photo.title || "Orangutan");
    setSource(photo.source || "");
    setPhotographer(photo.photographer || "");
    setPexelsUrl(photo.pexelsUrl || "");
  };

  const getOrangutan = async () => {
    try {
      setLoading(true);
      setError("");

      let nextPhoto = null;

      setPhotoQueue((currentQueue) => {
        if (currentQueue.length > 0) {
          [nextPhoto] = currentQueue;
          return currentQueue.slice(1);
        }

        return currentQueue;
      });

      if (!nextPhoto) {
        const queuedPhotos = await fetchOrangutanBatch();
        [nextPhoto] = queuedPhotos;
        setPhotoQueue(queuedPhotos.slice(1));
      }

      await applyPhoto(nextPhoto);
    } catch (err) {
      setError(`Temporary connection issue. Try again. (API: ${API_BASE_URL})`);
      setImageLoading(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getOrangutan();
  }, []);

  useEffect(() => {
    if (photoQueue.length >= 2) {
      return;
    }

    let cancelled = false;

    fetchOrangutanBatch()
      .then((photos) => {
        if (cancelled || !photos.length) {
          return;
        }

        setPhotoQueue((currentQueue) => {
          const seen = new Set(currentQueue.map((photo) => photo.id));
          const additions = photos.filter((photo) => !seen.has(photo.id));
          return [...currentQueue, ...additions];
        });

        const preloadTarget = photos[0]?.image;
        if (preloadTarget) {
          preloadImage(preloadTarget).catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [photoQueue]);

  return (
    <div className="app">
      <div className="background-glow glow-one"></div>
      <div className="background-glow glow-two"></div>

      <main className="card">
        <div className="top">
          <div className="badge">Orang Utan photo API</div>
          <div className="emoji-wrap">
            <div className="emoji">🦧</div>
          </div>
          <h1>OrangyAPI</h1>
          <p className="subtitle">
            Random orangutan pictures.
          </p>

          <button className="main-button" onClick={getOrangutan} disabled={loading}>
            {loading ? "Loading..." : "Show me another orangutan"}
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <section className="result">
          <div className="image-frame">
            {imageLoading && <div className="skeleton" />}

            {image && (
              <img
                src={image}
                alt={title}
                className={imageLoading ? "image hidden" : "image visible"}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageLoading(false);
                  setError("Could not load image");
                }}
              />
            )}
          </div>

          <div className="info">
            <p className="title">{title || "Loading orangutan..."}</p>

            <p className="source">
              {photographer ? (
                <>
                  Photo by{" "}
                  {pexelsUrl ? (
                    <a href={pexelsUrl} target="_blank" rel="noreferrer">
                      {photographer}
                    </a>
                  ) : (
                    photographer
                  )}{" "}
                  {source ? `on ${source}` : ""}
                </>
              ) : source ? (
                `Source: ${source}`
              ) : (
                ""
              )}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
