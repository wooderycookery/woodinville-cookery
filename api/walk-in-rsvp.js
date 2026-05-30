import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)

const STATUS_LABELS = {
  attending: 'Attending',
  maybe: 'I hope to make it',
  declined: 'Send my regrets',
}

function confirmationHtml({ guestName, eventName, eventDate, rsvpStatus, eventUrl, icsUrl, appUrl }) {
  const logoUrl = `${appUrl}/wcs_logo.png`
  const heading = rsvpStatus === 'attending' ? "We'll set a place for you."
    : rsvpStatus === 'maybe' ? 'We hope the evening finds you free.'
    : "We're sorry to miss you this time."
  const subtext = rsvpStatus === 'attending' ? 'We look forward to the evening.'
    : rsvpStatus === 'maybe' ? "We'll keep your place in mind."
    : 'We hope to share a table another evening.'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>RSVP — ${eventName}</title>
</head>
<body style="margin:0;padding:40px 0;background-color:#F5F0E8;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background-color:#F5F0E8;">
    <div style="text-align:center;padding-bottom:4px;">
      <img src="${logoUrl}" alt="Woodinville Cookery Society" width="180" style="height:auto;display:inline-block;" />
    </div>
    <div style="width:40px;height:1px;background:#B87C5A;margin:16px auto;"></div>
    <div style="padding:32px 48px 0;text-align:center;">
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 10px;">RSVP ${STATUS_LABELS[rsvpStatus] || rsvpStatus}</p>
      <p style="font-family:Georgia,serif;font-size:26px;font-weight:400;color:#2C4A2E;margin:0 0 10px;line-height:1.3;">${heading}</p>
      <p style="font-size:14px;color:#5A6B5C;margin:0 0 0;">${subtext}</p>
      <div style="width:40px;height:1px;background:#B87C5A;margin:24px auto;"></div>
      <p style="font-family:Georgia,serif;font-size:16px;color:#2C4A2E;margin:0 0 8px;">${eventName}</p>
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 24px;">${eventDate}</p>
      ${rsvpStatus !== 'declined' ? `<a href="${eventUrl}" style="display:inline-block;background:#2C4A2E;color:#F5F0E8;padding:14px 40px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-family:'Inter',system-ui,sans-serif;">See the details</a>` : ''}
      ${icsUrl ? `<p style="margin:20px 0 0;"><a href="${icsUrl}" style="font-size:12px;color:#B87C5A;font-family:'Inter',system-ui,sans-serif;letter-spacing:0.04em;">Add this evening to your calendar</a></p>` : ''}
    </div>
    <div style="margin-top:40px;padding:20px 48px;border-top:1px solid #DDD5C8;text-align:center;">
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 8px;">Woodinville Cookery Society · woodinvillecookery.com</p>
      <p style="font-size:11px;color:#8C9E8E;margin:0;">You received this invitation to ${eventName} on ${eventDate} from the Woodinville Cookery Society.</p>
    </div>
  </div>
</body>
</html>`
}

function confirmationText({ eventName, eventDate, rsvpStatus, eventUrl }) {
  const heading = rsvpStatus === 'attending' ? "We'll set a place for you."
    : rsvpStatus === 'maybe' ? 'We hope the evening finds you free.'
    : "We're sorry to miss you this time."
  return [
    'WOODINVILLE COOKERY SOCIETY',
    '',
    heading,
    `RSVP: ${STATUS_LABELS[rsvpStatus] || rsvpStatus}`,
    '',
    eventName,
    eventDate,
    '',
    rsvpStatus !== 'declined' ? `View event page: ${eventUrl}` : '',
    '',
    'Woodinville Cookery Society · woodinvillecookery.com',
  ].join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, name, email, rsvpStatus, dietaryNotes, guestCount, optIn, appUrl } = req.body

  if (!eventId || !name?.trim() || !rsvpStatus) {
    return res.status(400).json({ error: 'eventId, name, and rsvpStatus are required' })
  }
  if (!['attending', 'maybe', 'declined'].includes(rsvpStatus)) {
    return res.status(400).json({ error: 'Invalid RSVP status' })
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name, date')
    .eq('id', eventId)
    .single()
  if (eventError || !event) return res.status(404).json({ error: 'Event not found' })

  const normalizedEmail = email?.toLowerCase().trim() || null
  const trimmedName = name.trim()

  // Find or create contact
  let contact
  if (normalizedEmail) {
    const { data: found } = await supabase
      .from('contacts')
      .select('id, tags')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (found) {
      contact = found
      const updates = { name: trimmedName }
      if (optIn) {
        const existing = found.tags || []
        if (!existing.includes('wcs_updates')) updates.tags = [...existing, 'wcs_updates']
      }
      await supabase.from('contacts').update(updates).eq('id', found.id)
    } else {
      const insertData = { email: normalizedEmail, name: trimmedName }
      if (optIn) insertData.tags = ['wcs_updates']
      const { data: created, error: insertError } = await supabase
        .from('contacts')
        .insert(insertData)
        .select('id')
        .single()
      if (insertError) return res.status(500).json({ error: 'Failed to create contact' })
      contact = created
    }
  } else {
    // No email — use a placeholder to satisfy the NOT NULL constraint on contacts.email
    const placeholder = `walkin_${crypto.randomUUID()}@noemail.invalid`
    const insertData = { email: placeholder, name: trimmedName }
    if (optIn) insertData.tags = ['wcs_updates']
    const { data: created, error: insertError } = await supabase
      .from('contacts')
      .insert(insertData)
      .select('id')
      .single()
    if (insertError) return res.status(500).json({ error: 'Failed to create contact' })
    contact = created
  }

  // Find or create guest record for this event
  const { data: existingGuest } = await supabase
    .from('guests')
    .select('id, invite_token')
    .eq('contact_id', contact.id)
    .eq('event_id', eventId)
    .maybeSingle()

  const rsvpData = {
    rsvp_status: rsvpStatus,
    rsvp_at: new Date().toISOString(),
    dietary_notes: dietaryNotes || null,
    guest_count: (rsvpStatus === 'attending' || rsvpStatus === 'maybe')
      ? Math.max(1, parseInt(guestCount, 10) || 1)
      : null,
  }

  let guestToken, guestId
  if (existingGuest) {
    await supabase.from('guests').update(rsvpData).eq('id', existingGuest.id)
    guestToken = existingGuest.invite_token
    guestId = existingGuest.id
  } else {
    guestToken = crypto.randomUUID()
    const { data: newGuest, error: guestInsertError } = await supabase
      .from('guests')
      .insert({ contact_id: contact.id, event_id: eventId, invite_token: guestToken, ...rsvpData })
      .select('id')
      .single()
    if (guestInsertError) return res.status(500).json({ error: 'Failed to create guest record' })
    guestId = newGuest.id
  }

  // Send confirmation email if provided
  if (normalizedEmail) {
    try {
      const eventUrl = `${appUrl}/event/${eventId}?token=${guestToken}`
      const icsUrl = rsvpStatus !== 'declined'
        ? `${appUrl}/api/generate-ics?eventId=${eventId}&token=${guestToken}`
        : null
      const formattedDate = new Date(event.date + 'T12:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'America/Los_Angeles',
      })
      await resend.emails.send({
        from: 'Woodinville Cookery Society <events@woodinvillecookery.com>',
        reply_to: `WCS — ${event.name} <events@woodinvillecookery.com>`,
        to: [normalizedEmail],
        subject: rsvpStatus === 'attending'
          ? `We'll set a place for you — ${event.name}`
          : rsvpStatus === 'maybe'
          ? `We hope to see you — ${event.name}`
          : `Thank you for letting us know — ${event.name}`,
        html: confirmationHtml({ guestName: trimmedName, eventName: event.name, eventDate: formattedDate, rsvpStatus, eventUrl, icsUrl, appUrl }),
        text: confirmationText({ eventName: event.name, eventDate: formattedDate, rsvpStatus, eventUrl }),
        headers: { 'X-Entity-Ref-ID': `wcs-rsvp-${guestId}` },
      })
    } catch (emailErr) {
      console.error('Walk-in confirmation email failed:', emailErr)
      // RSVP was saved — don't fail over email
    }
  }

  return res.status(200).json({
    token: guestToken,
    guestId,
    guestName: trimmedName,
    guestEmail: normalizedEmail,
    rsvpStatus,
  })
}
