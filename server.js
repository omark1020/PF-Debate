const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
};

// ============================================================
// HTML entity decoder
// ============================================================
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// ============================================================
// Parse Brave Search HTML results
// ============================================================
function parseBraveResults(html) {
  const results = [];
  const skip = ["youtube.com", "brave.com", "google.com", "facebook.com",
    "twitter.com", "instagram.com", "tiktok.com", "reddit.com"];

  const blocks = html.split(/class="snippet\s+svelte-[^"]*"\s*data-pos="/);

  for (let i = 1; i < blocks.length && results.length < 8; i++) {
    const block = blocks[i];

    const urlMatch = block.match(/href="(https?:\/\/[^"]+)"\s*target/);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    if (skip.some(s => url.includes(s))) continue;

    let title = "";
    const textMatches = block.match(/>([^<]{15,})</g);
    if (textMatches) {
      for (const tm of textMatches) {
        const text = tm.substring(1).trim();
        if (text.length > 15 && !text.includes("svg") && !text.includes("{") && !text.includes("class=")) {
          title = decodeEntities(text);
          break;
        }
      }
    }

    let snippet = "";
    const snippetMatch = block.match(/class="[^"]*snippet-description[^"]*"[^>]*>([\s\S]*?)<\//);
    if (snippetMatch) {
      snippet = decodeEntities(snippetMatch[1].replace(/<[^>]+>/g, "").trim());
    }
    if (!snippet) {
      const contentMatch = block.match(/class="[^"]*snippet-content[^"]*"[\s\S]*?<p[^>]*>([^<]+)/);
      if (contentMatch) snippet = decodeEntities(contentMatch[1].trim());
    }

    results.push({ url, title: title || url, snippet });
  }

  return results;
}

// ============================================================
// Make HTTPS GET request (follows redirects)
// ============================================================
function httpsGet(url, callback, depth) {
  if (!depth) depth = 0;
  if (depth > 3) { callback(new Error("too many redirects")); return; }

  https.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  }, (response) => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      httpsGet(response.headers.location, callback, depth + 1);
      return;
    }
    let data = "";
    response.on("data", chunk => (data += chunk));
    response.on("end", () => callback(null, data));
  }).on("error", err => callback(err, null));
}


// ============================================================
// Fetch a single web page (follows redirects, respects timeout)
// ============================================================
function fetchPage(pageUrl, callback, depth) {
  if (!depth) depth = 0;
  if (depth > 3) { callback(new Error("too many redirects")); return; }

  const isHttps = pageUrl.startsWith("https");
  const proto = isHttps ? https : http;

  const req = proto.get(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "identity",
    },
    timeout: 10000,
  }, (response) => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      let redir = response.headers.location;
      if (redir.startsWith("/")) {
        try { const u = new URL(pageUrl); redir = u.origin + redir; }
        catch { callback(new Error("bad redirect")); return; }
      }
      fetchPage(redir, callback, depth + 1);
      return;
    }

    if (response.statusCode !== 200) {
      callback(new Error(`HTTP ${response.statusCode}`));
      return;
    }

    let data = "";
    let size = 0;
    const MAX = 500000;

    response.on("data", chunk => {
      size += chunk.length;
      if (size < MAX) data += chunk.toString();
    });
    response.on("end", () => callback(null, data));
    response.on("error", err => callback(err));
  });

  req.on("error", err => callback(err));
  req.on("timeout", () => { req.destroy(); callback(new Error("timeout")); });
}

// ============================================================
// Extract real paragraphs from an HTML page
// ============================================================
function extractParagraphs(html) {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;

  while ((match = pRegex.exec(cleaned)) !== null) {
    let text = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    text = decodeEntities(text);

    if (text.length >= 80 &&
        !text.match(/^(cookie|privacy|subscribe|sign up|log in|menu|home|©|copyright)/i) &&
        !text.match(/^(share|tweet|email|print|comment|related|advertisement)/i)) {
      paragraphs.push(text);
    }
  }

  return paragraphs;
}


