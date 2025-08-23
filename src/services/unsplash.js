// src/services/unsplash.js
const UNSPLASH_ACCESS_KEY = process.env.REACT_APP_UNSPLASH_KEY;

export async function getPlaceImage(query) {
    try {
        const res = await fetch(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&client_id=${UNSPLASH_ACCESS_KEY}&orientation=landscape&per_page=1`
        );

        if (!res.ok) {
            throw new Error("Unsplash fetch failed");
        }

        const data = await res.json();
        if (data.results.length > 0) {
            return data.results[0].urls.regular;
        } else {
            // fallback placeholder image
            return "https://via.placeholder.com/600x400?text=No+Image";
        }
    } catch (error) {
        console.error("Unsplash error:", error);
        return "https://via.placeholder.com/600x400?text=No+Image";
    }
}
