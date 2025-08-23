// src/pages/Home.js
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  Fragment,
} from "react";
import { generateItinerary } from "../services/gemini";
import { getPlaceImage } from "../services/unsplash";
// Import Leaflet components
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom marker icons for numbered stops
const createNumberedIcon = (number, color = '#ff6b35') => {
  return L.divIcon({
    className: 'custom-numbered-marker',
    html: `<div style="
      background: ${color};
      color: white;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">${number}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

// Map controls component
const MapControls = ({ mapRef }) => {
  const map = useMap();
  
  useEffect(() => {
    if (mapRef && map) {
      mapRef.current = map;
      // Force map to refresh after a short delay
      setTimeout(() => {
        if (map) {
          map.invalidateSize();
        }
      }, 200);
    }
  }, [map, mapRef]);

  return null;
};

/**
 * Home
 * - Clean, lively UI for AI trip planning
 * - Interactive map with pins + route lines
 * - Card grid per day
 * - Rich detail panel with image + long description + embedded map + external Maps link
 * - Unsplash image fetch + caching + graceful fallback
 * - Smooth transitions and polished micro-interactions
 *
 * Notes:
 * - Spline animation was fully removed as requested.
 * - Inputs accept empty values (no sticky "0"), with proper placeholders.
 * - Day preview chips remain inside the globe region with responsive height (no dead empty space).
 * - Long descriptions scroll inside the detail panel; buttons stay visible.
 */

// ----------------------------- Utility: clamp -----------------------------
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// ----------------------------- Utility: sleep (for demo/UX pacing) -----------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------- Component: ShimmerLine -----------------------------
const ShimmerLine = ({ width = "100%", height = 12, radius = 6, style }) => (
  <div
    style={{
      width,
      height,
      borderRadius: radius,
      background:
        "linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.18), rgba(255,255,255,0.06))",
      backgroundSize: "200% 100%",
      animation: "shimmer 1600ms infinite",
      ...style,
    }}
  />
);

// ----------------------------- Component: SoftBadge -----------------------------
const SoftBadge = ({ children }) => (
  <span
    style={{
      padding: "5px 8px",
      fontSize: 12,
      borderRadius: 999,
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.12)",
      marginLeft: 6,
    }}
  >
    {children}
  </span>
);

// ----------------------------- Hook: useImageCache -----------------------------
/**
 * Keeps a local cache of image URLs keyed by a canonical key (e.g., place name).
 * Provides get, set, and a helper that fetches via Unsplash if absent.
 */
const useImageCache = () => {
  const cacheRef = useRef(new Map());

  const get = useCallback((key) => cacheRef.current.get(key), []);
  const set = useCallback((key, val) => {
    cacheRef.current.set(key, val);
  }, []);

  const getOrFetch = useCallback(
    async (key, query) => {
      const current = cacheRef.current.get(key);
      if (current) return current;
      try {
        const url = await getPlaceImage(query);
        if (url) {
          cacheRef.current.set(key, url);
          return url;
        }
      } catch (err) {
        console.error("getOrFetch image failed:", err);
      }
      
      // Always provide a fallback
      const fallback = `https://source.unsplash.com/600x400/?${encodeURIComponent(
        query || "travel"
      )}`;
      cacheRef.current.set(key, fallback);
      return fallback;
    },
    []
  );

  return { get, set, getOrFetch };
};

// ----------------------------- Hook: usePrefetchImagesForDay -----------------------------
/**
 * Prefetch Unsplash images for all places in a selected day and store them in cache.
 * Returns a map-like object { [placeKey]: imageUrl }
 */
const usePrefetchImagesForDay = (dayData, imageCache) => {
  const [imageMap, setImageMap] = useState({});

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!dayData?.itinerary?.length) {
        setImageMap({});
        return;
      }
      const entries = dayData.itinerary;

      const nextMap = {};
      for (const p of entries) {
        const key = (p.name || p.location?.label || "place").toLowerCase();
        const q =
          p.image ||
          p.name ||
          p.location?.label ||
          (p.location ? `${p.location.lat},${p.location.lng}` : "travel");

        try {
          const url = await imageCache.getOrFetch(key, q);
          if (!mounted) return;
          nextMap[key] = url;
          // Yield a microtask to keep UI responsive if there are many
          // eslint-disable-next-line no-await-in-loop
          await sleep(8);
        } catch (e) {
          console.error("Image prefetch error:", e);
        }
      }

      if (mounted) setImageMap(nextMap);
    };

    run();

    return () => {
      mounted = false;
    };
  }, [dayData, imageCache]);

  return imageMap;
};

// ----------------------------- Main Component -----------------------------
const Home = () => {
  // ---- Form state ----
  const [city, setCity] = useState("");
  const [budget, setBudget] = useState("");
  const [inputDays, setInputDays] = useState("");

  // ---- Itinerary state ----
  const [days, setDays] = useState(0);
  const [itins, setItins] = useState([]); // full itinerary array
  const [selectedDay, setSelectedDay] = useState(0); // day index
  const [dayData, setDayData] = useState(null); // current day object
  const [loading, setLoading] = useState(false);

  // ---- Place details state (for in-page detail panel) ----
  const [selectedPlace, setSelectedPlace] = useState(null);

  // ---- Globe sizing / refs ----
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  // ---- Image cache + prefetch for the selected day ----
  const imageCache = useImageCache();
  const dayImageMap = usePrefetchImagesForDay(dayData, imageCache);

  // -------------------- Derived: all itinerary data for map --------------------
  const allItineraryData = useMemo(() => {
    if (!itins.length) return [];
    
    const allPlaces = [];
    let dayNumber = 1;
    
    itins.forEach((day, dayIndex) => {
      if (day?.itinerary?.length) {
        day.itinerary.forEach((place, placeIndex) => {
          allPlaces.push({
            ...place,
            dayNumber: dayNumber,
            dayIndex: dayIndex,
            placeIndex: placeIndex,
            isFirstPlaceOfDay: placeIndex === 0
          });
        });
        dayNumber++; // Increment day number for each day
      }
    });
    
    return allPlaces;
  }, [itins]);

  const allRoutePositions = useMemo(() => {
    return allItineraryData.map(place => [place.location.lat, place.location.lng]);
  }, [allItineraryData]);

  // -------------------- Effects: Map sizing --------------------
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Use full container dimensions for better map display
      setMapSize({ 
        width: rect.width, 
        height: rect.height 
      });
    };
    
    // Initial size update
    updateSize();
    
    // Update size after a short delay to ensure container is fully rendered
    const timer = setTimeout(updateSize, 100);
    
    window.addEventListener("resize", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
      clearTimeout(timer);
    };
  }, []);

  // -------------------- Effects: Reset map ref when itinerary changes --------------------
  useEffect(() => {
    if (itins.length === 0) {
      // Reset map reference when clearing itinerary
      if (mapRef.current) {
        mapRef.current = null;
      }
    }
  }, [itins.length]);

  // -------------------- Effects: Force map refresh when itinerary changes --------------------
  useEffect(() => {
    if (itins.length > 0 && mapRef.current) {
      // Force map to refresh and fit bounds when new itinerary is loaded
      setTimeout(() => {
        if (mapRef.current && allItineraryData.length > 0) {
          const bounds = L.latLngBounds(allItineraryData.map(p => [p.location.lat, p.location.lng]));
          mapRef.current.fitBounds(bounds, { padding: [20, 20] });
        }
      }, 500);
    }
  }, [itins.length, allItineraryData.length]);

  // -------------------- Effects: Force map refresh when map size changes --------------------
  useEffect(() => {
    if (mapRef.current && mapSize.width > 0 && mapSize.height > 0) {
      // Force map to refresh when container size changes
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 100);
    }
  }, [mapSize.width, mapSize.height]);

  // -------------------- Effects: update day + POV --------------------
  useEffect(() => {
    if (days > 0 && itins.length > 0) {
      const d = itins[selectedDay] || itins[0];
      setDayData(d);
      
      // Center the map on the selected day's location with a slight delay
      setTimeout(() => {
        if (mapRef.current && allItineraryData.length > 0) {
          const dayLocation = allItineraryData.find(place => place.dayNumber === selectedDay + 1);
          if (dayLocation) {
            mapRef.current.setView([dayLocation.location.lat, dayLocation.location.lng], 14);
          }
        }
      }, 150);
    } else {
      setDayData(null);
    }
  }, [selectedDay, days, itins, allItineraryData]);

  // -------------------- Handlers --------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all fields are filled
    if (!city.trim()) {
      alert("Please enter a city name");
      return;
    }
    
    if (!budget || budget <= 0) {
      alert("Please enter a valid budget amount");
      return;
    }
    
    if (!inputDays || inputDays <= 0) {
      alert("Please enter the number of days");
      return;
    }
    
    // Clear all previous data before starting new generation
    setSelectedPlace(null);
    setSelectedDay(0);
    setDayData(null);
    setItins([]);
    setDays(0);
    setLoading(true);

    try {
      const d = clamp(Number(inputDays), 1, 21);
      const res = await generateItinerary(city.trim(), Number(budget), d);
      setItins(Array.isArray(res) ? res : []);
      setDays(d);
    } catch (err) {
      console.error("generateItinerary failed:", err);
      setItins([]);
      setDays(0);
      setDayData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDayChipClick = (i) => {
    setSelectedDay(i);
    setSelectedPlace(null);
    
    // Use setTimeout to ensure the map is ready and dayData is updated
    setTimeout(() => {
      // Find the location for this specific day number
      const dayLocation = allItineraryData.find(place => place.dayNumber === i + 1);
      if (dayLocation && mapRef.current) {
        mapRef.current.setView([dayLocation.location.lat, dayLocation.location.lng], 14);
      }
    }, 100);
  };

  const handleBackFromDetail = () => {
    setSelectedPlace(null);
  };

  // -------------------- Helpers --------------------

  const getFoodRecommendation = (place) => {
    // Return data from Gemini API if available, otherwise fallback
    if (place.nearbyFood && place.nearbyFood.length > 0) {
      return place.nearbyFood[0]; // Return first restaurant from API
    }
    
    // Fallback for when API data isn't available
    return {
      name: "Local Restaurant",
      rating: "4.0/5",
      distance: "500m away",
      description: "Popular local restaurant with authentic cuisine."
    };
  };

  const getTimeOfDay = (index) => {
    const times = ["Morning", "Afternoon", "Evening", "Morning", "Afternoon", "Evening"];
    return times[index % times.length];
  };

  const getDuration = (index) => {
    const durations = ["2 hours", "2 hours", "2 hours", "3 hours", "4 hours", "3 hours"];
    return durations[index % durations.length];
  };

  const getImageForPlace = (place) => {
    const key = (place.name || place.location?.label || "place").toLowerCase();
    const imageUrl = dayImageMap[key] || place.image;
    
    if (imageUrl) {
      console.log(`Using cached/prefetched image for ${place.name}:`, imageUrl);
      return imageUrl;
    }
    
    // Fallback to Unsplash with a more specific query
    const query = place.name || place.location?.label || "travel destination";
    const fallbackUrl = `https://source.unsplash.com/600x400/?${encodeURIComponent(query)}`;
    console.log(`Using fallback image for ${place.name}:`, fallbackUrl);
    return fallbackUrl;
  };

  // -------------------- Render --------------------
  return (
    <div style={styles.page}>
      {/* Global keyframes + visuals */}
      <StyleTag />

      {/* Hero */}
      <div style={styles.hero}>
        <div style={styles.heroRow}>
          <div style={styles.heroLeft}>
            <h1 style={styles.heroTitle}>
              <span style={styles.glowText}>AI Travel Itinerary</span>
              <span style={styles.sparkle} aria-hidden>
                ✦
              </span>
            </h1>
            <p style={styles.heroSubtitle}>
              Enter a city, budget & days — get a complete day-by-day plan with
              rich details, images, and maps. Click any place to view its story
              and navigate easily.
            </p>
                         <div style={styles.heroTips}>
               <SoftBadge>Gemini-powered</SoftBadge>
               <SoftBadge>Unsplash Photos</SoftBadge>
             </div>
          </div>
          <div style={styles.heroRight}>
            <div style={styles.pulseDot} />
            <div style={styles.pulseDotSecondary} />
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div style={styles.container} className="container">
        {/* LEFT PANEL */}
        <div style={styles.leftPanel} className="left-panel">
          {/* Form */}
          <form onSubmit={handleSubmit} style={styles.form}>
                         <div style={styles.row} className="form-row">
               <input
                 type="text"
                 placeholder="City (e.g., Kyoto) *"
                 value={city}
                 onChange={(e) => setCity(e.target.value)}
                 style={{
                   ...styles.input,
                   borderColor: !city.trim() ? "rgba(255,100,100,0.6)" : "rgba(255,255,255,0.18)"
                 }}
                 required
               />
                               <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Budget (e.g., 1200) *"
                  min="1"
                  value={budget === "" ? "" : budget}
                  onChange={(e) =>
                    setBudget(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  style={{
                    ...styles.input,
                    borderColor: (!budget || budget <= 0) ? "rgba(255,100,100,0.6)" : "rgba(255,255,255,0.18)"
                  }}
                  required
                />
               <input
                 type="number"
                 inputMode="numeric"
                 placeholder="Days (1–21) *"
                 min="1"
                 value={inputDays === "" ? "" : inputDays}
                 onChange={(e) =>
                   setInputDays(
                     e.target.value === "" ? "" : Number(e.target.value)
                   )
                 }
                 style={{
                   ...styles.input,
                   borderColor: (!inputDays || inputDays <= 0) ? "rgba(255,100,100,0.6)" : "rgba(255,255,255,0.18)"
                 }}
                 required
               />
             </div>
                         <button 
               type="submit" 
               style={{
                 ...styles.button,
                 opacity: (!city.trim() || !budget || !inputDays) ? 0.5 : 1,
                 cursor: (!city.trim() || !budget || !inputDays) ? "not-allowed" : "pointer"
               }} 
               disabled={loading || !city.trim() || !budget || !inputDays}
             >
               {loading ? "Generating…" : "Generate"}
                          </button>
           </form>

           

          {/* Loading shimmer */}
          {loading && (
            <div
              style={{
                ...styles.loadingWrap,
                animation: "fadeIn 300ms ease forwards",
              }}
            >
              <ShimmerLine height={16} width={"70%"} style={{ margin: "6px 0" }} />
              <ShimmerLine height={12} width={"85%"} style={{ margin: "6px 0" }} />
              <ShimmerLine height={12} width={"65%"} style={{ margin: "6px 0" }} />
              <div style={{ height: 10 }} />
              <div style={styles.loadingCards}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={styles.loadingCard}>
                    <ShimmerLine height={120} radius={12} />
                    <div style={{ height: 8 }} />
                    <ShimmerLine height={12} width="60%" />
                    <div style={{ height: 6 }} />
                    <ShimmerLine height={10} width="80%" />
                  </div>
                ))}
              </div>
            </div>
          )}

                     {/* Trip meta */}
           {!loading && days > 0 && (
             <div style={styles.meta}>
               <div>
                 <span style={styles.metaKey}>City:</span> {city || "—"}
               </div>
                               <div>
                  <span style={styles.metaKey}>Budget:</span>{" "}
                  {budget ? `$${budget}` : "—"}
                </div>
                <div>
                  <span style={styles.metaKey}>Days:</span> {days}
                </div>
             </div>
           )}

          {/* Day chips */}
          {!loading && days > 0 && itins.length > 0 && (
            <div style={styles.dayChipsRow}>
              {itins.slice(0, days).map((d, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.dayChip,
                    ...(selectedDay === i ? styles.dayChipActive : {}),
                  }}
                  onClick={() => handleDayChipClick(i)}
                >
                  Day {i + 1}
                </div>
              ))}
            </div>
          )}

          {/* Place cards: selected day */}
          {!loading && days > 0 && dayData && (
            <div style={styles.cardsGrid} className="cards-grid">
              {dayData.itinerary.map((place, idx) => {
                const imgUrl = getImageForPlace(place);
                return (
                  <div
                    key={idx}
                    style={styles.card}
                    onClick={() => setSelectedPlace(place)}
                    className="card-anim"
                  >
                                         <div
                       style={{
                         ...styles.cardImage,
                         backgroundImage: `url("${imgUrl}")`,
                         backgroundSize: "cover",
                         backgroundPosition: "center",
                         backgroundRepeat: "no-repeat",
                       }}
                       aria-hidden
                     />
                    <div style={styles.cardOverlay} />
                    <div style={styles.cardContent}>
                      <div style={styles.cardTitle}>{place.name}</div>
                      <div
                        style={styles.cardDesc}
                        title={place.description || ""}
                      >
                        {(place.description || "")
                          .split(" ")
                          .slice(0, 26)
                          .join(" ")}
                        {place.description &&
                          place.description.split(" ").length > 26
                          ? "…"
                          : ""}
                      </div>
                      <div style={styles.cardCta}>View details →</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!loading && days === 0 && (
            <div style={styles.emptyHint}>
              👋 Start by entering your trip details and press{" "}
              <b>Generate</b>. You'll get beautiful cards you can click for full
              details, images, and a live map.
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div ref={containerRef} style={styles.rightPanel} className="right-panel">
          {/* Subtle starfield background */}
          <div style={styles.starfield} aria-hidden />

          {/* 1) Empty right panel state */}
          {!loading && days === 0 && (
            <div style={styles.rightEmptyWrap}>
              <div style={styles.rightEmptyCard}>
                <div style={styles.rightEmptyTitle}>Ready to explore?</div>
                <div style={styles.rightEmptySub}>
                  Your interactive map will appear here once your itinerary is
                  generated.
                </div>
                <div style={styles.rightEmptyHintRow}>
                  <span>Tip: Try</span>
                  <span style={styles.rightEmptyHintChip}>Kyoto / $900 / 5</span>
                  <span style={styles.rightEmptyHintChip}>
                    Paris / $1200 / 4
                  </span>
                  <span style={styles.rightEmptyHintChip}>
                    Bali / $800 / 6
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 2) Place details panel */}
          {!loading && days > 0 && selectedPlace && (
            <div style={styles.detailPanel}>
              <div style={styles.detailHeader}>
                <button
                  style={styles.backBtn}
                  onClick={handleBackFromDetail}
                  aria-label="Back"
                  title="Back"
                >
                  ← Back
                </button>
                <div style={styles.detailTitle}>{selectedPlace.name}</div>
              </div>

              <div style={styles.detailBody}>
                <div style={styles.detailLeft}>
                  {/* Big image */}
                  <div style={styles.detailHeroImageWrap}>
                                         <div
                       style={{
                         ...styles.detailHeroImage,
                         backgroundImage: `url("${getImageForPlace(
                           selectedPlace
                         )}")`,
                         backgroundSize: "cover",
                         backgroundPosition: "center",
                         backgroundRepeat: "no-repeat",
                       }}
                       aria-hidden
                     />
                    <div style={styles.detailHeroOverlay} />
                    <div style={styles.detailHeroLabel}>
                      {selectedPlace.location?.label || ""}
                    </div>
                  </div>

                  {/* Scrollable long description */}
                  <div style={styles.detailText}>
                    <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>
                      {selectedPlace.description}
                    </p>

                    <div style={styles.detailActionsRow}>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${selectedPlace.location.lat},${selectedPlace.location.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.mapsButton}
                      >
                        View on Google Maps
                      </a>

                      {/* Extra external help (optional) */}
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(
                          selectedPlace.name
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.secondaryButton}
                      >
                        Learn more ↗
                      </a>
                    </div>
                  </div>
                </div>

                {/* Embedded map */}
                <div style={styles.mapWrap}>
                  <iframe
                    title="Google Map"
                    src={`https://www.google.com/maps?q=${selectedPlace.location.lat},${selectedPlace.location.lng}&z=14&output=embed`}
                    style={styles.mapFrame}
                    loading="lazy"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3) Map view */}
          {!loading &&
            days > 0 &&
            !selectedPlace &&
            mapSize.width > 0 &&
            mapSize.height > 0 && (
              <Fragment>
                {/* Interactive Map Section */}
                <div style={styles.mapSection}>
                                     <div style={styles.mapHeader}>
                     <h2 style={styles.mapTitle}>Interactive Route</h2>
                     <div style={styles.mapControls}>
                       <button 
                         style={styles.mapControlBtn}
                         onClick={() => {
                           if (mapRef.current && allItineraryData.length) {
                             const bounds = L.latLngBounds(allItineraryData.map(p => [p.location.lat, p.location.lng]));
                             mapRef.current.fitBounds(bounds, { padding: [20, 20] });
                           }
                         }}
                       >
                         Fit to Route
                       </button>
                       <button 
                         style={styles.mapControlBtn}
                         onClick={() => mapRef.current?.zoomIn()}
                       >
                         Zoom +
                       </button>
                       <button 
                         style={styles.mapControlBtn}
                         onClick={() => mapRef.current?.zoomOut()}
                       >
                         Zoom -
                       </button>
                     </div>
                     <button 
                       style={styles.googleMapsBtn}
                       onClick={() => {
                         if (allItineraryData.length) {
                           const first = allItineraryData[0].location;
                           window.open(`https://www.google.com/maps?q=${first.lat},${first.lng}`, '_blank');
                         }
                       }}
                     >
                       Open in Google Maps
                     </button>
                  </div>
                  
                                     <div style={styles.mapContainer}>
                                           <MapContainer
                        center={allItineraryData.length > 0 ? [allItineraryData[0].location.lat, allItineraryData[0].location.lng] : [0, 0]}
                        zoom={10}
                        style={{ height: "100%", width: "100%", minHeight: "400px" }}
                        key={`map-${itins.length}-${selectedDay}`}
                        whenCreated={(map) => {
                          if (mapRef.current !== map) {
                            mapRef.current = map;
                          }
                        }}
                      >
                       <TileLayer
                         url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                         attribution="&copy; OpenStreetMap contributors"
                         maxZoom={19}
                       />
                                               {allItineraryData.map((place, idx) => (
                          <Marker 
                            key={idx} 
                            position={[place.location.lat, place.location.lng]} 
                            icon={createNumberedIcon(place.dayNumber, ['#ff6b35', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57'][place.dayIndex % 5])}
                            eventHandlers={{
                              click: () => setSelectedPlace(place)
                            }}
                          >
                            <Popup>
                              <div style={styles.popupContent}>
                                <strong>Day {place.dayNumber}: {place.name}</strong>
                                <br />
                                <span style={{ fontSize: '12px', opacity: 0.8 }}>
                                  {place.description?.substring(0, 100)}...
                                </span>
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                       {allRoutePositions.length > 1 && (
                         <Polyline 
                           positions={allRoutePositions}
                           color="#2196F3"
                           weight={3}
                           opacity={0.8}
                         />
                       )}
                       <MapControls mapRef={mapRef} />
                     </MapContainer>
                   </div>
                </div>

                {/* Day preview chips at bottom of map */}
                <div style={styles.previewContainer}>
                  {itins.slice(0, days).map((d, i) => (
                    <div
                      key={i}
                      style={{
                        ...styles.dayBox,
                        ...(selectedDay === i ? styles.activeDayBox : {}),
                      }}
                      onClick={() => handleDayChipClick(i)}
                    >
                      Day {i + 1}
                    </div>
                  ))}
                </div>
              </Fragment>
            )}
        </div>
      </div>

      {/* Mobile Details Section - Scrollable */}
      {!loading && days > 0 && itins.length > 0 && (
        <div style={styles.mobileDetailsSection}>
          <div style={styles.mobileDetailsHeader}>
            <h2 style={styles.mobileDetailsTitle}>📱 Stop Details & Food Picks</h2>
            <p style={styles.mobileDetailsSubtitle}>Detailed itinerary with food recommendations</p>
          </div>
          
          <div style={styles.mobileDaySelector}>
            {itins.map((day, index) => (
              <button
                key={index}
                style={{
                  ...styles.mobileDayButton,
                  ...(selectedDay === index ? styles.mobileActiveDayButton : {})
                }}
                onClick={() => handleDayChipClick(index)}
              >
                Day {index + 1}
              </button>
            ))}
          </div>

          <div style={styles.mobileItineraryList}>
            {itins[selectedDay]?.itinerary?.map((place, index) => (
              <div key={index} style={styles.mobilePlaceCard}>
                <div style={styles.mobilePlaceHeader}>
                  <div style={styles.mobilePlaceNumber}>{index + 1}</div>
                  <div style={styles.mobilePlaceInfo}>
                    <h3 style={styles.mobilePlaceName}>{place.name}</h3>
                    <p style={styles.mobilePlaceTime}>
                      {getTimeOfDay(index)} • {getDuration(index)}
                    </p>
                  </div>
                </div>
                
                {/* Food Recommendation */}
                <div style={styles.mobileFoodSection}>
                  <h4 style={styles.mobileFoodTitle}>🍽️ Nearby Food:</h4>
                  {place.nearbyFood && place.nearbyFood.length > 0 ? (
                    place.nearbyFood.map((restaurant, idx) => (
                      <div key={idx} style={styles.mobileFoodCard}>
                        <div style={styles.mobileFoodHeader}>
                          <span style={styles.mobileFoodName}>• {restaurant.name}</span>
                        </div>
                        <div style={styles.mobileFoodDetails}>
                          {restaurant.rating} • {restaurant.distance}
                        </div>
                        <div style={styles.mobileFoodDescription}>
                          {restaurant.description}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={styles.mobileFoodCard}>
                      <div style={styles.mobileFoodHeader}>
                        <span style={styles.mobileFoodName}>• {getFoodRecommendation(place).name}</span>
                      </div>
                      <div style={styles.mobileFoodDetails}>
                        {getFoodRecommendation(place).rating} • {getFoodRecommendation(place).distance}
                      </div>
                      <div style={styles.mobileFoodDescription}>
                        {getFoodRecommendation(place).description}
                      </div>
                    </div>
                  )}
                </div>

                {/* Hotels Recommendation */}
                <div style={styles.mobileFoodSection}>
                  <h4 style={styles.mobileFoodTitle}>🏨 Nearby Hotels:</h4>
                  {place.nearbyHotels && place.nearbyHotels.length > 0 ? (
                    place.nearbyHotels.map((hotel, idx) => (
                      <div key={idx} style={styles.mobileFoodCard}>
                        <div style={styles.mobileFoodHeader}>
                          <span style={styles.mobileFoodName}>• {hotel.name}</span>
                        </div>
                        <div style={styles.mobileFoodDetails}>
                          {hotel.rating} • {hotel.price} • {hotel.distance}
                        </div>
                        <div style={styles.mobileFoodDescription}>
                          {hotel.description}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={styles.mobileFoodCard}>
                      <div style={styles.mobileFoodHeader}>
                        <span style={styles.mobileFoodName}>• Local Hotel</span>
                      </div>
                      <div style={styles.mobileFoodDetails}>
                        4.0/5 • ₹2000/night • 500m away
                      </div>
                      <div style={styles.mobileFoodDescription}>
                        Comfortable accommodation with modern amenities
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Daily Itinerary Summary */}
          <div style={styles.mobileSummaryCard}>
            <h2 style={styles.mobileSummaryTitle}>📋 Daily Itinerary Summary</h2>
            <div style={styles.mobileSummaryContent}>
              <p style={styles.mobileSummaryDescription}>
                Day {selectedDay + 1}: {itins[selectedDay]?.title || 'Exploring the city'}
              </p>
              <ul style={styles.mobileSummaryList}>
                {itins[selectedDay]?.itinerary?.map((place, index) => (
                  <li key={index} style={styles.mobileSummaryItem}>
                    {place.name}
                  </li>
                ))}
              </ul>
                             <div style={styles.mobileCostInfo}>
                 Approx. Cost: ${itins[selectedDay]?.itinerary?.length * 50 || 0}
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ----------------------------- Inline <style> for keyframes/shadows -----------------------------
const StyleTag = () => (
  <style>{`
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pop {
      0% { transform: scale(0.95); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes floaty {
      0% { transform: translateY(0px); }
      50% { transform: translateY(-6px); }
      100% { transform: translateY(0px); }
    }
    .card-anim:hover {
      transform: translateY(-3px) scale(1.01);
      box-shadow: 0 16px 40px rgba(0,0,0,0.45);
    }
    .custom-numbered-marker {
      background: transparent !important;
      border: none !important;
    }
    .custom-numbered-marker div {
      transition: transform 140ms ease;
    }
    .custom-numbered-marker:hover div {
      transform: scale(1.1);
    }
    .dayChipsRow::-webkit-scrollbar {
      display: none;
    }
         .dayChipsRow {
       -ms-overflow-style: none;
       scrollbar-width: none;
     }
     .leaflet-popup-content-wrapper {
       background: rgba(0,0,0,0.9) !important;
       color: white !important;
       border-radius: 12px !important;
       border: 1px solid rgba(255,255,255,0.2) !important;
     }
     .leaflet-popup-tip {
       background: rgba(0,0,0,0.9) !important;
     }
     .leaflet-popup-close-button {
       color: white !important;
       font-size: 18px !important;
       font-weight: bold !important;
     }
  `}</style>
);

// ----------------------------- Styles -----------------------------
const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "radial-gradient(1200px 600px at 10% 0%, #1a2a3a 0%, #0b1220 40%, #060a14 100%)",
    color: "#e9f0ff",
    fontFamily: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },

  // ----- HERO -----
  hero: {
    padding: "28px 18px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))",
    "@media (max-width: 768px)": {
      textAlign: "center",
      padding: "20px 15px",
    },
  },
  heroRow: {
    maxWidth: 1280,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr 240px",
    gap: 24,
    alignItems: "center",
    "@media (max-width: 768px)": {
      gridTemplateColumns: "1fr",
      gap: 15,
    },
  },
  heroLeft: { 
    minWidth: 0,
    "@media (max-width: 768px)": {
      textAlign: "center",
    },
  },
  heroRight: {
    position: "relative",
    height: 72,
    "@media (max-width: 768px)": {
      display: "none",
    },
  },
  heroTitle: {
    fontSize: "2.2rem",
    fontWeight: 900,
    letterSpacing: 0.2,
    margin: 0,
    display: "flex",
    alignItems: "center",
    gap: 12,
    "@media (max-width: 768px)": {
      fontSize: "1.8rem",
      justifyContent: "center",
    },
  },
  glowText: {
    textShadow: "0 0 22px rgba(33,150,243,0.35)",
  },
  sparkle: {
    fontSize: 22,
    opacity: 0.9,
    animation: "floaty 3s ease-in-out infinite",
  },
  heroSubtitle: {
    margin: "8px 0 12px 0",
    fontSize: 15,
    opacity: 0.9,
    maxWidth: 900,
    "@media (max-width: 768px)": {
      textAlign: "center",
      fontSize: 14,
      margin: "10px auto",
      maxWidth: "100%",
    },
  },
  heroTips: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 2,
    "@media (max-width: 768px)": {
      justifyContent: "center",
      marginTop: 10,
    },
  },
  pulseDot: {
    position: "absolute",
    top: 12,
    right: 40,
    width: 14,
    height: 14,
    borderRadius: "50%",
    background:
      "radial-gradient(8px 8px at 50% 50%, rgba(76,175,80,1), rgba(76,175,80,0.2))",
    boxShadow: "0 0 24px rgba(76,175,80,0.55)",
    animation: "floaty 4s ease-in-out infinite",
  },
  pulseDotSecondary: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: "50%",
    background:
      "radial-gradient(6px 6px at 50% 50%, rgba(3,169,244,1), rgba(3,169,244,0.18))",
    boxShadow: "0 0 20px rgba(3,169,244,0.45)",
    animation: "floaty 3.5s ease-in-out infinite",
  },

  // ----- MAIN LAYOUT -----
  container: {
    display: "flex",
    gap: 20,
    padding: 20,
    flex: 1,
    minHeight: 0,
    maxWidth: 1280,
    margin: "0 auto",
    width: "100%",
    "@media (max-width: 768px)": {
      flexDirection: "column",
      padding: "15px",
      gap: "15px",
    },
  },

  // ----- LEFT PANEL -----
  leftPanel: {
    width: "38%",
    minWidth: 360,
    maxWidth: 560,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    backdropFilter: "blur(12px)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04))",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
    overflow: "hidden",
    boxSizing: "border-box",
    "@media (max-width: 768px)": {
      width: "100%",
      maxWidth: "100%",
      marginBottom: 0,
      order: 2,
    },
  },
     form: { display: "flex", flexDirection: "column", gap: 10, width: "100%" },
   row: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, width: "100%" },
  input: {
    height: 44,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    outline: "none",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.25))",
    color: "#fff",
    fontWeight: 500,
         boxShadow: "inset 0 4px 18px rgba(0,0,0,0.25)",
     width: "100%",
     boxSizing: "border-box",
   },
  button: {
    height: 46,
    borderRadius: 10,
    border: "none",
    background:
      "linear-gradient(135deg, rgba(63,81,181,0.95), rgba(33,150,243,0.95))",
    color: "#fff",
    fontWeight: 800,
    letterSpacing: 0.4,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(33,150,243,0.35)",
  },
  loadingWrap: {
    marginTop: 6,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
  },
  loadingCards: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 8,
  },
  loadingCard: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.25)",
    borderRadius: 14,
    padding: 10,
  },

  meta: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    fontSize: 14,
    padding: "10px 12px",
    borderRadius: 12,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04))",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  metaKey: { opacity: 0.8, marginRight: 6 },

  dayChipsRow: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 2,
    paddingRight: 4,
    marginRight: -4,
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    "&::-webkit-scrollbar": {
      display: "none"
    }
  },
  dayChip: {
    padding: "8px 12px",
    borderRadius: 999,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.05))",
    border: "1px solid rgba(255,255,255,0.12)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 13,
    transition: "transform 160ms ease",
  },
  dayChipActive: {
    background:
      "linear-gradient(135deg, rgba(63,81,181,0.92), rgba(33,150,243,0.92))",
    borderColor: "rgba(63,81,181,0.95)",
    boxShadow: "0 6px 18px rgba(63,81,181,0.45)",
    transform: "translateY(-1px)",
  },

  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 4,
  },
  card: {
    position: "relative",
    height: 186,
    borderRadius: 16,
    overflow: "hidden",
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    transform: "translateZ(0)",
    transition: "transform 200ms ease, box-shadow 200ms ease",
  },
  cardImage: {
    position: "absolute",
    inset: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: "saturate(1.05) contrast(1.05)",
    transform: "scale(1.02)",
  },
  cardOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.18) 60%, rgba(0,0,0,0) 100%)",
  },
  cardContent: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    color: "#fff",
  },
  cardTitle: { fontWeight: 900, fontSize: 16, marginBottom: 4 },
  cardDesc: {
    fontSize: 12,
    opacity: 0.92,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cardCta: {
    marginTop: 6,
    fontSize: 12,
    opacity: 0.95,
    textDecoration: "underline",
  },

     emptyHint: {
     opacity: 0.9,
     fontSize: 14,
     padding: 12,
     borderRadius: 12,
     background:
       "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04))",
     border: "1px solid rgba(255,255,255,0.12)",
   },



  // ----- RIGHT PANEL -----
  rightPanel: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    position: "relative",
    borderRadius: 22,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.12)",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.35))",
    boxShadow: "0 16px 50px rgba(0,0,0,0.45)",
    "@media (max-width: 768px)": {
      width: "100%",
      minHeight: "300px",
      order: 3,
    },
  },

  starfield: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "radial-gradient(1px 1px at 40% 30%, rgba(255,255,255,0.35), rgba(255,255,255,0)), radial-gradient(1px 1px at 60% 70%, rgba(255,255,255,0.28), rgba(255,255,255,0))",
    backgroundRepeat: "no-repeat",
    pointerEvents: "none",
    opacity: 0.4,
  },

  rightEmptyWrap: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: 20,
  },
  rightEmptyCard: {
    width: "min(560px, 92%)",
    borderRadius: 16,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04))",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: 18,
    textAlign: "center",
    animation: "pop 240ms ease",
  },
  rightEmptyTitle: { fontWeight: 900, fontSize: 20, marginBottom: 6 },
  rightEmptySub: { opacity: 0.9, fontSize: 14 },
  rightEmptyHintRow: {
    display: "flex",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    flexWrap: "wrap",
    fontSize: 13,
    opacity: 0.95,
  },
  rightEmptyHintChip: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
  },

  // ----- DETAIL PANEL -----
  detailPanel: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    background:
      "linear-gradient(180deg, rgba(6,10,21,0.92) 0%, rgba(10,15,28,0.95) 50%, rgba(10,15,28,0.98) 100%)",
    color: "#fff",
    animation: "fadeIn 200ms ease",
  },
  detailHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.25))",
  },
  backBtn: {
    height: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04))",
    color: "#fff",
    cursor: "pointer",
  },
  detailTitle: { fontWeight: 900, fontSize: 18 },

  detailBody: {
    display: "grid",
    gridTemplateColumns: "1.15fr 1fr",
    gap: 14,
    padding: 14,
    height: "100%",
    boxSizing: "border-box",
    minHeight: 0,
  },

  detailLeft: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    gap: 12,
  },

  detailHeroImageWrap: {
    position: "relative",
    borderRadius: 14,
    overflow: "hidden",
    height: 240,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.3)",
  },
  detailHeroImage: {
    position: "absolute",
    inset: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    transform: "scale(1.02)",
    filter: "saturate(1.05) contrast(1.05)",
  },
  detailHeroOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.45))",
  },
  detailHeroLabel: {
    position: "absolute",
    left: 12,
    bottom: 12,
    padding: "6px 10px",
    borderRadius: 10,
    backdropFilter: "blur(4px)",
    background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 12,
  },

  detailText: {
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.04))",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 14,
    overflow: "auto",
    minHeight: 0,
  },

  detailSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px solid rgba(255,255,255,0.1)",
  },
  detailSectionTitle: {
    margin: "0 0 12px 0",
    fontSize: "16px",
    fontWeight: "700",
    color: "#fff",
  },
  detailCard: {
    background: "rgba(255,255,255,0.05)",
    borderRadius: "12px",
    padding: "15px",
    border: "1px solid rgba(255,255,255,0.1)",
    marginBottom: "8px",
  },
  detailCardHeader: {
    marginBottom: "6px",
  },
  detailCardName: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#fff",
  },
  detailCardDetails: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.7)",
    marginBottom: "6px",
  },
  detailCardDescription: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.8)",
    lineHeight: "1.4",
  },

  detailActionsRow: {
    display: "flex",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },

  mapsButton: {
    display: "inline-block",
    padding: "10px 12px",
    background:
      "linear-gradient(135deg, rgba(33,150,243,0.95), rgba(0,188,212,0.95))",
    color: "#fff",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 800,
    boxShadow: "0 10px 24px rgba(33,150,243,0.35)",
  },

  secondaryButton: {
    display: "inline-block",
    padding: "10px 12px",
    background:
      "linear-gradient(135deg, rgba(76,175,80,0.95), rgba(0,200,83,0.95))",
    color: "#fff",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 800,
    boxShadow: "0 10px 24px rgba(0,200,83,0.35)",
  },

  mapWrap: {
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.04))",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    overflow: "hidden",
    minHeight: 0,
  },
  mapFrame: {
    border: "none",
    width: "100%",
    height: "100%",
    minHeight: 360,
  },

  // ----- MAP SECTION -----
  mapSection: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "100%",
    backgroundColor: "#0b132b",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
  },
  mapHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px",
  },
  mapTitle: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#fff",
    margin: 0,
  },
  mapControls: {
    display: "flex",
    gap: "8px",
  },
  mapControlBtn: {
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04))",
    color: "#fff",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 500,
    transition: "all 140ms ease",
    ":hover": {
      background: "linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.08))",
      transform: "translateY(-1px)",
    },
  },
  googleMapsBtn: {
    padding: "10px 16px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, rgba(33,150,243,0.95), rgba(0,188,212,0.95))",
    color: "#fff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 700,
    boxShadow: "0 6px 18px rgba(33,150,243,0.35)",
    transition: "all 140ms ease",
    ":hover": {
      transform: "translateY(-1px)",
      boxShadow: "0 8px 24px rgba(33,150,243,0.45)",
    },
  },
  mapContainer: {
    flex: 1,
    padding: "0",
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
    width: "100%",
    height: "100%",
    backgroundColor: "#fff",
  },
  popupContent: {
    maxWidth: "250px",
    fontSize: "14px",
    padding: "8px",
    textAlign: "center",
  },

  // ----- PREVIEW CONTAINER -----
  previewContainer: {
    position: "absolute",
    bottom: 8,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 8,
    padding: "8px 12px",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.36), rgba(0,0,0,0.28))",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    maxWidth: "95%",
    overflowX: "auto",
    boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
    backdropFilter: "blur(6px)",
    zIndex: 10,
  },
  dayBox: {
    padding: "8px 12px",
    borderRadius: 10,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.05))",
    border: "1px solid rgba(255,255,255,0.12)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 12,
    color: "#fff",
    transition: "transform 140ms ease",
  },
  activeDayBox: {
    background:
      "linear-gradient(135deg, rgba(63,81,181,0.9), rgba(33,150,243,0.9))",
    borderColor: "rgba(63,81,181,0.95)",
    boxShadow: "0 6px 18px rgba(63,81,181,0.45)",
    transform: "translateY(-1px)",
  },
  detailsButton: {
    padding: "8px 16px",
    borderRadius: "8px",
    border: "none",
    background: "linear-gradient(135deg, rgba(76,175,80,0.95), rgba(0,200,83,0.95))",
    color: "#fff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
    boxShadow: "0 4px 12px rgba(76,175,80,0.35)",
    transition: "all 140ms ease",
    ":hover": {
      transform: "translateY(-1px)",
      boxShadow: "0 6px 16px rgba(76,175,80,0.45)",
    },
  },

  // ----- MOBILE DETAILS SECTION -----
  mobileDetailsSection: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "40px 20px",
    width: "100%",
    boxSizing: "border-box",
  },
  mobileDetailsHeader: {
    textAlign: "center",
    marginBottom: "30px",
  },
  mobileDetailsTitle: {
    fontSize: "2rem",
    fontWeight: 900,
    margin: "0 0 8px 0",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  mobileDetailsSubtitle: {
    fontSize: "16px",
    opacity: 0.8,
    margin: 0,
  },
  mobileDaySelector: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
    marginBottom: "30px",
    flexWrap: "wrap",
  },
  mobileDayButton: {
    padding: "12px 20px",
    border: "2px solid rgba(255,255,255,0.2)",
    borderRadius: "25px",
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: "14px",
    fontWeight: "600",
    transition: "all 200ms ease",
    backdropFilter: "blur(10px)",
  },
  mobileActiveDayButton: {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    borderColor: "rgba(255,255,255,0.3)",
    boxShadow: "0 8px 25px rgba(102,126,234,0.4)",
    transform: "translateY(-2px)",
  },
  mobileItineraryList: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    marginBottom: "40px",
  },
  mobilePlaceCard: {
    background: "rgba(255,255,255,0.08)",
    borderRadius: "16px",
    padding: "20px",
    border: "1px solid rgba(255,255,255,0.1)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
    transition: "transform 200ms ease",
  },
  mobilePlaceHeader: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
    marginBottom: "15px",
  },
  mobilePlaceNumber: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    fontWeight: "700",
    boxShadow: "0 4px 15px rgba(102,126,234,0.4)",
  },
  mobilePlaceInfo: {
    flex: 1,
  },
  mobilePlaceName: {
    margin: "0 0 5px 0",
    fontSize: "18px",
    fontWeight: "700",
    color: "#fff",
  },
  mobilePlaceTime: {
    margin: 0,
    fontSize: "14px",
    color: "rgba(255,255,255,0.7)",
  },
  mobilePlaceDescription: {
    marginBottom: "20px",
  },
  mobilePlaceTimeInfo: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.8)",
    padding: "8px 12px",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  mobileTimeLabel: {
    fontWeight: "600",
    color: "#667eea",
    marginRight: "8px",
  },
  mobileFoodSection: {
    borderTop: "1px solid rgba(255,255,255,0.1)",
    paddingTop: "15px",
  },
  mobileFoodTitle: {
    margin: "0 0 12px 0",
    fontSize: "16px",
    fontWeight: "700",
    color: "#fff",
  },
  mobileFoodCard: {
    background: "rgba(255,255,255,0.05)",
    borderRadius: "12px",
    padding: "15px",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  mobileFoodHeader: {
    marginBottom: "6px",
  },
  mobileFoodName: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#fff",
  },
  mobileFoodDetails: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.7)",
    marginBottom: "6px",
  },
  mobileFoodDescription: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.8)",
    lineHeight: "1.4",
  },
  mobileSummaryCard: {
    background: "rgba(255,255,255,0.08)",
    borderRadius: "16px",
    padding: "25px",
    border: "1px solid rgba(255,255,255,0.1)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  },
  mobileSummaryTitle: {
    margin: "0 0 20px 0",
    fontSize: "20px",
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  mobileSummaryContent: {
    color: "rgba(255,255,255,0.9)",
  },
  mobileSummaryDescription: {
    margin: "0 0 15px 0",
    fontSize: "16px",
    lineHeight: "1.5",
    textAlign: "center",
  },
  mobileSummaryList: {
    margin: "0 0 20px 0",
    paddingLeft: "25px",
  },
  mobileSummaryItem: {
    fontSize: "15px",
    marginBottom: "8px",
    lineHeight: "1.4",
  },
  mobileCostInfo: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#667eea",
    padding: "15px 0",
    borderTop: "1px solid rgba(255,255,255,0.1)",
    marginTop: "15px",
    textAlign: "center",
  },
};




