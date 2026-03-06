import { useEffect, useState } from "react";
import "./App.css";

const RAW_API_URL = import.meta.env.VITE_API_URL || "https://orangyapi.onrender.com";
const API_BASE_URL = (RAW_API_URL.startsWith("http") ? RAW_API_URL : `https://${RAW_API_URL}`).replace(/\/$/, "");
const RETRY_DELAYS_MS = [600, 1400];

export default function App() {
  const [image, setImage] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [pexelsUrl, setPexelsUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");

  const preloadImage = (url) => {
    if (!url) return;
    const img = new Image();
    img.src = url;
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchRandomOrangutan = async () => {
    let lastError = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/random-orangutan`, {
          cache: "no-store"
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.details || data.error || "Something went wrong");
        }

        return data;
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length) {
          await wait(RETRY_DELAYS_MS[attempt]);
        }
      }
    }

    throw lastError || new Error("Failed to fetch");
  };

  const getOrangutan = async () => {
    try {
      setLoading(true);
      setImageLoading(true);
      setError("");

      const data = await fetchRandomOrangutan();

      setImage(data.image);
      setTitle(data.title || "Orangutan");
      setSource(data.source || "");
      setPhotographer(data.photographer || "");
      setPexelsUrl(data.pexelsUrl || "");

      fetchRandomOrangutan()
        .then((next) => {
          if (next.image) preloadImage(next.image);
        })
        .catch(() => {});
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
