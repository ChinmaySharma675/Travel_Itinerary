// src/services/gemini.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY);

export async function generateItinerary(city, budget, days) {
    // Check if API key exists
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey) {
        console.error("🔑 No Gemini API key found! Please add REACT_APP_GEMINI_API_KEY to your .env file");
        throw new Error("Gemini API key is missing. Please check your .env file.");
    }
    
    console.log("🔑 API key found, length:", apiKey.length);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // how many days we allow per chunk
    const CHUNK_SIZE = 7;

    let fullItinerary = [];

    try {
        console.log(`🚀 Generating itinerary for ${city}, ${days} days, budget: ${budget}`);
        
        for (let start = 1; start <= days; start += CHUNK_SIZE) {
            const end = Math.min(start + CHUNK_SIZE - 1, days);
            console.log(`📅 Processing days ${start} to ${end}`);

            const prompt = `Generate a detailed day-by-day travel itinerary for ${city} with a budget of ${budget}.

Create plans ONLY for days ${start} to ${end}.

Each place must include a long detailed description (history, cultural significance, architecture, interesting facts, and visitor tips).

IMPORTANT: Use REAL and ACCURATE coordinates (latitude and longitude) for each location. Research actual coordinates for famous landmarks, museums, parks, and attractions in ${city}.

ALSO IMPORTANT: For each place, include 2-3 nearby restaurants/food shops and 1-2 nearby hotels with real names, ratings, and prices.

CRITICAL: Return ONLY valid JSON in this exact structure, with NO additional text, explanations, or markdown formatting:

[
  {
    "title": "Day ${start}: Short Title",
    "itinerary": [
      {
        "name": "Place 1",
        "description": "A long, detailed description of the place including its history, cultural significance, architecture, interesting facts, and visitor tips.",
        "location": { "lat": 28.6139, "lng": 77.2090, "label": "Place 1 Label" },
        "nearbyFood": [
          {
            "name": "Restaurant Name",
            "rating": "4.5/5",
            "distance": "300m away",
            "description": "Brief description of the restaurant and its cuisine"
          }
        ],
        "nearbyHotels": [
          {
            "name": "Hotel Name",
            "rating": "4.3/5",
            "price": "₹2000/night",
            "distance": "500m away",
            "description": "Brief description of the hotel"
          }
        ]
      }
    ]
  }
]

Do not include any text before or after the JSON array. Start with [ and end with ].`;

            console.log(`🤖 Sending request to Gemini API...`);
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            console.log(`📝 Raw API response:`, text.substring(0, 500) + "...");

            // More robust JSON extraction
            let cleaned = text.trim();
            
            // Remove markdown code blocks
            cleaned = cleaned.replace(/```json\s*/g, "").replace(/```\s*/g, "");
            
            // Find the first [ and last ] to extract just the JSON array
            const firstBracket = cleaned.indexOf('[');
            const lastBracket = cleaned.lastIndexOf(']');
            
            if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                cleaned = cleaned.substring(firstBracket, lastBracket + 1);
            }
            
            console.log(`🧹 Cleaned response:`, cleaned.substring(0, 300) + "...");
            
            let chunk;
            try {
                chunk = JSON.parse(cleaned);
            } catch (parseError) {
                console.error(`❌ JSON parse error for chunk ${start}-${end}:`, parseError.message);
                console.error(`❌ Problematic text:`, cleaned.substring(0, 500));
                
                // Try to find and extract valid JSON more aggressively
                const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    try {
                        chunk = JSON.parse(jsonMatch[0]);
                        console.log(`✅ Recovered JSON using regex match`);
                    } catch (recoveryError) {
                        console.error(`❌ Recovery failed:`, recoveryError.message);
                        throw new Error(`JSON parsing failed for days ${start}-${end}: ${parseError.message}`);
                    }
                } else {
                    throw new Error(`No valid JSON array found in response for days ${start}-${end}`);
                }
            }
            console.log(`✅ Parsed chunk for days ${start}-${end}:`, chunk.length, "days");
            
            // Validate chunk structure
            if (!Array.isArray(chunk)) {
                throw new Error(`Expected array but got ${typeof chunk} for days ${start}-${end}`);
            }
            
            // Validate each day has the required structure
            chunk.forEach((day, index) => {
                if (!day.title || !day.itinerary || !Array.isArray(day.itinerary)) {
                    throw new Error(`Invalid day structure at index ${index} in chunk ${start}-${end}`);
                }
                
                day.itinerary.forEach((place, placeIndex) => {
                    if (!place.name || !place.description || !place.location || 
                        typeof place.location.lat !== 'number' || typeof place.location.lng !== 'number') {
                        throw new Error(`Invalid place structure at place ${placeIndex} in day ${index} of chunk ${start}-${end}`);
                    }
                });
            });

            fullItinerary = [...fullItinerary, ...chunk];
        }

        console.log(`🎉 Successfully generated ${fullItinerary.length} days of itinerary`);
        
        // Final validation - ensure we got the expected number of days
        if (fullItinerary.length !== days) {
            console.warn(`⚠️ Warning: Expected ${days} days but got ${fullItinerary.length} days`);
        }
        
        return fullItinerary;
    } catch (err) {
        console.error("❌ Error generating itinerary:", err);
        console.error("❌ Error details:", {
            message: err.message,
            stack: err.stack,
            name: err.name
        });
        
        // Check if it's an API key issue
        if (err.message?.includes('API_KEY') || err.message?.includes('401') || err.message?.includes('authentication')) {
            console.error("🔑 This appears to be an API key issue. Please check your REACT_APP_GEMINI_API_KEY in .env file");
        }
        
        return [
            {
                title: "Day 1: Default Plan (API Error)",
                itinerary: [
                    {
                        name: "Fallback Spot",
                        description: `Default location because AI parsing failed. Error: ${err.message}`,
                        location: { lat: 28.6139, lng: 77.2090, label: "Fallback Spot" }
                    }
                ]
            }
        ];
    }
}
