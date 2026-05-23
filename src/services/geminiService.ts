import type { Pharmacy } from '../types';
import { detectGeoZones, filterPharmaciesByZones, getZoneContextForPrompt } from './galiciaGeoZones';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

interface GeminiResponse {
  reply: string;
  isRouteProposal: boolean;
  routeTitle: string;
  selectedPharmacyIds: string[];
}

/**
 * Normaliza texto: quita acentos, minúsculas, trim.
 */
function sanitize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Pre-filtra el catálogo de farmacias para reducir tokens antes del LLM.
 * Prioriza: zonas geográficas > ciudades > keywords > fallback geográfico
 */
function preFilterPharmacies(
  query: string,
  allPharmacies: Pharmacy[]
): { filtered: Pharmacy[]; zoneContext: string; matchType: string } {
  const querySanitized = sanitize(query);
  const queryWords = querySanitized.split(/\s+/).filter((w) => w.length >= 3);

  // PASO 1: Detectar zonas geográficas (costa de lugo, rías baixas, etc.)
  const detectedZones = detectGeoZones(query);
  if (detectedZones.length > 0) {
    const zoneFiltered = filterPharmaciesByZones(allPharmacies, detectedZones);
    const zoneContext = getZoneContextForPrompt(detectedZones);
    console.log(`[Gemini Pre-Filter] 🗺️ Zonas geográficas detectadas:`, detectedZones.map(z => z.name));
    console.log(`[Gemini Pre-Filter] 📍 Farmacias en zona: ${zoneFiltered.length}`);

    if (zoneFiltered.length > 0) {
      return {
        filtered: zoneFiltered.slice(0, 150), // Más holgura para zonas amplias
        zoneContext,
        matchType: 'geographic_zone'
      };
    }
  }

  // PASO 2: Buscar ciudades mencionadas (matching por tokens cruzados)
  const cities = Array.from(new Set(allPharmacies.map((p) => p.city.trim())));
  const mentionedCities = cities.filter((city) => {
    const citySanitized = sanitize(city);
    const cityTokens = citySanitized.split(/\s+/).filter(t => t.length >= 3);

    return (
      // Match directo bidireccional
      querySanitized.includes(citySanitized) ||
      citySanitized.includes(querySanitized) ||
      // Match por tokens: alguna palabra de la query coincide con alguna de la ciudad
      queryWords.some((qw) => citySanitized.includes(qw)) ||
      // Match inverso: alguna palabra de la ciudad está en la query
      cityTokens.some((ct) => querySanitized.includes(ct) && ct.length > 3)
    );
  });

  if (mentionedCities.length > 0) {
    console.log(`[Gemini Pre-Filter] 🏙️ Ciudades identificadas:`, mentionedCities);
    const cityFiltered = allPharmacies.filter((p) =>
      mentionedCities.some((c) => sanitize(p.city) === sanitize(c))
    );
    if (cityFiltered.length > 0) {
      return {
        filtered: cityFiltered.slice(0, 100),
        zoneContext: '',
        matchType: 'city'
      };
    }
  }

  // PASO 3: Buscar por keywords en nombre/dirección de farmacia
  const keywords = queryWords.filter((w) => w.length > 3);
  const keywordMatches = allPharmacies.filter((p) =>
    keywords.some((k) =>
      sanitize(p.name).includes(k) ||
      sanitize(p.address).includes(k)
    )
  );
  if (keywordMatches.length > 0) {
    console.log(`[Gemini Pre-Filter] 🔤 Matches por keyword: ${keywordMatches.length}`);
    return {
      filtered: keywordMatches.slice(0, 100),
      zoneContext: '',
      matchType: 'keyword'
    };
  }

  // PASO 4: Fallback — subconjunto razonable
  console.warn(`[Gemini Pre-Filter] ⚠️ Sin matches. Usando fallback de 50 farmacias.`);
  return {
    filtered: allPharmacies.slice(0, 50),
    zoneContext: '',
    matchType: 'fallback'
  };
}

