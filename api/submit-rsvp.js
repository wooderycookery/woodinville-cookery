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
    : rsvpStatus === 'maybe' ? "We hope the evening finds you free."
    : "We're sorry to miss you this time."
  const subtext = rsvpStatus === 'attending' ? "We look forward to the evening."
    : rsvpStatus === 'maybe' ? "We'll keep your place in mind."
    : "We hope to share a table another evening."

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

function confirmationText({ guestName, eventName, eventDate, rsvpStatus, eventUrl }) {
  const heading = rsvpStatus === 'attending' ? "We'll set a place for you."
    : rsvpStatus === 'maybe' ? "We hope the evening finds you free."
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
    '',
    `You received this invitation to ${eventName} on ${eventDate} from the Woodinville Cookery Society.`,
  ].join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token, rsvpStatus, dietaryNotes, guestCount, appUrl } = req.body

  if (!token || !rsvpStatus) return res.status(400).json({ error: 'Missing required fields' })
  if (!['attending', 'maybe', 'declined'].includes(rsvpStatus)) {
    return res.status(400).json({ error: 'Invalid RSVP status' })
  }

  // Validate token and load guest + event data
  const { data: guest, error: guestError } = await supabase
    .from('guests')
    .select('id, contacts(name, email), events(id, name, date, vibe)')
    .eq('invite_token', token)
    .single()

  if (guestError || !guest) return res.status(404).json({ error: 'Invalid token' })

  // Update RSVP
  const updateData = {
    rsvp_status: rsvpStatus,
    rsvp_at: new Date().toISOString(),
    dietary_notes: dietaryNotes || null,
  }
  if (rsvpStatus === 'attending' || rsvpStatus === 'maybe') {
    updateData.guest_count = Math.max(1, parseInt(guestCount, 10) || 1)
  }
  const { error: updateError } = await supabase
    .from('guests')
    .update(updateData)
    .eq('id', guest.id)

  if (updateError) return res.status(500).json({ error: 'Failed to save RSVP' })

  // Send confirmation email
  const guestEmail = guest.contacts?.email
  const guestName = guest.contacts?.name
  const event = guest.events
  const eventUrl = `${appUrl}/event/${event.id}?token=${token}`
  const icsUrl = rsvpStatus !== 'declined'
    ? `${appUrl}/api/generate-ics?eventId=${event.id}&token=${token}`
    : null

  const formattedDate = new Date(event.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })

  if (guestEmail) {
    try {
      await resend.emails.send({
        from: 'Woodinville Cookery Society <events@woodinvillecookery.com>',
        reply_to: process.env.REPLY_TO_EMAIL,
        to: [guestEmail],
        subject: rsvpStatus === 'attending'
          ? `We'll set a place for you — ${event.name}`
          : rsvpStatus === 'maybe'
          ? `We hope to see you — ${event.name}`
          : `Thank you for letting us know — ${event.name}`,
        html: confirmationHtml({
          guestName, eventName: event.name, eventDate: formattedDate,
          rsvpStatus, eventUrl, icsUrl, appUrl,
        }),
        text: confirmationText({
          guestName, eventName: event.name, eventDate: formattedDate,
          rsvpStatus, eventUrl,
        }),
        headers: {
          'X-Entity-Ref-ID': `wcs-rsvp-${guest.id}`,
        },
      })
    } catch (emailErr) {
      console.error('Confirmation email failed:', emailErr)
      // RSVP was saved — don't fail the request over email
    }
  }

  return res.status(200).json({ success: true, rsvpStatus })
}
