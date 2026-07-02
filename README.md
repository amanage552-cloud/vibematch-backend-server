# Vibematch Server

## Deploy to Render

1. Push this repository to GitHub.
2. Open Render and create a New Web Service.
3. Connect the GitHub repository.
4. Use these settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add the environment variable:
   - `NODE_ENV=production`
6. Deploy.

## Deploy to Railway

1. Push this repository to GitHub.
2. Open Railway and create a New Project.
3. Deploy from GitHub.
4. Railway will use the existing `npm start` script automatically.

## Notes

- The server listens on `process.env.PORT`.
- A health endpoint is available at `/`.
- If you want periodic keep-alive pings, add `HEARTBEAT_URL` in your deployment environment variables.
