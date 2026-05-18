'use strict';

let selectedFiles = [];
let configOpen = true;
let lastResults = [];
let loadingMsgInterval = null;

const DEFAULT_PARAMS = [
  "סכם את הנקודות העיקריות ב-4 עד 6 נקודות",
  "ציין תאריכים וחתימות חשובים אם קיימים",
  "ציין פעולות נדרשות או החלטות שיש לקבל",
  "ציין את הגורמים המעורבים (אנשים / חברות / גופים)"
];

const LOADING_MESSAGES = [
  'קורא את הקבצים…',
  'מנתח את תוכן המסמכים…',
  'שולח ל-Claude…',
  'ממתין לתשובה…',
  'מעבד תוצאות…',
  'מסכם…'
];

// ─── Init ──────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initDropZone();
  initParams();
  checkSettings();
  initMagneticBtn();
  document.getElementById("settingsToggle").addEventListener("click", openSettingsPanel);
});

// ─── Magnetic Button ───────────────────────────────────────────────────────

function initMagneticBtn() {
  // Skip on touch-only devices or reduced-motion
  if (!window.matchMedia('(hover: hover)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const btn = document.getElementById('summarizeBtn');
  let curX = 0, curY = 0, targetX = 0, targetY = 0;
  let rafId = null;

  // Lerp-based spring: exponential decay toward target, gives spring feel
  function tick() {
    curX += (targetX - curX) * 0.13;
    curY += (targetY - curY) * 0.13;
    btn.style.transform = `translate(${curX.toFixed(2)}px, ${curY.toFixed(2)}px)`;
    const dx = Math.abs(targetX - curX);
    const dy = Math.abs(targetY - curY);
    if (dx > 0.08 || dy > 0.08) {
      rafId = requestAnimationFrame(tick);
    } else {
      curX = targetX; curY = targetY;
      btn.style.transform = (targetX === 0 && targetY === 0) ? '' : `translate(${curX}px, ${curY}px)`;
      rafId = null;
    }
  }

  btn.addEventListener('mousemove', (e) => {
    if (btn.disabled) return;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Horizontal drift up to ~14px, slight upward lift (-4px at center)
    targetX = (e.clientX - cx) * 0.22;
    targetY = (e.clientY - cy) * 0.12 - 4;
    if (!rafId) rafId = requestAnimationFrame(tick);
  });

  btn.addEventListener('mouseleave', () => {
    targetX = 0; targetY = 0;
    if (!rafId) rafId = requestAnimationFrame(tick);
  });
}

// ─── Settings ──────────────────────────────────────────────────────────────

const MODEL_KEY = "libra_selected_model";
let lastVerdictResults = [];
let keyVisible = false;

async function checkSettings() {
  const saved = localStorage.getItem(MODEL_KEY);
  if (saved) document.getElementById("modelSelect").value = saved;

  try {
    const res  = await fetch("/settings");
    const data = await res.json();
    const el   = document.getElementById("keyStatus");
    if (data.has_api_key) {
      el.textContent = `✓ מפתח מוגדר (${data.api_key_hint})`;
      el.className   = "key-status";
    } else {
      el.textContent = "✗ מפתח לא מוגדר";
      el.className   = "key-status missing";
    }
  } catch (_) {}
}

function toggleKeyVisibility() {
  keyVisible = !keyVisible;
  const input   = document.getElementById("apiKeyInput");
  const iconEl  = document.getElementById("eyeIcon");
  input.type    = keyVisible ? "text" : "password";
  // Switch between open-eye and crossed-eye SVG path
  iconEl.innerHTML = keyVisible
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
       <circle cx="12" cy="12" r="3"/>`;
}

async function saveSettings() {
  const key   = document.getElementById("apiKeyInput").value.trim();
  const model = document.getElementById("modelSelect").value;
  localStorage.setItem(MODEL_KEY, model);
  try {
    await fetch("/settings", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ api_key: key || undefined, model })
    });
  } catch (_) {}
  showBanner("הגדרות נשמרו ✓", "success");
  setTimeout(hideBanner, 2000);
  await checkSettings();
}

function openSettingsPanel() {
  const overlay = document.getElementById("settingsOverlay");
  const drawer  = document.getElementById("settingsDrawer");
  drawer.classList.remove("is-closing");
  overlay.classList.remove("is-closing");
  overlay.classList.remove("hidden");
  checkSettings();
}

function closeSettingsPanel() {
  const overlay = document.getElementById("settingsOverlay");
  const drawer  = document.getElementById("settingsDrawer");
  overlay.classList.add("is-closing");
  drawer.classList.add("is-closing");
  setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.classList.remove("is-closing");
    drawer.classList.remove("is-closing");
  }, 240);
}

// ─── Banner ────────────────────────────────────────────────────────────────

function showBanner(msg, type) {
  const el = document.getElementById("banner");
  el.textContent = msg;
  el.className = `banner ${type}`;
}

function hideBanner() {
  document.getElementById("banner").className = "banner hidden";
}

// ─── Config Toggle — smooth height spring ─────────────────────────────────

function toggleConfig() {
  configOpen = !configOpen;
  const body  = document.getElementById("configBody");
  const arrow = document.getElementById("configArrow");
  arrow.classList.toggle("open", configOpen);

  if (configOpen) {
    // Opening: set display, measure height, animate in
    body.style.display    = 'flex';
    body.style.maxHeight  = '0px';
    body.style.opacity    = '0';
    body.style.overflow   = 'hidden';
    // Force reflow so the starting values register before transition kicks in
    void body.offsetHeight;
    const fullH = body.scrollHeight;
    body.style.transition = 'max-height 0.42s cubic-bezier(0.22,1,0.36,1), opacity 0.32s ease';
    body.style.maxHeight  = fullH + 'px';
    body.style.opacity    = '1';
    // Clear inline styles once animation finishes (allow dynamic resizing)
    const onEnd = () => {
      body.style.maxHeight  = '';
      body.style.overflow   = '';
      body.style.transition = '';
      body.removeEventListener('transitionend', onEnd);
    };
    body.addEventListener('transitionend', onEnd);
  } else {
    // Closing: fix current height, then animate to 0
    body.style.maxHeight  = body.scrollHeight + 'px';
    body.style.overflow   = 'hidden';
    void body.offsetHeight;
    body.style.transition = 'max-height 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.24s ease';
    body.style.maxHeight  = '0px';
    body.style.opacity    = '0';
    setTimeout(() => {
      body.style.display    = 'none';
      body.style.maxHeight  = '';
      body.style.opacity    = '';
      body.style.overflow   = '';
      body.style.transition = '';
    }, 340);
  }
}

// ─── Drop Zone ─────────────────────────────────────────────────────────────

function initDropZone() {
  const zone  = document.getElementById("dropZone");
  const input = document.getElementById("fileInput");

  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", e => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove("over");
  });
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("over");
    addFiles(Array.from(e.dataTransfer.files));
  });
  zone.addEventListener("click", e => {
    if (e.target.tagName !== "BUTTON") input.click();
  });
  input.addEventListener("change", () => {
    addFiles(Array.from(input.files));
    input.value = "";
  });
}

function addFiles(newFiles) {
  const ok = newFiles.filter(f => /\.(pdf|docx|doc)$/i.test(f.name));
  if (ok.length !== newFiles.length) {
    showBanner("חלק מהקבצים לא נתמכים — מותר PDF ו-DOCX בלבד", "warning");
    setTimeout(hideBanner, 3500);
  }
  ok.forEach(f => {
    if (!selectedFiles.find(x => x.name === f.name && x.size === f.size))
      selectedFiles.push(f);
  });
  renderFileList();
}

function removeFile(idx) {
  const list  = document.getElementById("fileList");
  const chips = list.querySelectorAll(".file-chip");
  const chip  = chips[idx];
  if (chip) {
    // Animate out, then remove from data and re-render
    chip.classList.add("removing");
    chip.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      selectedFiles.splice(idx, 1);
      renderFileList();
    }, 230);
  } else {
    selectedFiles.splice(idx, 1);
    renderFileList();
  }
}

function renderFileList() {
  const list = document.getElementById("fileList");
  if (!selectedFiles.length) { list.classList.add("hidden"); return; }
  list.classList.remove("hidden");
  list.innerHTML = selectedFiles.map((f, i) => {
    const ext = (f.name.split(".").pop() || "").toUpperCase();
    return `
      <div class="file-chip">
        <span class="chip-ext">${escHtml(ext)}</span>
        <span class="chip-name" title="${escHtml(f.name)}">${escHtml(f.name)}</span>
        <button class="chip-remove" onclick="removeFile(${i})" title="הסר">✕</button>
      </div>`;
  }).join("");
}

// ─── Parameters ────────────────────────────────────────────────────────────

function initParams() {
  DEFAULT_PARAMS.forEach(p => addParameter(p));
}

function addParameter(value = "") {
  const list = document.getElementById("paramsList");
  const div  = document.createElement("div");
  div.className = "param-item";
  div.innerHTML = `
    <span class="param-dot" aria-hidden="true"></span>
    <input type="text" class="field-input" value="${escHtml(value)}" placeholder="הוסף הנחיה…" />
    <button class="param-del" onclick="this.parentElement.remove()" title="הסר">✕</button>`;
  list.appendChild(div);
}

function getParams() {
  return Array.from(document.querySelectorAll("#paramsList .param-item input"))
    .map(i => i.value.trim()).filter(Boolean);
}

// ─── Summarize ─────────────────────────────────────────────────────────────

async function summarize() {
  if (!selectedFiles.length) {
    showBanner("יש לבחור לפחות קובץ אחד", "warning");
    return;
  }

  const btn = document.getElementById("summarizeBtn");
  btn.disabled = true;
  // Show spinner inside the button
  btn.innerHTML = `<span class="btn-spinner"></span>מעבד…`;
  hideBanner();

  const fd = new FormData();
  selectedFiles.forEach(f => fd.append("files", f));

  const cfg = {
    language:      document.getElementById("language").value,
    output_format: document.getElementById("format").value,
    max_length:    parseInt(document.getElementById("maxLength").value) || 400,
    parameters:    getParams(),
    model:         localStorage.getItem(MODEL_KEY) || "claude-opus-4-5"
  };
  fd.append("config_override", JSON.stringify(cfg));

  showLoading(selectedFiles.length);

  try {
    const res  = await fetch("/summarize", { method: "POST", body: fd });
    const data = await res.json();
    hideLoading();

    if (data.error === "missing_api_key") {
      openSettingsPanel();
      showBanner("יש להגדיר API Key בהגדרות", "error");
      return;
    }

    renderResults(data.results);
  } catch (e) {
    hideLoading();
    showBanner("שגיאת רשת: " + e.message, "error");
  } finally {
    btn.disabled = false;
    // Restore button content
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      סכם מסמכים`;
  }
}

function showLoading(count) {
  document.getElementById("loadingState").classList.remove("hidden");
  document.getElementById("resultsSection").classList.add("hidden");

  const textEl = document.getElementById("loadingText");
  textEl.style.opacity = '1';
  textEl.textContent = `מעבד ${count} ${count === 1 ? "קובץ" : "קבצים"}…`;

  let msgIdx = 0;
  // Cycle through messages with a cross-fade
  loadingMsgInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
    textEl.style.opacity = '0';
    setTimeout(() => {
      textEl.textContent = LOADING_MESSAGES[msgIdx];
      textEl.style.opacity = '1';
    }, 230);
  }, 2400);
}

