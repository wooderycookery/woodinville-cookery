import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, token } = req.query
  if (!eventId) return res.status(400).json({ error: 'eventId is required' })

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('guest_list_reveal_date')
    .eq('id', eventId)
    .single()

  if (eventError || !event) return res.status(404).json({ error: 'Event not found' })

  const { data: attendingGuests } = await supabase
    .from('guests')
    .select('id, guest_count, contacts(name)')
    .eq('event_id', eventId)
    .eq('rsvp_status', 'attending')

  const attendingCount = (attendingGuests || []).reduce((sum, g) => sum + (g.guest_count || 1), 0)

  const revealDate = event.guest_list_reveal_date
  const revealReached = revealDate && new Date() >= new Date(revealDate + 'T00:00:00')

  let names = null
  if (revealReached && token) {
    const { data: guestRecord } = await supabase
      .from('guests')
      .select('id')
      .eq('invite_token', token)
      .eq('event_id', eventId)
      .maybeSingle()

    if (guestRecord) {
      names = (attendingGuests || [])
        .map(g => (g.contacts?.name || '').split(/\s+/)[0] || null)
        .filter(Boolean)
    }
  }

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ attendingCount, names })
}
