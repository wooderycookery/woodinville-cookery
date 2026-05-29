import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)

function renderHtml({ eventName, eventDate, hostNames, teaserLine, heroImageUrl, eventUrl, appUrl }) {
  const logoUrl     = `${appUrl}/wcs_logo.png`
  const heroSection = heroImageUrl
    ? `<img src="${heroImageUrl}" alt="" style="width:100%;max-height:280px;object-fit:cover;display:block;" />`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Save the Date — ${eventName}</title>
</head>
<body style="margin:0;padding:40px 0;background-color:#F5F0E8;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background-color:#F5F0E8;">

    <div style="text-align:center;padding-bottom:4px;">
      <img src="${logoUrl}" alt="Woodinville Cookery Society" width="180" style="height:auto;display:inline-block;" />
    </div>
    <div style="width:40px;height:1px;background:#B87C5A;margin:16px auto;"></div>

    ${heroSection}

    <div style="padding:32px 48px 0;text-align:center;">
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 10px;">Mark the date</p>
      <p style="font-family:Georgia,serif;font-size:28px;font-weight:400;color:#2C4A2E;margin:0 0 10px;line-height:1.3;">${eventName}</p>
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 10px;">${eventDate}</p>
      ${hostNames ? `<p style="font-size:13px;color:#5A6B5C;margin:0 0 0;">Hosted by ${hostNames}</p>` : ''}
      <div style="width:40px;height:1px;background:#B87C5A;margin:24px auto;"></div>
      <p style="font-size:15px;color:#3D5A3E;line-height:1.8;margin:0 0 20px;">You are warmly invited to hold ${eventDate} for an evening with the Woodinville Cookery Society. The full details follow in the weeks ahead. For now, simply know that a place at the table is yours if you want it.</p>
      ${teaserLine ? `<p style="font-size:15px;font-style:italic;color:#3D5A3E;line-height:1.8;margin:0 0 32px;">${teaserLine}</p>` : ''}
      <a href="${eventUrl}" style="display:inline-block;background:#2C4A2E;color:#F5F0E8;padding:14px 40px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-family:'Inter',system-ui,sans-serif;">See the details</a>
    </div>

    <div style="margin-top:40px;padding:20px 48px;border-top:1px solid #DDD5C8;text-align:center;">
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 8px;">Woodinville Cookery Society · woodinvillecookery.com</p>
      <p style="font-size:11px;color:#8C9E8E;margin:0;">You received this invitation to ${eventName} on ${eventDate} from the Woodinville Cookery Society.</p>
    </div>

  </div>
</body>
</html>`
}

function renderText({ eventName, eventDate, hostNames, teaserLine, eventUrl }) {
  return [
    'WOODINVILLE COOKERY SOCIETY',
    '',
    'SAVE THE DATE',
    '',
    eventName,
    eventDate,
    '',
    hostNames ? `Hosted by ${hostNames}` : '',
    '',
    teaserLine || '',
    '',
    `View the event page: ${eventUrl}`,
    '',
    `You received this invitation to ${eventName} on ${eventDate} from the Woodinville Cookery Society.`,
  ].filter(l => l !== undefined).join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, guests, appUrl } = req.body

  if (!eventId || !guests?.length) {
    return res.status(400).json({ error: 'eventId and guests are required' })
  }

  // Load event data (using service role so no RLS issues)
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name, date, description, vibe')
    .eq('id', eventId)
    .single()

  if (eventError || !event) return res.status(404).json({ error: 'Event not found' })

  let vibeData = {}
  try { vibeData = JSON.parse(event.vibe) } catch {}

  const formattedDate = new Date(event.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })

  const baseEventUrl = `${appUrl}/event/${event.id}`
  const guestList = []

  for (const { name, email } of guests) {
    // Find-or-create: look up by email first to avoid hitting the NOT NULL
    // constraint on contacts.name when inserting a brand-new address with no name.
    let contact
    const { data: found } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (found) {
      contact = found
      // Only update name when a real name was provided — never overwrite an
      // existing name with null/empty.
      if (name) {
        await supabase.from('contacts').update({ name }).eq('id', found.id)
      }
    } else {
      const { data: created, error: insertError } = await supabase
        .from('contacts')
        .insert({ email, name: name || email })
        .select('id')
        .single()
      if (insertError) { console.error('contact insert:', insertError); continue }
      contact = created
    }

    const { data: existing } = await supabase
      .from('guests')
      .select('id, invite_token')
      .eq('contact_id', contact.id)
      .eq('event_id', event.id)
      .maybeSingle()

    if (existing) {
      guestList.push({ email, token: existing.invite_token, isNew: false })
      continue
    }

    const token = crypto.randomUUID()
    const { error: guestError } = await supabase
      .from('guests')
      .insert({ contact_id: contact.id, event_id: event.id, invite_token: token })
    if (guestError) { console.error('guest insert:', guestError); continue }

    guestList.push({ email, token, isNew: true })
  }

  // Send invitations only to newly added guests
  const newGuests = guestList.filter(g => g.isNew)
  if (newGuests.length > 0) {
    const batch = newGuests.map(({ email, token }) => {
      const eventUrl = `${baseEventUrl}?token=${token}`
      return {
        from: 'Woodinville Cookery Society <events@woodinvillecookery.com>',
        reply_to: `WCS — ${event.name} <events@woodinvillecookery.com>`,
        to: [email],
        subject: `Mark the date — ${event.name}`,
        html: renderHtml({
          eventName: event.name,
          eventDate: formattedDate,
          hostNames: vibeData.hostNames || '',
          teaserLine: event.description || '',
          heroImageUrl: vibeData.heroImageUrl || null,
          eventUrl,
          appUrl,
        }),
        text: renderText({
          eventName: event.name,
          eventDate: formattedDate,
          hostNames: vibeData.hostNames || '',
          teaserLine: event.description || '',
          eventUrl,
        }),
        headers: {
          'List-Unsubscribe': `<mailto:events@woodinvillecookery.com?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-Entity-Ref-ID': `wcs-std-${event.id}`,
        },
      }
    })

    try {
      await resend.batch.send(batch)
    } catch (err) {
      console.error('Resend batch error:', err)
      return res.status(500).json({ error: 'Guests added but email send failed: ' + err.message })
    }
  }

  return res.status(200).json({
    added: newGuests.length,
    skipped: guestList.length - newGuests.length,
    total: guestList.length,
  })
}
