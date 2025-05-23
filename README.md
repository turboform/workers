# TurboForm API

TurboForm is an AI-powered form builder. This repository contains the web frontend built with Next.js, providing a modern user interface for creating, managing, and distributing forms with AI assistance.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Making Database Changes](#making-database-changes)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)
- [License](#license)

## Features

- **AI Form Generation**: Generate forms automatically using OpenAI
- **Form Management**: Create, read, update, and delete forms
- **Form Submissions**: Handle and store form responses
- **Vector Embeddings**: Semantic search across form responses using pgvector
- **Authentication**: User management with Supabase Auth
- **Payment Processing**: Subscription management with Stripe
- **Email Notifications**: Send notifications with Resend
- **Telegram, Slack, Zapier, Make, Webhooks**: Integrate with external services for notifications and automation

## Architecture

TurboForm API is built with:

- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless compute platform
- [Hono](https://hono.dev/) - Lightweight web framework for Cloudflare Workers
- [Chanfana](https://chanfana.pages.dev/) - OpenAPI documentation generation
- [Supabase](https://supabase.com/) - PostgreSQL database with authentication
- [OpenAI](https://openai.com/) - AI text generation and embeddings
- [Stripe](https://stripe.com/) - Payment processing
- [pgvector](https://github.com/pgvector/pgvector) - Vector similarity search in PostgreSQL

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [npm](https://www.npmjs.com/) v8 or later
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) - Cloudflare Workers CLI
- [Supabase CLI](https://supabase.com/docs/guides/cli) - For database migrations
- A Cloudflare account
- Access to the required external services (Supabase, OpenAI, Stripe, Resend)

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/turboform/workers.git
   cd workers
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy the `.env.example` to `.env` (create it if it doesn't exist)
   - Fill in all required environment variables

```bash
# Supabase credentials
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI API key
OPENAI_API_KEY=your_openai_api_key

# Stripe API keys
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# Resend API key
RESEND_API_KEY=your_resend_api_key
```

## Local Development

1. Make sure you've set up all environment variables in the `.env` file.

2. Start the development server:

   ```bash
   npm run dev
   ```

   or

   ```bash
   wrangler dev
   ```

3. Open `http://localhost:8787/` in your browser to see the Swagger/OpenAPI interface where you can test the endpoints.

4. Changes made in the `src/` folder will automatically trigger the server to reload. You only need to refresh the Swagger interface.

### Development Tips

- Use the `cf-typegen` script to generate TypeScript types for Cloudflare Workers:

  ```bash
  npm run cf-typegen
  ```

- Generate Supabase TypeScript types:
  ```bash
  npm run gen-db-types
  ```

## Making Database Changes

The project uses Supabase migrations to manage database schema changes. Here's how to create and apply database migrations. Checkout these docs to create and apply migrations: [https://supabase.com/docs/guides/deployment/database-migrations](https://supabase.com/docs/guides/deployment/database-migrations)

## Deployment

To deploy the API to Cloudflare Workers:

1. Make sure you're logged in to Cloudflare:

   ```bash
   wrangler login
   ```

2. Deploy to production:

   ```bash
   npm run deploy
   ```

   or

   ```bash
   wrangler deploy
   ```

3. For different environments, you can use environment variables defined in `.dev.vars` (development) and `.prd.vars` (production).

## API Documentation

The API is documented using OpenAPI/Swagger. When running the development server, you can access the documentation at `http://localhost:8787/`.

The documentation is automatically generated from the code using Chanfana. Each endpoint's request and response models are defined in their respective handler files.

## Contributing

We welcome contributions to TurboForm! Here's how you can contribute:

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following the project's code style
4. Commit your changes: `git commit -m 'Add some amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Development Guidelines

- Follow the established project structure and patterns
- Write clean, maintainable code with appropriate comments
- Ensure all linting and type checking passes before submitting

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
