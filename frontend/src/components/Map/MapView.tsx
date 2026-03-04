import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { FeatureCollection, Polygon } from 'geojson';
import type { HexFeatureProps } from '../../types';

const SOURCE_ID = 'hexes';
const FILL_LAYER = 'hex-fill';
const LINE_LAYER = 'hex-line';
const SELECTED_LAYER = 'hex-selected';

interface MapViewProps {
  token: string;
  geoJson: FeatureCollection<Polygon, HexFeatureProps> | null;
  selectedHexId: string | null;
  onHexClick: (hexId: string) => void;
}

export default function MapView({ token, geoJson, selectedHexId, onHexClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const onHexClickRef = useRef(onHexClick);
  onHexClickRef.current = onHexClick;

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [10, 48],
      zoom: 4,
      minZoom: 3,
      maxZoom: 8,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: FILL_LAYER,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': 1,
        },
      });

      map.addLayer({
        id: LINE_LAYER,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': ['get', 'lineColor'],
          'line-width': ['get', 'lineWidth'],
        },
      });

      map.addLayer({
        id: SELECTED_LAYER,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#ffffff',
          'line-width': 3,
        },
        filter: ['==', ['get', 'hexId'], ''],
      });

      map.on('click', FILL_LAYER, (e) => {
        if (e.features && e.features[0]) {
          const props = e.features[0].properties;
          if (props?.hexId) onHexClickRef.current(props.hexId);
        }
      });

      map.on('mouseenter', FILL_LAYER, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', FILL_LAYER, () => {
        map.getCanvas().style.cursor = '';
      });

      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [token]);

  // Update GeoJSON data when map is loaded OR geoJson changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !geoJson) return;

    const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geoJson);
    }
  }, [geoJson, mapLoaded]);

  // Update selected hex filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    map.setFilter(SELECTED_LAYER, ['==', ['get', 'hexId'], selectedHexId ?? '']);
  }, [selectedHexId, mapLoaded]);

  return (
    <div ref={containerRef} className="w-full h-full" />
  );
}
