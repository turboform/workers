import Stripe from 'stripe';

export const stripeClient = (apiKey: string) => new Stripe(
  apiKey,
  {
    apiVersion: '2025-02-24.acacia',
  }
)
