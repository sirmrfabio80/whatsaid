

# Enable Paddle Payments & Configure Products

## Step 1: Enable Paddle
Call `enable_paddle_payments` to create a test/sandbox environment on the project. This gives you a Paddle sandbox where you can test checkouts without real money.

## Step 2: Create 3 Products
After enabling, use the Paddle product creation tools to set up:

| Product | Type | Base Price (GBP) | Credits |
|---------|------|------------------|---------|
| One-time transcript | One-time | £4.99 | 1 |
| 5-credit pack | One-time | £14.99 | 5 |
| 20-credit pack | One-time | £39.99 | 20 |

All three are one-time purchases (not subscriptions).

## Step 3: Implement Checkout & Webhooks
After products exist, wire up:
- Paddle checkout overlay on the Pricing page
- Webhook edge function to handle `transaction.completed` events and call `add_credits` to top up the buyer's balance
- Update `paddle-pricing.ts` with real Paddle Price IDs so localised pricing works

## What happens immediately
- A Paddle sandbox is created for testing
- No real payments are processed until you complete Paddle's seller verification for live mode
- Existing UI and pricing code are untouched until products are created

## No changes until approved
This plan covers enabling + product creation + checkout implementation. I will proceed step by step after approval.

