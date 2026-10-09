import { assertConfig } from './config.js'
import { checkDatabaseConnection, pool } from './database.js'

assertConfig()
try {
  const ok = await checkDatabaseConnection()
  if (!ok) throw new Error('Database connectivity check returned an unexpected result')
  console.log(JSON.stringify({ event: 'database_connection_check', ok: true }))
} catch (error) {
  console.error(JSON.stringify({ event: 'database_connection_check', ok: false, name: error.name, code: error.code }))
  process.exitCode = 1
} finally {
  await pool.end()
}
