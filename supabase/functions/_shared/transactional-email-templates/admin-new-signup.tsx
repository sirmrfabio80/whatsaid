/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface AdminNewSignupProps {
  userEmail?: string
  displayName?: string
  signupAt?: string
  userId?: string
}

const AdminNewSignupEmail = ({
  userEmail,
  displayName,
  signupAt,
  userId,
}: AdminNewSignupProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New WhatSaid signup: {userEmail ?? 'unknown'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>🎉 New signup</Heading>
        <Text style={text}>A new user just created a WhatSaid account.</Text>
        <Section style={panel}>
          <Text style={row}><strong>Email:</strong> {userEmail ?? '—'}</Text>
          <Text style={row}><strong>Name:</strong> {displayName ?? '—'}</Text>
          <Text style={row}><strong>Signed up:</strong> {signupAt ?? new Date().toISOString()}</Text>
          {userId && <Text style={rowMuted}><strong>User ID:</strong> {userId}</Text>}
        </Section>
        <Text style={footer}>WhatSaid · Admin notification</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AdminNewSignupEmail,
  subject: (d: Record<string, any>) =>
    `New signup: ${d.userEmail ?? 'unknown'}`,
  displayName: 'Admin · New signup',
  previewData: {
    userEmail: 'jane@example.com',
    displayName: 'Jane Doe',
    signupAt: new Date().toISOString(),
    userId: '00000000-0000-0000-0000-000000000000',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Inter', Arial, sans-serif",
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = {
  fontFamily: "'Space Grotesk', Arial, sans-serif",
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(220, 25%, 10%)',
  margin: '0 0 16px',
}
const text = {
  fontSize: '15px',
  color: 'hsl(220, 10%, 35%)',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const panel = {
  background: 'hsl(250, 40%, 97%)',
  border: '1px solid hsl(250, 30%, 90%)',
  borderRadius: '12px',
  padding: '16px 20px',
  margin: '0 0 24px',
}
const row = {
  fontSize: '14px',
  color: 'hsl(220, 25%, 15%)',
  margin: '4px 0',
  lineHeight: '1.5',
}
const rowMuted = {
  fontSize: '12px',
  color: 'hsl(220, 10%, 50%)',
  margin: '8px 0 0',
  lineHeight: '1.5',
  wordBreak: 'break-all' as const,
}
const footer = {
  fontSize: '12px',
  color: '#999999',
  margin: '24px 0 0',
}
