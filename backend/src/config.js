import 'dotenv/config'

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL']

export const config = {
  port: Number(process.env.PORT ),
  frontendOrigin: process.env.FRONTEND_ORIGIN ,
  authRedirectUrl: process.env.AUTH_REDIRECT_URL ,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  databaseUrl: process.env.DATABASE_URL,
  databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  nodeEnv: process.env.NODE_ENV ,
  publicSignupEnabled: process.env.PUBLIC_SIGNUP_ENABLED === 'true',
}

export function assertConfig() {
  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing backend environment variables: ${missing.join(', ')}`)
  }
  if (config.nodeEnv === 'production') {
    if (/^https?:\/\/localhost|^http:\/\//i.test(config.frontendOrigin)) throw new Error('FRONTEND_ORIGIN must use HTTPS in production')
    if (!config.databaseSslRejectUnauthorized) throw new Error('DATABASE_SSL_REJECT_UNAUTHORIZED must be true in production')
  }
}
