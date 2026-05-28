/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface DatasetSummary {
  dataset_key: string
  status?: string
  strategy?: string
  candidates?: number
  processed?: number
  error?: string
}

interface AdminRetentionAlertProps {
  alertKind?: 'run_failed' | 'high_candidates' | 'large_processed_jump' | 'missing_runs'
  runId?: string | null
  mode?: 'live' | 'dry-run'
  jobName?: string
  datasets?: DatasetSummary[]
  dashboardUrl?: string
  detectedAt?: string
  message?: string
}

const KIND_LABEL: Record<string, string> = {
  run_failed: 'Prune-retention run failed',
  high_candidates: 'High candidate volume detected',
  large_processed_jump: 'Unusual processed-row spike',
  missing_runs: 'Prune-retention has not run recently',
}

const AdminRetentionAlertEmail = ({
  alertKind = 'run_failed',
  runId,
  mode = 'live',
  jobName,
  datasets = [],
  dashboardUrl,
  detectedAt,
  message,
}: AdminRetentionAlertProps) => {
  const title = KIND_LABEL[alertKind] ?? 'Retention alert'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>⚠️ {title}</Heading>
          {message && <Text style={text}>{message}</Text>}
          <Section style={panel}>
            <Text style={row}><strong>Mode:</strong> {mode}</Text>
            {jobName && <Text style={row}><strong>Job:</strong> {jobName}</Text>}
            {runId && <Text style={rowMuted}><strong>Run ID:</strong> {runId}</Text>}
            <Text style={row}><strong>Detected:</strong> {detectedAt ?? new Date().toISOString()}</Text>
          </Section>
          {datasets.length > 0 && (
            <Section style={panel}>
              <Text style={{ ...row, fontWeight: 'bold' as const }}>Datasets</Text>
              {datasets.map((d) => (
                <Text key={d.dataset_key} style={row}>
                  • <strong>{d.dataset_key}</strong>
                  {d.strategy ? ` (${d.strategy})` : ''}
                  {typeof d.candidates === 'number' ? ` — ${d.candidates} candidate(s)` : ''}
                  {typeof d.processed === 'number' ? `, ${d.processed} processed` : ''}
                  {d.status ? ` — ${d.status}` : ''}
                  {d.error ? ` — ⚠️ ${d.error}` : ''}
                </Text>
              ))}
            </Section>
          )}
          {dashboardUrl && (
            <Text style={text}>
              <Link href={dashboardUrl} style={link}>Open the Retention Monitor</Link> for the full report and to retry.
            </Text>
          )}
          <Text style={footer}>WhatSaid · Admin alert</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AdminRetentionAlertEmail,
  subject: (d: Record<string, any>) =>
    `[WhatSaid] ${KIND_LABEL[d.alertKind] ?? 'Retention alert'}`,
  displayName: 'Admin · Retention alert',
  previewData: {
    alertKind: 'run_failed',
    runId: '00000000-0000-0000-0000-000000000000',
    mode: 'live',
    jobName: 'prune-retention',
    datasets: [
      { dataset_key: 'cleanup_logs', strategy: 'delete', candidates: 120, processed: 0, status: 'failed', error: 'permission denied' },
    ],
    dashboardUrl: 'https://whatsaid.app/admin',
    detectedAt: new Date().toISOString(),
    message: 'One or more datasets reported errors during the last run.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
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
  background: 'hsl(40, 80%, 96%)',
  border: '1px solid hsl(40, 60%, 85%)',
  borderRadius: '12px',
  padding: '14px 18px',
  margin: '0 0 18px',
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
  margin: '6px 0 0',
  lineHeight: '1.5',
  wordBreak: 'break-all' as const,
}
const link = { color: 'hsl(250, 75%, 55%)', textDecoration: 'underline' }
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 0' }
