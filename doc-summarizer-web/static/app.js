'use strict';

let selectedFiles = [];
let lastVerdictResults = [];
let keyVisible = false;

const MODEL_KEY = "libra_selected_model";

// ─── Init ──────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initDropZone();
  checkSettings();
  document.getElementById("settingsToggle").addEventListener("click", openSettingsPanel);
});

// ─── Settings ──────────────────────────────────────────────────────────────

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
  const input  = document.getElementById("apiKeyInput");
  const iconEl = document.getElementById("eyeIcon");
  input.type   = keyVisible ? "text" : "password";
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

// ─── Analyze ───────────────────────────────────────────────────────────────

async function analyzeDocuments() {
  if (!selectedFiles.length) {
    showBanner("יש לבחור לפחות קובץ אחד", "warning");
    return;
  }

  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span>מנתח…`;
  hideBanner();
  document.getElementById("verdictSection").classList.add("hidden");
  document.getElementById("loadingState").classList.remove("hidden");

  const fd = new FormData();
  selectedFiles.forEach(f => fd.append("files", f));

  try {
    const res  = await fetch("/analyze", { method: "POST", body: fd });
    const data = await res.json();

    if (data.error === "missing_api_key") {
      openSettingsPanel();
      showBanner("יש להגדיר API Key בהגדרות", "error");
      return;
    }

    lastVerdictResults = data.results;
    renderVerdictTable(data.results);
  } catch (e) {
    showBanner("שגיאת רשת: " + e.message, "error");
  } finally {
    document.getElementById("loadingState").classList.add("hidden");
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"/>
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
        <td colspan="5">${escHtml(r.filename)} — שגיאה: ${escHtml(r.error)}</td>`;
    } else {
      tr.innerHTML = `
        <td class="court-cell">${escHtml(r.court || "לא צוין")}</td>
        <td class="judge-cell">${escHtml(r.judge || "לא צוין")}</td>
        <td>${escHtml(r.case_description || "לא צוין")}</td>
        <td class="verdict-cell">${escHtml(r.verdict || "לא צוין")}</td>
        <td class="amount-cell">${escHtml(fmtAmountText(r.amount_final))}</td>`;
    }
    tbody.appendChild(tr);
  });

  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── Excel Export ──────────────────────────────────────────────────────────

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

// ─── Utils ─────────────────────────────────────────────────────────────────

function escHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