// ============================================================
// Call Groq API (OpenAI-compatible chat endpoint)
// ============================================================
function callGroq(system, prompt, callback) {
  const payload = JSON.stringify({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: system || "You are a helpful assistant." },
      { role: "user", content: prompt || "" },
    ],
    temperature: 0.7,
    max_tokens: 8192,
  });

  const options = {
    hostname: "api.groq.com",
    port: 443,
    path: "/openai/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  const groqReq = https.request(options, (groqRes) => {
    let data = "";
    groqRes.on("data", chunk => (data += chunk));
    groqRes.on("end", () => {
      try {
        const result = JSON.parse(data);
        if (result.error) {
          callback(new Error(result.error.message || "Groq API error"));
          return;
        }
        const text = result.choices && result.choices[0] && result.choices[0].message
          ? result.choices[0].message.content
          : "";
        callback(null, text);
      } catch (e) {
        callback(new Error("Failed to parse Groq response"));
      }
    });
  });

  groqReq.on("error", err => callback(err));
  groqReq.write(payload);
  groqReq.end();
}


// ============================================================
// HTTP Server
// ============================================================
const server = http.createServer((req, res) => {

  // --- Fetch pages and extract paragraphs ---
  if (req.method === "POST" && req.url === "/api/fetch-pages") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      const urls = (parsed.urls || []).slice(0, 4);
      if (urls.length === 0) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ pages: [] }));
        return;
      }

      console.log(`[fetch-pages] Fetching ${urls.length} pages...`);
      const pages = [];
      let completed = 0;

      urls.forEach(url => {
        fetchPage(url, (err, html) => {
          completed++;
          if (!err && html) {
            const paragraphs = extractParagraphs(html).slice(0, 30);
            console.log(`[fetch-pages] ${url} → ${paragraphs.length} paragraphs`);
            if (paragraphs.length > 0) {
              pages.push({ url, paragraphs });
            }
          } else {
            console.log(`[fetch-pages] ${url} → failed: ${err ? err.message : "empty"}`);
          }

          if (completed === urls.length) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ pages }));
          }
        });
      });
    });
    return;
  }

  // --- Web search endpoint (Brave Search) ---
  if (req.method === "POST" && req.url === "/api/search") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      const query = (parsed.query || "").trim();
      if (!query) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing query" }));
        return;
      }

      const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
      console.log(`[search] Querying: ${query}`);

      httpsGet(searchUrl, (err, html) => {
        if (err || !html) {
          console.log("[search] Failed:", err ? err.message : "empty response");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ results: [] }));
          return;
        }

        const results = parseBraveResults(html);
        console.log(`[search] Found ${results.length} results`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results }));
      });
    });
    return;
  }

  // --- AI generation endpoint (Groq) ---
  if (req.method === "POST" && req.url === "/api/generate") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      if (!GROQ_API_KEY) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "GROQ_API_KEY not set. Add it as an environment variable." }));
        return;
      }

      const { system, prompt } = parsed;

      callGroq(system, prompt, (err, text) => {
        if (err) {
          console.log("[generate] Groq error:", err.message);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "AI generation failed: " + err.message }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text }));
      });
    });
    return;
  }

  // --- Health check ---
  if (req.url === "/api/health") {
    if (!GROQ_API_KEY) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, hasModel: false, reason: "No API key" }));
      return;
    }
    // Quick check: call Groq with a tiny request
    callGroq("Reply with just OK", "test", (err, text) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (err) {
        res.end(JSON.stringify({ ok: false, hasModel: false, reason: err.message }));
      } else {
        res.end(JSON.stringify({ ok: true, hasModel: true }));
      }
    });
    return;
  }

  // --- Static files ---
  let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`PF Debate Prep running on port ${PORT}`);
  console.log(`Using Groq (${GROQ_MODEL}) + Brave Search`);
  if (!GROQ_API_KEY) console.log("WARNING: GROQ_API_KEY not set — AI generation will fail");
});
