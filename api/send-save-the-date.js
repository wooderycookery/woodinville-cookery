import { Resend } from 'resend'
import { render } from '@react-email/render'
import SaveTheDateEmail from '../src/emails/SaveTheDateEmail.jsx'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    eventId,
    eventName,
    eventDate,
    hostNames,
    teaserLine,
    heroImageUrl,
    emails,
    appUrl,
  } = req.body

  if (!emails || emails.length === 0) {
    return res.status(400).json({ error: 'No recipient emails provided' })
  }

  const formattedDate = new Date(eventDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })

  const eventUrl = `${appUrl}/event/${eventId}`

  let html
  try {
    html = await render(
      SaveTheDateEmail({
        eventName,
        eventDate: formattedDate,
        hostNames,
        teaserLine,
        heroImageUrl,
        eventUrl,
      })
    )
  } catch (err) {
    console.error('Email render error:', err)
    return res.status(500).json({ error: 'Failed to render email template' })
  }

  // Resend supports up to 50 recipients per batch call
  const BATCH_SIZE = 50
  const batches = []
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    batches.push(emails.slice(i, i + BATCH_SIZE))
  }

  try {
    for (const batch of batches) {
      await resend.emails.send({
        from: 'Woodinville Cookery Society <events@woodinvillecookery.com>',
        to: batch,
        subject: `Save the Date — ${eventName}`,
        html,
      })
    }
    return res.status(200).json({ sent: emails.length })
  } catch (err) {
    console.error('Resend error:', err)
    return res.status(500).json({ error: err.message || 'Failed to send email' })
  }
}
