import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { config } from './config.js'
import apiRouter from './routes/api.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: config.frontendOrigin, credentials: false }))
  app.use(express.json({ limit: '100kb' }))
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))

  app.get('/health', (_request, response) => response.json({ ok: true, service: 'loyaltea-api' }))
  app.use('/api', apiRouter)

  app.use((_request, response) => response.status(404).json({ error: 'Route not found' }))
  app.use((error, _request, response, _next) => {
    console.error(error)
    const status = error.status || error.statusCode || 500
    response.status(status).json({ error: status >= 500 && config.nodeEnv === 'production' ? 'Internal server error' : error.message })
  })

  return app
}
