/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

const LOGO_URL = 'https://gidjkdtmagxuzhlntlbt.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SITE_NAME = 'WhatSaid'

const translations: Record<string, {
  preview: string
  heading: string
  body: string
  cta: string
  footer: string
}> = {
  en: {
    preview: `You've been invited to join ${SITE_NAME}`,
    heading: "You've been invited",
    body: `You've been invited to join <strong>${SITE_NAME}</strong>. Click the button below to accept the invitation and create your account.`,
    cta: "Accept Invitation",
    footer: "If you weren't expecting this invitation, you can safely ignore this email.",
  },
  it: {
    preview: `Sei stato invitato a unirti a ${SITE_NAME}`,
    heading: "Sei stato invitato",
    body: `Sei stato invitato a unirti a <strong>${SITE_NAME}</strong>. Clicca il pulsante qui sotto per accettare l'invito e creare il tuo account.`,
    cta: "Accetta l'invito",
    footer: "Se non ti aspettavi questo invito, puoi ignorare questa email.",
  },
  fr: {
    preview: `Vous avez été invité à rejoindre ${SITE_NAME}`,
    heading: "Vous avez été invité",
    body: `Vous avez été invité à rejoindre <strong>${SITE_NAME}</strong>. Cliquez sur le bouton ci-dessous pour accepter l'invitation et créer votre compte.`,
    cta: "Accepter l'invitation",
    footer: "Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet email.",
  },
}

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  locale?: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  locale,
}: InviteEmailProps) => {
  const lang = locale && translations[locale] ? locale : 'en'
  const t = translations[lang]

  return (
    <Html lang={lang} dir="ltr">
      <Head />
      <Preview>{t.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} alt={SITE_NAME} width="48" height="48" style={logo} />
          <Heading style={h1}>{t.heading}</Heading>
          <Text style={text} dangerouslySetInnerHTML={{ __html: t.body }} />
          <Button style={button} href={confirmationUrl}>
            {t.cta}
          </Button>
          <Text style={footer}>
            {t.footer}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const logo = { borderRadius: '12px', marginBottom: '24px' }
const h1 = {
  fontFamily: "'Space Grotesk', Arial, sans-serif",
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: 'hsl(220, 25%, 10%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '15px',
  color: 'hsl(220, 10%, 45%)',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const link = { color: 'hsl(245, 50%, 48%)', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(245, 50%, 48%)',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '12px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '13px', color: '#999999', margin: '32px 0 0' }
