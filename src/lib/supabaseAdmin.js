import { createClient } from '@supabase/supabase-js'

const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY

/**
 * Cliente Supabase con service_role key.
 * ⚠️  Bypasses RLS — usar SOLO en el panel /superadmin.
 * Requiere VITE_SUPABASE_SERVICE_KEY en .env (NO el anon key).
 * Si no está configurado, las acciones de creación/invitación estarán deshabilitadas.
 */
export const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession:   false,
      },
    })
  : null
