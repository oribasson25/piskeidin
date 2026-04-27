'use strict';

let selectedFiles = [];
let configOpen = true;

const DEFAULT_PARAMS = [
  "סכם את הנקודות העיקריות ב-4 עד 6 נקודות",
  "ציין תאריכים וחתימות חשובים אם קיימים",
  "ציין פעולות נדרשות או החלטות שיש לקבל",
  "ציין את הגורמים המעורבים (אנשים / חברות / גופים)"
];

// ─── Init ──────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initDropZone();
  initParams();
  checkSettings();
  document.getElementById("settingsToggle").addEventListener("click", openSettingsPanel);
});

// ─── Settings ──────────────────────────────────────────────────────────────

async function checkSettings() {
  try {
    const res  = await fetch("/settings");
    const data = await res.json();
    if (!data.has_api_key) {
      openSettingsPanel();
      showBanner("יש להגדיר API Key לפני השימוש", "warning");
      setKeyStatus("✗ מפתח לא מוגדר", true);
    } else {
      const src = data.from_env ? " · מוגדר ב-Environment Variable" : "";
      setKeyStatus(`✓ מפתח מוגדר (${data.api_key_hint})${src}`);
      const sel = document.getElementById("modelSelect");
      if (data.model) sel.value = data.model;
    }
  } catch {
    showBanner("לא ניתן להתחבר לשרת", "error");
  }
}

async function saveSettings() {
  const key   = document.getElementById("apiKeyInput").value.trim();
  const model = document.getElementById("modelSelect").value;
  try {
    await fetch("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, model })
    });
    setKeyStatus("נשמר ✓");
    hideBanner();
    setTimeout(checkSettings, 500);
  } catch {
    showBanner("שגיאה בשמירת ההגדרות", "error");
  }
}

function toggleKeyVisibility() {
  const input = document.getElementById("apiKeyInput");
  input.type = input.type === "password" ? "text" : "password";
}

function openSettingsPanel() {
  document.getElementById("settingsOverlay").classList.remove("hidden");
}

function closeSettingsPanel() {
  document.getElementById("settingsOverlay").classList.add("hidden");
}

function setKeyStatus(msg, missing = false) {
  const el = document.getElementById("keyStatus");
  el.textContent = msg;
  el.className = "key-status" + (missing ? " missing" : "");
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

// ─── Config Toggle ─────────────────────────────────────────────────────────

function toggleConfig() {
  configOpen = !configOpen;
  const body  = document.getElementById("configBody");
  const arrow = document.getElementById("configArrow");
  body.classList.toggle("collapsed", !configOpen);
  arrow.classList.toggle("open", configOpen);
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
  selectedFiles.splice(idx, 1);
  renderFileList();
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
  hideBanner();

  const fd = new FormData();
  selectedFiles.forEach(f => fd.append("files", f));

  const cfg = {
    language:      document.getElementById("language").value,
    output_format: document.getElementById("format").value,
    max_length:    parseInt(document.getElementById("maxLength").value) || 400,
    parameters:    getParams()
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
  }
}

function showLoading(count) {
  document.getElementById("loadingState").classList.remove("hidden");
  document.getElementById("loadingText").textContent =
    `מעבד ${count} ${count === 1 ? "קובץ" : "קבצים"}…`;
  document.getElementById("resultsSection").classList.add("hidden");
}

function hideLoading() {
  document.getElementById("loadingState").classList.add("hidden");
}

// ─── Results ───────────────────────────────────────────────────────────────

function renderResults(results) {
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
    card.style.animationDelay = `${i * 0.06}s`;

    const meta = r.char_count
      ? `${r.char_count.toLocaleString()} תווים${r.truncated ? "" : ""}`
      : "";

    const summaryJson = JSON.stringify(r.summary || "");

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
            <button class="export-btn" onclick="exportFile('${escAttr(r.filename)}', ${summaryJson}, 'pdf')">
              ↓ PDF
            </button>
            <button class="export-btn" onclick="exportFile('${escAttr(r.filename)}', ${summaryJson}, 'docx')">
              ↓ Word
            </button>
          </div>` : ""}
      </div>
      ${r.error
        ? `<div class="result-error-body">${escHtml(r.error)}</div>`
        : `<div class="result-body">${escHtml(r.summary)}</div>`}`;

    container.appendChild(card);
  });

  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── Export ────────────────────────────────────────────────────────────────

async function exportFile(filename, summary, format) {
  try {
    const res = await fetch(`/export/${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, summary })
    });
    if (!res.ok) throw new Error("שגיאת שרת");
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

// ─── Utils ─────────────────────────────────────────────────────────────────

function escHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
