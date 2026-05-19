/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface AdminCreditPurchaseProps {
  userEmail?: string
  credits?: number
  amount?: string
  currency?: string
  transactionId?: string
  newBalance?: number
  userId?: string
  purchasedAt?: string
}

const AdminCreditPurchaseEmail = ({
  userEmail,
  credits,
  amount,
  currency,
  transactionId,
  newBalance,
  userId,
  purchasedAt,
}: AdminCreditPurchaseProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      💰 {userEmail ?? 'A user'} purchased {credits ?? '?'} credits
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>💰 New credit purchase</Heading>
        <Text style={text}>A user just completed a Paddle checkout.</Text>
        <Section style={panel}>
          <Text style={row}><strong>Customer:</strong> {userEmail ?? '—'}</Text>
          <Text style={row}>
            <strong>Credits:</strong> {credits ?? '—'}
          </Text>
          <Text style={row}>
            <strong>Amount:</strong>{' '}
            {amount ? `${amount} ${currency ?? ''}`.trim() : '—'}
          </Text>
          <Text style={row}>
            <strong>New balance:</strong> {newBalance ?? '—'}
          </Text>
          <Text style={row}>
            <strong>Purchased:</strong> {purchasedAt ?? new Date().toISOString()}
          </Text>
          {transactionId && (
            <Text style={rowMuted}>
              <strong>Paddle txn:</strong> {transactionId}
            </Text>
          )}
          {userId && (
            <Text style={rowMuted}>
              <strong>User ID:</strong> {userId}
            </Text>
          )}
        </Section>
        <Text style={footer}>WhatSaid · Admin notification</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AdminCreditPurchaseEmail,
  subject: (d: Record<string, any>) =>
    `💰 Purchase: ${d.credits ?? '?'} credits — ${d.userEmail ?? 'user'}`,
  displayName: 'Admin · Credit purchase',
  previewData: {
    userEmail: 'jane@example.com',
    credits: 5,
    amount: '14.99',
    currency: 'GBP',
    transactionId: 'txn_01h...',
    newBalance: 7,
    userId: '00000000-0000-0000-0000-000000000000',
    purchasedAt: new Date().toISOString(),
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
  background: 'hsl(170, 40%, 96%)',
  border: '1px solid hsl(170, 30%, 88%)',
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
