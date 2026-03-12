// ============================================================
// PF Debate Prep — app.js
// Searches for real sources, then generates debate material
// Format matches real Public Forum debate evidence standards
// ============================================================

(function () {
  "use strict";

  // ===================== SYSTEM PROMPT =====================

  const BASE_RULES = `You are an expert Public Forum debate coach and case writer. Follow these rules EXACTLY:

EVIDENCE CARD FORMAT (this is how real PF debaters format cards):
- Citation line: Author/Source Last Name (Year) on its own line
- URL on the next line (must be a real URL from the provided sources)
- Then the FULL evidence paragraph in a > blockquote. This is a LONG cut from the source — at least 4-8 sentences.
- Within that paragraph, the specific phrases the debater reads aloud are wrapped in __double underscores__ like __this is what I read aloud__
- The underlined read-aloud portions can be BITS AND PIECES scattered throughout the paragraph — they do NOT have to be one continuous chunk
- The rest of the paragraph stays as normal text (context the opponent can read on the card)
- After the evidence blockquote, write 1 sentence of analysis connecting it to the argument

EXAMPLE OF A PROPERLY FORMATTED EVIDENCE CARD:
**Greenberg (2025)**
https://www.espn.com/espn/betting/story/example
> The American sports betting industry posted a record $13.71 billion in 2024 revenue, __up from 2023's record of $11.04 billion__, according to the American Gaming Association's annual report issued Wednesday. The AGA, during its state of the industry call, said legal sportsbooks took nearly $150 billion worth of bets, __a 22.2% increase from 2023__. The growth trajectory demonstrates that the current state-by-state regulatory framework is effectively drawing bettors into regulated channels. Industry analysts project continued double-digit growth as additional states adopt legal betting frameworks.

This proves the current market is thriving without federal intervention.

EVIDENCE DENSITY — THIS IS CRITICAL:
- A 4-minute constructive MUST be PACKED with evidence. Almost every sentence the debater speaks should either be reading a card or setting up the next card.
- Each contention should have 3-5 evidence cards
- Impact claims MUST have their own evidence card proving the harm is real with statistics
- Brief 1-sentence transitions between cards, then immediately into the next card
- More evidence = more credible case. Err on the side of MORE cards

IMPACT RULES:
- Impacts must be EXTREME and clearly linked — death, financial ruin, suicide rates, war, famine, etc. Never vague.
- Clear chain of logic: argument → mechanism → real-world consequence
- Impact claims MUST be backed by their own evidence card with hard numbers/statistics
- The impact chain should escalate to the most severe harm you can logically link

EVIDENCE RULES:
- You will be given a list of REAL sources with exact URLs found via web search
- You MUST use ONLY the provided source URLs — copy them EXACTLY as given
- NEVER make up or invent any URL — only use URLs from the REAL SOURCES list
- Each evidence paragraph must be LONG (4-8 sentences) — a real cut from the article
- The __underlined__ read-aloud parts should be the most impactful, data-driven phrases
- You CAN underline bits and pieces scattered through the paragraph — not just one chunk
- You can reuse the same source URL for multiple cards if relevant

FORMAT YOUR OUTPUT WITH:
- ## headings for contention titles
- **bold** for citation headers like **Author (Year)**
- > blockquotes for the entire evidence paragraph (the full cut)
- __double underscores__ for read-aloud portions WITHIN evidence paragraphs
- Regular text for brief transitions and analysis between cards`;


  // ===================== TAB NAVIGATION =====================
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.remove("hidden");
    });
  });

  // ===================== TOGGLE GROUPS =====================
  document.querySelectorAll(".toggle-group").forEach(group => {
    group.querySelectorAll(".toggle-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  });

  // ===================== HELPER: get active toggle value =====================
  function getToggle(container, attr) {
    const el = container.querySelector(`.toggle-btn.active[data-${attr}]`);
    return el ? el.getAttribute(`data-${attr}`) : null;
  }


  // ===================== LOADING STATE =====================
  const overlay = document.getElementById("loading-overlay");

  function showLoading() {
    overlay.classList.remove("hidden");
  }

  function hideLoading() {
    overlay.classList.add("hidden");
  }

  function setLoadingText(text, hint) {
    document.querySelector(".loading-text").textContent = text;
    if (hint !== undefined) {
      document.querySelector(".loading-hint").textContent = hint;
    }
  }


  // ===================== WEB SEARCH FOR REAL SOURCES =====================
  async function searchSources(query) {
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      return data.results || [];
    } catch {
      return [];
    }
  }

  function buildSourceContext(sources) {
    if (!sources || sources.length === 0) return "";

    let ctx = `\n\n===== REAL SOURCES (found via web search) =====\nYou MUST use ONLY these exact URLs. Do NOT invent any URL.\n`;
    sources.forEach((s, i) => {
      ctx += `\nSource ${i + 1}:\n  Title: "${s.title}"\n  URL: ${s.url}\n  Summary: ${s.snippet}\n`;
    });
    ctx += `\n===== END SOURCES =====\nCRITICAL: Every evidence card MUST use one of the above URLs exactly as written. Do NOT create any new URLs. You may reuse the same source for multiple cards.`;
    return ctx;
  }


  // ===================== AI GENERATION (with multi-search) =====================
  async function generate(system, prompt, outputId, searchQueries) {
    showLoading();

    try {
      // Normalize to array
      const queries = Array.isArray(searchQueries)
        ? searchQueries
        : [searchQueries].filter(Boolean);

      // Step 1 — search for real sources (run multiple searches for diversity)
      let allSources = [];
      if (queries.length > 0) {
        setLoadingText("Searching for real sources...", "Finding credible evidence online");
        for (const q of queries) {
          const results = await searchSources(q);
          allSources = allSources.concat(results);
        }
        // Deduplicate by URL
        const seen = new Set();
        allSources = allSources.filter(s => {
          if (seen.has(s.url)) return false;
          seen.add(s.url);
          return true;
        });
      }

      // Append real source context to the prompt
      if (allSources.length > 0) {
        prompt += buildSourceContext(allSources);
        setLoadingText("Generating with real sources...", `Found ${allSources.length} sources — this may take 60-90s`);
      } else {
        setLoadingText("Generating...", "This may take 60-90 seconds");
      }

      // Step 2 — generate with Ollama
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system, prompt }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        alert(data.error || "Generation failed. Please try again.");
        return;
      }

      const outputArea = document.getElementById(outputId);
      const outputBody = document.getElementById(outputId + "-body");
      outputBody.innerHTML = renderMarkdown(data.text);
      outputArea.classList.remove("hidden");
      outputArea.scrollIntoView({ behavior: "smooth", block: "start" });

    } catch (err) {
      alert("Could not reach the AI engine. Make sure Ollama is running and the server is started.");
    } finally {
      hideLoading();
    }
  }


  // ===================== GENERATE CASE =====================
  document.getElementById("generate-case-btn").addEventListener("click", () => {
    const resolution = document.getElementById("case-resolution").value.trim();
    if (!resolution) return alert("Please enter a resolution.");

    const section = document.getElementById("generate-case");
    const side = getToggle(section, "side") || "aff";
    const numCt = getToggle(section, "ct") || "2";
    const instructions = document.getElementById("case-instructions").value.trim();
    const sideWord = side === "aff" ? "Affirmative" : "Negative";
    const verb = side === "aff" ? "affirm" : "negate";

    let prompt = `Generate a complete 4-minute ${sideWord} Public Forum constructive speech. This speech must be PACKED with evidence — almost every sentence should be reading a card or setting up the next one.

RESOLUTION: "${resolution}"

STRUCTURE:
1. Introduction (2-3 sentences) — starts with "My partner and I ${verb} the resolution…" followed by a brief framework
2. ${numCt} Contentions — each contention has:
   - A contention title (## heading)
   - Brief 1-sentence claim
   - 3-5 evidence cards per contention, each formatted as:
     * **Author/Source (Year)** citation on its own line
     * URL on the next line
     * Full paragraph (4-8 sentences) in a > blockquote with __underlined read-aloud__ portions scattered throughout
   - 1-sentence analysis/transition after each card
   - A dedicated impact card with hard statistics proving extreme harm
3. Conclusion (1-2 sentences) — brief summary urging the judge to vote ${sideWord}

EVIDENCE DENSITY: This is a 4-minute speech. It must be LOADED with evidence cards. Each contention needs 3-5 cards. Brief transitions between cards then immediately into the next one. Do NOT make unsupported claims — every assertion needs a card.

TARGET LENGTH: 800-1100 words. The speech should feel like a wall of evidence.`;

    if (instructions) prompt += `\n\nADDITIONAL INSTRUCTIONS: ${instructions}`;

    // Multiple searches for diverse sources
    const searchQueries = [
      `${resolution} evidence research study data`,
      `${resolution} impact consequences statistics report`,
    ];
    generate(BASE_RULES, prompt, "case-output", searchQueries);
  });


  // ===================== GENERATE CONTENTION =====================
  document.getElementById("generate-ct-btn").addEventListener("click", () => {
    const resolution = document.getElementById("ct-resolution").value.trim();
    const topic = document.getElementById("ct-topic").value.trim();
    if (!resolution) return alert("Please enter a resolution.");
    if (!topic) return alert("Please enter a contention topic.");

    const section = document.getElementById("generate-contention");
    const side = getToggle(section, "side") || "aff";
    const instructions = document.getElementById("ct-instructions").value.trim();
    const sideWord = side === "aff" ? "Affirmative" : "Negative";

    let prompt = `Generate a SINGLE contention for the ${sideWord} side of a Public Forum debate. Pack it with evidence — every claim needs a card.

RESOLUTION: "${resolution}"
CONTENTION TOPIC/ANGLE: ${topic}

STRUCTURE:
- Contention title (## heading)
- Brief 1-sentence claim
- 3-4 evidence cards, each formatted as:
  * **Author/Source (Year)** citation line
  * URL on the next line
  * Full paragraph (4-8 sentences) in a > blockquote with __underlined read-aloud__ bits and pieces scattered throughout
- 1-sentence analysis after each card
- A dedicated impact card with statistics proving extreme, specific harm (death, economic collapse, etc.)

TARGET LENGTH: 400-600 words. Evidence-heavy — almost all cards with brief transitions.`;

    if (instructions) prompt += `\n\nADDITIONAL INSTRUCTIONS: ${instructions}`;

    const searchQueries = [
      `${topic} ${resolution} evidence data`,
      `${topic} impact statistics study`,
    ];
    generate(BASE_RULES, prompt, "ct-output", searchQueries);
  });


  // ===================== GENERATE EVIDENCE CARD =====================
  document.getElementById("generate-ev-btn").addEventListener("click", () => {
    const topic = document.getElementById("ev-topic").value.trim();
    if (!topic) return alert("Please enter a topic or claim.");

    const context = document.getElementById("ev-context").value.trim();
    const instructions = document.getElementById("ev-instructions").value.trim();

    let prompt = `Generate a single formatted evidence card for Public Forum debate.

CLAIM TO SUPPORT: "${topic}"`;

    if (context) prompt += `\nDEBATE CONTEXT/RESOLUTION: "${context}"`;

    prompt += `

FORMAT:
- **Author/Source (Year)** as a bold citation header
- Direct URL on its own line (MUST be from the provided real sources)
- A FULL paragraph (4-8 sentences) in a > blockquote — this is the entire cut from the article
- Within that paragraph, __underline the read-aloud portions__ — these can be bits and pieces scattered throughout, not just one chunk
- The underlined parts should be the most impactful, quotable, data-driven phrases
- 1-2 sentence analysis explaining why this evidence matters

The evidence paragraph must be substantial and read like a real cut from the article.`;

    if (instructions) prompt += `\n\nADDITIONAL INSTRUCTIONS: ${instructions}`;

    const searchQuery = `${topic} study evidence report data`;
    generate(BASE_RULES, prompt, "ev-output", searchQuery);
  });


  // ===================== BLOCK GENERATION SHARED LOGIC =====================
  async function generateBlock(searchText, systemPrompt, userPrompt, outputId, resolution, instructions) {
    showLoading();

    try {
      // Step 1 — Search for sources
      setLoadingText("Searching for evidence...", "Finding relevant sources online");

      const shortArg = searchText.split(/\s+/).slice(0, 8).join(" ");
      const searchQueries = [
        `${shortArg} evidence data`,
        `${shortArg} problems risks study`,
      ];

      let allResults = [];
      for (const q of searchQueries) {
        const results = await searchSources(q);
        allResults = allResults.concat(results);
      }
      const seen = new Set();
      allResults = allResults.filter(s => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
      });

      if (allResults.length === 0) {
        alert("Could not find any sources. Try rephrasing.");
        return;
      }

      // Step 2 — Fetch actual page content
      const fetchCount = Math.min(allResults.length, 4);
      setLoadingText("Reading source articles...", `Fetching ${fetchCount} pages for real paragraphs`);

      const urls = allResults.slice(0, 4).map(r => r.url);
      const pagesRes = await fetch("/api/fetch-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const pagesData = await pagesRes.json();
      const pages = pagesData.pages || [];

      if (pages.length === 0 || pages.every(p => p.paragraphs.length === 0)) {
        alert("Could not extract text from the sources. Try a different topic.");
        return;
      }

      // Step 3 — Send real paragraphs to LLM for verbatim selection
      setLoadingText("Selecting best evidence...", "AI is choosing the most relevant paragraphs");

      let paraContext = "";
      pages.forEach(page => {
        const info = allResults.find(r => r.url === page.url);
        const title = info ? info.title : "Source";
        paraContext += `\n--- SOURCE: "${title}" | URL: ${page.url} ---\n`;
        page.paragraphs.forEach((p, i) => {
          paraContext += `[P${i + 1}]: ${p}\n\n`;
        });
      });

      let fullPrompt = userPrompt;
      if (resolution) fullPrompt += `\nRESOLUTION: "${resolution}"`;
      fullPrompt += `\n\nSelect 2-4 paragraphs from the sources below that best apply. Output each one EXACTLY as written — word for word, no changes.\n`;
      fullPrompt += paraContext;
      if (instructions) fullPrompt += `\n\nPREFERENCES: ${instructions}`;

      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, prompt: fullPrompt }),
      });

      const data = await genRes.json();

      if (!genRes.ok || data.error) {
        alert(data.error || "Generation failed. Please try again.");
        return;
      }

      const outputArea = document.getElementById(outputId);
      const outputBody = document.getElementById(outputId + "-body");
      outputBody.innerHTML = renderMarkdown(data.text);
      outputArea.classList.remove("hidden");
      outputArea.scrollIntoView({ behavior: "smooth", block: "start" });

    } catch (err) {
      alert("Could not complete block generation. Make sure Ollama is running.");
    } finally {
      hideLoading();
    }
  }


  // ===================== OFFENSIVE BLOCK =====================
  document.getElementById("generate-off-btn").addEventListener("click", async () => {
    const argument = document.getElementById("off-argument").value.trim();
    if (!argument) return alert("Please describe the opponent's argument to attack.");

    const resolution = document.getElementById("off-resolution").value.trim();
    const instructions = document.getElementById("off-instructions").value.trim();

    const system = `You are a debate evidence selector. You receive REAL paragraphs extracted from real web pages.

YOUR JOB: Select the 2-4 paragraphs that best ATTACK an opponent's debate argument — proving it wrong, undermining it, or showing it causes harm.

CRITICAL RULES:
- Output each paragraph EXACTLY as it appears in the source — word for word
- Do NOT change, rephrase, add to, or remove ANY words from the paragraphs
- Do NOT add analysis, commentary, or your own sentences
- Just the citation and the verbatim paragraph, nothing else
- Select paragraphs from DIFFERENT sources when possible
- Pick paragraphs with the strongest data, statistics, or direct counter-claims

FORMAT (repeat for each selected paragraph):

## Answer to: [brief label for their argument]

**[Source Title]**
[exact URL from the source]

> [paste the EXACT paragraph word for word — change NOTHING]

---`;

    const prompt = `OPPONENT'S ARGUMENT TO ATTACK: "${argument}"`;
    await generateBlock(argument, system, prompt, "off-output", resolution, instructions);
  });


  // ===================== DEFENSIVE BLOCK (auto-predicts attacks) =====================
  document.getElementById("generate-def-btn").addEventListener("click", async () => {
    const yourArg = document.getElementById("def-your-argument").value.trim();
    if (!yourArg) return alert("Please describe your argument to defend.");

    const resolution = document.getElementById("def-resolution").value.trim();
    const instructions = document.getElementById("def-instructions").value.trim();

    showLoading();

    try {
      // Step 1 — AI predicts likely opponent attacks
      setLoadingText("Predicting opponent attacks...", "Thinking about how the other side would respond");

      const predictSystem = `You are an expert Public Forum debate strategist. Given a debater's argument, predict the 2-3 most likely attacks an opponent would make against it. Be specific and realistic — think like a competitive debater.

OUTPUT FORMAT — output ONLY a JSON array of strings, nothing else:
["attack 1 description", "attack 2 description", "attack 3 description"]

No explanation, no markdown, no extra text. Just the JSON array.`;

      let predictPrompt = `ARGUMENT TO DEFEND: "${yourArg}"`;
      if (resolution) predictPrompt += `\nRESOLUTION: "${resolution}"`;
      predictPrompt += `\n\nWhat are the 2-3 most likely attacks an opponent would make against this argument? Output ONLY a JSON array.`;

      const predictRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: predictSystem, prompt: predictPrompt }),
      });
      const predictData = await predictRes.json();

      if (!predictRes.ok || predictData.error) {
        alert(predictData.error || "Failed to predict attacks.");
        return;
      }

      // Parse the predicted attacks from LLM response
      let attacks = [];
      try {
        const jsonMatch = predictData.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) attacks = JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Fallback: split by newlines or numbered items
        attacks = predictData.text.split(/\n/).filter(l => l.trim().length > 10).slice(0, 3);
      }

      if (attacks.length === 0) {
        alert("Could not predict attacks. Try rephrasing your argument.");
        return;
      }

      // Step 2 — Search for evidence that defends against these attacks
      setLoadingText("Searching for defensive evidence...", `Found ${attacks.length} likely attacks — finding counters`);

      const shortArg = yourArg.split(/\s+/).slice(0, 6).join(" ");
      const searchQueries = attacks.slice(0, 3).map(atk => {
        const shortAtk = (typeof atk === "string" ? atk : String(atk)).split(/\s+/).slice(0, 6).join(" ");
        return `${shortArg} ${shortAtk} evidence`;
      });

      let allResults = [];
      for (const q of searchQueries) {
        const results = await searchSources(q);
        allResults = allResults.concat(results);
      }
      const seen = new Set();
      allResults = allResults.filter(s => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
      });

      if (allResults.length === 0) {
        alert("Could not find sources. Try rephrasing your argument.");
        return;
      }

      // Step 3 — Fetch pages
      const fetchCount = Math.min(allResults.length, 5);
      setLoadingText("Reading source articles...", `Fetching ${fetchCount} pages for real paragraphs`);

      const urls = allResults.slice(0, 5).map(r => r.url);
      const pagesRes = await fetch("/api/fetch-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const pagesData = await pagesRes.json();
      const pages = pagesData.pages || [];

      if (pages.length === 0 || pages.every(p => p.paragraphs.length === 0)) {
        alert("Could not extract text from sources. Try a different argument.");
        return;
      }

      // Step 4 — LLM selects defensive evidence for each predicted attack
      setLoadingText("Building defensive block...", "Selecting evidence to counter each predicted attack");

      let paraContext = "";
      pages.forEach(page => {
        const info = allResults.find(r => r.url === page.url);
        const title = info ? info.title : "Source";
        paraContext += `\n--- SOURCE: "${title}" | URL: ${page.url} ---\n`;
        page.paragraphs.forEach((p, i) => {
          paraContext += `[P${i + 1}]: ${p}\n\n`;
        });
      });

      const attackList = attacks.map((a, i) => `${i + 1}. ${a}`).join("\n");

      const defSystem = `You are a debate evidence selector. You receive REAL paragraphs extracted from real web pages.

YOUR JOB: For each predicted opponent attack, select 1-2 paragraphs that best DEFEND against it — reinforcing the original argument, rebutting the attack, or providing counter-evidence.

CRITICAL RULES:
- Output each paragraph EXACTLY as it appears in the source — word for word
- Do NOT change, rephrase, add to, or remove ANY words from the paragraphs
- Do NOT add analysis, commentary, or your own sentences beyond the attack label
- Select paragraphs from DIFFERENT sources when possible
- Pick paragraphs that directly counter the specific attack

FORMAT:

## They say: [brief summary of predicted attack]

**[Source Title]**
[exact URL from the source]

> [paste the EXACT paragraph word for word — change NOTHING]

---

(Repeat for each predicted attack)`;

      let defPrompt = `YOUR ARGUMENT: "${yourArg}"\n\nPREDICTED OPPONENT ATTACKS:\n${attackList}\n\nFor each attack above, select 1-2 paragraphs from the sources that best defend against it. Output each paragraph EXACTLY as written.\n`;
      defPrompt += paraContext;
      if (instructions) defPrompt += `\n\nPREFERENCES: ${instructions}`;

      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: defSystem, prompt: defPrompt }),
      });

      const data = await genRes.json();

      if (!genRes.ok || data.error) {
        alert(data.error || "Generation failed. Please try again.");
        return;
      }

      const outputArea = document.getElementById("def-output");
      const outputBody = document.getElementById("def-output-body");
      outputBody.innerHTML = renderMarkdown(data.text);
      outputArea.classList.remove("hidden");
      outputArea.scrollIntoView({ behavior: "smooth", block: "start" });

    } catch (err) {
      alert("Could not complete defensive block. Make sure Ollama is running.");
    } finally {
      hideLoading();
    }
  });


  // ===================== RENDER MARKDOWN → HTML =====================
  function renderMarkdown(raw) {
    let html = escHtml(raw);

    // Headers
    html = html.replace(/^### (.+)$/gm, '<div class="section-title" style="font-size:0.95rem;">$1</div>');
    html = html.replace(/^## (.+)$/gm, '<div class="section-title">$1</div>');
    html = html.replace(/^# (.+)$/gm, '<div class="section-title" style="font-size:1.2rem;">$1</div>');

    // Bold (**text**)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Underline / read-aloud (__text__)
    html = html.replace(/__(.+?)__/g, '<span class="read-aloud">$1</span>');

    // Blockquotes → evidence cards
    html = html.replace(/^&gt; (.+)$/gm, '<div class="bq-line">$1</div>');

    // Make URLs clickable
    html = html.replace(/(https?:\/\/[^\s<"]+)/g, '<a href="$1" target="_blank" style="color:var(--accent);word-break:break-all;">$1</a>');

    // Line breaks
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');

    // Group consecutive bq-lines into ev-card divs
    html = html.replace(
      /(<div class="bq-line">.*?<\/div>(?:<br>)*)+/g,
      match => {
        const inner = match
          .replace(/<div class="bq-line">/g, '')
          .replace(/<\/div>/g, '<br>')
          .replace(/(<br>)+$/g, '');
        return `<div class="ev-card">${inner}</div>`;
      }
    );

    return html;
  }

  function escHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }


  // ===================== COPY BUTTONS =====================
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".copy-btn");
    if (!btn) return;

    const targetId = btn.dataset.target;
    const target = document.getElementById(targetId);
    if (!target) return;

    const text = target.innerText || target.textContent;
    navigator.clipboard.writeText(text).then(() => {
      showToast("Copied to clipboard");
    }).catch(() => {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("copy");
      sel.removeAllRanges();
      showToast("Copied to clipboard");
    });
  });


  // ===================== TOAST =====================
  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.style.opacity = "1";
    setTimeout(() => { toast.style.opacity = "0"; }, 2000);
  }


  // ===================== HEALTH CHECK =====================
  async function checkHealth() {
    const dot = document.getElementById("status-dot");
    const text = document.getElementById("status-text");
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.ok && data.hasModel) {
        dot.className = "status-dot ok";
        text.textContent = "AI ready";
      } else {
        dot.className = "status-dot error";
        text.textContent = data.reason || "AI not available — check API key";
      }
    } catch {
      dot.className = "status-dot error";
      text.textContent = "Server not reachable";
    }
  }

  checkHealth();

})();
