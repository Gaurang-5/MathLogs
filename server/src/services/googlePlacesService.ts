import axios from 'axios';

export interface GooglePlaceResult {
    placeId: string;
    name: string;
    formattedAddress?: string;
    rating?: number;
    userRatingsTotal?: number;
}

export interface GooglePlaceDetails {
    placeId: string;
    name: string;
    formattedAddress?: string;
    url?: string;
    mapsUrl?: string;
    rating?: number;
    userRatingsTotal?: number;
    reviews?: any[];
    photos?: any[];
}

export async function searchGooglePlaces(query: string): Promise<GooglePlaceResult[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        console.warn('GOOGLE_PLACES_API_KEY not set');
        return [];
    }

    try {
        const response = await axios.get(
            `https://maps.googleapis.com/maps/api/place/textsearch/json`,
            {
                params: {
                    query,
                    key: apiKey
                }
            }
        );

        if (response.data.status !== 'OK' || !Array.isArray(response.data.results)) {
            return [];
        }

        return response.data.results.map((p: any) => ({
            placeId: p.place_id,
            name: p.name,
            formattedAddress: p.formatted_address,
            rating: p.rating,
            userRatingsTotal: p.user_ratings_total
        }));
    } catch (error) {
        console.error('Error fetching Google Places:', error);
        return [];
    }
}

export async function fetchGooglePlaceDetails(placeId: string): Promise<GooglePlaceDetails | null> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        console.warn('GOOGLE_PLACES_API_KEY not set');
        return null;
    }

    try {
        const response = await axios.get(
            `https://maps.googleapis.com/maps/api/place/details/json`,
            {
                params: {
                    place_id: placeId,
                    fields: 'place_id,name,formatted_address,url,rating,user_ratings_total,reviews,photos',
                    key: apiKey
                }
            }
        );

        if (response.data.status !== 'OK' || !response.data.result) {
            return null;
        }

        const p = response.data.result;
        return {
            placeId: p.place_id,
            name: p.name,
            formattedAddress: p.formatted_address,
            url: p.url,
            mapsUrl: p.url,
            rating: p.rating,
            userRatingsTotal: p.user_ratings_total,
            reviews: p.reviews || [],
            photos: p.photos || []
        };
    } catch (error) {
        console.error('Error fetching Google Place Details:', error);
        return null;
    }
}
