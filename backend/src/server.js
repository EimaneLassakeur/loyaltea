import { createApp } from './app.js'
import { assertConfig, config } from './config.js'
import { expireSubscriptions } from './subscription.js'

assertConfig()

const app = createApp()
app.listen(config.port, () => {
  console.log(`Loyaltea API listening on http://localhost:${config.port}`)
})

const expirationTimer = setInterval(() => {
  expireSubscriptions().catch((error) => console.error(JSON.stringify({ event: 'subscription_expiration_failed', message: error.message })))
}, 15 * 60 * 1000)
expirationTimer.unref?.()
