import type { Pharmacy } from '../types';

/**
 * Zonas geográficas de Galicia con bounding boxes (lat/lng).
 * Cada zona define un rectángulo que contiene las farmacias relevantes.
 * Se usan para el pre-filtrado inteligente antes de enviar al LLM.
 */

interface GeoZone {
  name: string;
  aliases: string[];           // Variaciones que el usuario puede escribir
  description: string;         // Para el prompt a Gemini
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

// === PROVINCIAS ===
const PROVINCES: GeoZone[] = [
  {
    name: 'Provincia de A Coruña',
    aliases: ['provincia coruna', 'provincia coruña', 'provincia de a coruna', 'provincia de a coruña', 'coruna provincia'],
    description: 'Toda la provincia de A Coruña',
    bounds: { minLat: 42.55, maxLat: 43.80, minLng: -9.30, maxLng: -7.85 }
  },
  {
    name: 'Provincia de Lugo',
    aliases: ['provincia lugo', 'provincia de lugo', 'lugo provincia'],
    description: 'Toda la provincia de Lugo',
    bounds: { minLat: 42.30, maxLat: 43.75, minLng: -7.85, maxLng: -7.00 }
  },
  {
    name: 'Provincia de Ourense',
    aliases: ['provincia ourense', 'provincia de ourense', 'ourense provincia', 'provincia orense'],
    description: 'Toda la provincia de Ourense',
    bounds: { minLat: 41.80, maxLat: 42.45, minLng: -8.50, maxLng: -6.75 }
  },
  {
    name: 'Provincia de Pontevedra',
    aliases: ['provincia pontevedra', 'provincia de pontevedra', 'pontevedra provincia'],
    description: 'Toda la provincia de Pontevedra',
    bounds: { minLat: 41.85, maxLat: 42.65, minLng: -9.00, maxLng: -8.05 }
  }
];

// === ZONAS COSTERAS ===
const COASTAL_ZONES: GeoZone[] = [
  {
    name: 'Costa de Lugo (A Mariña)',
    aliases: [
      'costa de lugo', 'costa lugo', 'marina lucense', 'a marina', 'la marina',
      'mariña lucense', 'costa lucense', 'litoral lugo', 'litoral de lugo',
      'costa norte lugo', 'mariña'
    ],
    description: 'Zona costera norte de la provincia de Lugo: Ribadeo, Foz, Burela, Viveiro, Cervo, Xove, Barreiros, Mondoñedo',
    bounds: { minLat: 43.40, maxLat: 43.75, minLng: -7.70, maxLng: -7.00 }
  },
  {
    name: 'Costa da Morte',
    aliases: [
      'costa da morte', 'costa de la muerte', 'costa morte', 'costadamorte',
      'finisterre', 'fisterra', 'costa occidental'
    ],
    description: 'Costa da Morte: Muxía, Fisterra, Cee, Camariñas, Laxe, Carballo, Malpica',
    bounds: { minLat: 42.85, maxLat: 43.25, minLng: -9.30, maxLng: -8.75 }
  },
  {
    name: 'Rías Baixas',
    aliases: [
      'rias baixas', 'rias bajas', 'ria de vigo', 'ria de pontevedra',
      'ria de arousa', 'ria de muros', 'costa sur', 'litoral sur',
      'costa pontevedra', 'costa de pontevedra'
    ],
    description: 'Costa sur de Galicia: O Grove, Sanxenxo, Cambados, Vilagarcía, Cangas, Baiona, Nigrán',
    bounds: { minLat: 42.05, maxLat: 42.65, minLng: -9.05, maxLng: -8.55 }
  },
  {
    name: 'Rías Altas',
    aliases: [
      'rias altas', 'costa coruna', 'costa de coruna', 'costa de coruña',
      'costa artabra', 'golfo artabro', 'litoral coruna'
    ],
    description: 'Costa norte de A Coruña: Ferrol, Cedeira, Ortigueira, A Coruña, Betanzos, Sada',
    bounds: { minLat: 43.20, maxLat: 43.80, minLng: -8.80, maxLng: -7.80 }
  }
];

// === COMARCAS / ZONAS INTERIORES ===
const COMARCAS: GeoZone[] = [
  {
    name: 'Comarca de Santiago',
    aliases: ['comarca santiago', 'area santiago', 'zona santiago', 'area metropolitana santiago'],
    description: 'Santiago de Compostela y municipios limítrofes: Ames, Teo, Brión, Boqueixón',
    bounds: { minLat: 42.78, maxLat: 42.95, minLng: -8.65, maxLng: -8.40 }
  },
  {
    name: 'Comarca de Vigo',
    aliases: ['area vigo', 'zona vigo', 'gran vigo', 'area metropolitana vigo', 'comarca vigo'],
    description: 'Vigo y municipios limítrofes: Redondela, Mos, Porriño, Gondomar, Nigrán',
    bounds: { minLat: 42.10, maxLat: 42.30, minLng: -8.85, maxLng: -8.55 }
  },
  {
    name: 'Comarca de Ourense',
    aliases: ['zona ourense', 'area ourense', 'comarca ourense', 'orense ciudad'],
    description: 'Ourense capital y entorno: Barbadás, San Cibrao das Viñas, Pereiro de Aguiar',
    bounds: { minLat: 42.25, maxLat: 42.40, minLng: -8.05, maxLng: -7.75 }
  },
  {
    name: 'Comarca de Ferrol',
    aliases: ['zona ferrol', 'area ferrol', 'comarca ferrol', 'ferrol y alrededores'],
    description: 'Ferrol y comarca: Narón, Neda, Fene, Mugardos, Ares',
    bounds: { minLat: 43.42, maxLat: 43.55, minLng: -8.30, maxLng: -8.05 }
  },
  {
    name: 'Ribeira Sacra',
    aliases: ['ribeira sacra', 'rivera sacra', 'cañones sil', 'ribera sacra'],
    description: 'Zona interior entre Lugo y Ourense: Monforte de Lemos, Chantada, Pantón',
    bounds: { minLat: 42.25, maxLat: 42.65, minLng: -7.80, maxLng: -7.30 }
  },
  {
    name: 'O Salnés',
    aliases: ['o salnes', 'salnes', 'el salnes', 'comarca salnes', 'zona arousana'],
    description: 'Comarca del Salnés (Rías Baixas): Cambados, O Grove, Sanxenxo, Meaño, Ribadumia',
    bounds: { minLat: 42.40, maxLat: 42.55, minLng: -8.90, maxLng: -8.70 }
  },
  {
    name: 'Terra Chá',
    aliases: ['terra cha', 'tierra llana', 'lugo interior', 'interior lugo', 'meseta lucense'],
    description: 'Interior de Lugo: Villalba, Cospeito, Castro de Rei, Guitiriz',
    bounds: { minLat: 43.05, maxLat: 43.40, minLng: -7.75, maxLng: -7.30 }
  },
  {
    name: 'O Morrazo',
    aliases: ['morrazo', 'o morrazo', 'peninsula morrazo'],
    description: 'Península del Morrazo: Cangas, Bueu, Moaña, Marín',
    bounds: { minLat: 42.25, maxLat: 42.40, minLng: -8.85, maxLng: -8.65 }
  },
  {
    name: 'Deza-Tabeirós',
    aliases: ['deza', 'tabeiros', 'comarca deza', 'zona lalin'],
    description: 'Comarcas interiores de Pontevedra: Lalín, Silleda, Vila de Cruces, A Estrada',
    bounds: { minLat: 42.50, maxLat: 42.75, minLng: -8.30, maxLng: -7.95 }
  },
  {
    name: 'Valdeorras',
    aliases: ['valdeorras', 'o barco', 'barco valdeorras', 'ourense este'],
    description: 'Zona este de Ourense: O Barco de Valdeorras, Rúa, Vilamartín',
    bounds: { minLat: 42.30, maxLat: 42.50, minLng: -7.10, maxLng: -6.75 }
  }
];

// === CONCEPTOS ESPECIALES ===
const SPECIAL_CONCEPTS: GeoZone[] = [
  {
    name: 'Interior de Galicia',
    aliases: ['interior galicia', 'galicia interior', 'zona interior', 'pueblos interior'],
    description: 'Zona interior de Galicia, alejada de la costa',
    bounds: { minLat: 42.00, maxLat: 43.20, minLng: -8.30, maxLng: -6.80 }
  },
  {
    name: 'Costa de Galicia',
    aliases: ['costa galicia', 'litoral gallego', 'costa gallega', 'todo el litoral', 'toda la costa'],
    description: 'Todo el litoral gallego',
    bounds: { minLat: 41.85, maxLat: 43.80, minLng: -9.30, maxLng: -7.00 }
  },
  {
    name: 'Camino de Santiago',
    aliases: ['camino santiago', 'camino de santiago', 'ruta jacobea', 'via compostelana', 'camino frances'],
    description: 'Farmacias cercanas al Camino de Santiago en su tramo gallego',
    bounds: { minLat: 42.70, maxLat: 43.05, minLng: -8.65, maxLng: -6.95 }
  }
];

const ALL_ZONES: GeoZone[] = [...PROVINCES, ...COASTAL_ZONES, ...COMARCAS, ...SPECIAL_CONCEPTS];

/**
 * Normaliza texto para matching: quita acentos, minúsculas, trim.
 */
function sanitize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Busca zonas geográficas mencionadas en la query del usuario.
 * Devuelve las zonas que coinciden.
 */
export function detectGeoZones(query: string): GeoZone[] {
  const q = sanitize(query);
  const matched: GeoZone[] = [];

  for (const zone of ALL_ZONES) {
    for (const alias of zone.aliases) {
      if (q.includes(sanitize(alias))) {
        matched.push(zone);
        break; // No duplicar la misma zona
      }
    }
  }

  return matched;
}

/**
 * Filtra farmacias que caen dentro de los bounding boxes de las zonas detectadas.
 */
export function filterPharmaciesByZones(pharmacies: Pharmacy[], zones: GeoZone[]): Pharmacy[] {
  if (zones.length === 0) return [];

  return pharmacies.filter((p) =>
    zones.some((z) =>
      p.latitude >= z.bounds.minLat &&
      p.latitude <= z.bounds.maxLat &&
      p.longitude >= z.bounds.minLng &&
      p.longitude <= z.bounds.maxLng
    )
  );
}

/**
 * Genera texto descriptivo de las zonas detectadas para incluir en el prompt a Gemini.
 */
export function getZoneContextForPrompt(zones: GeoZone[]): string {
  if (zones.length === 0) return '';

  return zones
    .map((z) => `- ${z.name}: ${z.description}`)
    .join('\n');
}

/**
 * Exportar todas las zonas para consulta.
 */
export { ALL_ZONES, type GeoZone };
