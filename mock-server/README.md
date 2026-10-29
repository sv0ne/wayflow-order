# Mock server

## Run locally

From this directory:

```sh
npm install
npm run dev
```

The API listens on `http://localhost:8787`. Set `API_PORT` to use another port.

## Deploy to Vercel

Import the repository into Vercel and set **Root Directory** to `mock-server`. Leave the framework/build settings on **Other** / automatic detection, with no custom build or output directory. Vercel detects the Hono app exported by `index.ts` and serves its routes as functions.

If the frontend is deployed separately, set `VITE_API_BASE_URL` in the frontend's Vercel project to the deployed mock-server URL, without a trailing slash.