export async function parseQueryWithGemini(
  query: string,
  availablePharmacies: Pharmacy[]
): Promise<GeminiResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error('Clave VITE_GEMINI_API_KEY no encontrada en el entorno.');
  }

  // Pre-filtrado inteligente
  const { filtered, zoneContext, matchType } = preFilterPharmacies(query, availablePharmacies);
  console.log(`[Gemini Service] Tipo de match: ${matchType} | Farmacias filtradas: ${filtered.length}`);

  const catalogText = filtered
    .map((p) => `ID: "${p.id}", Nombre: "${p.name}", Ciudad: "${p.city}", Dirección: "${p.address}"`)
    .join('\n');

  // Contexto geográfico adicional si se detectaron zonas
  const geoContextBlock = zoneContext
    ? `\nCONTEXTO GEOGRÁFICO DETECTADO:\nEl delegado se refiere a la(s) siguiente(s) zona(s) geográfica(s) de Galicia:\n${zoneContext}\nTodas las farmacias del catálogo adjunto pertenecen a esta(s) zona(s). Selecciona las más apropiadas para una ruta coherente.\n`
    : '';

  const systemInstructions = `
Eres el motor de Inteligencia Artificial de PharmaMaps, una app de enrutamiento para delegados farmacéuticos en Galicia.
Tu objetivo es analizar la petición de texto o voz del delegado y traducirla a una acción estructurada de selección de farmacias.

CONOCIMIENTO GEOGRÁFICO DE GALICIA:
- Galicia tiene 4 provincias: A Coruña, Lugo, Ourense, Pontevedra.
- "Costa de Lugo" o "A Mariña" = zona costera de la PROVINCIA de Lugo (Ribadeo, Foz, Burela, Viveiro, etc.), NO la ciudad de Lugo.
- "Rías Baixas" = costa sur (Sanxenxo, O Grove, Cambados, Vilagarcía, etc.)
- "Rías Altas" = costa norte de A Coruña (Ferrol, Cedeira, Ortigueira, etc.)
- "Costa da Morte" = costa occidental (Fisterra, Muxía, Camariñas, etc.)
- "Ribeira Sacra" = zona interior entre Lugo y Ourense (Monforte de Lemos, Chantada, etc.)
- "Terra Chá" = meseta interior de Lugo (Villalba, etc.)
- "O Salnés" = comarca costera de Pontevedra (Cambados, O Grove, Sanxenxo, etc.)
- Distingue siempre entre CIUDAD (el núcleo urbano) y PROVINCIA (toda la demarcación territorial).
- Cuando alguien dice "costa de [provincia]", se refiere al litoral de esa provincia, NO a la ciudad capital.

Recibirás un catálogo de farmacias disponibles con su ID, Nombre, Ciudad y Dirección.
${geoContextBlock}
Debes identificar qué farmacias quiere visitar el delegado según su petición:
- Si el delegado menciona una ciudad, zona o comarca, selecciona TODAS las farmacias de esa área presentes en el catálogo.
- Si menciona nombres específicos de farmacia, busca la coincidencia más lógica.
- Las farmacias seleccionadas deben ordenarse geográficamente para optimizar el itinerario.
- El título de la ruta debe ser descriptivo y reflejar la zona (ej: "Ruta Costa de Lugo - A Mariña", "Ruta Santiago Centro", etc.)

Debes responder EXCLUSIVAMENTE con un objeto JSON válido:
{
  "reply": "Texto cordial explicando qué farmacias has seleccionado y por qué",
  "isRouteProposal": true,
  "routeTitle": "Título descriptivo para la ruta (ej: Ruta Costa de Lugo - A Mariña)",
  "selectedPharmacyIds": ["id1", "id2", "id3"]
}

Si el usuario solo hace una pregunta genérica (no pide ruta), usa isRouteProposal: false y selectedPharmacyIds: [].

CATÁLOGO DE FARMACIAS DISPONIBLES:
${catalogText}

PETICIÓN DEL DELEGADO:
"${query}"
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: systemInstructions }]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Error en API de Gemini: ${response.statusText}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawText) {
      throw new Error('Respuesta vacía de Gemini.');
    }

    const parsed: GeminiResponse = JSON.parse(rawText.trim());
    console.log(`[Gemini Service] ✅ Respuesta parseada: ${parsed.selectedPharmacyIds.length} farmacias seleccionadas | Ruta: "${parsed.routeTitle}"`);
    return parsed;
  } catch (error) {
    console.error('[Gemini Service] ❌ Fallo al consultar IA:', error);
    return {
      reply: `He procesado tu petición "${query}" de forma local debido a un fallo en la conexión con el servidor de IA.`,
      isRouteProposal: true,
      routeTitle: 'Ruta Local (Modo Contingencia)',
      selectedPharmacyIds: filtered.slice(0, 5).map((p) => p.id)
    };
  }
}