<style>{`
  @media (max-width: 768px) {
    .container { 
      flex-direction: column !important; 
      padding: 15px !important;
      gap: 15px !important;
    }
    .left-panel {
      width: 100% !important;
      max-width: 100% !important;
      margin-bottom: 0 !important;
      order: 2 !important;
    }
    .right-panel {
      width: 100% !important;
      min-height: 300px !important;
      order: 3 !important;
    }
    .form-row { 
      grid-template-columns: 1fr !important; 
      gap: 12px !important;
    }
    .cards-grid { 
      grid-template-columns: 1fr !important; 
    }
    
    /* Mobile Hero Styles */
    .hero {
      text-align: center !important;
      padding: 20px 15px !important;
      order: 1 !important;
    }
    .heroRow {
      grid-template-columns: 1fr !important;
      gap: 15px !important;
    }
    .heroRight {
      display: none !important;
    }
    .heroTitle {
      font-size: 1.8rem !important;
      justify-content: center !important;
    }
    .heroSubtitle {
      text-align: center !important;
      font-size: 14px !important;
      margin: 10px auto !important;
      max-width: 100% !important;
    }
    .heroTips {
      justify-content: center !important;
      margin-top: 10px !important;
    }

    /* Mobile Form Styles */
    .form {
      margin-bottom: 20px !important;
    }
    .input {
      height: 50px !important;
      font-size: 16px !important;
    }
    .button {
      height: 50px !important;
      font-size: 16px !important;
    }

    /* Mobile Map Styles */
    .mapSection {
      position: relative !important;
      height: 300px !important;
      margin-bottom: 20px !important;
    }
    .mapHeader {
      padding: 12px 15px !important;
    }
    .mapTitle {
      font-size: 16px !important;
    }
    .mapControls {
      gap: 6px !important;
    }
    .mapControlBtn {
      padding: 6px 10px !important;
      font-size: 11px !important;
    }
    .googleMapsBtn {
      padding: 8px 12px !important;
      font-size: 12px !important;
    }

    /* Mobile Details Section */
    .mobileDetailsSection {
      order: 4 !important;
      padding: 20px 15px !important;
      margin-top: 0 !important;
    }
    .mobileDetailsHeader {
      margin-bottom: 20px !important;
    }
    .mobileDetailsTitle {
      font-size: 1.5rem !important;
    }
    .mobileDaySelector {
      margin-bottom: 20px !important;
    }
    .mobileDayButton {
      padding: 10px 16px !important;
      font-size: 13px !important;
    }
    .mobilePlaceCard {
      margin-bottom: 15px !important;
      padding: 15px !important;
    }
    .mobilePlaceNumber {
      width: 35px !important;
      height: 35px !important;
      font-size: 16px !important;
    }
    .mobilePlaceName {
      font-size: 16px !important;
    }
    .mobilePlaceTime {
      font-size: 13px !important;
    }
    .mobileFoodSection {
      margin-top: 12px !important;
      padding-top: 12px !important;
    }
    .mobileFoodTitle {
      font-size: 14px !important;
      margin-bottom: 10px !important;
    }
    .mobileFoodCard {
      padding: 12px !important;
      margin-bottom: 8px !important;
    }
    .mobileFoodName {
      font-size: 14px !important;
    }
    .mobileFoodDetails {
      font-size: 12px !important;
    }
    .mobileFoodDescription {
      font-size: 12px !important;
    }
    .mobileSummaryCard {
      padding: 20px !important;
    }
    .mobileSummaryTitle {
      font-size: 18px !important;
    }
    .mobileSummaryDescription {
      font-size: 14px !important;
    }
    .mobileSummaryItem {
      font-size: 14px !important;
    }
    .mobileCostInfo {
      font-size: 14px !important;
    }

    /* Hide desktop elements on mobile */
    .meta, .dayChipsRow, .cardsGrid, .emptyHint {
      display: none !important;
    }

    /* Show mobile elements */
    .mobileDetailsSection {
      display: block !important;
    }
  }
`}</style>


export default Home;