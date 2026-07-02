import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, item, category, token, authorId, isHostProvided } = req.body
  if (!eventId || !item?.trim()) return res.status(400).json({ error: 'Missing required fields' })

  let name = 'Host'
  let rsvp_id = null
  const is_host_provided = isHostProvided === true

  if (authorId) {
    const { data: event } = await supabase
      .from('events')
      .select('host_id')
      .eq('id', eventId)
      .single()
    if (!event || event.host_id !== authorId) {
      return res.status(403).json({ error: 'Not authorized' })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', authorId)
      .single()
    name = profile?.display_name || 'Host'
  } else if (token) {
    const { data: guest } = await supabase
      .from('guests')
      .select('id, contacts(name)')
      .eq('invite_token', token)
      .eq('event_id', eventId)
      .single()
    if (!guest) return res.status(403).json({ error: 'Invalid token' })
    rsvp_id = guest.id
    name = guest.contacts?.name?.split(' ')[0] || 'Guest'
  } else {
    return res.status(403).json({ error: 'Authentication required' })
  }

  const { data: contribution, error } = await supabase
    .from('table_contributions')
    .insert({
      event_id: eventId,
      rsvp_id,
      name,
      item: item.trim(),
      category: category || null,
      is_host_provided,
    })
    .select('id, name, item, category, is_host_provided, rsvp_id, created_at')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ contribution })
}
