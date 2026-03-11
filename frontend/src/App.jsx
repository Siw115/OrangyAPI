import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import meImage from "./assets/me.png";

const RAW_API_URL = import.meta.env.VITE_API_URL || "https://orangyapi.onrender.com";
const API_BASE_URL = (RAW_API_URL.startsWith("http") ? RAW_API_URL : `https://${RAW_API_URL}`).replace(/\/$/, "");
const RETRY_DELAYS_MS = [600, 1400];
const PREFETCH_BATCH_SIZE = 6;
const SWAGGER_URL = `${API_BASE_URL}/docs`;
const heroVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
  },
};
const detailVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  }),
};
const photoVariants = {
  initial: { opacity: 0, scale: 0.9, rotate: -2, filter: "blur(10px) saturate(0.9)" },
  animate: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    filter: "blur(0px) saturate(1)",
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    scale: 1.05,
    rotate: 1.5,
    filter: "blur(8px) saturate(1.08)",
    transition: { duration: 0.3, ease: [0.4, 0, 1, 1] },
  },
};

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
  const prefersReducedMotion = useReducedMotion();
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(50);
  const spotlight = useMotionTemplate`radial-gradient(circle at ${pointerX}% ${pointerY}%, rgba(255, 216, 3, 0.24), transparent 20%), radial-gradient(circle at top left, rgba(255,216,3,0.18), transparent 30%), radial-gradient(circle at bottom right, rgba(186,232,232,0.22), transparent 28%), linear-gradient(145deg, #fffffe 0%, #f7f8fa 42%, #eef3f5 100%)`;
  const [image, setImage] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [pexelsUrl, setPexelsUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoQueue, setPhotoQueue] = useState([]);
  const [shuffleBurst, setShuffleBurst] = useState(0);

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
      setShuffleBurst((count) => count + 1);

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

  useEffect(() => {
    if (!shuffleBurst) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShuffleBurst(0);
    }, 520);

    return () => window.clearTimeout(timeoutId);
  }, [shuffleBurst]);

  return (
    <motion.div
      className="page-shell min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,216,3,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(186,232,232,0.22),_transparent_28%),linear-gradient(145deg,_#fffffe_0%,_#f7f8fa_42%,_#eef3f5_100%)] px-4 py-8 text-[#272343] sm:px-6 lg:px-8"
      style={prefersReducedMotion ? undefined : { backgroundImage: spotlight }}
      onPointerMove={(event) => {
        if (prefersReducedMotion) {
          return;
        }

        const bounds = event.currentTarget.getBoundingClientRect();
        const nextX = ((event.clientX - bounds.left) / bounds.width) * 100;
        const nextY = ((event.clientY - bounds.top) / bounds.height) * 100;
        pointerX.set(Math.max(0, Math.min(100, nextX)));
        pointerY.set(Math.max(0, Math.min(100, nextY)));
      }}
    >
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl items-center">
        <main className="grid w-full gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <motion.section
            variants={heroVariants}
            initial={prefersReducedMotion ? false : "hidden"}
            animate="visible"
            whileHover={prefersReducedMotion ? undefined : { y: -4 }}
            className="relative overflow-hidden rounded-[2rem] border border-[#272343]/15 bg-white/85 p-8 shadow-[0_24px_80px_rgba(39,35,67,0.10)] backdrop-blur xl:p-10"
          >
            <div className="ambient-orb orb-one absolute -left-12 top-0 h-40 w-40 rounded-full bg-[#ffd803]/28 blur-3xl" />
            <div className="ambient-orb orb-two absolute bottom-0 right-0 h-36 w-36 rounded-full bg-[#bae8e8]/50 blur-3xl" />

            <div className="relative flex h-full flex-col">
              <motion.div
                custom={0.08}
                variants={detailVariants}
                initial={prefersReducedMotion ? false : "hidden"}
                animate="visible"
                className="badge-pop mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#272343]/20 bg-[#e3f6f5] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#272343]"
              >
                Orangutan Photo API
              </motion.div>

              <motion.div
                custom={0.14}
                variants={detailVariants}
                initial={prefersReducedMotion ? false : "hidden"}
                animate="visible"
                whileHover={prefersReducedMotion ? undefined : { rotate: 8, scale: 1.08 }}
                className="mascot-bob mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#272343] text-3xl text-[#fffffe] shadow-lg shadow-[#bae8e8]/70"
              >
                🦧
              </motion.div>

              <motion.h1
                custom={0.2}
                variants={detailVariants}
                initial={prefersReducedMotion ? false : "hidden"}
                animate="visible"
                className="max-w-md text-4xl font-black tracking-[-0.06em] text-[#272343] sm:text-5xl"
              >
                OrangyAPI
              </motion.h1>

              <motion.p
                custom={0.28}
                variants={detailVariants}
                initial={prefersReducedMotion ? false : "hidden"}
                animate="visible"
                className="mt-5 max-w-lg text-base leading-7 text-[#2d334a] sm:text-lg"
              >
                Fresh orangutan photos, straight from the canopy. Hit randomize for another jungle celebrity, or open the docs for the technical bananas.
              </motion.p>

              <motion.div
                custom={0.34}
                variants={detailVariants}
                initial={prefersReducedMotion ? false : "hidden"}
                animate="visible"
                className="mt-8 flex flex-col gap-3 sm:flex-row"
              >
                <motion.button
                  type="button"
                  onClick={getOrangutan}
                  disabled={loading}
                  whileHover={prefersReducedMotion ? undefined : { y: -5, scale: 1.02, rotate: -1 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.97, y: 1 }}
                  className={`randomize-button inline-flex items-center justify-center gap-2 rounded-2xl bg-[#ffd803] px-5 py-4 text-sm font-semibold text-[#272343] transition hover:bg-[#f6cf00] disabled:cursor-not-allowed disabled:opacity-70 ${
                    loading ? "is-loading" : ""
                  }`}
                >
                  <ShuffleIcon />
                  {loading ? "Randomizing..." : "Randomize"}
                </motion.button>

                <motion.a
                  href={SWAGGER_URL}
                  target="_blank"
                  rel="noreferrer"
                  whileHover={prefersReducedMotion ? undefined : { y: -4, scale: 1.01 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#272343]/25 bg-white px-5 py-4 text-sm font-semibold text-[#272343] transition hover:-translate-y-0.5 hover:border-[#272343] hover:text-[#272343]"
                >
                  <DocsIcon />
                  Swagger Docs
                </motion.a>
              </motion.div>

              {error && (
                <p className="mt-5 rounded-2xl border border-[#ffd803]/60 bg-[#fff7cc] px-4 py-3 text-sm font-medium text-[#272343]">
                  {error}
                </p>
              )}

              <div className="mt-auto pt-8">
                <motion.div
                  custom={0.42}
                  variants={detailVariants}
                  initial={prefersReducedMotion ? false : "hidden"}
                  animate="visible"
                  whileHover={prefersReducedMotion ? undefined : { y: -6, rotate: -0.5, scale: 1.01 }}
                  className="creator-card mb-4 flex items-center gap-4 rounded-[1.5rem] border border-[#272343]/15 bg-[#e3f6f5]/80 p-4"
                >
                  <img
                    src={meImage}
                    alt="Creator portrait"
                    className="creator-photo h-20 w-20 rounded-2xl object-cover"
                  />
                  <div>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[#272343]">
                      Created By Me
                    </p>
                    <p className="mt-1 text-sm text-[#2d334a]">
                      Built and styled by the creator of OrangyAPI. Image by{" "}
                      <a
                        href="https://humation.app/"
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[#272343] underline decoration-[#ffd803] underline-offset-4"
                      >
                        humation.app
                      </a>
                      .
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  custom={0.5}
                  variants={detailVariants}
                  initial={prefersReducedMotion ? false : "hidden"}
                  animate="visible"
                  whileHover={prefersReducedMotion ? undefined : { y: -4 }}
                  className="rounded-[1.75rem] border border-[#272343]/15 bg-[#272343] px-5 py-4 text-sm text-[#e3f6f5]"
                >
                  <p className="font-semibold uppercase tracking-[0.2em] text-[#ffd803]">
                    Live endpoint
                  </p>
                  <a
                    href={`${API_BASE_URL}/api/random-orangutan`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all font-mono text-xs text-[#fffffe] underline decoration-[#ffd803]/70 underline-offset-4 transition hover:text-[#ffd803] sm:text-sm"
                  >
                    {API_BASE_URL}/api/random-orangutan
                  </a>
                </motion.div>
              </div>
            </div>
          </motion.section>

          <motion.section
            variants={heroVariants}
            initial={prefersReducedMotion ? false : "hidden"}
            whileHover={prefersReducedMotion ? undefined : { y: -4 }}
            animate={
              prefersReducedMotion
                ? "visible"
                : shuffleBurst
                  ? {
                      x: [0, -10, 10, -6, 6, 0],
                      y: [0, -6, 4, -3, 2, 0],
                      rotate: [0, -1.4, 1.2, -0.8, 0.5, 0],
                      transition: { duration: 0.52, ease: [0.22, 1, 0.36, 1] },
                    }
                  : "visible"
            }
            className="overflow-hidden rounded-[2rem] border border-[#272343]/15 bg-white/82 p-4 shadow-[0_24px_80px_rgba(39,35,67,0.10)] backdrop-blur sm:p-5"
          >
            <motion.div
              animate={
                prefersReducedMotion || !shuffleBurst
                  ? undefined
                  : {
                      rotate: [0, 0.6, -0.6, 0],
                      scale: [1, 0.985, 1.01, 1],
                      transition: { duration: 0.48, ease: [0.22, 1, 0.36, 1] },
                    }
              }
              className="photo-shell flex h-[640px] flex-col rounded-[1.6rem] p-3 sm:h-[720px] sm:p-4"
            >
              <div className="photo-stage relative flex h-[420px] shrink-0 flex-col overflow-hidden rounded-[1.45rem] border border-[#272343]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(227,246,245,0.98))] p-3 sm:h-[520px] sm:p-4">
                <div className="photo-stage-label mb-3 inline-flex w-fit items-center rounded-full border border-[#272343]/12 bg-white/80 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[#2d334a]">
                  Featured orangutan
                </div>
                <div className="photo-well relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[1.15rem] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.98),_rgba(242,247,247,0.96)_58%,_rgba(227,246,245,0.9)_100%)] px-4 py-5 sm:px-6">
                {imageLoading && (
                  <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,rgba(231,229,228,0.95)_8%,rgba(255,255,255,0.98)_18%,rgba(231,229,228,0.95)_33%)] bg-[length:200%_100%]" />
                )}

                {image ? (
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={image}
                      variants={prefersReducedMotion ? undefined : photoVariants}
                      initial={prefersReducedMotion ? false : "initial"}
                      animate={prefersReducedMotion ? undefined : "animate"}
                      exit={prefersReducedMotion ? undefined : "exit"}
                      src={image}
                      alt={title}
                      className={`block h-full w-full object-contain transition duration-300 ${imageLoading ? "opacity-0" : "opacity-100"}`}
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      onLoad={() => setImageLoading(false)}
                      onError={() => {
                        setImageLoading(false);
                        setError("Could not load image");
                      }}
                    />
                  </AnimatePresence>
                ) : (
                  <p className="px-6 text-center text-sm font-medium text-[#2d334a]">
                    Loading orangutan...
                  </p>
                )}
                </div>
              </div>

              <div className="photo-caption mt-4 flex min-h-[132px] shrink-0 flex-col justify-start gap-3 rounded-[1.3rem] border border-white/70 bg-white/86 px-4 py-4 shadow-[0_16px_34px_rgba(39,35,67,0.07)] sm:min-h-[144px] sm:px-5">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-xl font-bold tracking-[-0.03em] text-[#272343]">
                  {title || "Loading orangutan..."}
                  </p>
                  <span className="rounded-full bg-[#e3f6f5] px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#272343]">
                    Photo
                  </span>
                </div>

                <p className="text-sm leading-6 text-[#2d334a]">
                  {photographer ? (
                    <>
                      Photo by{" "}
                      {pexelsUrl ? (
                        <a
                          href={pexelsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-[#272343] underline decoration-[#ffd803] underline-offset-4"
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
            </motion.div>
          </motion.section>
        </main>
      </div>
    </motion.div>
  );
}
