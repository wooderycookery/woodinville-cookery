import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'Token required' })

  // Identify the contact from the token
  const { data: guest, error } = await supabase
    .from('guests')
    .select('contact_id, contacts(name, email)')
    .eq('invite_token', token)
    .single()

  if (error || !guest) return res.status(404).json({ error: 'Invalid token' })

  // Fetch all invitations for this contact
  const { data: invitations, error: invErr } = await supabase
    .from('guests')
    .select('id, rsvp_status, invite_token, events(id, name, date, vibe, description, location, pre_gallery_open, post_gallery_open)')
    .eq('contact_id', guest.contact_id)

  if (invErr) return res.status(500).json({ error: invErr.message })

  return res.status(200).json({
    guest: {
      name: guest.contacts?.name || null,
      email: guest.contacts?.email || null,
    },
    invitations: (invitations || []).map(i => ({
      guestId: i.id,
      token: i.invite_token,
      rsvpStatus: i.rsvp_status || 'no_response',
      event: {
        id: i.events?.id,
        name: i.events?.name,
        date: i.events?.date,
        description: i.events?.description,
        location: i.events?.location,
        vibe: i.events?.vibe,
        preGalleryOpen: i.events?.pre_gallery_open || false,
        postGalleryOpen: i.events?.post_gallery_open || false,
      },
    })),
  })
}
