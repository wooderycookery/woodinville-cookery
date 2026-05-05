import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Img,
  Text,
  Hr,
  Link,
  Font,
} from '@react-email/components'

export default function SaveTheDateEmail({
  eventName = 'Woodinville Cookery Society Dinner',
  eventDate = 'Friday, July 11, 2026',
  hostNames = 'Your Hosts',
  teaserLine = 'Something delicious is coming.',
  heroImageUrl = null,
  eventUrl = 'https://woodinvillecookery.com',
}) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Georgia"
          fallbackFontFamily="serif"
        />
      </Head>
      <Body style={body}>
        <Container style={container}>

          {/* Hero image */}
          {heroImageUrl && (
            <Section style={{ padding: 0, margin: 0 }}>
              <Img
                src={heroImageUrl}
                alt={eventName}
                width="600"
                style={heroImg}
              />
            </Section>
          )}

          {/* Header band */}
          <Section style={headerBand}>
            <Text style={wordmark}>WOODINVILLE COOKERY SOCIETY</Text>
          </Section>

          {/* Body */}
          <Section style={bodySection}>
            <Text style={saveTheDateLabel}>Save the Date</Text>

            <Text style={eventNameStyle}>{eventName}</Text>

            <Text style={dateStyle}>{eventDate}</Text>

            <Hr style={divider} />

            <Text style={hostedBy}>Hosted by {hostNames}</Text>

            <Text style={teaser}>{teaserLine}</Text>

            <Hr style={divider} />

            <Link href={eventUrl} style={ctaButton}>
              View Event Page
            </Link>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Full invitation coming soon — Woodinville Cookery Society
            </Text>
            <Text style={footerMeta}>
              You received this because you were invited by your host.
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  )
}

const body = {
  backgroundColor: '#F9F6F1',
  fontFamily: 'Georgia, serif',
  margin: 0,
  padding: '32px 0',
}

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '4px',
  overflow: 'hidden',
}

const heroImg = {
  width: '100%',
  maxHeight: '320px',
  objectFit: 'cover',
  display: 'block',
}

const headerBand = {
  backgroundColor: '#1B3A2D',
  padding: '16px 32px',
  textAlign: 'center',
}

const wordmark = {
  color: '#F9F6F1',
  fontSize: '10px',
  letterSpacing: '4px',
  margin: 0,
  fontFamily: 'system-ui, sans-serif',
}

const bodySection = {
  padding: '40px 48px',
  textAlign: 'center',
}

const saveTheDateLabel = {
  color: '#C8873C',
  fontSize: '11px',
  letterSpacing: '3px',
  textTransform: 'uppercase',
  fontFamily: 'system-ui, sans-serif',
  margin: '0 0 16px',
}

const eventNameStyle = {
  color: '#1B3A2D',
  fontSize: '28px',
  fontFamily: 'Georgia, serif',
  margin: '0 0 12px',
  lineHeight: '1.3',
}

const dateStyle = {
  color: '#1B3A2D',
  fontSize: '18px',
  fontWeight: 'bold',
  fontFamily: 'Georgia, serif',
  margin: '0 0 24px',
}

const divider = {
  borderColor: '#1B3A2D',
  opacity: 0.1,
  margin: '24px 0',
}

const hostedBy = {
  color: '#1B3A2D',
  fontSize: '14px',
  fontFamily: 'system-ui, sans-serif',
  margin: '0 0 16px',
  opacity: 0.7,
}

const teaser = {
  color: '#1B3A2D',
  fontSize: '18px',
  fontStyle: 'italic',
  fontFamily: 'Georgia, serif',
  margin: '0 0 32px',
  lineHeight: '1.5',
}

const ctaButton = {
  display: 'inline-block',
  backgroundColor: '#1B3A2D',
  color: '#F9F6F1',
  padding: '12px 32px',
  borderRadius: '4px',
  textDecoration: 'none',
  fontSize: '13px',
  letterSpacing: '1px',
  fontFamily: 'system-ui, sans-serif',
}

const footer = {
  backgroundColor: '#F9F6F1',
  padding: '24px 48px',
  textAlign: 'center',
  borderTop: '1px solid rgba(27,58,45,0.1)',
}

const footerText = {
  color: '#1B3A2D',
  fontSize: '13px',
  fontFamily: 'Georgia, serif',
  fontStyle: 'italic',
  margin: '0 0 8px',
  opacity: 0.8,
}

const footerMeta = {
  color: '#1B3A2D',
  fontSize: '11px',
  fontFamily: 'system-ui, sans-serif',
  margin: 0,
  opacity: 0.4,
}
