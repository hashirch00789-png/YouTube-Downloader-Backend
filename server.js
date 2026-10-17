const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 500);
const STORE_DIR = process.env.STORE_DIR || '/tmp/authorized-video-files';
fs.mkdirSync(STORE_DIR, { recursive: true });

app.use(cors({ origin: ALLOWED_ORIGIN ? ALLOWED_ORIGIN.split(',').map(s => s.trim()) : true }));
app.use(express.json({ limit: '32kb' }));

function parseYouTubeId(input) {
  let u;
  try { u = new URL(input); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/').filter(Boolean)[0] || null;
  else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const parts = u.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1] || null;
    }
  } else return null;
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

function safeName(name) {
  const ext = path.extname(name || '').toLowerCase();
  const allowed = new Set(['.mp4', '.mov', '.webm', '.m4v', '.mkv']);
  return allowed.has(ext) ? ext : '.mp4';
}

function requireAdmin(req, res, next) {
  if (!ADMIN_API_KEY) return res.status(503).json({ success: false, message: 'ADMIN_API_KEY is not configured on the server.' });
  const provided = req.get('x-admin-api-key');
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(ADMIN_API_KEY));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STORE_DIR),
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + safeName(file.originalname))
  }),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/x-matroska', 'application/octet-stream']);
    if (!allowed.has(file.mimetype)) return cb(new Error('Unsupported file type. Upload an authorized video file such as MP4, MOV, or WebM.'));
    cb(null, true);
  }
});

app.get('/', (_req, res) => res.json({
  name: 'YouTube Video Downloader Backend', status: 'running',
  endpoints: ['/health', '/api/resolve', '/api/admin/upload-authorized-file', '/api/download/:id'],
  note: 'YouTube metadata endpoint plus download links for video files you own or are authorized to distribute. It does not extract arbitrary video files from YouTube.'
}));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'youtube-authorized-download-backend' }));

app.post('/api/resolve', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const videoId = parseYouTubeId(url);
  if (!videoId) return res.status(400).json({ success: false, message: 'Please provide a valid YouTube video, Shorts, or youtu.be URL.' });
  try {
    const oembedUrl = new URL('https://www.youtube.com/oembed');
    oembedUrl.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
    oembedUrl.searchParams.set('format', 'json');
    const response = await fetch(oembedUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(422).json({ success: false, message: 'YouTube did not return metadata. The video may be private, unavailable, or restricted.' });
    const meta = await response.json();
    return res.json({ success: true, videoId, title: meta.title || 'YouTube video', authorName: meta.author_name || '', thumbnail: meta.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, watchUrl: `https://www.youtube.com/watch?v=${videoId}`, embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`, message: 'Metadata retrieved. This endpoint does not download video files from YouTube.' });
  } catch (err) {
    console.error('Resolve error:', err.message);
    return res.status(502).json({ success: false, message: 'Could not reach the YouTube metadata service. Please try again later.' });
  }
});

// Upload original/authorized video files via an authenticated admin request.
// Do not put ADMIN_API_KEY in public Elementor JavaScript.
app.post('/api/admin/upload-authorized-file', requireAdmin, (req, res) => {
  upload.single('video')(req, res, err => {
    if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Attach one video file in the multipart field named "video".' });
    const id = path.basename(req.file.filename, path.extname(req.file.filename));
    const downloadUrl = `${req.protocol}://${req.get('host')}/api/download/${encodeURIComponent(id)}`;
    return res.status(201).json({ success: true, id, filename: path.basename(req.file.originalname), bytes: req.file.size, downloadUrl, message: 'Authorized file uploaded. Share this download URL only with people permitted to access the file.' });
  });
});

app.get('/api/download/:id', (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ success: false, message: 'Invalid file ID.' });
  const matches = ['.mp4', '.mov', '.webm', '.m4v', '.mkv'].map(ext => path.join(STORE_DIR, id + ext));
  const filePath = matches.find(p => fs.existsSync(p));
  if (!filePath) return res.status(404).json({ success: false, message: 'File not found. Render temporary storage may have been cleared after a restart or redeploy.' });
  res.download(filePath, `authorized-video${path.extname(filePath)}`);
});

// Temporary disk cleanup: remove files older than 24 hours. Use persistent object storage for production.
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(STORE_DIR)) {
    const p = path.join(STORE_DIR, entry);
    try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); } catch (_) {}
  }
}, 60 *  60 * 1000).unref();

app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(500).json({ success: false, message: 'Unexpected server error.' });
});
app.listen(PORT, '0.0.0.0', () => console.log(`API listening on port ${PORT}`));
