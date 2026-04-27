'use strict';

let selectedFiles = [];

const DEFAULT_PARAMS = [
  "סכם את הנקודות העיקריות ב-4 עד 6 נקודות",
  "ציין תאריכים וחתימות חשובים אם קיימים",
  "ציין פעולות נדרשות או החלטות שיש לקבל",
  "ציין את הגורמים המעורבים (אנשים / חברות / גופים)"
];

// ─── Init ───────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initDropZone();
  initParams();
  checkSettings();
});

// ─── Settings ────────────────────────────────────────────────────────────────

async function checkSettings() {
  try {
    const res = await fetch("/settings");
    const data = await res.json();
    if (!data.has_api_key) {
      openSettingsPanel();
      showBanner("יש להגדיר API Key לפני השימוש", "warning");
      showKeyStatus("✗ מפתח לא מוגדר", true);
    } else {
      showKeyStatus(`✓ מפתח מוגדר (${data.api_key_hint})`);
      const sel = document.getElementById("modelSelect");
      if (data.model) sel.value = data.model;
    }
  } catch {
    showBanner("לא ניתן להתחבר לשרת", "error");
  }
}

async function saveSettings() {
  const key = document.getElementById("apiKeyInput").value.trim();
  const model = document.getElementById("modelSelect").value;
  try {
    await fetch("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, model })
    });
    showKeyStatus("נשמר ✓");
    hideBanner();
    setTimeout(checkSettings, 500);
  } catch {
    showBanner("שגיאה בשמירת ההגדרות", "error");
  }
}

function toggleKeyVisibility() {
  const input = document.getElementById("apiKeyInput");
  const btn = document.getElementById("toggleKeyVisibility");
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "הסתר";
  } else {
    input.type = "password";
    btn.textContent = "הצג";
  }
}

function openSettingsPanel() {
  document.getElementById("settingsPanel").classList.remove("hidden");
}

function closeSettingsPanel() {
  document.getElementById("settingsPanel").classList.add("hidden");
}

document.getElementById("settingsToggle").addEventListener("click", () => {
  document.getElementById("settingsPanel").classList.toggle("hidden");
});

function showKeyStatus(msg, missing = false) {
  const el = document.getElementById("keyStatus");
  el.textContent = msg;
  el.className = "key-status" + (missing ? " missing" : "");
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function showBanner(msg, type) {
  const el = document.getElementById("banner");
  el.textContent = msg;
  el.className = `banner ${type}`;
}

function hideBanner() {
  document.getElementById("banner").className = "banner hidden";
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────

function initDropZone() {
  const zone = document.getElementById("dropZone");
  const input = document.getElementById("fileInput");

  zone.addEventListener("dragover", e => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
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
  const allowed = newFiles.filter(f =>
    f.name.toLowerCase().endsWith(".pdf") ||
    f.name.toLowerCase().endsWith(".docx") ||
    f.name.toLowerCase().endsWith(".doc")
  );
  if (allowed.length !== newFiles.length) {
    showBanner("קבצים לא נתמכים הוסרו. מותר רק PDF ו-DOCX.", "warning");
    setTimeout(hideBanner, 3000);
  }
  allowed.forEach(f => {
    if (!selectedFiles.find(x => x.name === f.name && x.size === f.size)) {
      selectedFiles.push(f);
    }
  });
  renderFileList();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
}

function renderFileList() {
  const list = document.getElementById("fileList");
  if (selectedFiles.length === 0) {
    list.classList.add("hidden");
    return;
  }
  list.classList.remove("hidden");
  list.innerHTML = selectedFiles.map((f, i) => `
    <div class="file-item">
      <span class="file-item-name">
        ${f.name.toLowerCase().endsWith(".pdf") ? "📄" : "📝"}
        ${escapeHtml(f.name)}
      </span>
      <button class="file-remove" onclick="removeFile(${i})" title="הסר">✕</button>
    </div>
  `).join("");
}

// ─── Parameters ───────────────────────────────────────────────────────────────

function initParams() {
  DEFAULT_PARAMS.forEach(p => addParameter(p));
}

function addParameter(value = "") {
  const list = document.getElementById("paramsList");
  const div = document.createElement("div");
  div.className = "param-item";
  div.innerHTML = `
    <span class="param-bullet">•</span>
    <input type="text" value="${escapeHtml(value)}" placeholder="הוסף הנחיה..." />
    <button class="file-remove" onclick="this.parentElement.remove()" title="הסר">✕</button>
  `;
  list.appendChild(div);
}

function getParametersList() {
  return Array.from(document.querySelectorAll("#paramsList .param-item input"))
    .map(i => i.value.trim())
    .filter(Boolean);
}

// ─── Summarize ────────────────────────────────────────────────────────────────

async function summarize() {
  if (selectedFiles.length === 0) {
    showBanner("יש לבחור לפחות קובץ אחד", "warning");
    return;
  }

  const btn = document.getElementById("summarizeBtn");
  btn.disabled = true;
  hideBanner();

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append("files", f));

  const config = {
    language: document.getElementById("language").value,
    output_format: document.getElementById("format").value,
    max_length: parseInt(document.getElementById("maxLength").value) || 400,
    parameters: getParametersList()
  };
  formData.append("config_override", JSON.stringify(config));

  showLoading(selectedFiles.length);

  try {
    const res = await fetch("/summarize", { method: "POST", body: formData });
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
    `מעבד ${count} קבצים... (זה עשוי לקחת מספר שניות)`;
  document.getElementById("resultsSection").classList.add("hidden");
}

function hideLoading() {
  document.getElementById("loadingState").classList.add("hidden");
}

// ─── Results ──────────────────────────────────────────────────────────────────

function renderResults(results) {
  const section = document.getElementById("resultsSection");
  const container = document.getElementById("resultsContainer");
  section.classList.remove("hidden");
  container.innerHTML = "";

  results.forEach(r => {
    const card = document.createElement("div");
    card.className = "result-card" + (r.error ? " error" : "");

    const meta = r.char_count
      ? `${r.char_count.toLocaleString()} תווים${r.truncated ? " · נחתך ל-50,000" : ""}`
      : "";

    card.innerHTML = `
      <div class="result-header">
        <div>
          <div class="result-filename">
            ${r.error ? "⚠️" : "📄"} ${escapeHtml(r.filename)}
            ${r.truncated ? '<span class="truncated-badge">נחתך</span>' : ""}
          </div>
          ${meta ? `<div class="result-meta">${meta}</div>` : ""}
        </div>
        ${!r.error ? `
          <div class="result-actions">
            <button class="btn-export" onclick="exportSummary('${escapeAttr(r.filename)}', ${JSON.stringify(r.summary)}, 'pdf')">⬇ PDF</button>
            <button class="btn-export" onclick="exportSummary('${escapeAttr(r.filename)}', ${JSON.stringify(r.summary)}, 'docx')">⬇ Word</button>
          </div>
        ` : ""}
      </div>
      ${r.error
        ? `<div class="result-error">שגיאה: ${escapeHtml(r.error)}</div>`
        : `<div class="result-body">${escapeHtml(r.summary)}</div>`
      }
    `;
    container.appendChild(card);
  });

  section.scrollIntoView({ behavior: "smooth" });
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function exportSummary(filename, summary, format) {
  try {
    const res = await fetch(`/export/${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, summary })
    });
    if (!res.ok) throw new Error("שגיאת שרת");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = filename.replace(/\.[^.]+$/, "");
    a.href = url;
    a.download = `${base}_summary.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    showBanner("שגיאה בייצוא: " + e.message, "error");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'");
}
