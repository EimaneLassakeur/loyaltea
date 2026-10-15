import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { config } from './config.js'
import apiRouter from './routes/api.js'

export function parseAllowedOrigins(originString) {
  if (!originString) return []
  return originString
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())

  const allowedOrigins = parseAllowedOrigins(config.frontendOrigin)
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        const normalized = origin.trim().replace(/\/+$/, '')
        if (allowedOrigins.length === 0 || allowedOrigins.includes(normalized)) {
          return callback(null, true)
        }
        if (config.nodeEnv === 'development' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
          return callback(null, true)
        }
        return callback(null, false)
      },
      credentials: false,
    })
  )
  app.use(express.json({ limit: '100kb' }))
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))

  app.get('/health', (_request, response) => response.json({ ok: true, service: 'loyaltea-api' }))
  app.use('/api', apiRouter)

  app.use((_request, response) => response.status(404).json({ error: 'Route not found' }))
  app.use((error, request, response, _next) => {
    const status = error.status || error.statusCode || 500
    const code = error.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR')
    console.error(JSON.stringify({ event: 'request_error', method: request.method, path: request.originalUrl, status, code, category: status >= 500 ? 'server' : 'request', name: error.name, message: error.message }))
    response.status(status).json({ error: status >= 500 ? 'Internal server error' : error.message, code })
  })

  return app
}