function hideLoading() {
  clearInterval(loadingMsgInterval);
  loadingMsgInterval = null;
  document.getElementById("loadingState").classList.add("hidden");
  const textEl = document.getElementById("loadingText");
  textEl.style.opacity = '1';
}

// ─── Results ───────────────────────────────────────────────────────────────

function renderSummary(text) {
  if (!text) return "";
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const isBullet = l => /^[•\-\*▪▸›»–◆◇○●■]\s/.test(l) || /^\d+[\.\)]\s/.test(l);

  if (lines.some(isBullet)) {
    let num = 0;
    const items = lines.map(line => {
      num++;
      const clean = line
        .replace(/^[•\-\*▪▸›»–◆◇○●■]\s*/, "")
        .replace(/^\d+[\.\)]\s*/, "");
      // Stagger each bullet with increasing delay for cascade effect
      return `<li class="summary-item" style="animation-delay:${(num - 1) * 0.08}s">
        <span class="summary-bullet">${num}</span>
        <span class="summary-text">${escHtml(clean)}</span>
      </li>`;
    });
    return `<ul class="summary-list">${items.join("")}</ul>`;
  }

  return lines.map((l, i) =>
    `<p class="summary-para" style="animation-delay:${i * 0.07}s">${escHtml(l)}</p>`
  ).join("");
}

