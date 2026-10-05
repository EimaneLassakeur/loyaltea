import 'dotenv/config'

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL']

export const config = {
  port: Number(process.env.PORT || 3000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  authRedirectUrl: process.env.AUTH_REDIRECT_URL || `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/auth/callback`,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  databaseUrl: process.env.DATABASE_URL,
  databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  nodeEnv: process.env.NODE_ENV || 'development',
}

export function assertConfig() {
  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing backend environment variables: ${missing.join(', ')}`)
  }
}
