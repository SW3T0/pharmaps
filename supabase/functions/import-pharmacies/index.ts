import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const query = `
[out:json][timeout:180];
area["ISO3166-2"="ES-GA"]->.searchArea;
(
  node["amenity"="pharmacy"](area.searchArea);
  way["amenity"="pharmacy"](area.searchArea);
);
out center;
`;

const url = 'https://lz4.overpass-api.de/api/interpreter';

serve(async (req) => {
  // Manejo de CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase URL or Service Role Key missing in environment.');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const OVERPASS_SERVERS = [
      'https://lz4.overpass-api.de/api/interpreter',
      'https://z.overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass-api.de/api/interpreter'
    ];

    let elements = [];
    let success = false;
    let fetchError = null;

    for (const serverUrl of OVERPASS_SERVERS) {
      try {
        console.log(`Intentando conectar con servidor Overpass: ${serverUrl}...`);
        const response = await fetch(
          `${serverUrl}?data=${encodeURIComponent(query)}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json',
              'Referer': 'https://overpass-turbo.eu/'
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          elements = data.elements || [];
          if (elements.length > 0) {
            console.log(`[Servidor: ${serverUrl}] Recibidos ${elements.length} resultados con éxito.`);
            success = true;
            break;
          } else {
            console.warn(`[Servidor: ${serverUrl}] Devolvió 0 resultados. Saltando...`);
          }
        } else {
          console.warn(`[Servidor: ${serverUrl}] Error de red: Status ${response.status}`);
          fetchError = new Error(`Status ${response.status}`);
        }
      } catch (err: any) {
        console.warn(`[Servidor: ${serverUrl}] Fallo en la conexión: ${err.message}`);
        fetchError = err;
      }
    }

    if (!success) {
      throw fetchError || new Error('Todos los servidores espejo de Overpass fallaron o no devolvieron resultados.');
    }

    console.log(`Procesando ${elements.length} farmacias...`);

    const pharmaciesToUpsert = [];

    for (const el of elements) {
      const tags = el.tags || {};
      const name = tags.name || tags['brand'] || 'Oficina de Farmacia';
      
      const street = tags['addr:street'] || '';
      const number = tags['addr:housenumber'] || '';
      let address = `${street} ${number}`.trim();
      if (!address) address = tags['addr:place'] || 'Dirección no especificada';

      const city = tags['addr:city'] || tags['addr:suburb'] || 'Desconocido';
      const postalCode = tags['addr:postcode'] || '36000';
      const lat = el.lat || (el.center && el.center.lat);
      const lon = el.lon || (el.center && el.center.lon);

      if (!lat || !lon) continue;

      // Generar UUID determinista basado en el ID de OSM usando Web Crypto API
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(`osm/${el.type}/${el.id}`);
      const hashBuffer = await crypto.subtle.digest("SHA-1", dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const uuid = [
        hashHex.substring(0, 8),
        hashHex.substring(8, 12),
        `4${hashHex.substring(13, 16)}`,
        `${((parseInt(hashHex.substring(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hashHex.substring(18, 20)}`,
        hashHex.substring(20, 32)
      ].join('-');

      const phone = tags.phone || tags['contact:phone'] || null;

      pharmaciesToUpsert.push({
        id: uuid,
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        postal_code: postalCode.trim(),
        location: `POINT(${lon} ${lat})`, // Formato espacial para PostGIS
        phone: phone ? phone.trim() : null
      });
    }

    // Insertar en lotes de 100 para evitar desbordar memoria o límites
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < pharmaciesToUpsert.length; i += batchSize) {
      const batch = pharmaciesToUpsert.slice(i, i + batchSize);
      const { error } = await supabaseClient
        .from('pharmacies')
        .upsert(batch, { onConflict: 'id' });
      
      if (error) {
        console.error('Error during batch upsert:', error);
        throw error;
      }
      insertedCount += batch.length;
    }

    // Guardar marca de tiempo de la última sincronización en app_settings
    try {
      await supabaseClient
        .from('app_settings')
        .upsert({
          key: 'last_sync_time',
          value: { timestamp: new Date().toISOString() },
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
    } catch (dbErr) {
      console.warn('No se pudo registrar la marca de tiempo en app_settings:', dbErr);
    }

    return new Response(
      JSON.stringify({ success: true, count: insertedCount }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
});
