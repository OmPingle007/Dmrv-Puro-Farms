import { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in Leaflet with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function LocationMarker({ position, setPosition }: { position: L.LatLng | null, setPosition: (p: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return position === null ? null : (
    <Marker position={position}></Marker>
  );
}

interface LocationPickerMapProps {
  onLocationSelect: (lat: number, lng: number) => void;
  initialLat?: number;
  initialLng?: number;
}

export default function LocationPickerMap({ onLocationSelect, initialLat, initialLng }: LocationPickerMapProps) {
  const [position, setPosition] = useState<L.LatLng | null>(
    initialLat && initialLng ? new L.LatLng(initialLat, initialLng) : null
  );

  const handleSetPosition = useCallback((pos: L.LatLng) => {
    setPosition(pos);
    onLocationSelect(pos.lat, pos.lng);
  }, [onLocationSelect]);

  useEffect(() => {
    if (!position) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handleSetPosition(new L.LatLng(pos.coords.latitude, pos.coords.longitude));
        },
        () => {
          // Default to Central India
          handleSetPosition(new L.LatLng(21.1458, 79.0882));
        }
      );
    }
  }, [position, handleSetPosition]);

  return (
    <div className="w-full h-48 sm:h-64 rounded-lg overflow-hidden border border-slate-300 z-0">
      {position ? (
        <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={position} setPosition={handleSetPosition} />
        </MapContainer>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-500">
          Loading map...
        </div>
      )}
    </div>
  );
}
