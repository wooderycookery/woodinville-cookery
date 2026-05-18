import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token, itemId } = req.body
  if (!token || !itemId) return res.status(400).json({ error: 'Missing required fields' })

  // Validate token → get guest
  const { data: guest, error: guestError } = await supabase
    .from('guests')
    .select('id, event_id')
    .eq('invite_token', token)
    .single()

  if (guestError || !guest) return res.status(404).json({ error: 'Invalid token' })

  // Verify item belongs to the same event as this guest
  const { data: item, error: itemError } = await supabase
    .from('bring_list_items')
    .select('id, event_id, label, slots_total')
    .eq('id', itemId)
    .single()

  if (itemError || !item) return res.status(404).json({ error: 'Item not found' })
  if (item.event_id !== guest.event_id) return res.status(403).json({ error: 'Item does not belong to this event' })

  // Check slots available
  const { count: claimCount } = await supabase
    .from('bring_list_claims')
    .select('*', { count: 'exact', head: true })
    .eq('item_id', itemId)

  if (claimCount >= item.slots_total) {
    return res.status(409).json({ error: 'No slots available for this item' })
  }

  // Check guest hasn't already claimed anything for this event
  const { data: existingClaim } = await supabase
    .from('bring_list_claims')
    .select('id, bring_list_items(label)')
    .eq('guest_id', guest.id)
    .maybeSingle()

  if (existingClaim) {
    return res.status(409).json({
      error: 'already_claimed',
      claimedLabel: existingClaim.bring_list_items?.label,
    })
  }

  // Insert claim
  const { error: claimError } = await supabase
    .from('bring_list_claims')
    .insert({ item_id: itemId, guest_id: guest.id })

  if (claimError) {
    if (claimError.code === '23505') {
      return res.status(409).json({ error: 'already_claimed' })
    }
    return res.status(500).json({ error: 'Failed to save claim' })
  }

  return res.status(200).json({ success: true, label: item.label })
}
