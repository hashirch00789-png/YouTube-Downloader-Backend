# YouTube backend starter for Render

This Node.js/Express API validates YouTube URLs and retrieves metadata through YouTube's official oEmbed endpoint. It is a deployment starter, not a video-file downloader.

## Endpoints
- `GET /health` — health check
- `POST /api/resolve` — accepts `{"url":"https://www.youtube.com/watch?v=VIDEO_ID"}` and returns metadata, thumbnail, watch URL, and embed URL.

## Run locally
1. Install Node.js 20 or newer.
2. Run `npm install` in this folder.
3. Run `npm start`.
4. Open `http://localhost:10000/health`.

## Deploy on Render
1. Push these files to a GitHub repository.
2. In Render, choose **New + → Web Service** and connect the repository.
3. Runtime: Node; Build command: `npm install`; Start command: `npm start`.
4. Deploy. Open `https://YOUR-SERVICE.onrender.com/health`; expect `{"ok":true,...}`.
5. Use `https://YOUR-SERVICE.onrender.com/api/resolve` as the API endpoint in your Elementor frontend.

## Test
Send POST JSON `{"url":"https://youtu.be/dQw4w9WgXcQ"}` to `/api/resolve`.

## Important limitation
YouTube's official oEmbed endpoint provides metadata, not the video file. The YouTube Data API does not provide a general-purpose endpoint for downloading arbitrary video files. For content you own, use the original source file or an authorized storage/download workflow and build file downloads around that source. Never commit secrets to GitHub.
