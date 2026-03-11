import { useEffect, useState } from "react";

const RAW_API_URL = import.meta.env.VITE_API_URL || "https://orangyapi.onrender.com";
const API_BASE_URL = (RAW_API_URL.startsWith("http") ? RAW_API_URL : `https://${RAW_API_URL}`).replace(/\/$/, "");
const RETRY_DELAYS_MS = [600, 1400];
const PREFETCH_BATCH_SIZE = 6;
const SWAGGER_URL = `${API_BASE_URL}/docs`;

function ShuffleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15 21 21" />
      <path d="M4 4h5l4 4" />
    </svg>
  );
}

function DocsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3h5v5" />
      <path d="M10 14 19 5" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

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
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.2),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(20,184,166,0.18),_transparent_28%),linear-gradient(145deg,_#fff7ed_0%,_#fffbeb_38%,_#f7fee7_100%)] px-4 py-8 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl items-center">
        <main className="grid w-full gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/75 p-8 shadow-[0_24px_80px_rgba(120,53,15,0.12)] backdrop-blur xl:p-10">
            <div className="absolute -left-12 top-0 h-40 w-40 rounded-full bg-orange-200/40 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-36 w-36 rounded-full bg-lime-200/50 blur-3xl" />

            <div className="relative flex h-full flex-col">
              <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-orange-700">
                Orangutan Photo API
              </div>

              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-stone-950 text-3xl text-white shadow-lg shadow-orange-200/60">
                O
              </div>

              <h1 className="max-w-md text-4xl font-black tracking-[-0.06em] text-stone-950 sm:text-5xl">
                OrangyAPI
              </h1>

              <p className="mt-5 max-w-lg text-base leading-7 text-stone-600 sm:text-lg">
                Random orangutan images, fast API responses, and a cleaner front page for exploring the dataset.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={getOrangutan}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <ShuffleIcon />
                  {loading ? "Randomizing..." : "Randomize"}
                </button>

                <a
                  href={SWAGGER_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-5 py-4 text-sm font-semibold text-stone-800 transition hover:-translate-y-0.5 hover:border-stone-950 hover:text-stone-950"
                >
                  <DocsIcon />
                  Swagger Docs
                </a>
              </div>

              {error && (
                <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </p>
              )}

              <div className="mt-auto pt-8">
                <div className="rounded-[1.75rem] border border-stone-200/80 bg-stone-950 px-5 py-4 text-sm text-stone-300">
                  <p className="font-semibold uppercase tracking-[0.2em] text-orange-300">
                    Live endpoint
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-stone-100 sm:text-sm">
                    {API_BASE_URL}/api/random-orangutan
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[2rem] border border-stone-200/70 bg-white/80 p-4 shadow-[0_24px_80px_rgba(41,37,36,0.12)] backdrop-blur sm:p-5">
            <div className="flex h-full flex-col rounded-[1.6rem] bg-stone-100/80 p-3 sm:p-4">
              <div className="relative flex min-h-[420px] flex-1 items-center justify-center overflow-hidden rounded-[1.35rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.75),rgba(231,229,228,0.95))] sm:min-h-[520px]">
                {imageLoading && (
                  <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,rgba(231,229,228,0.95)_8%,rgba(255,255,255,0.98)_18%,rgba(231,229,228,0.95)_33%)] bg-[length:200%_100%]" />
                )}

                {image ? (
                  <img
                    src={image}
                    alt={title}
                    className={`h-full w-full object-contain transition duration-300 ${imageLoading ? "opacity-0" : "opacity-100"}`}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    onLoad={() => setImageLoading(false)}
                    onError={() => {
                      setImageLoading(false);
                      setError("Could not load image");
                    }}
                  />
                ) : (
                  <p className="px-6 text-center text-sm font-medium text-stone-500">
                    Loading orangutan...
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 px-2 pb-2 pt-5 sm:px-3">
                <p className="text-xl font-bold tracking-[-0.03em] text-stone-950">
                  {title || "Loading orangutan..."}
                </p>

                <p className="text-sm leading-6 text-stone-600">
                  {photographer ? (
                    <>
                      Photo by{" "}
                      {pexelsUrl ? (
                        <a
                          href={pexelsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-stone-950 underline decoration-orange-300 underline-offset-4"
                        >
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
                    "Fresh orangutan image from the cache."
                  )}
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
