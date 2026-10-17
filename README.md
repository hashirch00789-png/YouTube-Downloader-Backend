# YouTube metadata + authorized file download API (Render)

This project keeps `/api/resolve` for YouTube metadata and adds an authenticated upload endpoint for original video files you own or are authorized to distribute. It does not extract/download arbitrary YouTube streams.

## Render settings
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`

## Environment variables
- `ADMIN_API_KEY`: required secret used only for authenticated uploads. Use a long random value. Never put it in Elementor JavaScript or GitHub.
- `ALLOWED_ORIGIN`: optional comma-separated frontend origin(s), e.g. `https://example.com`. Leave unset during initial testing if needed.
- `MAX_FILE_MB`: optional maximum upload size; defaults to 500.
- `STORE_DIR`: optional storage path; defaults to `/tmp/authorized-video-files`.

## Upload a file you own/are authorized to distribute
Use curl locally; do not expose the admin key in the browser:

```bash
curl -X POST "https://YOUR-RENDER-SERVICE.onrender.com/api/admin/upload-authorized-file" \
  -H "x-admin-api-key: YOUR_ADMIN_API_KEY" \
  -F "video=@/path/to/your-video.mp4"
```

The API returns a `downloadUrl`. Open that URL to download the uploaded file.

## Important storage note
The default `/tmp` storage is temporary and can be cleared when Render restarts/redeploys. For production, attach a Render persistent disk if your plan supports it (set `STORE_DIR` to its mount path), or integrate durable object storage such as S3/R2. The current API's YouTube URL endpoint only retrieves metadata; it intentionally does not download media from YouTube.
