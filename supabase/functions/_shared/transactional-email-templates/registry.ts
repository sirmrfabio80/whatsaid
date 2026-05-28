/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as adminNewSignup } from './admin-new-signup.tsx'
import { template as adminCreditPurchase } from './admin-credit-purchase.tsx'
import { template as adminDsrRectification } from './admin-dsr-rectification.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'admin-new-signup': adminNewSignup,
  'admin-credit-purchase': adminCreditPurchase,
  'admin-dsr-rectification': adminDsrRectification,
}
