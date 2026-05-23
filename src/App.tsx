import { useState, useEffect } from 'react';
import { RouteSidebar } from './components/RouteSidebar';
import { ChatConsole } from './components/ChatConsole';
import type { ChatMessage } from './components/ChatConsole';
import { InteractiveMap } from './components/InteractiveMap';
import { useVoiceInput } from './hooks/useVoiceInput';
import { AppContainer } from './components/AppContainer';
import { LoginScreen } from './components/LoginScreen';
import { parseQueryWithGemini } from './services/geminiService';
import { solveTSP } from './services/routingSolver';
import { supabase } from './services/supabaseClient';
import { onAuthStateChange, signOut, getSession } from './services/authService';
import type { Pharmacy, Route, RouteStop } from './types';
import type { Session } from '@supabase/supabase-js';

// Puntos de partida predefinidos para delegados en Galicia
const START_POINTS: { [key: string]: { name: string; latitude: number; longitude: number } } = {
  coruna: { name: 'A Coruña (Sede Central)', latitude: 43.362, longitude: -8.406 },
  santiago: { name: 'Santiago (Delegación)', latitude: 42.879, longitude: -8.544 },
  vigo: { name: 'Vigo (Delegación Sur)', latitude: 42.235, longitude: -8.715 }
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [activeStops, setActiveStops] = useState<RouteStop[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [startPointKey, setStartPointKey] = useState<string>('coruna');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [authError, setAuthError] = useState(false);

  // Gestión de sesión de autenticación
  useEffect(() => {
    // Cargar sesión existente
    getSession().then((s) => {
      setSession(s);
      setAuthLoading(false);
    }).catch(() => {
      setAuthLoading(false);
    });

    // Escuchar cambios de auth (login, logout, token refresh)
    const unsubscribe = onAuthStateChange((s) => {
      setSession(s);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  // Inicializar historial de chat
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content: '¡Hola! Soy tu asistente de rutas. Puedo optimizar tu agenda de visitas farmacéuticas en Galicia.\n\nEscribe o di por voz consultas como:\n* "Planifica una ruta para mañana en Santiago"\n* "¿Qué farmacias tengo pendientes en Pontevedra?"',
      type: 'text',
      timestamp: new Date()
    }
  ]);

  // Listener para el estado de conectividad a Internet
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Cargar datos iniciales desde Supabase directamente
  useEffect(() => {
    const initData = async () => {
      if (import.meta.env.VITE_SUPABASE_ANON_KEY === 'TU_ANON_PUBLIC_KEY_AQUI' || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        setAuthError(true);
        return;
      }
      if (!isOnline) return;
      if (!session) {
        console.log('[Init] ⏳ No hay sesión activa, esperando login...');
        return;
      }

      console.log('[Init] 🚀 Sesión detectada. Usuario:', session.user.email, '| ID:', session.user.id);

      // 0. Asegurar que existe el perfil del usuario (FK requerida por routes)
      //    Usa RPC con SECURITY DEFINER para bypassar RLS en profiles
      try {
        console.log('[Init] 📝 Asegurando perfil del usuario via RPC...');
        const userName = session.user.user_metadata?.full_name || session.user.email || 'Delegado';
        const { error: profileErr } = await supabase.rpc('ensure_user_profile', {
          p_full_name: userName
        });
        if (profileErr) {
          console.error('[Init] ❌ Error en ensure_user_profile RPC:', profileErr);
          // Fallback: intentar INSERT directo por si la RPC no existe aún
          console.log('[Init] 🔄 Fallback: intentando INSERT directo...');
          const { error: insertErr } = await supabase.from('profiles').insert({
            id: session.user.id,
            full_name: userName,
            role: 'delegado'
          });
          if (insertErr && !insertErr.message?.includes('duplicate')) {
            console.error('[Init] ❌ Fallback INSERT también falló:', insertErr);
          } else {
            console.log('[Init] ✅ Perfil creado via fallback INSERT.');
          }
        } else {
          console.log('[Init] ✅ Perfil asegurado correctamente.');
        }
      } catch (err) {
        console.error('[Init] ❌ Error verificando perfil:', err);
      }

      try {
        // 1. Contar farmacias
        const { count, error: countErr } = await supabase
          .from('pharmacies')
          .select('*', { count: 'exact', head: true });

        console.log('[Init] 📊 Count farmacias:', count, '| Error:', countErr);

        if (!countErr && count === 0) {
          console.log('[Init] Base de datos vacía. Disparando importación automática...');
          const { data: funcData, error: funcError } = await supabase.functions.invoke('import-pharmacies');
          console.log('[Init] Resultado importación:', funcData, '| Error:', funcError);
        }

        // 2. Cargar farmacias — usar columnas individuales, NO el campo location completo
        //    PostGIS geography se devuelve como WKB hex, inútil en el cliente.
        //    Necesitamos extraer lat/lng con ST_Y/ST_X en el servidor.
        //    Intentamos primero via RPC, si no existe, parseamos manualmente.
        let mapped: Pharmacy[] = [];

        // Intento 1: RPC con PostGIS (más fiable)
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_pharmacies_with_coords').limit(2000);

        if (!rpcError && rpcData && rpcData.length > 0) {
          console.log('[Init] ✅ RPC get_pharmacies_with_coords OK:', rpcData.length, 'farmacias');
          console.log('[Init] 🔍 Muestra primera farmacia:', JSON.stringify(rpcData[0]));
          mapped = rpcData.map((p: any) => ({
            id: p.id,
            xunta_id: p.xunta_id,
            name: p.name,
            address: p.address,
            city: p.city,
            postal_code: p.postal_code,
            latitude: parseFloat(p.latitude) || 0,
            longitude: parseFloat(p.longitude) || 0,
            phone: p.phone,
            email: p.email,
            contact_person: p.contact_person,
            notes: p.notes
          }));
        } else {
          // Intento 2: Query normal + parseo manual del WKT/hex
          console.warn('[Init] ⚠️ RPC no disponible o falló:', rpcError?.message, '— intentando parseo manual...');
          const { data: dbPharmacies, error: dbError } = await supabase.from('pharmacies').select('*');

          if (dbError) {
            console.error('[Init] ❌ Error SELECT farmacias:', dbError);
            throw dbError;
          }

          console.log('[Init] 📦 Datos crudos recibidos:', dbPharmacies?.length, 'filas');
          if (dbPharmacies && dbPharmacies.length > 0) {
            console.log('[Init] 🔍 Muestra primer registro crudo:', JSON.stringify(dbPharmacies[0]));
            console.log('[Init] 🔍 Tipo de location:', typeof dbPharmacies[0].location, '| Valor:', dbPharmacies[0].location);
          }

          if (dbPharmacies) {
            mapped = dbPharmacies.map((p: any) => {
              let lat = 0, lng = 0;

              if (p.location) {
                // Caso A: GeoJSON (object con coordinates)
                if (typeof p.location === 'object' && p.location.coordinates) {
                  lng = p.location.coordinates[0];
                  lat = p.location.coordinates[1];
                }
                // Caso B: WKT string tipo "POINT(-8.406 43.362)"
                else if (typeof p.location === 'string') {
                  const wktMatch = p.location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
                  if (wktMatch) {
                    lng = parseFloat(wktMatch[1]);
                    lat = parseFloat(wktMatch[2]);
                  }
                }
              }

              // Fallback: campos directos latitude/longitude si existen
              if (lat === 0 && lng === 0) {
                lat = parseFloat(p.latitude) || 0;
                lng = parseFloat(p.longitude) || 0;
              }

              return {
                id: p.id,
                xunta_id: p.xunta_id,
                name: p.name,
                address: p.address,
                city: p.city,
                postal_code: p.postal_code,
                latitude: lat,
                longitude: lng,
                phone: p.phone,
                email: p.email,
                contact_person: p.contact_person,
                notes: p.notes
              };
            });
          }
        }

        // Filtrar farmacias sin coordenadas válidas
        const valid = mapped.filter(p => p.latitude !== 0 && p.longitude !== 0);
        const invalid = mapped.length - valid.length;
        console.log(`[Init] 📍 Farmacias con coordenadas válidas: ${valid.length}/${mapped.length} (${invalid} sin coords)`);

        if (valid.length > 0) {
          console.log('[Init] 🔍 Ejemplo farmacia mapeada:', valid[0].name, '→', valid[0].latitude, valid[0].longitude);
        }

        setPharmacies(valid);

      } catch (err: any) {
        console.error('[Init] ❌ Error al cargar catálogo de farmacias de Supabase:', err);
        if (err?.status === 401 || err?.status === 403 || err?.message?.includes('JWT')) {
          setAuthError(true);
        }
      }

      // 3. Cargar el historial de rutas
      try {
        const { data: dbRoutes, error: dbError } = await supabase
          .from('routes')
          .select('*')
          .order('date', { ascending: false });

        console.log('[Init] 🗺️ Rutas cargadas:', dbRoutes?.length, '| Error:', dbError);

        if (dbError) throw dbError;

        if (dbRoutes) {
          setRoutes(dbRoutes);
          if (dbRoutes.length > 0) {
            setActiveRouteId(dbRoutes[0].id);
          }
        }
      } catch (err) {
        console.error('[Init] ❌ Error al cargar historial de rutas:', err);
      }
    };

    initData();
  }, [isOnline, session]);

  // Cargar las paradas correspondientes cuando cambia la ruta activa
  useEffect(() => {
    if (!activeRouteId) {
      setActiveStops([]);
      return;
    }

    const loadStops = async () => {
      try {
        const { data: dbStops, error: dbError } = await supabase
          .from('route_stops')
          .select('*')
          .eq('route_id', activeRouteId)
          .order('stop_order', { ascending: true });
        
        if (dbError) throw dbError;
        if (dbStops) {
          setActiveStops(dbStops);
        }
      } catch (err) {
        console.error('Error al cargar paradas de la ruta activa desde Supabase:', err);
      }
    };

    loadStops();
  }, [activeRouteId]);

  // Procesador de transcripción de voz
  const handleTranscript = (transcript: string) => {
    handleSendMessage(transcript);
  };

  const { toggleListening, isListening } = useVoiceInput({
    onTranscript: handleTranscript
  });

  // Procesador NLP del chatbot que interactúa con Gemini
  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: 'user',
      content: text,
      type: 'text',
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const geminiResult = await parseQueryWithGemini(text, pharmacies);
      
      if (geminiResult.isRouteProposal && geminiResult.selectedPharmacyIds.length > 0) {
        const selectedPharms = geminiResult.selectedPharmacyIds
          .map((id) => pharmacies.find((p) => p.id === id))
          .filter((p): p is Pharmacy => !!p);

        const start = START_POINTS[startPointKey] || START_POINTS.coruna;
        const { orderedWaypoints, totalDistanceKm } = solveTSP(start.latitude, start.longitude, selectedPharms);

        const stopsMetadata = orderedWaypoints.map((p, idx) => ({
          id: p.id,
          name: p.name,
          city: p.city,
          order: idx + 1
        }));

        const calculatedDurationMinutes = Math.round((totalDistanceKm / 70) * 60) + orderedWaypoints.length * 20;

        const reply: ChatMessage = {
          id: Math.random().toString(),
          sender: 'assistant',
          content: geminiResult.reply,
          type: 'route_card',
          timestamp: new Date(),
          metadata: {
            title: geminiResult.routeTitle,
            stopsCount: orderedWaypoints.length,
            distanceKm: totalDistanceKm,
            durationMinutes: calculatedDurationMinutes,
            stops: stopsMetadata
          }
        };
        setMessages((prev) => [...prev, reply]);
      } else {
        const reply: ChatMessage = {
          id: Math.random().toString(),
          sender: 'assistant',
          content: geminiResult.reply,
          type: 'text',
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, reply]);
      }
    } catch (err) {
      console.error('Error al procesar consulta con Gemini:', err);
      const errorReply: ChatMessage = {
        id: Math.random().toString(),
        sender: 'assistant',
        content: 'Lo siento, no he podido procesar tu solicitud en este momento. Inténtalo de nuevo.',
        type: 'error',
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Guardar la propuesta de ruta al pulsar "Aplicar al mapa" directamente en Supabase
  const handleApplyRoute = async (meta: any) => {
    console.log('[ApplyRoute] 🟡 Botón pulsado. Meta recibido:', JSON.stringify(meta));

    if (!meta || !meta.stops) {
      console.error('[ApplyRoute] ❌ Meta es null o no tiene stops. Abortando.');
      return;
    }

    console.log('[ApplyRoute] 📋 Stops a guardar:', meta.stops.length);

    const newRouteId = crypto.randomUUID();
    const userId = session?.user?.id || '00000000-0000-0000-0000-000000000000';
    console.log('[ApplyRoute] 🔑 User ID para delegado_id:', userId);

    const newRoute: Route = {
      id: newRouteId,
      delegado_id: userId,
      name: meta.title || 'Ruta sin nombre',
      date: new Date().toISOString().split('T')[0],
      status: 'active',
      distance_meters: meta.distanceKm * 1000,
      duration_seconds: meta.durationMinutes * 60,
    };

    const stopsToAdd: RouteStop[] = meta.stops.map((stop: any, idx: number) => ({
      id: crypto.randomUUID(),
      route_id: newRouteId,
      pharmacy_id: stop.id,
      stop_order: idx + 1,
      status: 'pending'
    }));

    console.log('[ApplyRoute] 📦 Ruta a insertar:', JSON.stringify(newRoute));
    console.log('[ApplyRoute] 📦 Paradas a insertar:', JSON.stringify(stopsToAdd));

    try {
      // 1. Guardar ruta en la nube
      console.log('[ApplyRoute] ⏳ Insertando ruta en Supabase...');
      const { error: routeErr } = await supabase.from('routes').insert(newRoute);
      if (routeErr) {
        console.error('[ApplyRoute] ❌ Error al insertar ruta:', routeErr);
        throw routeErr;
      }
      console.log('[ApplyRoute] ✅ Ruta insertada OK');

      // 2. Guardar las paradas de la ruta en la nube
      console.log('[ApplyRoute] ⏳ Insertando paradas en Supabase...');
      const { error: stopsErr } = await supabase.from('route_stops').insert(stopsToAdd);
      if (stopsErr) {
        console.error('[ApplyRoute] ❌ Error al insertar paradas:', stopsErr);
        throw stopsErr;
      }
      console.log('[ApplyRoute] ✅ Paradas insertadas OK');

      // 3. Actualizar estados locales reactivos
      setRoutes((prev) => [newRoute, ...prev]);
      setActiveStops(stopsToAdd);
      setActiveRouteId(newRouteId);

      console.log('[ApplyRoute] ✅ Estado local actualizado. Ruta activa:', newRouteId);

      // Notificar confirmación en el chat
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: 'assistant',
          content: `¡Ruta guardada y aplicada con éxito en Supabase! Ya puedes iniciar tus visitas y marcar check-ins.`,
          type: 'text',
          timestamp: new Date()
        }
      ]);
    } catch (err: any) {
      console.error('[ApplyRoute] ❌ Error completo:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: 'assistant',
          content: `Fallo al persistir la ruta en el servidor: ${err.message || JSON.stringify(err)}`,
          type: 'error',
          timestamp: new Date()
        }
      ]);
    }
  };

  // Modificación del estado de una parada (Check-in/Check-out o saltar)
  const handleUpdateStopStatus = async (
    stopId: string,
    status: 'pending' | 'completed' | 'skipped',
    notes?: string
  ) => {
    const updates: any = { status };
    if (status === 'completed') {
      updates.check_in_time = new Date().toISOString();
      updates.check_out_time = new Date().toISOString();
    }
    if (notes) {
      updates.notes = notes;
    }

    try {
      const { error } = await supabase
        .from('route_stops')
        .update(updates)
        .eq('id', stopId);
      
      if (error) throw error;

      // Actualizar reactivamente
      setActiveStops((prev) =>
        prev.map((stop) => (stop.id === stopId ? { ...stop, ...updates } : stop))
      );
    } catch (err) {
      console.error('Error al actualizar estado de visita en Supabase:', err);
    }
  };

  // Reordenación física en el mapa por arrastrar
  const handleReorderStops = async (newStops: RouteStop[]) => {
    setActiveStops(newStops); // Actualización optimista

    try {
      const payload = newStops.map((stop) => ({
        id: stop.id,
        route_id: stop.route_id,
        pharmacy_id: stop.pharmacy_id,
        stop_order: stop.stop_order,
        status: stop.status,
        check_in_time: stop.check_in_time || null,
        check_out_time: stop.check_out_time || null,
        notes: stop.notes || null
      }));

      const { error } = await supabase
        .from('route_stops')
        .upsert(payload, { onConflict: 'id' });
      
      if (error) throw error;
    } catch (err) {
      console.error('Error al reordenar paradas en el servidor:', err);
      // Revertir en caso de error
      if (activeRouteId) {
        const { data } = await supabase
          .from('route_stops')
          .select('*')
          .eq('route_id', activeRouteId)
          .order('stop_order', { ascending: true });
        if (data) setActiveStops(data);
      }
    }
  };

  // Eliminar una ruta completa de la nube
  const handleDeleteRoute = async (routeId: string) => {
    try {
      const { error } = await supabase
        .from('routes')
        .delete()
        .eq('id', routeId);
      
      if (error) throw error;

      const remaining = routes.filter((r) => r.id !== routeId);
      setRoutes(remaining);
      
      if (activeRouteId === routeId) {
        setActiveRouteId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error('Error al borrar la ruta de Supabase:', err);
    }
  };

  // Eliminar una parada individual de la ruta activa en la nube y reordenar las demás
  const handleDeleteStop = async (stopId: string) => {
    const stopToDelete = activeStops.find((s) => s.id === stopId);
    if (!stopToDelete) return;

    try {
      // 1. Borrar de Supabase
      const { error: delError } = await supabase
        .from('route_stops')
        .delete()
        .eq('id', stopId);
      
      if (delError) throw delError;

      // 2. Reordenar paradas locales remanentes
      const remaining = activeStops.filter((s) => s.id !== stopId);
      const reordered = remaining.map((stop, idx) => ({
        ...stop,
        stop_order: idx + 1
      }));

      // 3. Upsert en Supabase del nuevo orden secuencial
      if (reordered.length > 0) {
        const payload = reordered.map((s) => ({
          id: s.id,
          route_id: s.route_id,
          pharmacy_id: s.pharmacy_id,
          stop_order: s.stop_order,
          status: s.status,
          check_in_time: s.check_in_time || null,
          check_out_time: s.check_out_time || null,
          notes: s.notes || null
        }));

        const { error: upsertErr } = await supabase
          .from('route_stops')
          .upsert(payload, { onConflict: 'id' });
        
        if (upsertErr) throw upsertErr;
      }

      setActiveStops(reordered);
    } catch (err) {
      console.error('Error al eliminar la parada en Supabase:', err);
    }
  };

  // Cambiar origen de ruta dinámicamente y recalcular ruta activa en caliente
  const handleStartPointChange = async (key: string) => {
    setStartPointKey(key);

    if (activeRouteId && activeStops.length > 0) {
      const stopsPharmacies = activeStops
        .map((s) => pharmacies.find((p) => p.id === s.pharmacy_id))
        .filter((p): p is Pharmacy => !!p);

      const start = START_POINTS[key] || START_POINTS.coruna;
      
      // RECALCULAR CON EL ALGORITMO CLÁSICO TSP DESDE EL NUEVO ORIGEN
      const { orderedWaypoints, totalDistanceKm } = solveTSP(start.latitude, start.longitude, stopsPharmacies);

      // Reordenar localmente
      const updatedStopsList: RouteStop[] = [];
      for (let i = 0; i < orderedWaypoints.length; i++) {
        const pharm = orderedWaypoints[i];
        const originalStop = activeStops.find((s) => s.pharmacy_id === pharm.id);
        if (originalStop) {
          updatedStopsList.push({
            ...originalStop,
            stop_order: i + 1
          });
        }
      }

      const calculatedDurationMinutes = Math.round((totalDistanceKm / 70) * 60) + orderedWaypoints.length * 20;

      try {
        // 1. Actualizar métricas de la ruta
        const { error: routeErr } = await supabase
          .from('routes')
          .update({
            distance_meters: totalDistanceKm * 1000,
            duration_seconds: calculatedDurationMinutes * 60
          })
          .eq('id', activeRouteId);
        
        if (routeErr) throw routeErr;

        // 2. Upsert de paradas reordenadas en Supabase
        const payload = updatedStopsList.map((s) => ({
          id: s.id,
          route_id: s.route_id,
          pharmacy_id: s.pharmacy_id,
          stop_order: s.stop_order,
          status: s.status
        }));

        const { error: stopsErr } = await supabase
          .from('route_stops')
          .upsert(payload, { onConflict: 'id' });
        
        if (stopsErr) throw stopsErr;

        // Actualizar estados reactivos
        setActiveStops(updatedStopsList.sort((a, b) => a.stop_order - b.stop_order));
        
        // Recargar listado de rutas
        const { data: allRoutes } = await supabase
          .from('routes')
          .select('*')
          .order('date', { ascending: false });
        if (allRoutes) setRoutes(allRoutes);

      } catch (err) {
        console.error('Error al recalcular ruta desde origen en Supabase:', err);
      }
    }
  };

  // Cerrar sesión
  const handleLogout = async () => {
    try {
      await signOut();
      setSession(null);
      setPharmacies([]);
      setRoutes([]);
      setActiveRouteId(null);
      setActiveStops([]);
    } catch (err) {
      console.error('[Auth] Error al cerrar sesión:', err);
    }
  };

  // Pantalla de carga durante la verificación de sesión
  if (authLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-muted)',
        fontFamily: 'Outfit, sans-serif',
        fontSize: '0.9rem'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32,
            height: 32,
            border: '3px solid rgba(79, 172, 254, 0.2)',
            borderTopColor: 'var(--accent-blue)',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
            margin: '0 auto 12px'
          }} />
          Verificando sesión…
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Gate de autenticación: si no hay sesión, mostrar login
  if (!session) {
    return <LoginScreen onLoginSuccess={() => {
      // El listener onAuthStateChange se encargará de setSession
    }} />;
  }

  const userName = session.user?.user_metadata?.full_name || session.user?.email || 'Delegado';

  return (
    <AppContainer>
      {authError && (
        <div className="auth-error-banner">
          <div className="banner-content">
            <strong>⚠️ Error de Credenciales:</strong> La clave <code>VITE_SUPABASE_ANON_KEY</code> en tu archivo <code>.env</code> es el valor de prueba. Reemplázala con tu clave <code>anon public</code> de Supabase para poder operar.
          </div>
        </div>
      )}
      <RouteSidebar
        routes={routes}
        activeRouteId={activeRouteId}
        onSelectRoute={setActiveRouteId}
        onDeleteRoute={handleDeleteRoute}
        delegadoName={userName}
        startPointKey={startPointKey}
        onStartPointChange={handleStartPointChange}
        pharmaciesCount={pharmacies.length}
        onLogout={handleLogout}
      />
      <ChatConsole
        messages={messages}
        onSendMessage={handleSendMessage}
        onApplyRoute={handleApplyRoute}
        isProcessing={isProcessing}
        voiceActive={isListening}
        onToggleVoice={toggleListening}
      />
      <InteractiveMap
        activeRouteStops={activeStops}
        pharmacies={pharmacies}
        polyline=""
        isOnline={isOnline}
        onUpdateStopStatus={handleUpdateStopStatus}
        onReorderStops={handleReorderStops}
        onDeleteStop={handleDeleteStop}
      />

      <style>{`
        .auth-error-banner {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(239, 68, 68, 0.2);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(239, 68, 68, 0.4);
          border-radius: 8px;
          padding: 12px 24px;
          color: #fca5a5;
          font-size: 0.85rem;
          z-index: 99999;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          max-width: 550px;
          text-align: center;
          animation: slideDown 0.3s ease-out;
        }

        .auth-error-banner code {
          background: rgba(0, 0, 0, 0.4);
          padding: 2px 6px;
          border-radius: 4px;
          color: var(--accent-cyan);
          font-family: monospace;
          font-size: 0.8rem;
        }

        @keyframes slideDown {
          from { transform: translate(-50%, -50px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
    </AppContainer>
  );
}
