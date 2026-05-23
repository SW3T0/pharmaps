import { supabase } from './supabaseClient';
import type { Session, User } from '@supabase/supabase-js';


export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

/**
 * Inicia sesión con email y contraseña.
 * Si el usuario no existe, lo registra automáticamente (solo para el MVP).
 */
export async function signIn(email: string, password: string) {
  // Intentar login directo
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    // Si el usuario no existe, crearlo automáticamente (MVP)
    if (error.message.includes('Invalid login credentials')) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: 'Delegado de Prueba',
            role: 'delegado'
          }
        }
      });

      if (signUpError) throw signUpError;

      // Supabase puede requerir confirmación de email.
      // Si el usuario fue creado pero no confirmado, intentar login de nuevo.
      if (signUpData.session) {
        return signUpData;
      }

      // Si no hay sesión tras signup, probablemente requiere confirmación.
      // Intentar login de nuevo por si auto-confirm está habilitado.
      const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (retryError) throw retryError;
      return retryData;
    }

    throw error;
  }

  return data;
}

/**
 * Cierra la sesión activa.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Obtiene la sesión actual.
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

/**
 * Suscribe un listener a cambios de autenticación.
 * Retorna la función de limpieza para el useEffect.
 */
export function onAuthStateChange(callback: (session: Session | null) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => subscription.unsubscribe();
}
