/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface AdminDsrRectificationProps {
  requestId?: string
  userEmail?: string
  userId?: string
  field?: string
  requestedValue?: string
  reason?: string
  submittedAt?: string
}

const AdminDsrRectificationEmail = ({
  requestId,
  userEmail,
  userId,
  field,
  requestedValue,
  reason,
  submittedAt,
}: AdminDsrRectificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>DSR rectification request from {userEmail ?? 'unknown user'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>📝 Data correction requested</Heading>
        <Text style={text}>
          A user has submitted a UK GDPR Art. 16 (rectification) request through
          Settings. You have <strong>1 month</strong> from submission to fulfil
          or formally reject it.
        </Text>
        <Section style={panel}>
          <Text style={row}><strong>User:</strong> {userEmail ?? '—'}</Text>
          <Text style={row}><strong>Field:</strong> {field ?? '—'}</Text>
          <Text style={row}><strong>Requested value:</strong> {requestedValue ?? '—'}</Text>
          <Text style={row}><strong>Reason:</strong> {reason ?? '—'}</Text>
          <Text style={row}><strong>Submitted:</strong> {submittedAt ?? new Date().toISOString()}</Text>
          {userId && <Text style={rowMuted}><strong>User ID:</strong> {userId}</Text>}
          {requestId && <Text style={rowMuted}><strong>Request ID:</strong> {requestId}</Text>}
        </Section>
        <Text style={text}>
          Open the Admin → DSRs tab to review and apply the change.
        </Text>
        <Text style={footer}>WhatSaid · Admin notification</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AdminDsrRectificationEmail,
  subject: (d: Record<string, any>) =>
    `Data correction request: ${d.field ?? 'unknown'} (${d.userEmail ?? 'unknown user'})`,
  displayName: 'Admin · DSR rectification',
  previewData: {
    requestId: '00000000-0000-0000-0000-000000000000',
    userEmail: 'jane@example.com',
    userId: '00000000-0000-0000-0000-000000000000',
    field: 'email',
    requestedValue: 'jane.new@example.com',
    reason: 'I changed providers and want the new address on file.',
    submittedAt: new Date().toISOString(),
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
