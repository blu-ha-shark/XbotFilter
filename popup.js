const copyModeEl = document.getElementById("copyMode");
const themeBtn = document.getElementById("themeBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
const modeHintEl = document.getElementById("modeHint");

const DEFAULT_SETTINGS = {
  contentKeywords: [],
  usernameKeywords: [],
  enabled: true,
  markSelected: false,
  copyMode: false,
  creatorModeEnabled: false,
  darkMode: false,
};

function uniqueKeywords(list) {
  const seen = new Set();
  const result = [];
  for (const item of list || []) {
    const value = String(item).trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/**
 * 過濾模式 / 選中模式 / 貼文管理 為互斥模式，同時間僅能有一個啟用（或全部關閉）。
 * 用來修正舊版資料可能同時存在多個 true 的情況。
 */
function normalizeModes(settings) {
  const s = { ...settings };
  if (s.creatorModeEnabled) {
    s.enabled = false;
    s.markSelected = false;
    s.creatorModeEnabled = true;
  } else if (s.markSelected) {
    s.enabled = false;
    s.markSelected = true;
    s.creatorModeEnabled = false;
  } else if (s.enabled) {
    s.enabled = true;
    s.markSelected = false;
    s.creatorModeEnabled = false;
  } else {
    s.enabled = false;
    s.markSelected = false;
    s.creatorModeEnabled = false;
  }
  return s;
}

/** 把舊版 keywords 合併進 contentKeywords，並刪除殘留的 keywords */
function migrateLegacyKeywords(result, callback) {
  const legacyKeywords = Array.isArray(result.keywords) ? result.keywords : [];
  const hasLegacy = legacyKeywords.length > 0;

  const contentKeywords = uniqueKeywords([
    ...(Array.isArray(result.contentKeywords) ? result.contentKeywords : []),
    ...legacyKeywords,
  ]);
  const usernameKeywords = uniqueKeywords(
    Array.isArray(result.usernameKeywords) ? result.usernameKeywords : []
  );

  const settings = normalizeModes({
    contentKeywords,
    usernameKeywords,
    enabled: result.enabled === true,
    markSelected: result.markSelected === true,
    copyMode: result.copyMode === true,
    creatorModeEnabled: result.creatorModeEnabled === true,
    darkMode: result.darkMode === true,
  });

  if (!hasLegacy) {
    callback(settings);
    return;
  }

  chrome.storage.sync.set(settings, () => {
    chrome.storage.sync.remove("keywords", () => callback(settings));
  });
}

function getAllSettings(callback) {
  chrome.storage.sync.get(
    { ...DEFAULT_SETTINGS, keywords: [] },
    (result) => migrateLegacyKeywords(result, callback)
  );
}

function saveAllSettings(settings) {
  const next = normalizeModes({
    contentKeywords: uniqueKeywords(settings.contentKeywords),
    usernameKeywords: uniqueKeywords(settings.usernameKeywords),
    enabled: settings.enabled === true,
    markSelected: settings.markSelected === true,
    copyMode: settings.copyMode === true,
    creatorModeEnabled: settings.creatorModeEnabled === true,
    darkMode: settings.darkMode === true,
  });
  next.contentKeywords = uniqueKeywords(settings.contentKeywords);
  next.usernameKeywords = uniqueKeywords(settings.usernameKeywords);

  chrome.storage.sync.set(next, () => {
    chrome.storage.sync.remove("keywords");
  });
}

function getCurrentToggles() {
  return {
    copyMode: copyModeEl ? copyModeEl.checked : false,
    darkMode: document.documentElement ? document.documentElement.dataset.theme === "dark" : false,
  };
}

function applyTheme(darkMode) {
  if (document.documentElement) {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  }
  if (themeBtn) {
    themeBtn.setAttribute("aria-pressed", darkMode ? "true" : "false");
    themeBtn.title = darkMode ? "淺色模式" : "黑暗模式";
    themeBtn.setAttribute(
      "aria-label",
      darkMode ? "切換淺色模式" : "切換黑暗模式"
    );
  }
}

function resetKeywordEditRow(item) {
  const textEl = item.querySelector(".keyword-text");
  const inputEl = item.querySelector(".keyword-edit-input");
  const buttons = item.querySelectorAll(".keyword-actions button");
  if (!textEl || !inputEl || buttons.length < 2) return;

  item.dataset.editing = "false";
  inputEl.value = textEl.textContent;
  textEl.hidden = false;
  inputEl.hidden = true;
  buttons[0].textContent = "編輯";
  buttons[0].className = "edit-btn";
  buttons[1].textContent = "刪除";
  buttons[1].className = "remove-btn";
}

function renderKeywordList(listEl, emptyHint, keywords, storageKey) {
  listEl.innerHTML = "";

  if (keywords.length === 0) {
    emptyHint.style.display = "flex";
    return;
  }

  emptyHint.style.display = "none";

  keywords.forEach((keyword, index) => {
    const li = document.createElement("li");

    const text = document.createElement("span");
    text.className = "keyword-text";
    text.textContent = keyword;

    const editInput = document.createElement("input");
    editInput.type = "text";
    editInput.className = "keyword-edit-input";
    editInput.value = keyword;
    editInput.hidden = true;

    const actions = document.createElement("div");
    actions.className = "keyword-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit-btn";
    editBtn.textContent = "編輯";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "刪除";

    function exitEditMode() {
      li.dataset.editing = "false";
      text.hidden = false;
      editInput.hidden = true;
      editBtn.textContent = "編輯";
      editBtn.className = "edit-btn";
      removeBtn.textContent = "刪除";
      removeBtn.className = "remove-btn";
    }

    function enterEditMode() {
      document.querySelectorAll('li[data-editing="true"]').forEach((item) => {
        if (item !== li) resetKeywordEditRow(item);
      });

      li.dataset.editing = "true";
      text.hidden = true;
      editInput.hidden = false;
      editInput.value = keyword;
      editInput.focus();
      editInput.select();
      editBtn.textContent = "儲存";
      editBtn.className = "save-btn";
      removeBtn.textContent = "取消";
      removeBtn.className = "cancel-btn";
    }

    function saveEdit() {
      const value = editInput.value.trim();
      if (!value) return;

      getAllSettings((settings) => {
        const current = settings[storageKey] || [];
        const duplicate = current.some(
          (kw, i) => i !== index && kw.toLowerCase() === value.toLowerCase()
        );
        if (duplicate) return;

        const next = [...current];
        next[index] = value;
        saveAllSettings({ ...settings, ...getCurrentToggles(), [storageKey]: next });
        renderAllKeywords({ ...settings, [storageKey]: next });
      });
    }

    editBtn.addEventListener("click", () => {
      if (li.dataset.editing === "true") {
        saveEdit();
      } else {
        enterEditMode();
      }
    });

    removeBtn.addEventListener("click", () => {
      if (li.dataset.editing === "true") {
        exitEditMode();
        return;
      }

      getAllSettings((settings) => {
        const next = (settings[storageKey] || []).filter((_, i) => i !== index);
        saveAllSettings({ ...settings, ...getCurrentToggles(), [storageKey]: next });
        renderAllKeywords({ ...settings, [storageKey]: next });
      });
    });

    editInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") saveEdit();
      if (event.key === "Escape") exitEditMode();
    });

    actions.appendChild(editBtn);
    actions.appendChild(removeBtn);
    li.appendChild(text);
    li.appendChild(editInput);
    li.appendChild(actions);
    listEl.appendChild(li);
  });
}

const keywordSections = [
  {
    storageKey: "contentKeywords",
    listEl: document.getElementById("contentKeywordList"),
    inputEl: document.getElementById("contentKeywordInput"),
    addBtn: document.getElementById("contentAddBtn"),
    emptyHint: document.getElementById("contentEmptyHint"),
  },
  {
    storageKey: "usernameKeywords",
    listEl: document.getElementById("usernameKeywordList"),
    inputEl: document.getElementById("usernameKeywordInput"),
    addBtn: document.getElementById("usernameAddBtn"),
    emptyHint: document.getElementById("usernameEmptyHint"),
  },
];

function renderAllKeywords(settings) {
  keywordSections.forEach(({ storageKey, listEl, emptyHint }) => {
    renderKeywordList(listEl, emptyHint, settings[storageKey] || [], storageKey);
  });
}

/** 更新三個模式按鈕的啟用(綠)/未啟用(灰)樣式 */
function updateModeButtons(settings) {
  modeButtons.forEach((btn) => {
    const key = btn.dataset.mode;
    const active = settings[key] === true;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setModeHint(text) {
  if (!modeHintEl) return;
  if (text) {
    modeHintEl.textContent = text;
    modeHintEl.hidden = false;
  } else {
    modeHintEl.textContent = "";
    modeHintEl.hidden = true;
  }
}

/** 檢查目前分頁是否為貼文留言頁面，若不是則在按鈕下方顯示提示（貼文管理現在同時支援發文者與讀者） */
function checkOwnPostAndUpdateHint(shouldCheck) {
  if (!shouldCheck) {
    setModeHint("");
    return;
  }

  if (!chrome.tabs || !chrome.tabs.query) {
    setModeHint("非貼文留言頁面，無法使用");
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      setModeHint("非貼文留言頁面，無法使用");
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: "XBOTFILTER_CHECK_POST_PAGE" },
      (response) => {
        if (chrome.runtime.lastError || !response || !response.isPostPage) {
          setModeHint("非貼文留言頁面，無法使用");
        } else {
          setModeHint("");
        }
      }
    );
  });
}

/** 點擊模式按鈕：三選一（再次點擊啟用中的按鈕會全部關閉） */
function setMode(modeKey) {
  getAllSettings((settings) => {
    const isActive = settings[modeKey] === true;
    const next = {
      enabled: false,
      markSelected: false,
      creatorModeEnabled: false,
    };
    if (!isActive) next[modeKey] = true;

    const merged = { ...settings, ...next, ...getCurrentToggles() };
    saveAllSettings(merged);
    updateModeButtons(merged);

    if (modeKey === "creatorModeEnabled") {
      checkOwnPostAndUpdateHint(next.creatorModeEnabled);
    } else {
      setModeHint("");
    }
  });
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

function loadSettings() {
  getAllSettings((settings) => {
    if (copyModeEl) copyModeEl.checked = settings.copyMode;
    applyTheme(settings.darkMode);
    updateModeButtons(settings);
    if (settings.creatorModeEnabled) {
      checkOwnPostAndUpdateHint(true);
    } else {
      setModeHint("");
    }
    renderAllKeywords(settings);
  });
}

function addKeyword(storageKey, inputEl) {
  const value = inputEl.value.trim();
  if (!value) return;

  getAllSettings((settings) => {
    const keywords = settings[storageKey] || [];
    const exists = keywords.some(
      (kw) => kw.toLowerCase() === value.toLowerCase()
    );
    if (exists) {
      inputEl.value = "";
      return;
    }

    const next = [...keywords, value];
    saveAllSettings({ ...settings, ...getCurrentToggles(), [storageKey]: next });
    renderAllKeywords({ ...settings, [storageKey]: next });
    inputEl.value = "";
  });
}

keywordSections.forEach(({ storageKey, inputEl, addBtn }) => {
  addBtn.addEventListener("click", () => addKeyword(storageKey, inputEl));
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addKeyword(storageKey, inputEl);
  });
});

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tab === tabName);
  });
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function onCopyModeToggle() {
  getAllSettings((settings) => {
    saveAllSettings({ ...settings, ...getCurrentToggles() });
  });
}

