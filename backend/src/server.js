import { createApp } from './app.js'
import { assertConfig, config } from './config.js'
import { checkDatabaseConnection } from './database.js'
import { expireSubscriptions } from './subscription.js'

assertConfig()

const app = createApp()
const server = app.listen(config.port, () => {
  console.log(`Loyaltea API listening on port ${config.port}`)
})

checkDatabaseConnection().then(() => {
  console.log(JSON.stringify({ event: 'database_connection_check', ok: true }))
}).catch((error) => {
  console.error(JSON.stringify({ event: 'database_connection_check', ok: false, name: error.name, code: error.code }))
  server.close(() => process.exitCode = 1)
})

const expirationTimer = setInterval(() => {
  expireSubscriptions().catch((error) => console.error(JSON.stringify({ event: 'subscription_expiration_failed', message: error.message })))
}, 15 * 60 * 1000)
expirationTimer.unref?.()