function renderResults(results) {
  lastResults = results;

  const section   = document.getElementById("resultsSection");
  const container = document.getElementById("resultsContainer");
  const countEl   = document.getElementById("resultsCount");

  section.classList.remove("hidden");
  const ok = results.filter(r => !r.error).length;
  countEl.textContent = `${ok} מתוך ${results.length} הצליחו`;

  container.innerHTML = "";
  results.forEach((r, i) => {
    const card = document.createElement("div");
    card.className = "result-card" + (r.error ? " is-error" : "");
    // Stagger card entrances with longer delay between cards
    card.style.animationDelay = `${i * 0.09}s`;

    const meta = r.char_count
      ? `${r.char_count.toLocaleString()} תווים`
      : "";

    card.innerHTML = `
      <div class="result-card-head">
        <div class="result-file-info">
          <div class="result-filename">${r.error ? "⚠ " : ""}${escHtml(r.filename)}</div>
          ${meta ? `
            <div class="result-meta">
              ${escHtml(meta)}
              ${r.truncated ? '<span class="truncated-tag">נחתך</span>' : ""}
            </div>` : ""}
        </div>
        ${!r.error ? `
          <div class="result-actions">
            <button class="export-btn" onclick="exportResult(${i}, 'pdf')">↓ PDF</button>
            <button class="export-btn" onclick="exportResult(${i}, 'docx')">↓ Word</button>
          </div>` : ""}
      </div>
      ${r.error
        ? `<div class="result-error-body">${escHtml(r.error)}</div>`
        : `<div class="result-body">${renderSummary(r.summary)}</div>`}`;

    container.appendChild(card);
  });

  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── Export ────────────────────────────────────────────────────────────────

async function exportResult(idx, format) {
  const r = lastResults[idx];
  if (!r) return;
  const { filename, summary } = r;
  try {
    const res = await fetch(`/export/${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, summary })
    });
    if (!res.ok) throw new Error(`שגיאת שרת ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename.replace(/\.[^.]+$/, "") + `_summary.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    showBanner("שגיאה בייצוא: " + e.message, "error");
  }
}

// ─── Court Analyze ─────────────────────────────────────────────────────────

async function analyzeDocuments() {
  if (!selectedFiles.length) {
    showBanner("יש לבחור לפחות קובץ אחד", "warning");
    return;
  }

  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner" style="border-color:rgba(255,199,0,.3);border-top-color:var(--c-yellow)"></span>מנתח…`;
  hideBanner();
  document.getElementById("verdictSection").classList.add("hidden");

  const fd = new FormData();
  selectedFiles.forEach(f => fd.append("files", f));

  showLoading(selectedFiles.length);

  try {
    const res  = await fetch("/analyze", { method: "POST", body: fd });
    const data = await res.json();
    hideLoading();

    if (data.error === "missing_api_key") {
      openSettingsPanel();
      showBanner("יש להגדיר API Key בהגדרות", "error");
      return;
    }

    lastVerdictResults = data.results;
    renderVerdictTable(data.results);
  } catch (e) {
    hideLoading();
    showBanner("שגיאת רשת: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>
        <line x1="15" y1="3" x2="15" y2="21"/>
      </svg>
      נתח פסקי דין`;
  }
}

function fmtAmountText(val) {
  if (val === null || val === undefined) return "לא צוין";
  if (val === 0) return "₪ 0";
  return `₪ ${Number(val).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderVerdictTable(results) {
  const section = document.getElementById("verdictSection");
  const tbody   = document.getElementById("verdictTableBody");
  const countEl = document.getElementById("verdictCount");

  const ok = results.filter(r => !r.error).length;
  countEl.textContent = `${ok} מתוך ${results.length} עובדו בהצלחה`;

  tbody.innerHTML = "";
  results.forEach(r => {
    const tr = document.createElement("tr");
    if (r.error) {
      tr.className = "is-error";
      tr.innerHTML = `
        <td class="court-cell" colspan="4">${escHtml(r.filename)} — שגיאה: ${escHtml(r.error)}</td>
        <td></td><td></td>`;
    } else {
      tr.innerHTML = `
        <td class="court-cell">${escHtml(r.court || "לא צוין")}</td>
        <td class="judge-cell">${escHtml(r.judge || "לא צוין")}</td>
        <td>${escHtml(r.case_description || "לא צוין")}</td>
        <td class="verdict-cell">${escHtml(r.verdict || "לא צוין")}</td>
        <td class="amount-cell">${escHtml(fmtAmountText(r.amount_before_vat))}</td>
        <td class="amount-cell">${escHtml(fmtAmountText(r.amount_after_vat))}</td>`;
    }
    tbody.appendChild(tr);
  });

  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth", block: "start" });

  // Trigger court analysis automatically
  const validCases = results.filter(r => !r.error);
  if (validCases.length > 0) {
    document.getElementById("courtAnalysis").classList.remove("hidden");
    document.getElementById("analysisContent").textContent = "";
    loadCourtAnalysis();
  }
}

async function exportExcel() {
  if (!lastVerdictResults.length) return;
  try {
    const res = await fetch("/export/excel", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ results: lastVerdictResults })
    });
    if (!res.ok) throw new Error(`שגיאת שרת ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "piskei_din.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    showBanner("שגיאה בייצוא: " + e.message, "error");
  }
}

async function loadCourtAnalysis() {
  const spinner = document.getElementById("analysisSpinner");
  const content = document.getElementById("analysisContent");

  const validCases = lastVerdictResults.filter(r => !r.error);
  if (!validCases.length) {
    content.textContent = "אין נתונים תקינים לניתוח.";
    spinner.style.display = "none";
    return;
  }

  spinner.style.display = "";
  content.textContent = "";

  try {
    const res  = await fetch("/analyze/summary", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ cases: validCases })
    });
    const data = await res.json();
    if (data.error === "missing_api_key") {
      openSettingsPanel();
      showBanner("יש להגדיר API Key", "error");
      return;
    }
    content.textContent = data.summary || "לא התקבל ניתוח.";
  } catch (e) {
    content.textContent = "שגיאה בניתוח: " + e.message;
  } finally {
    spinner.style.display = "none";
  }
}

// ─── Utils ─────────────────────────────────────────────────────────────────

function escHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
