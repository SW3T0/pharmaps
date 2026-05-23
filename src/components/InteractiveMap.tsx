import React, { useEffect, useRef, useState } from 'react';
import type { RouteStop, Pharmacy } from '../types';
import { Map, Marker, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CheckCircle2, AlertTriangle, ChevronUp, ChevronDown, Milestone, Trash2, Navigation } from 'lucide-react';

interface InteractiveMapProps {
  activeRouteStops: RouteStop[];
  pharmacies: Pharmacy[];
  polyline?: string;
  isOnline: boolean;
  onUpdateStopStatus: (stopId: string, status: 'pending' | 'completed' | 'skipped', notes?: string) => void;
  onReorderStops: (newStops: RouteStop[]) => void;
  onDeleteStop?: (stopId: string) => void;
}

// Crea el HTML del marcador de parada de ruta (numerado, con label)
function createRouteMarkerEl(order: number, name: string, status: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = `route-marker-wrapper status-${status}`;

  // Pin con número
  const pin = document.createElement('div');
  pin.className = 'route-marker-pin';
  pin.innerHTML = `<span>${order}</span>`;

  // Label flotante
  const label = document.createElement('div');
  label.className = 'route-marker-label';
  label.textContent = name.length > 22 ? name.substring(0, 20) + '…' : name;

  wrapper.appendChild(pin);
  wrapper.appendChild(label);
  return wrapper;
}

// Crea el HTML del marcador de farmacia del catálogo (punto pequeño)
function createCatalogMarkerEl(): HTMLElement {
  const dot = document.createElement('div');
  dot.className = 'catalog-marker-dot';
  return dot;
}

