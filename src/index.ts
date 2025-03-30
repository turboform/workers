import { fromHono } from "chanfana";
import { StripeWebhooks } from 'endpoints/v1/stripe/webhooks';
import { Hono } from "hono";

// Start a Hono app
const app = new Hono();

// Setup OpenAPI registry
const openapi = fromHono(app, {
  docs_url: "/", // TODO: hide docs when in production
});

openapi.post('/v1/stripe/webhooks', StripeWebhooks)

// Export the Hono app
export default app;
