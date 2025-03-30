import { fromHono } from "chanfana";
import { Hono } from "hono";

// Start a Hono app
const app = new Hono();

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});

// Export the Hono app
export default app;
