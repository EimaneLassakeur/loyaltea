import 'dotenv/config'
import { Buffer } from 'node:buffer'

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL']
const connectionStringSslParameters = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']

export function readCertificate(value = process.env.DATABASE_SSL_CA, base64Value = process.env.DATABASE_SSL_CA_B64) {
  if (base64Value) return Buffer.from(base64Value.replace(/\s+/g, ''), 'base64').toString('utf8')
  return value?.replace(/\\n/g, '\n').trim() || ''
}

export function getConflictingSslParameters(databaseUrl) {
  const url = new URL(databaseUrl)
  return connectionStringSslParameters.filter((parameter) => url.searchParams.has(parameter))
}

export function sanitizeDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl)
  for (const parameter of connectionStringSslParameters) url.searchParams.delete(parameter)
  return url.toString()
}

export function buildDatabaseSsl(databaseUrl, ca) {
  const url = new URL(databaseUrl)
  return {
    ca,
    rejectUnauthorized: true,
    servername: url.hostname,
  }
}

const databaseUrl = process.env.DATABASE_URL || ''
const databaseCa = readCertificate()

export const config = {
  port: Number(process.env.PORT || 3000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || '',
  authRedirectUrl: process.env.AUTH_REDIRECT_URL || '',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  databaseUrl,
  databaseConnectionString: databaseUrl ? sanitizeDatabaseUrl(databaseUrl) : '',
  databaseSslCa: databaseCa,
  databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true',
  databaseSsl: databaseUrl && databaseCa ? buildDatabaseSsl(databaseUrl, databaseCa) : null,
  nodeEnv: process.env.NODE_ENV || 'development',
  publicSignupEnabled: process.env.PUBLIC_SIGNUP_ENABLED === 'true',
}

export function assertConfig() {
  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) throw new Error(`Missing backend environment variables: ${missing.join(', ')}`)
  if (!['development', 'test', 'production'].includes(config.nodeEnv)) throw new Error('NODE_ENV must be development, test, or production')
  if (!config.databaseSslCa) throw new Error('DATABASE_SSL_CA_B64 or DATABASE_SSL_CA must contain the Supabase CA certificate')
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'true') throw new Error('DATABASE_SSL_REJECT_UNAUTHORIZED must be true')
  const conflictingSslParameters = getConflictingSslParameters(config.databaseUrl)
  if (conflictingSslParameters.length) throw new Error(`DATABASE_URL must not contain SSL parameters: ${conflictingSslParameters.join(', ')}`)
  if (config.nodeEnv === 'production') {
    if (/^https?:\/\/localhost|^http:\/\//i.test(config.frontendOrigin)) throw new Error('FRONTEND_ORIGIN must use HTTPS in production')
    if (!config.databaseSsl) throw new Error('A verified PostgreSQL SSL configuration is required in production')
  }
}