// Crea el HTML del popup premium
function createPopupHTML(pharmacy: Pharmacy, stopOrder?: number, status?: string): string {
  const statusLabel = status === 'completed' ? 'Visita realizada' :
                      status === 'skipped' ? 'Parada omitida' :
                      status === 'pending' ? 'Pendiente de visita' : '';
  const statusClass = status || '';
  const orderBadge = stopOrder ? `<span class="popup-order">#${stopOrder}</span>` : '';
  const statusBadge = statusLabel ? `<span class="popup-status popup-status-${statusClass}">${statusLabel}</span>` : '';
  const phone = pharmacy.phone ? `<div class="popup-row"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg><span>${pharmacy.phone}</span></div>` : '';

  return `
    <div class="pm-popup">
      <div class="popup-header">
        ${orderBadge}
        <h3 class="popup-title">${pharmacy.name}</h3>
      </div>
      <div class="popup-body">
        <div class="popup-row">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <span>${pharmacy.address}</span>
        </div>
        <div class="popup-row">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>${pharmacy.city} · ${pharmacy.postal_code}</span>
        </div>
        ${phone}
      </div>
      ${statusBadge ? `<div class="popup-footer">${statusBadge}</div>` : ''}
    </div>
  `;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  activeRouteStops,
  pharmacies,
  isOnline,
  onUpdateStopStatus,
  onReorderStops,
  onDeleteStop
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const catalogMarkersRef = useRef<Marker[]>([]);
  const [mapError, setMapError] = useState(false);
  const [activeStopNotes, setActiveStopNotes] = useState<{ [key: string]: string }>({});
  const [showCatalog, setShowCatalog] = useState(false);

  // Cruzar paradas de ruta con datos de farmacias
  const stopsWithData = activeRouteStops
    .map((stop) => {
      const pharm = pharmacies.find((p) => p.id === stop.pharmacy_id);
      return { ...stop, pharmacy: pharm };
    })
    .sort((a, b) => a.stop_order - b.stop_order);

  // IDs de farmacias ya en ruta (para excluir del catálogo)
  const routePharmacyIds = new Set(activeRouteStops.map(s => s.pharmacy_id));

  // Inicialización de MapLibre GL
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    try {
      const map = new Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'cartodb-dark': {
              type: 'raster',
              tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
              tileSize: 256,
              attribution: '© CartoDB, © OpenStreetMap contributors'
            }
          },
          layers: [
            {
              id: 'cartodb-tiles',
              type: 'raster',
              source: 'cartodb-dark',
              minzoom: 0,
              maxzoom: 20
            }
          ]
        },
        center: [-8.406, 43.362],
        zoom: 8,
        pitch: 0,
        bearing: 0
      });

      map.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
      mapInstance.current = map;
      setMapError(false);
    } catch (err) {
      console.warn('Error al iniciar MapLibre GL:', err);
      setMapError(true);
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Mostrar/ocultar farmacias del catálogo como puntos de fondo
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || mapError) return;

    // Limpiar marcadores de catálogo anteriores
    catalogMarkersRef.current.forEach(m => m.remove());
    catalogMarkersRef.current = [];

    if (!showCatalog) return;

    // Solo mostrar farmacias NO en la ruta activa
    const catalogPharms = pharmacies.filter(p =>
      !routePharmacyIds.has(p.id) && p.latitude !== 0 && p.longitude !== 0
    );

    catalogPharms.forEach((p) => {
      const el = createCatalogMarkerEl();
      const popup = new Popup({ offset: 10, closeButton: false, maxWidth: '260px' })
        .setHTML(createPopupHTML(p));

      const marker = new Marker({ element: el })
        .setLngLat([p.longitude, p.latitude])
        .setPopup(popup)
        .addTo(map);

      catalogMarkersRef.current.push(marker);
    });
  }, [showCatalog, pharmacies, routePharmacyIds, mapError]);

  // Actualizar marcadores de ruta + línea de conexión
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || mapError) return;

    // Limpiar marcadores de ruta anteriores
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Limpiar la línea de ruta si existe
    if (map.getSource('route-line')) {
      map.removeLayer('route-line-layer');
      map.removeLayer('route-line-glow');
      map.removeSource('route-line');
    }

    if (stopsWithData.length === 0) return;

    // Añadir marcadores de parada
    stopsWithData.forEach((stop) => {
      if (!stop.pharmacy) return;

      const el = createRouteMarkerEl(stop.stop_order, stop.pharmacy.name, stop.status);
      const popup = new Popup({
        offset: 30,
        closeButton: true,
        maxWidth: '280px',
        className: 'pm-popup-container'
      }).setHTML(createPopupHTML(stop.pharmacy, stop.stop_order, stop.status));

      const marker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([stop.pharmacy.longitude, stop.pharmacy.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Dibujar línea de ruta entre paradas
    const validStops = stopsWithData.filter(s => s.pharmacy);
    if (validStops.length > 1) {
      const coordinates = validStops.map(s => [s.pharmacy!.longitude, s.pharmacy!.latitude]);

      const drawRouteLine = (geometry: any) => {
        if (!mapInstance.current || mapInstance.current.getSource('route-line')) return;
        const m = mapInstance.current;

        m.addSource('route-line', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry
          }
        });

        // Glow layer (behind)
        m.addLayer({
          id: 'route-line-glow',
          type: 'line',
          source: 'route-line',
          paint: {
            'line-color': '#4facfe',
            'line-width': 6,
            'line-opacity': 0.25,
            'line-blur': 4
          }
        });

        // Main line (solid real road)
        m.addLayer({
          id: 'route-line-layer',
          type: 'line',
          source: 'route-line',
          paint: {
            'line-color': '#00f2fe',
            'line-width': 3.5,
            'line-opacity': 0.85
          }
        });
      };

      const fetchRealRoute = async () => {
        try {
          const coordString = coordinates.map(c => `${c[0]},${c[1]}`).join(';');
          const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
          const response = await fetch(url);
          if (!response.ok) throw new Error('OSRM API returned ' + response.status);
          const data = await response.json();
          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            drawRouteLine(data.routes[0].geometry);
          } else {
            throw new Error('No valid route in OSRM response');
          }
        } catch (err) {
          console.warn('No se pudo cargar la ruta real de OSRM, usando fallback de línea recta:', err);
          drawRouteLine({
            type: 'LineString',
            coordinates
          });
        }
      };

      fetchRealRoute();

      // Encuadrar el mapa a la ruta
      const lngs = validStops.map(s => s.pharmacy!.longitude);
      const lats = validStops.map(s => s.pharmacy!.latitude);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: { top: 60, bottom: 60, left: 40, right: 40 }, duration: 800 }
      );
    } else if (validStops.length === 1) {
      map.flyTo({
        center: [validStops[0].pharmacy!.longitude, validStops[0].pharmacy!.latitude],
        zoom: 14,
        duration: 800
      });
    }
  }, [stopsWithData, mapError]);

  const handleMoveStop = (index: number, direction: 'up' | 'down') => {
    const newStops = [...stopsWithData];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;

    if (targetIdx < 0 || targetIdx >= newStops.length) return;

    const temp = newStops[index].stop_order;
    newStops[index].stop_order = newStops[targetIdx].stop_order;
    newStops[targetIdx].stop_order = temp;

    onReorderStops(
      newStops.map((s) => ({
        id: s.id,
        route_id: s.route_id,
        pharmacy_id: s.pharmacy_id,
        stop_order: s.stop_order,
        status: s.status,
        check_in_time: s.check_in_time,
        check_out_time: s.check_out_time,
        notes: s.notes
      }))
    );
  };

  const handleStatusChange = (stopId: string, status: 'completed' | 'skipped') => {
    const notes = activeStopNotes[stopId] || '';
    onUpdateStopStatus(stopId, status, notes);
  };

  return (
    <section className="map-and-itinerary-container">
      {/* Map View */}
      <div className="map-view-wrapper">
        {mapError || !isOnline ? (
          <div className="offline-map-fallback">
            <AlertTriangle className="warning-icon" size={32} />
            <h4>Mapa no disponible</h4>
            <p>Sin conexión. Visualizando itinerario esquemático.</p>
            <div className="offline-graph-canvas">
              {stopsWithData.map((stop, idx) => (
                <div key={stop.id} className="graph-node-row">
                  <div className="graph-dot" data-status={stop.status}>{idx + 1}</div>
                  <div className="graph-details">
                    <strong>{stop.pharmacy?.name}</strong>
                    <span>{stop.pharmacy?.city}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div ref={mapContainer} className="map-canvas-element" />
            {/* Controles flotantes del mapa */}
            <div className="map-controls-overlay">
              <button
                className={`map-control-btn ${showCatalog ? 'active' : ''}`}
                onClick={() => setShowCatalog(!showCatalog)}
                title={showCatalog ? 'Ocultar catálogo' : 'Mostrar farmacias del catálogo'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span>{showCatalog ? 'Ocultar catálogo' : `${pharmacies.length} farmacias`}</span>
              </button>
              {stopsWithData.length > 0 && (
                <div className="map-stats-badge">
                  <Navigation size={12} />
                  <span>{stopsWithData.length} paradas</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Itinerary / Stop Action panel */}
      <div className="itinerary-panel glass-panel">
        <div className="panel-header">
          <h3>Itinerario de Ruta</h3>
          <span className="badge-route-status">Ventas &amp; Distribución</span>
        </div>

        <div className="stops-scrollable">
          {stopsWithData.length === 0 ? (
            <div className="empty-itinerary">
              <Milestone size={24} className="accent-cyan-text" />
              <p>No hay ninguna ruta cargada. Pide una ruta al asistente o escoge una en el historial.</p>
            </div>
          ) : (
            stopsWithData.map((stop, idx) => (
              <div key={stop.id} className={`itinerary-item glass-panel ${stop.status}`}>
                <div className="item-main">
                  <div className="item-index" data-status={stop.status}>
                    {idx + 1}
                  </div>
                  <div className="item-details">
                    <h4>{stop.pharmacy?.name || 'Cargando farmacia...'}</h4>
                    <span className="address-text">{stop.pharmacy?.address}</span>
                    {stop.pharmacy?.city && (
                      <span className="city-text">{stop.pharmacy.city}</span>
                    )}
                  </div>
                  <div className="reorder-controls">
                    <button
                      disabled={idx === 0}
                      onClick={() => handleMoveStop(idx, 'up')}
                      className="btn-order"
                      title="Subir parada"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      disabled={idx === stopsWithData.length - 1}
                      onClick={() => handleMoveStop(idx, 'down')}
                      className="btn-order"
                      title="Bajar parada"
                    >
                      <ChevronDown size={14} />
                    </button>
                    {onDeleteStop && (
                      <button
                        onClick={() => onDeleteStop(stop.id)}
                        className="btn-order delete-stop"
                        title="Eliminar parada de la ruta"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {stop.status === 'pending' && (
                  <div className="action-tray">
                    <textarea
                      placeholder="Notas de visita (inventario, incidencias)..."
                      value={activeStopNotes[stop.id] || ''}
                      onChange={(e) =>
                        setActiveStopNotes({ ...activeStopNotes, [stop.id]: e.target.value })
                      }
                      className="stop-notes-input"
                    />
                    <div className="action-buttons">
                      <button
                        onClick={() => handleStatusChange(stop.id, 'completed')}
                        className="btn-action complete"
                      >
                        <CheckCircle2 size={12} /> Completar
                      </button>
                      <button
                        onClick={() => handleStatusChange(stop.id, 'skipped')}
                        className="btn-action skip"
                      >
                        Saltar
                      </button>
                    </div>
                  </div>
                )}

                {stop.status !== 'pending' && (
                  <div className="status-badge-compact" data-status={stop.status}>
                    <span>Visita {stop.status === 'completed' ? 'Realizada ✓' : 'Omitida'}</span>
                    {stop.notes && <p className="saved-note">"{stop.notes}"</p>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        .map-and-itinerary-container {
          display: grid;
          grid-template-rows: 1fr 280px;
          height: 100%;
          overflow: hidden;
          background-color: var(--bg-primary);
        }

        .map-view-wrapper {
          width: 100%;
          height: 100%;
          position: relative;
          background: #0d1117;
        }

        .map-canvas-element {
          width: 100%;
          height: 100%;
        }

        /* === MAP CONTROLS OVERLAY === */
        .map-controls-overlay {
          position: absolute;
          top: 14px;
          left: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          z-index: 10;
        }

        .map-control-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          background: rgba(19, 27, 46, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--glass-border);
          border-radius: 8px;
          color: var(--text-secondary);
          font-family: 'Outfit', sans-serif;
          font-size: 0.72rem;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .map-control-btn:hover {
          background: rgba(19, 27, 46, 0.95);
          color: var(--text-primary);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .map-control-btn.active {
          background: rgba(0, 242, 254, 0.1);
          border-color: rgba(0, 242, 254, 0.3);
          color: var(--accent-cyan);
        }

        .map-stats-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          background: rgba(19, 27, 46, 0.85);
          backdrop-filter: blur(12px);
          border: 1px solid var(--glass-border);
          border-radius: 8px;
          color: var(--accent-cyan);
          font-size: 0.68rem;
          font-weight: 600;
          pointer-events: none;
        }

        /* === ROUTE MARKERS (PIN + LABEL) === */
        .route-marker-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
          transition: transform 0.15s;
        }

        .route-marker-wrapper:hover {
          transform: scale(1.12);
          z-index: 100 !important;
        }

        .route-marker-pin {
          width: 32px;
          height: 32px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          border: 2.5px solid rgba(255, 255, 255, 0.9);
          box-shadow: 0 0 12px rgba(0, 242, 254, 0.4);
        }

        .route-marker-pin span {
          transform: rotate(45deg);
          color: #0b0f19;
          font-family: 'Outfit', sans-serif;
          font-size: 0.75rem;
          font-weight: 800;
          line-height: 1;
        }

        .status-completed .route-marker-pin {
          background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
        }

        .status-skipped .route-marker-pin {
          background: linear-gradient(135deg, #6b7280 0%, #9ca3af 100%);
          box-shadow: 0 0 8px rgba(107, 114, 128, 0.3);
          opacity: 0.7;
        }

        .route-marker-label {
          margin-top: 4px;
          padding: 2px 8px;
          background: rgba(11, 15, 25, 0.88);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          color: var(--text-primary);
          font-family: 'Outfit', sans-serif;
          font-size: 0.62rem;
          font-weight: 500;
          white-space: nowrap;
          letter-spacing: 0.01em;
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* === CATALOG MARKERS (SMALL DOTS) === */
        .catalog-marker-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: rgba(79, 172, 254, 0.5);
          border: 1px solid rgba(79, 172, 254, 0.3);
          cursor: pointer;
          transition: all 0.2s;
        }

        .catalog-marker-dot:hover {
          width: 10px;
          height: 10px;
          background: var(--accent-cyan);
          border-color: white;
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.6);
        }

        /* === POPUP STYLES === */
        .pm-popup-container .maplibregl-popup-content {
          background: rgba(19, 27, 46, 0.95) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 10px !important;
          padding: 0 !important;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6) !important;
          color: var(--text-primary) !important;
        }

        .pm-popup-container .maplibregl-popup-tip {
          border-top-color: rgba(19, 27, 46, 0.95) !important;
        }

        .pm-popup-container .maplibregl-popup-close-button {
          color: var(--text-muted) !important;
          font-size: 16px !important;
          right: 6px !important;
          top: 4px !important;
        }

        .pm-popup-container .maplibregl-popup-close-button:hover {
          color: var(--text-primary) !important;
          background: transparent !important;
        }

        .maplibregl-popup-content {
          background: rgba(19, 27, 46, 0.95) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 10px !important;
          padding: 0 !important;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6) !important;
          color: var(--text-primary) !important;
        }

        .maplibregl-popup-tip {
          border-top-color: rgba(19, 27, 46, 0.95) !important;
        }

        .pm-popup {
          padding: 12px 14px;
          font-family: 'Outfit', sans-serif;
        }

        .popup-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .popup-order {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          background: var(--accent-gradient);
          border-radius: 6px;
          color: #0b0f19;
          font-size: 0.7rem;
          font-weight: 800;
          flex-shrink: 0;
        }

        .popup-title {
          font-size: 0.82rem !important;
          font-weight: 600 !important;
          color: var(--text-primary) !important;
          margin: 0 !important;
          line-height: 1.3;
        }

        .popup-body {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .popup-row {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          font-size: 0.7rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .popup-row svg {
          flex-shrink: 0;
          margin-top: 1px;
          color: var(--text-muted);
        }

        .popup-footer {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .popup-status {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 600;
        }

        .popup-status-pending {
          background: rgba(79, 172, 254, 0.12);
          color: var(--accent-blue);
        }

        .popup-status-completed {
          background: rgba(16, 185, 129, 0.12);
          color: var(--success);
        }

        .popup-status-skipped {
          background: rgba(107, 114, 128, 0.12);
          color: var(--text-muted);
        }

        /* === OFFLINE FALLBACK === */
        .offline-map-fallback {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          text-align: center;
          background: radial-gradient(circle, #131b2e 0%, #0b0f19 100%);
          color: var(--text-primary);
        }

        .warning-icon {
          color: var(--warning);
          margin-bottom: 12px;
          animation: pulseGlow 2s infinite;
        }

        .offline-map-fallback h4 { font-size: 1.1rem; font-weight: 600; margin-bottom: 6px; }
        .offline-map-fallback p { font-size: 0.8rem; color: var(--text-secondary); max-width: 320px; margin-bottom: 20px; }

        .offline-graph-canvas {
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          padding: 16px;
          width: 100%;
          max-width: 340px;
          text-align: left;
        }

        .graph-node-row {
          display: flex;
          align-items: center;
          gap: 12px;
          position: relative;
        }

        .graph-node-row:not(:last-child)::after {
          content: '';
          position: absolute;
          left: 11px;
          top: 24px;
          width: 2px;
          height: 16px;
          background: var(--bg-tertiary);
        }

        .graph-dot {
          width: 24px;
          height: 24px;
          background: var(--accent-gradient);
          color: #0b0f19;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          z-index: 2;
        }

        .graph-dot[data-status="completed"] { background: var(--success); }
        .graph-dot[data-status="skipped"] { background: var(--text-muted); color: var(--text-secondary); }

        .graph-details { display: flex; flex-direction: column; }
        .graph-details strong { font-size: 0.8rem; color: var(--text-primary); }
        .graph-details span { font-size: 0.65rem; color: var(--text-muted); }

        /* === ITINERARY PANEL === */
        .itinerary-panel {
          margin: 14px;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          flex-shrink: 0;
        }

        .panel-header h3 { font-size: 0.9rem; font-weight: 600; }

        .badge-route-status {
          background-color: rgba(0, 242, 254, 0.1);
          color: var(--accent-cyan);
          border: 1px solid rgba(0, 242, 254, 0.2);
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 0.65rem;
          font-weight: 600;
        }

        .stops-scrollable {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          flex-grow: 1;
          padding-bottom: 8px;
          align-items: flex-start;
        }

        .empty-itinerary {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          width: 100%;
          height: 100%;
          gap: 8px;
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .itinerary-item {
          flex-shrink: 0;
          width: 260px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: border-color 0.2s;
        }

        .itinerary-item.completed { border-color: rgba(16, 185, 129, 0.2); background-color: rgba(16, 185, 129, 0.02); }
        .itinerary-item.skipped { border-color: var(--glass-border); opacity: 0.6; }

        .item-main { display: flex; align-items: center; gap: 10px; }

        .item-index {
          width: 26px;
          height: 26px;
          background: var(--accent-gradient);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.72rem;
          font-weight: 800;
          color: #0b0f19;
          flex-shrink: 0;
        }

        .item-index[data-status="completed"] { background: var(--success); }
        .item-index[data-status="skipped"] { background: var(--bg-tertiary); color: var(--text-muted); }

        .item-details { flex-grow: 1; overflow: hidden; }

        .item-details h4 {
          font-size: 0.78rem;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .address-text {
          font-size: 0.65rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: block;
        }

        .city-text {
          font-size: 0.6rem;
          color: var(--accent-blue);
          opacity: 0.7;
          display: block;
          margin-top: 1px;
        }

        .reorder-controls { display: flex; flex-direction: column; gap: 2px; }

        .btn-order {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 2px;
          border-radius: 4px;
          transition: all 0.15s;
        }

        .btn-order:hover:not(:disabled) {
          color: var(--text-primary);
          background-color: rgba(255, 255, 255, 0.05);
        }

        .btn-order:disabled { opacity: 0.2; cursor: not-allowed; }

        .btn-order.delete-stop { margin-top: 4px; }
        .btn-order.delete-stop:hover { color: var(--danger) !important; background-color: rgba(239, 68, 68, 0.15) !important; }

        .action-tray { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }

        .stop-notes-input {
          background: var(--bg-primary);
          border: 1px solid var(--glass-border);
          border-radius: 6px;
          padding: 6px;
          font-family: inherit;
          font-size: 0.7rem;
          color: var(--text-primary);
          resize: none;
          height: 44px;
          outline: none;
          transition: border-color 0.2s;
        }

        .stop-notes-input:focus {
          border-color: var(--accent-blue);
        }

        .action-buttons { display: flex; gap: 6px; }

        .btn-action {
          flex-grow: 1;
          border: none;
          padding: 6px;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          transition: all 0.15s;
          font-family: 'Outfit', sans-serif;
        }

        .btn-action.complete {
          background-color: rgba(16, 185, 129, 0.15);
          color: var(--success);
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .btn-action.complete:hover { background-color: var(--success); color: #0b0f19; }

        .btn-action.skip {
          background-color: rgba(255, 255, 255, 0.05);
          color: var(--text-secondary);
          border: 1px solid var(--glass-border);
        }

        .btn-action.skip:hover { background-color: rgba(255,255,255,0.1); color: var(--text-primary); }

        .status-badge-compact {
          display: flex;
          flex-direction: column;
          font-size: 0.7rem;
          font-weight: 500;
          padding: 4px 6px;
          border-radius: 4px;
        }

        .status-badge-compact[data-status="completed"] { color: var(--success); }
        .status-badge-compact[data-status="skipped"] { color: var(--text-muted); }

        .saved-note { font-style: italic; font-size: 0.65rem; color: var(--text-muted); margin-top: 2px; }
      `}</style>
    </section>
  );
};
