import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { contributionId, token, authorId, eventId } = req.body
  if (!contributionId) return res.status(400).json({ error: 'Missing contributionId' })

  const { data: contribution } = await supabase
    .from('table_contributions')
    .select('id, rsvp_id, event_id')
    .eq('id', contributionId)
    .single()

  if (!contribution) return res.status(404).json({ error: 'Not found' })

  if (authorId) {
    const { data: event } = await supabase
      .from('events')
      .select('host_id')
      .eq('id', contribution.event_id)
      .single()
    if (!event || event.host_id !== authorId) {
      return res.status(403).json({ error: 'Not authorized' })
    }
  } else if (token) {
    const { data: guest } = await supabase
      .from('guests')
      .select('id')
      .eq('invite_token', token)
      .eq('event_id', contribution.event_id)
      .single()
    if (!guest || guest.id !== contribution.rsvp_id) {
      return res.status(403).json({ error: 'Not authorized' })
    }
  } else {
    return res.status(403).json({ error: 'Authentication required' })
  }

  const { error } = await supabase
    .from('table_contributions')
    .delete()
    .eq('id', contributionId)

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}
