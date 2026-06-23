"use client";

import { useEffect, useState } from "react";
import { MapPin, Star, ExternalLink } from "lucide-react";
import { getNearby, apiError } from "@/lib/api";
import { Badge, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import type { Place } from "@/lib/types";

export default function NearbyPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords({ lat: 40.7128, lon: -74.006 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setCoords({ lat: 40.7128, lon: -74.006 })
    );
  }, []);

  useEffect(() => {
    if (!coords) return;
    setLoading(true);
    getNearby(coords.lat, coords.lon)
      .then((data) => {
        setPlaces(data.places);
        setSource(data.source);
        setError(null);
      })
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [coords]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Nearby venues</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gyms, studios and wellness spots around you.</p>
        </div>
        {source && <Badge tone={source === "openstreetmap" ? "green" : "amber"}>{source === "openstreetmap" ? "Live OpenStreetMap" : "Simulated"}</Badge>}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => setCoords((c) => (c ? { ...c } : c))} />
      ) : !places.length ? (
        <EmptyState icon={<MapPin className="h-7 w-7" />} title="No venues found" description="Try again later or allow location access." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((place) => (
            <Card key={`${place.name}-${place.lat}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{place.name}</p>
                  <p className="text-xs text-slate-400">{place.type}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-sm text-amber-500"><Star className="h-4 w-4 fill-current" />{place.rating.toFixed(1)}</span>
              </div>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{place.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-400">{(place.distance_m / 1000).toFixed(1)} km away</span>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=16/${place.lat}/${place.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
                >
                  Map <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
