import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId } = req.query
  if (!eventId) return res.status(400).json({ error: 'Missing eventId' })

  const { data, error } = await supabase
    .from('table_contributions')
    .select('id, name, item, category, is_host_provided, rsvp_id, created_at')
    .eq('event_id', eventId)
    .order('is_host_provided', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ contributions: data || [] })
}
