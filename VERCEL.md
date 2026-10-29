# Deploying to Vercel

1. Push this project to a Git provider and import it into Vercel. Keep the project root as the Root Directory; do not set a separate build command or output directory because `vercel.json` configures `public` as the static output.
2. In Vercel project settings, add these environment variables for Production (and Preview if needed):
   - `MONGODB_URI`: your MongoDB connection string. In Atlas, allow Vercel's network access according to your security requirements.
   - `JWT_SECRET`: a unique random secret of at least 32 characters. Do not reuse the development secret or commit it.
3. Deploy, then open the Vercel deployment URL. The frontend calls `/api/...` on the same origin; no client URL setting is required.

The `api/[...path].js` function forwards API requests to the Express app. MongoDB connects on the first API request and reuses the connection in warm function instances. Local development remains `npm run dev` at `http://localhost:5000`.

The in-memory login rate limiter is per serverless instance, not shared across instances. For production traffic, use a shared rate-limit store if you need a strict global attempt limit.