if (copyModeEl) copyModeEl.addEventListener("change", onCopyModeToggle);

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const nextDark = document.documentElement ? document.documentElement.dataset.theme !== "dark" : false;
    applyTheme(nextDark);
    getAllSettings((settings) => {
      saveAllSettings({ ...settings, ...getCurrentToggles(), darkMode: nextDark });
    });
  });
}

function formatTextSettings(settings) {
  const lines = [
    "# XbotFilter 關鍵字設定檔",
    "# ",
    "# 格式說明：",
    "# 1. 以「#」開頭的行數為備註說明，編輯時請勿刪除以保持格式正確，匯入時會自動忽略。",
    "# 2. [Content] 標記下方代表「貼文內容過濾」關鍵字，每行請填寫一個關鍵字（如：免費領取）。",
    "# 3. [Username] 標記下方代表「使用者名稱過濾」關鍵字，每行請填寫一個帳號或關鍵字（如：bot123 或 @spam）。",
    "# 4. 其他全域開關設定（請寫在各自標記下方，填入 true 或 false）：",
    "#    - [Enabled] 過濾模式 (true=開啟, false=關閉)",
    "#    - [MarkSelected] 選中模式 (true=開啟徽章標記, false=關閉)",
    "#    - [CreatorModeEnabled] 貼文管理 (true=開啟, false=關閉)",
    "#    - 注意：過濾模式 / 選中模式 / 貼文管理 三者互斥，請僅將其中一個設為 true（或全部 false）。",
    "#    - [CopyMode] 文字複製模式 (true=開啟, false=關閉，此項獨立於上述三種模式)",
    "#    - [DarkMode] 設定面板黑暗模式 (true=黑暗, false=淺色)",
    "",
    "[Enabled]",
    settings.enabled ? "true" : "false",
    "",
    "[MarkSelected]",
    settings.markSelected ? "true" : "false",
    "",
    "[CopyMode]",
    settings.copyMode ? "true" : "false",
    "",
    "[CreatorModeEnabled]",
    settings.creatorModeEnabled ? "true" : "false",
    "",
    "[DarkMode]",
    settings.darkMode ? "true" : "false",
    "",
    "[Content]"
  ];

  (settings.contentKeywords || []).forEach(kw => {
    const trimmed = String(kw || "").trim();
    if (trimmed) lines.push(trimmed);
  });

  lines.push("", "[Username]");
  (settings.usernameKeywords || []).forEach(kw => {
    const trimmed = String(kw || "").trim();
    if (trimmed) lines.push(trimmed);
  });

  return lines.join("\r\n");
}

