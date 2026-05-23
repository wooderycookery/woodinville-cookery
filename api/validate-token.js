import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'Missing token' })

  const { data: guest, error } = await supabase
    .from('guests')
    .select('id, rsvp_status, rsvp_at, dietary_notes, guest_count, contacts(name, email)')
    .eq('invite_token', token)
    .single()

  if (error || !guest) return res.status(404).json({ valid: false })

  return res.status(200).json({
    valid: true,
    guestId: guest.id,
    rsvpStatus: guest.rsvp_status,
    rsvpAt: guest.rsvp_at,
    dietaryNotes: guest.dietary_notes,
    guestCount: guest.guest_count ?? 1,
    guestName: guest.contacts?.name,
    guestEmail: guest.contacts?.email,
  })
}
