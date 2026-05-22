import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function renderHtml({ eventName, eventDate, hostNames, teaserLine, heroImageUrl, eventUrl, appUrl, formattedDateFull }) {
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

    <!-- Logo -->
    <div style="text-align:center;padding-bottom:4px;">
      <img src="${logoUrl}" alt="Woodinville Cookery Society" width="180" style="height:auto;display:inline-block;" />
    </div>

    <!-- Copper rule -->
    <div style="width:40px;height:1px;background:#B87C5A;margin:16px auto;"></div>

    <!-- Hero image -->
    ${heroSection}

    <!-- Content -->
    <div style="padding:32px 48px 0;text-align:center;">

      <!-- Mark the date label -->
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 10px;">Mark the date</p>

      <!-- Event name -->
      <p style="font-family:Georgia,serif;font-size:28px;font-weight:400;color:#2C4A2E;margin:0 0 10px;line-height:1.3;">${eventName}</p>

      <!-- Date -->
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 10px;">${eventDate}</p>

      <!-- Host -->
      ${hostNames ? `<p style="font-size:13px;color:#5A6B5C;margin:0 0 0;">Hosted by ${hostNames}</p>` : ''}

      <!-- Copper rule -->
      <div style="width:40px;height:1px;background:#B87C5A;margin:24px auto;"></div>

      <!-- Opening -->
      <p style="font-size:15px;color:#3D5A3E;line-height:1.8;margin:0 0 20px;">You are warmly invited to hold ${eventDate} for an evening with the Woodinville Cookery Society. The full details follow in the weeks ahead. For now, simply know that a place at the table is yours if you want it.</p>

      <!-- Teaser -->
      ${teaserLine ? `<p style="font-size:15px;font-style:italic;color:#3D5A3E;line-height:1.8;margin:0 0 32px;">${teaserLine}</p>` : ''}

      <!-- CTA button -->
      <a href="${eventUrl}" style="display:inline-block;background:#2C4A2E;color:#F5F0E8;padding:14px 40px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-family:'Inter',system-ui,sans-serif;">See the details</a>

    </div>

    <!-- Footer -->
    <div style="margin-top:40px;padding:20px 48px;border-top:1px solid #DDD5C8;text-align:center;">
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 8px;">Woodinville Cookery Society · woodinvillecookery.com</p>
      <p style="font-size:11px;color:#8C9E8E;margin:0;">You received this invitation to ${eventName} on ${formattedDateFull} from the Woodinville Cookery Society.</p>
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
    `Hosted by ${hostNames}`,
    '',
    teaserLine,
    '',
    `View the event page: ${eventUrl}`,
    '',
    'Full invitation coming soon — Woodinville Cookery Society',
    '',
    `You received this invitation to ${eventName} on ${eventDate} from the Woodinville Cookery Society.`,
  ].join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { eventId, eventName, eventDate, hostNames, teaserLine, heroImageUrl, guests, emails, appUrl } = req.body

  // Accept either guests:[{email, token}] (new) or emails:[...] (legacy)
  const recipientList = guests && guests.length > 0
    ? guests
    : (emails || []).map(email => ({ email, token: null }))

  if (recipientList.length === 0) {
    return res.status(400).json({ error: 'No recipient emails provided' })
  }

  const formattedDate = new Date(eventDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })

  const baseEventUrl = `${appUrl}/event/${eventId}`

  const BATCH_SIZE = 100
  try {
    for (let i = 0; i < recipientList.length; i += BATCH_SIZE) {
      const batch = recipientList.slice(i, i + BATCH_SIZE).map(({ email, token }) => {
        const eventUrl = token ? `${baseEventUrl}?token=${token}` : baseEventUrl
        const params = { eventName, eventDate: formattedDate, hostNames, teaserLine, heroImageUrl, eventUrl, appUrl, formattedDateFull: formattedDate }
        return {
          from: 'Woodinville Cookery Society <events@woodinvillecookery.com>',
          reply_to: `WCS — ${eventName} <events@woodinvillecookery.com>`,
          to: [email],
          subject: `Mark the date — ${eventName}`,
          html: renderHtml(params),
          text: renderText(params),
          headers: {
            'List-Unsubscribe': `<mailto:events@woodinvillecookery.com?subject=unsubscribe>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            'X-Entity-Ref-ID': `wcs-std-${eventId}`,
          },
        }
      })
      await resend.batch.send(batch)
    }
    return res.status(200).json({ sent: recipientList.length })
  } catch (err) {
    console.error('Resend error:', err)
    return res.status(500).json({ error: err.message || 'Failed to send email' })
  }
}
