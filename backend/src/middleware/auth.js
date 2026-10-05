import { createServerClient, createUserClient } from '../supabase.js'
import { getAccessibleBusinessIds } from '../database.js'

export async function requireAuth(request, response, next) {
  const authorization = request.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'Authentication required' })
  }

  const accessToken = authorization.slice('Bearer '.length).trim()
  if (!accessToken) return response.status(401).json({ error: 'Authentication required' })

  const client = createUserClient(accessToken)
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user) return response.status(401).json({ error: 'Invalid or expired session' })

  request.accessToken = accessToken
  request.user = data.user
  request.supabase = createServerClient()
  return next()
}

export function requireRoles(...roles) {
  return async (request, response, next) => {
    const { data, error } = await request.supabase
      .from('users')
      .select('id, role, full_name, phone')
      .eq('id', request.user.id)
      .maybeSingle()

    if (error) return next(error)
    if (!data || !roles.includes(data.role)) return response.status(403).json({ error: 'Insufficient permissions' })

    request.profile = data
    request.businessIds = await getAccessibleBusinessIds(request.user.id)
    return next()
  }
}
