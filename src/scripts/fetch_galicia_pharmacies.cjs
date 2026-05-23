const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// Consulta de Overpass para obtener todas las farmacias en la Comunidad Autónoma de Galicia (ES-GA)
const query = `
[out:json][timeout:180];
area["ISO3166-2"="ES-GA"]->.searchArea;
(
  node["amenity"="pharmacy"](area.searchArea);
  way["amenity"="pharmacy"](area.searchArea);
);
out center;
`;

const postData = 'data=' + encodeURIComponent(query);

// Lista de espejos públicos globales de Overpass para tolerancia a fallos
const OVERPASS_SERVERS = [
  { host: 'lz4.overpass-api.de', path: '/api/interpreter' },
  { host: 'z.overpass-api.de', path: '/api/interpreter' },
  { host: 'overpass.kumi.systems', path: '/api/interpreter' },
  { host: 'overpass-api.de', path: '/api/interpreter' }
];

async function attemptFetch(serverIndex = 0) {
  if (serverIndex >= OVERPASS_SERVERS.length) {
    console.error('Error: Todos los servidores globales de Overpass han fallado.');
    return;
  }

  const server = OVERPASS_SERVERS[serverIndex];
  console.log(`Intentando conectar con servidor Overpass: https://${server.host}${server.path}...`);

  const options = {
    hostname: server.host,
    port: 443,
    path: server.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Origin': 'https://overpass-turbo.eu',
      'Referer': 'https://overpass-turbo.eu/'
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    
    res.on('data', (chunk) => {
      body += chunk;
    });

    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.warn(`[Servidor: ${server.host}] Error: Status ${res.statusCode} ${res.statusMessage}`);
        attemptFetch(serverIndex + 1);
        return;
      }

      try {
        const data = JSON.parse(body);
        const elements = data.elements || [];
        
        if (elements.length === 0) {
          console.warn(`[Servidor: ${server.host}] Devolvió 0 resultados. Probablemente no tiene cobertura global. Saltando...`);
          attemptFetch(serverIndex + 1);
          return;
        }

        console.log(`[Servidor: ${server.host}] Recibidas ${elements.length} entidades. Procesando datos...`);

        const sqlStatements = [];
        sqlStatements.push('-- Script semilla autogenerado con farmacias reales de Galicia');
        sqlStatements.push('create extension if not exists postgis;');
        sqlStatements.push('');
        sqlStatements.push('insert into public.pharmacies (id, name, address, city, postal_code, location, phone) values');

        const valueRows = [];
        let count = 0;

        for (const el of elements) {
          const tags = el.tags || {};
          
          // Sanitizar nombre
          let name = tags.name || tags['brand'] || 'Oficina de Farmacia';
          name = name.replace(/'/g, "''").trim();
          
          // Sanitizar dirección
          const street = tags['addr:street'] || '';
          const number = tags['addr:housenumber'] || '';
          let address = `${street} ${number}`.trim();
          if (!address) {
            address = tags['addr:place'] || 'Dirección no especificada';
          }
          address = address.replace(/'/g, "''");

          // Sanitizar ciudad y código postal
          let city = tags['addr:city'] || tags['addr:suburb'] || 'Desconocido';
          city = city.replace(/'/g, "''");
          const postalCode = tags['addr:postcode'] || '36000'; // Código postal genérico si no existe

          // Coordenadas
          const lat = el.lat || (el.center && el.center.lat);
          const lon = el.lon || (el.center && el.center.lon);

          if (!lat || !lon) continue;

          // Generar UUID determinista basado en el ID de OSM para evitar duplicados en ejecuciones sucesivas
          const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Namespace DNS
          const osmIdStr = `${el.type}/${el.id}`;
          const hash = crypto.createHash('sha1');
          hash.update(namespace + osmIdStr);
          const hex = hash.digest('hex');
          const uuid = [
            hex.substring(0, 8),
            hex.substring(8, 12),
            `4${hex.substring(13, 16)}`, // Versión 4 UUID
            `${((parseInt(hex.substring(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hex.substring(18, 20)}`,
            hex.substring(20, 32)
          ].join('-');

          // Teléfono si existe
          const phone = (tags.phone || tags['contact:phone'] || '').replace(/'/g, "''");

          valueRows.push(`  ('${uuid}', '${name}', '${address}', '${city}', '${postalCode}', st_setsrid(st_makepoint(${lon}, ${lat}), 4326)::geography, ${phone ? `'${phone}'` : 'null'})`);
          count++;
        }

        // Unir las filas con coma
        sqlStatements.push(valueRows.join(',\n') + ';');
        
        // Escribir el archivo final SQL
        const outputPath = path.join(__dirname, '..', '..', 'supabase', 'migrations', '20260523000001_seed_pharmacies.sql');
        fs.writeFileSync(outputPath, sqlStatements.join('\n'), 'utf-8');
        
        console.log(`¡Éxito! Se han indexado ${count} farmacias de Galicia y se ha escrito la migración semilla en:`);
        console.log(outputPath);
      } catch (e) {
        console.error('Error al procesar JSON:', e);
        attemptFetch(serverIndex + 1);
      }
    });
  });

  req.on('error', (e) => {
    console.warn(`[Servidor: ${server.host}] Fallo en la petición: ${e.message}`);
    attemptFetch(serverIndex + 1);
  });

  // Escribir los datos en el cuerpo del request
  req.write(postData);
  req.end();
}

attemptFetch();
