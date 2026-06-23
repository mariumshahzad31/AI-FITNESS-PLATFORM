import { Router } from 'express';
import axios from 'axios';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use(authRequired);

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

const DESCRIPTIONS = {
  Gym: 'Strength, cardio and recovery equipment with coaching on demand.',
  Wellness: 'Group classes, mobility training and personal coaching.',
  Outdoor: 'Open-air running and walking area for active recovery.',
  Pool: 'Lap swimming and aqua fitness for low-impact training.',
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Deterministic simulated venues around a coordinate (used as a fallback). */
function simulatedPlaces(lat, lon) {
  const seeds = [
    { name: 'CoreFit Gym', type: 'Gym', dLat: 0.004, dLon: 0.003, rating: 4.8 },
    { name: 'Pulse Health Studio', type: 'Wellness', dLat: -0.003, dLon: 0.005, rating: 4.6 },
    { name: 'Green Track Park', type: 'Outdoor', dLat: 0.006, dLon: -0.004, rating: 4.7 },
    { name: 'AquaLife Pool', type: 'Pool', dLat: -0.005, dLon: -0.006, rating: 4.5 },
    { name: 'Iron Temple Strength', type: 'Gym', dLat: 0.008, dLon: 0.002, rating: 4.4 },
  ];
  return seeds
    .map((s) => {
      const placeLat = lat + s.dLat;
      const placeLon = lon + s.dLon;
      return {
        name: s.name,
        type: s.type,
        lat: placeLat,
        lng: placeLon,
        rating: s.rating,
        distance_m: haversine(lat, lon, placeLat, placeLon),
        description: DESCRIPTIONS[s.type],
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m);
}

async function overpassPlaces(lat, lon) {
  const radius = 3000;
  const queryStr = `[out:json][timeout:8];(
    node["leisure"="fitness_centre"](around:${radius},${lat},${lon});
    node["leisure"="sports_centre"](around:${radius},${lat},${lon});
    node["leisure"="swimming_pool"](around:${radius},${lat},${lon});
  );out body 20;`;
  const { data } = await axios.post(OVERPASS_URL, queryStr, {
    headers: { 'Content-Type': 'text/plain' },
    timeout: 9000,
  });
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  return elements
    .filter((el) => el.lat && el.lon && el.tags?.name)
    .map((el) => {
      const type = el.tags.leisure === 'swimming_pool' ? 'Pool' : el.tags.leisure === 'sports_centre' ? 'Wellness' : 'Gym';
      return {
        name: el.tags.name,
        type,
        lat: el.lat,
        lng: el.lon,
        rating: 4.5,
        distance_m: haversine(lat, lon, el.lat, el.lon),
        description: DESCRIPTIONS[type],
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 10);
}

// GET /api/nearby?lat=&lon=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat) || 40.7128;
    const lon = Number(req.query.lon) || -74.006;

    // Try real OpenStreetMap data; fall back to deterministic simulated venues
    // (public Overpass instances rate-limit aggressively).
    try {
      const places = await overpassPlaces(lat, lon);
      if (places.length > 0) {
        return res.json({ places, source: 'openstreetmap' });
      }
    } catch (err) {
      console.warn('Overpass lookup failed, using simulated places:', err.message);
    }
    return res.json({ places: simulatedPlaces(lat, lon), source: 'simulated' });
  })
);

export default router;