function parseTextSettings(text) {
  const lines = text.split(/\r?\n/);
  const settings = {
    contentKeywords: [],
    usernameKeywords: [],
    enabled: true,
    markSelected: false,
    copyMode: false,
    creatorModeEnabled: false,
    darkMode: false,
  };
  
  let currentSection = null;
  let hasSections = false;
  
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    
    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1).toLowerCase();
      hasSections = true;
      continue;
    }
    
    if (currentSection === "content") {
      settings.contentKeywords.push(line);
    } else if (currentSection === "username") {
      settings.usernameKeywords.push(line);
    } else if (currentSection === "enabled") {
      settings.enabled = line.toLowerCase() === "true";
    } else if (currentSection === "markselected") {
      settings.markSelected = line.toLowerCase() === "true";
    } else if (currentSection === "copymode") {
      settings.copyMode = line.toLowerCase() === "true";
    } else if (currentSection === "creatormodeenabled") {
      settings.creatorModeEnabled = line.toLowerCase() === "true";
    } else if (currentSection === "darkmode") {
      settings.darkMode = line.toLowerCase() === "true";
    }
  }
  
  if (!hasSections && text.trim().length > 0) {
    throw new Error("Invalid text format: No sections found.");
  }
  
  return settings;
}

if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    getAllSettings((settings) => {
      const textContent = formatTextSettings(settings);
      const blob = new Blob([textContent], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "xbotfilter-keywords.txt";
      link.click();
      URL.revokeObjectURL(url);
    });
  });
}

if (importBtn) {
  importBtn.addEventListener("click", () => {
    if (importFile) importFile.click();
  });
}

if (importFile) {
  importFile.addEventListener("change", () => {
    const file = importFile.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = reader.result.trim();
        let data;
        if (content.startsWith("{")) {
          // 支援舊版 JSON 匯入
          data = JSON.parse(content);
        } else {
          // 支援新版 TXT 匯入
          data = parseTextSettings(content);
        }

        migrateLegacyKeywords(data, (settings) => {
          saveAllSettings(settings);
          if (copyModeEl) copyModeEl.checked = settings.copyMode;
          applyTheme(settings.darkMode);
          updateModeButtons(settings);
          if (settings.creatorModeEnabled) {
            checkOwnPostAndUpdateHint(true);
          } else {
            setModeHint("");
          }
          renderAllKeywords(settings);
        });
      } catch (err) {
        alert("匯入失敗：檔案格式不正確");
      }
      importFile.value = "";
    };
    reader.readAsText(file);
  });
}

loadSettings();
