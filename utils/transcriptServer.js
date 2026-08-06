// src/utils/transcriptServer.js
// Lightweight HTTP static file server for hosting channel transcripts.
// Serves files from /transcripts/ on a dedicated port.
// No directory listing — only exact UUID filenames are servable.
// Includes 24-hour auto-cleanup of expired transcript files.

const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { getDb } = require('./db');

const TRANSCRIPT_DIR = path.resolve(process.cwd(), 'transcripts');
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Check hourly

let server = null;

/**
 * Ensure the transcripts directory exists.
 */
function ensureDir() {
  fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
}

/**
 * Build the public URL for a transcript file.
 * Reads PUBLIC_HOST and TRANSCRIPT_PORT from env/config.
 */
function buildPublicUrl(filename) {
  const host = config.publicHost;
  const port = config.transcriptPort;
  if (!host) return null;
  return `http://${host}:${port}/transcripts/${filename}`;
}

/**
 * Write a transcript HTML file to disk and return its UUID filename.
 * @param {string} html - The HTML content.
 * @returns {{ filename: string, url: string|null, filePath: string }}
 */
function saveTranscript(html) {
  ensureDir();
  const { randomUUID } = require('crypto');
  const filename = `${randomUUID()}.html`;
  const filePath = path.join(TRANSCRIPT_DIR, filename);
  fs.writeFileSync(filePath, html, 'utf-8');
  return {
    filename,
    url: buildPublicUrl(filename),
    filePath,
  };
}

/**
 * Handle an incoming HTTP request. Only serves exact filenames under /transcripts/.
 * No directory listing. Returns a simple 404 for unknown paths.
 */
function handleRequest(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // Must be exactly /transcripts/<filename>
  // No trailing slash, no directory traversal
  const urlPath = req.url.split('?')[0];
  const match = /^\/transcripts\/([a-f0-9\-]+\.html)$/.exec(urlPath);
  if (!match) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>404 — Not Found</h1><p>This transcript does not exist or has expired.</p></body></html>');
    return;
  }

  const filename = match[1];
  const filePath = path.join(TRANSCRIPT_DIR, filename);

  // Security: ensure the resolved path is still within TRANSCRIPT_DIR (no ../)
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(TRANSCRIPT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Serve the file
  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>404 — This transcript has expired.</h1></body></html>');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
}

/**
 * Run one cleanup pass: delete transcript files older than 24 hours,
 * remove corresponding DB rows, and log the results.
 */
async function cleanupExpired() {
  try {
    const cutoff = Date.now() - EXPIRY_MS;
    const db = getDb();
    if (!db?.transcript) return;

    const expiredIds = await db.transcript.expired(cutoff);
    let deletedCount = 0;

    for (const id of expiredIds) {
      // Delete the file on disk
      const filePath = path.join(TRANSCRIPT_DIR, `${id}.html`);
      try { fs.unlinkSync(filePath); } catch { /* already gone */ }
      // Delete the DB row
      try { await db.transcript.delete(id); } catch { /* ignore */ }
      deletedCount++;
    }

    if (deletedCount > 0) {
      logger.info(`[transcript-cleanup] Deleted ${deletedCount} expired transcript(s)`);
    }
  } catch (e) {
    logger.error('transcript cleanup error', e?.message || e);
  }
}

/**
 * Start the transcript HTTP server on the configured port.
 * Also starts the 24-hour auto-cleanup interval.
 */
function start() {
  ensureDir();
  const port = config.transcriptPort;

  server = http.createServer(handleRequest);
  server.listen(port, () => {
    logger.info(`Transcript server running on port ${port}`);
  });

  // Handle server errors (e.g. port in use)
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Transcript server: port ${port} is already in use. Set TRANSCRIPT_PORT to a different port.`);
    } else {
      logger.error('Transcript server error', err.message);
    }
  });

  // Start the hourly cleanup job
  setInterval(cleanupExpired, CLEANUP_INTERVAL_MS);
  // Also run cleanup once on start (in case bot was offline during expiry window)
  setTimeout(cleanupExpired, 5000);

  return server;
}

/**
 * Stop the transcript server (for graceful shutdown).
 */
function stop() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { start, stop, saveTranscript, buildPublicUrl, TRANSCRIPT_DIR };
