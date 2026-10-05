import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'

export function createUserClient(accessToken) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}

export function createPublicClient() {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function createAuthClient() {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function createServerClient() {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
