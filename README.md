# PharmaMaps

PharmaMaps es una aplicación web de enrutamiento inteligente y CRM B2B diseñada específicamente para delegados comerciales farmacéuticos en la región de Galicia.

Ofrece una interfaz vanguardista de estética "glassmorphic dark" que maximiza el contraste en entornos al aire libre (tablets/móviles). Integra inteligencia artificial mediante procesamiento de lenguaje natural geográfico para la planificación automatizada de rutas comerciales.

![UI Preview](public/preview.png) *(Nota: Imagen ilustrativa)*

## Características Principales

1. **Inteligencia Geográfica con IA (Gemini 2.5 Flash)**
   - Chatbot integrado que entiende peticiones de voz y texto.
   - Procesamiento de conceptos territoriales gallegos (ej: *Rías Baixas*, *Costa de Lugo*, *A Mariña*, *Terra Chá*, *Ribeira Sacra*).
   - Traducción de intenciones a listados de paradas pre-optimizadas.

2. **Rutas Reales Asistidas (OSRM + MapLibre)**
   - Trazado de ruta basado en carreteras reales, no simples líneas rectas.
   - Renderizado en alta calidad (HD/Retina) usando cartografía de CartoDB Dark Matter.
   - Pines interactivos numerados con previsualización del nombre de la farmacia.
   - Popups con información detallada, datos de contacto e historial de estados.

3. **Arquitectura Cloud en Tiempo Real (Supabase)**
   - Backend as a Service 100% server-side sin cacheo obsoleto en el cliente.
   - Uso de PostGIS para almacenamiento de la capa espacial de las 1414 farmacias gallegas.
   - Seguridad mediante RLS (Row Level Security) e inyección de contexto de usuario autenticado.

4. **Automatización de Catálogo**
   - Importador CRON mediante Supabase Edge Functions.
   - Consulta directa contra la Overpass API de OpenStreetMap con parseo determinista a formato UUID (SHA-1).

## Stack Tecnológico

- **Frontend:** React 19, TypeScript, Vite 8, CSS3 Vanilla (variables, glassmorphism)
- **Mapas y Geometría:** MapLibre GL JS, OSRM (Open Source Routing Machine)
- **Backend & Auth:** Supabase Auth, PostgreSQL, PostGIS
- **NLP / Inteligencia Artificial:** Google Gemini 2.5 Flash API
- **Iconografía:** Lucide React

## Requisitos y Configuración

Para lanzar PharmaMaps localmente, necesitas tener instalado Node.js (v18+) y disponer de las siguientes claves de entorno.

Crea un archivo `.env` en el directorio raíz de la aplicación con:

```env
VITE_SUPABASE_URL=tu_supabase_project_url
VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key
VITE_GEMINI_API_KEY=tu_gemini_api_key
```

### Ejecución Local

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Generar build de producción
npm run build
```

## Arquitectura de Base de Datos (Supabase)

Asegúrate de ejecutar las siguientes migraciones SQL en tu editor de Supabase:

1. **Migración Inicial (`20260523000000_init.sql`)**: Creación de la tabla `pharmacies` (PostGIS `geography(Point, 4326)`), `profiles`, `routes` y `route_stops`.
2. **Setup de Seguridad y Perfiles (`20260523000005_ensure_profile_rpc.sql`)**: RPC `ensure_user_profile` con `SECURITY DEFINER` para permitir auto-creación del perfil al logearse.
3. **RPC Geográfico (`20260523000004_rpc_pharmacies_coords.sql`)**: Extracción automatizada de coordenadas ST_X y ST_Y debido al formateo WKB de PostGIS.
4. **Nomenclatura (`20260523000006_route_name_column.sql`)**: Columna de nombre dinámico para el historial de rutas.

## Estado del Proyecto (MVP)

PharmaMaps se encuentra en un estado funcional de **Minimum Viable Product (MVP)**, listo para ser testeado por delegados comerciales. 

Todas las features principales (Login, Autocompletado, Parsing de IA Geográfica, Trazado OSRM, Guardado y Check-in) están implementadas y conectadas.

---
*Desarrollado como prototipo corporativo B2B - Sector Farmacéutico.*
