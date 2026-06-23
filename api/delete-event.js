import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })

  const accessToken = authHeader.slice(7)
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { eventId } = req.body
  if (!eventId) return res.status(400).json({ error: 'eventId is required' })

  const { data: event } = await supabase
    .from('events')
    .select('id, host_id')
    .eq('id', eventId)
    .single()

  if (!event) return res.status(404).json({ error: 'Event not found' })
  if (event.host_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

  const { error } = await supabase.from('events').delete().eq('id', eventId)
  if (error) return res.status(500).json({ error: 'Failed to delete event' })

  return res.status(200).json({ deleted: true })
}
