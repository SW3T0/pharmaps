import type { Pharmacy } from '../types';

/**
 * Calcula la distancia del círculo máximo entre dos puntos geográficos (Haversine)
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radio medio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Resuelve el TSP (Traveling Salesperson Problem) usando el algoritmo clásico
 * de Vecino Más Cercano (Nearest Neighbor) seguido de optimización 2-opt.
 * 
 * @param startLat Latitud del punto de partida (ej. A Coruña)
 * @param startLng Longitud del punto de partida
 * @param waypoints Lista de farmacias a visitar
 * @returns Lista de farmacias ordenada óptimamente
 */
export function solveTSP(
  startLat: number,
  startLng: number,
  waypoints: Pharmacy[]
): { orderedWaypoints: Pharmacy[]; totalDistanceKm: number } {
  if (waypoints.length === 0) {
    return { orderedWaypoints: [], totalDistanceKm: 0 };
  }

  const unvisited = [...waypoints];
  const ordered: Pharmacy[] = [];
  
  let currentLat = startLat;
  let currentLng = startLng;
  let totalDistance = 0;

  // 1. Fase de Construcción: Vecino Más Cercano
  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = haversineDistance(
        currentLat,
        currentLng,
        unvisited[i].latitude,
        unvisited[i].longitude
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestIndex = i;
      }
    }

    const nextStop = unvisited.splice(nearestIndex, 1)[0];
    ordered.push(nextStop);
    totalDistance += minDistance;
    currentLat = nextStop.latitude;
    currentLng = nextStop.longitude;
  }

  // 2. Fase de Optimización: Heurística 2-opt clásica (elimina cruces en la ruta)
  let improved = true;
  let tour = [
    { id: 'start', name: 'Origen', latitude: startLat, longitude: startLng } as any as Pharmacy,
    ...ordered
  ];

  while (improved) {
    improved = false;
    for (let i = 1; i < tour.length - 1; i++) {
      for (let j = i + 1; j < tour.length; j++) {
        // Calcular la ganancia de intercambiar los enlaces i-1 -> i y j -> j+1 (si j+1 existe)
        const nodeA = tour[i - 1];
        const nodeB = tour[i];
        const nodeC = tour[j];
        const nodeD = j + 1 < tour.length ? tour[j + 1] : null;

        const currentDist =
          haversineDistance(nodeA.latitude, nodeA.longitude, nodeB.latitude, nodeB.longitude) +
          (nodeD
            ? haversineDistance(nodeC.latitude, nodeC.longitude, nodeD.latitude, nodeD.longitude)
            : 0);

        const newDist =
          haversineDistance(nodeA.latitude, nodeA.longitude, nodeC.latitude, nodeC.longitude) +
          (nodeD
            ? haversineDistance(nodeB.latitude, nodeB.longitude, nodeD.latitude, nodeD.longitude)
            : 0);

        if (newDist < currentDist) {
          // Invertir el segmento de i a j
          reverseSegment(tour, i, j);
          improved = true;
        }
      }
    }
  }

  // Quitar el nodo inicial ficticio
  const finalWaypoints = tour.slice(1);

  // Recalcular la distancia total real
  let finalDistance = 0;
  let lat = startLat;
  let lng = startLng;
  for (const stop of finalWaypoints) {
    finalDistance += haversineDistance(lat, lng, stop.latitude, stop.longitude);
    lat = stop.latitude;
    lng = stop.longitude;
  }

  return {
    orderedWaypoints: finalWaypoints,
    totalDistanceKm: finalDistance
  };
}

function reverseSegment(tour: Pharmacy[], i: number, j: number) {
  let left = i;
  let right = j;
  while (left < right) {
    const temp = tour[left];
    tour[left] = tour[right];
    tour[right] = temp;
    left++;
    right--;
  }
}
