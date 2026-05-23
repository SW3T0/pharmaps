const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

const url = 'https://overpass-api.de/api/interpreter';

async function fetchPharmacies() {
  console.log('Solicitando farmacias de Galicia a la API de Overpass (OpenStreetMap)...');
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      throw new Error(`Error en API de Overpass: ${response.statusText}`);
    }

    const data = await response.json();
    const elements = data.elements || [];
    console.log(`Recibidas ${elements.length} entidades. Procesando datos...`);

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
  } catch (err) {
    console.error('Error al generar la semilla de farmacias:', err);
  }
}

fetchPharmacies();
