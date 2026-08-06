const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.VIEWER_PORT || 3847;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Accept large HTML bodies (transcripts can be huge)
app.use(express.raw({ type: '*/*', limit: '50mb' }));

// ─── Upload endpoint — POST /upload ───────────────────────────────────────────
// Bot sends raw HTML body → server saves as {hash}.html → returns the view URL
app.post('/upload', (req, res) => {
    try {
        const htmlContent = req.body;
        if (!htmlContent || htmlContent.length === 0) {
            return res.status(400).json({ error: 'No content provided' });
        }

        // Generate a unique hash for the file
        const hash = crypto.createHash('sha256').update(htmlContent).digest('hex');
        const fileName = `${hash}.html`;
        const filePath = path.join(UPLOAD_DIR, fileName);

        // Save file (skip if already exists — same transcript = same hash)
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, htmlContent);
            console.log(`[SAVED] ${fileName} (${(htmlContent.length / 1024).toFixed(1)} KB)`);
        } else {
            console.log(`[EXISTS] ${fileName} — serving cached`);
        }

        // Return the view URL
        const baseUrl = process.env.VIEWER_BASE_URL || `http://localhost:${PORT}`;
        const viewUrl = `${baseUrl}/${fileName}`;

        return res.json({ url: viewUrl, file: fileName });
    } catch (err) {
        console.error('[UPLOAD ERROR]', err);
        return res.status(500).json({ error: 'Upload failed' });
    }
});

// ─── Serve HTML transcripts — GET /:filename ──────────────────────────────────
// Serves the saved HTML file directly with proper Content-Type
app.get('/:filename', (req, res) => {
    const fileName = req.params.filename;

    // Security: only allow .html files, no path traversal
    if (!fileName.endsWith('.html') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        return res.status(400).send('Invalid file name');
    }

    const filePath = path.join(UPLOAD_DIR, fileName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Not Found</title>
            <style>body{background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;margin:0}
            .box{text-align:center;padding:40px;border-radius:12px;background:#16213e}h1{color:#e94560;margin-bottom:10px}p{color:#999}</style></head>
            <body><div class="box"><h1>404</h1><p>Transcript not found or has expired.</p></div></body>
            </html>
        `);
    }

    // Serve as HTML so browser renders it instead of downloading
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
    res.sendFile(filePath);
});

// ─── Root / health check ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
    const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.html'));
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Unity Transcript Viewer</title>
        <style>body{background:#0f0f23;color:#fff;font-family:'Segoe UI',sans-serif;padding:40px;margin:0}
        h1{color:#8000ff;margin-bottom:5px}p{color:#888;margin-top:0}.stats{background:#1a1a2e;padding:20px;border-radius:12px;margin-top:20px;display:inline-block}
        .stat{font-size:2em;color:#8000ff;font-weight:bold}</style></head>
        <body>
            <h1>📋 Unity Transcript Viewer</h1>
            <p>Self-hosted transcript viewing server</p>
            <div class="stats">
                <div class="stat">${files.length}</div>
                <div style="color:#888;font-size:0.9em">Transcripts Stored</div>
            </div>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log('');
    console.log('\x1b[35m');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║    UNITY TRANSCRIPT VIEWER — ONLINE      ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('\x1b[0m');
    console.log(`  [SERVER] Running on port ${PORT}`);
    console.log(`  [SERVER] Base URL: ${process.env.VIEWER_BASE_URL || `http://localhost:${PORT}`}`);
    console.log('');
});
