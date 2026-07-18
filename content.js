(function () {
  "use strict";

  const PROCESSED_ATTR = "data-xbotfilter-processed";
  const HIDDEN_ATTR = "data-xbotfilter-hidden";
  const MARKED_ATTR = "data-xbotfilter-marked";
  const BADGE_CLASS = "xbotfilter-badge";
  const HIDDEN_CLASS = "xbotfilter-hidden";
  const COPY_MODE_CLASS = "xbotfilter-copy-mode";
  const COPYABLE_SELECTOR =
    '[data-testid="User-Name"], [data-testid="User-Names"], [data-testid="tweetText"]';

  let contentKeywords = [];
  let usernameKeywords = [];
  let enabled = true;
  let markSelected = false;
  let copyMode = false;
  let creatorModeEnabled = true;
  let observer = null;
  let copyModeBound = false;
  let suppressNextClick = false;
  let neutralizedLinks = [];

  // 創作者管理捷徑
  const SPAM_HIGHLIGHT_CLASS = "xbotfilter-spam-highlight";
  const SPAM_CHECKBOX_CLASS = "xbotfilter-spam-checkbox";
  const SPAM_CHECKBOX_WRAP_CLASS = "xbotfilter-spam-checkbox-wrap";
  const CREATOR_PANEL_ID = "xbotfilter-creator-panel";
  let creatorMode = false;        // 目前是否處於創作者模式
  let currentTweetId = null;      // 目前最上層推文 ID
  let actionQueue = [];           // 等待處理的 article 佇列
  let queueRunning = false;       // 佇列是否正在執行
  let lastUrl = location.href;    // URL 監聽

  function injectStyles() {
    if (document.getElementById("xbotfilter-styles")) return;

    const style = document.createElement("style");
    style.id = "xbotfilter-styles";
    style.textContent = `
      .${BADGE_CLASS} {
        display: inline-block;
        margin-bottom: 6px;
        padding: 2px 8px;
        background: #1d9bf0B3;
        color: #ffffff;
        font-size: 12px;
        font-weight: 600;
        border-radius: 4px;
        border: 1px solid #1d9bf0;
      }
      .${HIDDEN_CLASS} {
        display: none !important;
      }
      /* === 創作者管理捷徑：垃圾留言高亮 === */
      .${SPAM_HIGHLIGHT_CLASS} {
        background: rgba(255, 60, 60, 0.08) !important;
        border-left: 3px solid rgba(255, 60, 60, 0.6) !important;
        box-sizing: border-box;
        transition: background 0.2s;
      }
      .${SPAM_CHECKBOX_WRAP_CLASS} {
        position: absolute;
        top: 8px;
        left: 6px;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .${SPAM_CHECKBOX_CLASS} {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: #f4212e;
        flex-shrink: 0;
      }
      /* 讓推文 article 變為 relative 以容納 checkbox */
      article[data-testid="tweet"].${SPAM_HIGHLIGHT_CLASS} {
        position: relative !important;
      }
      /* === 創作者浮動面板 === */
      #${CREATOR_PANEL_ID} {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        width: 280px;
        background: #15202b;
        border: 1px solid #38444d;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.45);
        padding: 16px;
        font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif;
        color: #e7e9ea;
        font-size: 13px;
        user-select: none;
      }
      #${CREATOR_PANEL_ID}[data-theme="light"] {
        background: #ffffff;
        border-color: #eff3f4;
        color: #0f1419;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      }
      #${CREATOR_PANEL_ID} .xbf-panel-title {
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      #${CREATOR_PANEL_ID} .xbf-panel-sub {
        font-size: 12px;
        color: #8b98a5;
        margin-bottom: 12px;
      }
      #${CREATOR_PANEL_ID}[data-theme="light"] .xbf-panel-sub {
        color: #536471;
      }
      #${CREATOR_PANEL_ID} .xbf-select-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 10px;
        font-size: 12px;
      }
      #${CREATOR_PANEL_ID} .xbf-select-row input[type=checkbox] {
        accent-color: #1d9bf0;
        width: 15px;
        height: 15px;
        cursor: pointer;
      }
      #${CREATOR_PANEL_ID} .xbf-btn-row {
        display: flex;
        flex-direction: column;
        gap: 7px;
        margin-bottom: 10px;
      }
      #${CREATOR_PANEL_ID} .xbf-btn {
        padding: 9px 12px;
        border: none;
        border-radius: 999px;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        text-align: center;
        transition: opacity 0.15s;
      }
      #${CREATOR_PANEL_ID} .xbf-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      #${CREATOR_PANEL_ID} .xbf-btn-hide {
        background: #1d9bf0;
        color: #fff;
      }
      #${CREATOR_PANEL_ID} .xbf-btn-hide:not(:disabled):hover {
        background: #1a8cd8;
      }
      #${CREATOR_PANEL_ID} .xbf-btn-block {
        background: #f4212e;
        color: #fff;
      }
      #${CREATOR_PANEL_ID} .xbf-btn-block:not(:disabled):hover {
        background: #dc1d28;
      }
      #${CREATOR_PANEL_ID} .xbf-redirect-row {
        margin-bottom: 10px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      #${CREATOR_PANEL_ID} .xbf-redirect-row label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        cursor: pointer;
      }
      #${CREATOR_PANEL_ID} .xbf-redirect-row input[type=radio] {
        accent-color: #1d9bf0;
        cursor: pointer;
      }
      #${CREATOR_PANEL_ID} .xbf-progress {
        font-size: 12px;
        color: #8b98a5;
        min-height: 16px;
        text-align: center;
      }
      #${CREATOR_PANEL_ID}[data-theme="light"] .xbf-progress {
        color: #536471;
      }
      #${CREATOR_PANEL_ID} .xbf-divider {
        border: none;
        border-top: 1px solid #38444d;
        margin: 10px 0;
      }
      #${CREATOR_PANEL_ID}[data-theme="light"] .xbf-divider {
        border-color: #eff3f4;
      }
      /* 複製模式相關樣式 */
      html.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Name"],
      html.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Name"] *,
      html.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Names"],
      html.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Names"] *,
      html.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="tweetText"],
      html.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="tweetText"] *,
      body.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Name"],
      body.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Name"] *,
      body.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Names"],
      body.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Names"] *,
      body.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="tweetText"],
      body.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="tweetText"] * {
        user-select: text !important;
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        cursor: text !important;
      }
      html.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Name"] a,
      html.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Names"] a,
      html.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="tweetText"] a,
      body.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Name"] a,
      body.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="User-Names"] a,
      body.${COPY_MODE_CLASS} article[data-testid="tweet"] [data-testid="tweetText"] a {
        text-decoration: none !important;
        pointer-events: auto !important;
        -webkit-user-drag: none !important;
        user-drag: none !important;
      }
      html.${COPY_MODE_CLASS} [data-testid="HoverCard"],
      html.${COPY_MODE_CLASS} [data-testid="HoverCardPortal"],
      body.${COPY_MODE_CLASS} [data-testid="HoverCard"],
      body.${COPY_MODE_CLASS} [data-testid="HoverCardPortal"] {
        display: none !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeKeyword(keyword) {
    return keyword.trim();
  }

  function normalizeKeywords(list) {
    return (list || []).map(normalizeKeyword).filter(Boolean);
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          contentKeywords: [],
          usernameKeywords: [],
          keywords: [],
          enabled: true,
          markSelected: false,
          copyMode: false,
          creatorModeEnabled: true,
        },
        (result) => {
          const legacyKeywords = Array.isArray(result.keywords)
            ? result.keywords
            : [];
          const mergedContent = [
            ...(Array.isArray(result.contentKeywords)
              ? result.contentKeywords
              : []),
            ...legacyKeywords,
          ];

          contentKeywords = normalizeKeywords(mergedContent);
          usernameKeywords = normalizeKeywords(result.usernameKeywords);
          enabled = result.enabled !== false;
          markSelected = result.markSelected === true;
          copyMode = result.copyMode === true;
          creatorModeEnabled = result.creatorModeEnabled !== false;
          applyCopyModeClass();

          // 舊版 keywords 殘留時：合併進 contentKeywords 並刪除
          if (legacyKeywords.length > 0) {
            chrome.storage.sync.set(
              {
                contentKeywords: mergedContent.filter(
                  (kw, i, arr) =>
                    kw &&
                    arr.findIndex(
                      (x) => String(x).toLowerCase() === String(kw).toLowerCase()
                    ) === i
                ),
                usernameKeywords: result.usernameKeywords || [],
                enabled,
                markSelected,
                copyMode,
                creatorModeEnabled,
              },
              () => chrome.storage.sync.remove("keywords")
            );
          }

          resolve();
        }
      );
    });
  }

  function applyCopyModeClass() {
    document.documentElement.classList.toggle(COPY_MODE_CLASS, copyMode);
    document.body?.classList.toggle(COPY_MODE_CLASS, copyMode);
    if (!copyMode) {
      restoreNeutralizedLinks();
      suppressNextClick = false;
    }
  }

  function isInteractiveControl(el) {
    return !!el.closest(
      'button, [role="button"], input, textarea, select'
    );
  }

  function isCopyableTarget(el) {
    if (!(el instanceof Element)) return false;
    if (isInteractiveControl(el)) return false;
    return !!el.closest(COPYABLE_SELECTOR);
  }

  function hasTextSelection() {
    const selection = window.getSelection();
    return !!(selection && String(selection).length > 0);
  }

  function blockBubble(event) {
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  function blockNavigation(event) {
    event.preventDefault();
    blockBubble(event);
  }

  function restoreNeutralizedLinks() {
    for (const link of neutralizedLinks) {
      if (!link.isConnected) continue;
      const href = link.getAttribute("data-xbotfilter-href");
      if (href != null) {
        link.setAttribute("href", href);
        link.removeAttribute("data-xbotfilter-href");
      }
      if (link.hasAttribute("data-xbotfilter-draggable")) {
        const prev = link.getAttribute("data-xbotfilter-draggable");
        if (prev === "") {
          link.removeAttribute("draggable");
        } else {
          link.setAttribute("draggable", prev);
        }
        link.removeAttribute("data-xbotfilter-draggable");
      } else {
        link.removeAttribute("draggable");
      }
    }
    neutralizedLinks = [];
  }

  /**
   * 暫時拿掉 href / 關閉 draggable，讓拖曳變成選取文字而非拖曳連結。
   * mouseup 後再還原。
   */
  function neutralizeLinkForSelection(link) {
    if (!(link instanceof Element)) return;
    if (link.hasAttribute("data-xbotfilter-href")) return;

    if (link.hasAttribute("href")) {
      link.setAttribute("data-xbotfilter-href", link.getAttribute("href") || "");
      link.removeAttribute("href");
    }

    if (link.hasAttribute("draggable")) {
      link.setAttribute(
        "data-xbotfilter-draggable",
        link.getAttribute("draggable") || ""
      );
    }
    link.setAttribute("draggable", "false");
    neutralizedLinks.push(link);
  }

  function neutralizeCopyableLinks(target) {
    const scope = target.closest?.(COPYABLE_SELECTOR);
    if (!scope) return;

    if (scope.matches("a")) {
      neutralizeLinkForSelection(scope);
    }
    scope.querySelectorAll("a").forEach(neutralizeLinkForSelection);

    // X 也可能用 role="link" 的非 <a> 元素
    const roleLink = target.closest?.('[role="link"]');
    if (roleLink && scope.contains(roleLink)) {
      neutralizeLinkForSelection(roleLink);
    }
  }

  function onCopyModeMouseDown(event) {
    if (!copyMode || event.button !== 0) return;
    if (!isCopyableTarget(event.target)) return;
    suppressNextClick = true;

    neutralizeCopyableLinks(event.target);

    // 只阻斷冒泡（避免 X 導覽），不可 preventDefault，否則會無法選取文字
    blockBubble(event);
  }

  function onCopyModeMouseUp() {
    if (!copyMode) return;
    // 延後還原，讓 click 先以「無 href」狀態被攔截
    setTimeout(restoreNeutralizedLinks, 0);
  }

  function onCopyModeDragStart(event) {
    if (!copyMode) return;
    if (!isCopyableTarget(event.target)) return;
    event.preventDefault();
    blockBubble(event);
  }

  function onCopyModeMouseOver(event) {
    if (!copyMode) return;
    if (!(event.target instanceof Element)) return;
    // 阻止使用者名稱觸發 hover 名片
    if (
      event.target.closest(
        '[data-testid="User-Name"], [data-testid="User-Names"]'
      )
    ) {
      blockBubble(event);
    }
  }

  function onCopyModeClick(event) {
    if (!copyMode) return;
    if (event.button !== 0 && event.type === "click") return;
    if (isInteractiveControl(event.target)) {
      suppressNextClick = false;
      return;
    }

    const inTweet = event.target.closest?.('article[data-testid="tweet"]');
    if (!inTweet) {
      suppressNextClick = false;
      return;
    }

    const shouldBlock =
      suppressNextClick ||
      isCopyableTarget(event.target) ||
      hasTextSelection();

    suppressNextClick = false;
    if (!shouldBlock) return;

    blockNavigation(event);
  }

  function onCopyModeAuxClick(event) {
    if (!copyMode) return;
    if (!isCopyableTarget(event.target)) return;
    blockNavigation(event);
  }

  function bindCopyModeListeners() {
    if (copyModeBound) return;
    copyModeBound = true;
    document.addEventListener("mousedown", onCopyModeMouseDown, true);
    document.addEventListener("mouseup", onCopyModeMouseUp, true);
    document.addEventListener("dragstart", onCopyModeDragStart, true);
    document.addEventListener("mouseover", onCopyModeMouseOver, true);
    document.addEventListener("click", onCopyModeClick, true);
    document.addEventListener("auxclick", onCopyModeAuxClick, true);
  }

  function findMatchedKeyword(text, keywordList) {
    if (!text || keywordList.length === 0) return null;
    const lower = text.toLowerCase();
    return (
      keywordList.find((kw) => lower.includes(kw.toLowerCase())) || null
    );
  }

  function getTweetUsername(article) {
    const userNameNode = article.querySelector('[data-testid="User-Name"]');
    if (userNameNode) return userNameNode.innerText;

    const userNamesNode = article.querySelector('[data-testid="User-Names"]');
    if (userNamesNode) return userNamesNode.innerText;

    return "";
  }

  /** @returns {{ type: '貼文內容' | '使用者名稱', keyword: string } | null} */
  function tweetMatchesFilter(article) {
    const contentHit = findMatchedKeyword(
      getTweetText(article),
      contentKeywords
    );
    if (contentHit) {
      return { type: "貼文內容", keyword: contentHit };
    }

    const usernameHit = findMatchedKeyword(
      getTweetUsername(article),
      usernameKeywords
    );
    if (usernameHit) {
      return { type: "使用者名稱", keyword: usernameHit };
    }

    return null;
  }

  function formatMatchBadge(match) {
    return `已被 ${match.type}：${match.keyword} 選中`;
  }

  function getTweetText(article) {
    const textNode = article.querySelector('[data-testid="tweetText"]');
    if (textNode) return textNode.innerText;
    return article.innerText;
  }

  function getTweetCell(article) {
    const cellInner = article.closest('[data-testid="cellInnerDiv"]');
    if (!cellInner) return article;

    const parent = cellInner.parentElement;
    if (
      parent &&
      parent !== document.body &&
      parent.children.length === 1 &&
      parent !== cellInner
    ) {
      return parent;
    }

    return cellInner;
  }

  function getHiddenTargets(article) {
    const cell = getTweetCell(article);
    const targets = cell === article ? [article] : [cell, article];
    return targets;
  }

  function hideTweet(article) {
    for (const target of getHiddenTargets(article)) {
      target.classList.add(HIDDEN_CLASS);
      target.style.display = "";
      target.setAttribute(HIDDEN_ATTR, "true");
    }
  }

  function showTweet(article) {
    for (const target of getHiddenTargets(article)) {
      target.classList.remove(HIDDEN_CLASS);
      target.style.display = "";
      target.removeAttribute(HIDDEN_ATTR);
    }
  }

  function markTweet(article, match) {
    const label = formatMatchBadge(match);
    let badge = article.querySelector(`.${BADGE_CLASS}`);

    if (badge) {
      badge.textContent = label;
      article.setAttribute(MARKED_ATTR, "true");
      return;
    }

    badge = document.createElement("div");
    badge.className = BADGE_CLASS;
    badge.textContent = label;

    const textNode = article.querySelector('[data-testid="tweetText"]');
    if (textNode && textNode.parentElement) {
      textNode.parentElement.insertBefore(badge, textNode);
    } else {
      article.prepend(badge);
    }

    article.setAttribute(MARKED_ATTR, "true");
  }

  function unmarkTweet(article) {
    const badge = article.querySelector(`.${BADGE_CLASS}`);
    if (badge) badge.remove();
    article.removeAttribute(MARKED_ATTR);
  }

  // ===== 創作者管理捷徑：高亮標記與 Checkbox =====

  /** 高亮推文並插入 checkbox */
  function highlightSpamTweet(article) {
    if (article.classList.contains(SPAM_HIGHLIGHT_CLASS)) return;
    article.classList.add(SPAM_HIGHLIGHT_CLASS);
    showTweet(article);
    unmarkTweet(article);

    if (!article.querySelector(`.${SPAM_CHECKBOX_WRAP_CLASS}`)) {
      const wrap = document.createElement("div");
      wrap.className = SPAM_CHECKBOX_WRAP_CLASS;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = SPAM_CHECKBOX_CLASS;
      cb.checked = true;
      cb.title = "選取此留言進行批次管理";
      cb.addEventListener("change", updateFloatingPanel);
      // 阻止點擊 checkbox 觸發推文導覽
      cb.addEventListener("click", (e) => e.stopPropagation());
      wrap.appendChild(cb);
      article.appendChild(wrap);
    }
    updateFloatingPanel();
  }

  /** 清除高亮標記與 checkbox */
  function clearSpamHighlight(article) {
    article.classList.remove(SPAM_HIGHLIGHT_CLASS);
    const wrap = article.querySelector(`.${SPAM_CHECKBOX_WRAP_CLASS}`);
    if (wrap) wrap.remove();
    updateFloatingPanel();
  }

  function applyTweetFilter(article) {
    const match = tweetMatchesFilter(article);

    // 創作者管理模式：主貼文以外的留言才高亮（跳過頁面最頂端的主推文）
    if (creatorMode && creatorModeEnabled && match && enabled) {
      // 跳過本推文（主貼文）：若 article 是頁面上第一則推文
      const allArticles = document.querySelectorAll('article[data-testid="tweet"]');
      if (allArticles.length > 0 && allArticles[0] === article) {
        // 主貼文：不隱藏也不高亮
        clearSpamHighlight(article);
        showTweet(article);
        unmarkTweet(article);
        return;
      }
      clearSpamHighlight(article);
      highlightSpamTweet(article);
      return;
    }

    // 非創作者模式：清除高亮
    clearSpamHighlight(article);

    if (match && markSelected) {
      showTweet(article);
      markTweet(article, match);
      return;
    }

    unmarkTweet(article);

    if (match && enabled) {
      hideTweet(article);
    } else {
      showTweet(article);
    }
  }

  function isCurrentlyHidden(article) {
    return getHiddenTargets(article).some(
      (target) =>
        target.getAttribute(HIDDEN_ATTR) === "true" ||
        target.classList.contains(HIDDEN_CLASS) ||
        target.style.display === "none"
    );
  }

  function getScrollParent(el) {
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent);
      const overflowY = style.overflowY;
      if (
        (overflowY === "auto" ||
          overflowY === "scroll" ||
          overflowY === "overlay") &&
        parent.scrollHeight > parent.clientHeight
      ) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function scrollByDelta(scroller, delta) {
    if (Math.abs(delta) < 1) return;
    if (
      scroller === document.documentElement ||
      scroller === document.body ||
      scroller === document.scrollingElement
    ) {
      window.scrollBy(0, delta);
    } else {
      scroller.scrollTop += delta;
    }
  }

  /** 錨定「未被選中」貼文，過濾後維持其相對畫面位置 */
  function findScrollAnchor() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    const preferredY = Math.min(120, window.innerHeight * 0.2);
    let best = null;
    let bestScore = Infinity;

    for (const article of tweets) {
      if (isCurrentlyHidden(article)) continue;
      if (tweetMatchesFilter(article)) continue;

      const rect = article.getBoundingClientRect();
      if (rect.height < 8) continue;

      const inViewport =
        rect.bottom > 40 && rect.top < window.innerHeight - 20;
      if (!inViewport) continue;

      const score = Math.abs(rect.top - preferredY);
      if (score < bestScore) {
        bestScore = score;
        best = {
          article,
          offsetTop: rect.top,
          scroller: getScrollParent(article),
        };
      }
    }

    if (best) return best;

    // 畫面內全是被選中貼文時：改找最近的未被選中貼文
    let nearest = null;
    let nearestDist = Infinity;

    for (const article of tweets) {
      if (isCurrentlyHidden(article)) continue;
      if (tweetMatchesFilter(article)) continue;

      const rect = article.getBoundingClientRect();
      if (rect.height < 8) continue;

      const dist =
        rect.bottom < 0
          ? -rect.bottom
          : rect.top > window.innerHeight
            ? rect.top - window.innerHeight
            : 0;

      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = {
          article,
          offsetTop: rect.top,
          scroller: getScrollParent(article),
        };
      }
    }

    return nearest;
  }

  function restoreScrollAnchor(anchor) {
    if (!anchor || !anchor.article.isConnected) return;
    if (isCurrentlyHidden(anchor.article)) return;

    const newTop = anchor.article.getBoundingClientRect().top;
    scrollByDelta(anchor.scroller, newTop - anchor.offsetTop);
  }

  function processTweet(article) {
    if (article.getAttribute(PROCESSED_ATTR)) return;
    article.setAttribute(PROCESSED_ATTR, "true");
    applyTweetFilter(article);
  }

  function rescanAll({ preserveScroll = false } = {}) {
    const anchor = preserveScroll ? findScrollAnchor() : null;

    document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
      article.removeAttribute(PROCESSED_ATTR);
      applyTweetFilter(article);
      article.setAttribute(PROCESSED_ATTR, "true");
    });

    if (!anchor) return;

    // 等瀏覽器完成 reflow 後再校正，必要時再補一次
    requestAnimationFrame(() => {
      restoreScrollAnchor(anchor);
      requestAnimationFrame(() => restoreScrollAnchor(anchor));
    });
  }

  function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope
      .querySelectorAll(`article[data-testid="tweet"]:not([${PROCESSED_ATTR}])`)
      .forEach(processTweet);
  }

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          if (
            node.matches &&
            node.matches('article[data-testid="tweet"]')
          ) {
            processTweet(node);
          } else {
            scan(node);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ===== 創作者管理捷徑：頁面偵測與浮動面板 =====

  /** 取得目前登入帳號的 username（小寫）*/
  function getMyUsername() {
    const profileLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    if (!profileLink) return null;
    const href = profileLink.getAttribute("href") || "";
    const m = href.match(/^\/([^/]+)$/);
    return m ? m[1].toLowerCase() : null;
  }

  /** 判斷是否在自己的貼文頁（ /username/status/id ）*/
  function isOwnPostPage() {
    const m = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!m) return false;
    const pageUser = m[1].toLowerCase();
    const tweetId = m[2];
    const myUser = getMyUsername();
    if (!myUser || pageUser !== myUser) return false;
    currentTweetId = tweetId;
    return true;
  }

  /** 取得面板的主題（跟隨 X 的亮暗色） */
  function getPanelTheme() {
    const bg = getComputedStyle(document.body).backgroundColor;
    if (!bg) return "dark";
    const rgb = bg.match(/\d+/g);
    if (!rgb) return "dark";
    const brightness = 0.299 * Number(rgb[0]) + 0.587 * Number(rgb[1]) + 0.114 * Number(rgb[2]);
    return brightness > 128 ? "light" : "dark";
  }

  /** 建立或取得浮動管理面板 */
  function createFloatingPanel() {
    let panel = document.getElementById(CREATOR_PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = CREATOR_PANEL_ID;
    panel.innerHTML = `
      <div class="xbf-panel-title">🛡️ XbotFilter 創作者模式</div>
      <div class="xbf-panel-sub" id="xbf-panel-sub">偵測到 0 則疑似機器人留言</div>
      <div class="xbf-select-row">
        <input type="checkbox" id="xbf-select-all" />
        <label for="xbf-select-all">全選 / 取消全選</label>
      </div>
      <hr class="xbf-divider" />
      <div class="xbf-btn-row">
        <button class="xbf-btn xbf-btn-hide" id="xbf-btn-hide" disabled>一鍵隱藏選取 (0)</button>
        <button class="xbf-btn xbf-btn-block" id="xbf-btn-block" disabled>一鍵隱藏+封鎖選取 (0)</button>
      </div>
      <hr class="xbf-divider" />
      <div class="xbf-redirect-row">
        <label><input type="radio" name="xbf-redirect" value="none" checked /> 完成後保留頁面</label>
        <label><input type="radio" name="xbf-redirect" value="hidden" /> 完成後跳轉至隱藏清單</label>
        <label><input type="radio" name="xbf-redirect" value="blocked" /> 完成後跳轉至封鎖清單</label>
      </div>
      <div class="xbf-progress" id="xbf-panel-progress"></div>
    `;
    document.body.appendChild(panel);

    // 全選 / 取消全選
    document.getElementById("xbf-select-all").addEventListener("change", (e) => {
      document.querySelectorAll(`.${SPAM_CHECKBOX_CLASS}`).forEach((cb) => {
        cb.checked = e.target.checked;
      });
      updateFloatingPanel();
    });

    // 按鈕事件
    document.getElementById("xbf-btn-hide").addEventListener("click", () => {
      enqueueActions("hide");
    });
    document.getElementById("xbf-btn-block").addEventListener("click", () => {
      enqueueActions("hide_block");
    });

    return panel;
  }

  /** 更新浮動面板顯示的計數 */
  function updateFloatingPanel() {
    const panel = document.getElementById(CREATOR_PANEL_ID);
    if (!panel) return;

    const allHighlighted = document.querySelectorAll(`.${SPAM_HIGHLIGHT_CLASS}`);
    const checkedBoxes = document.querySelectorAll(`.${SPAM_CHECKBOX_CLASS}:checked`);
    const total = allHighlighted.length;
    const selected = checkedBoxes.length;

    const sub = document.getElementById("xbf-panel-sub");
    if (sub) sub.textContent = `偵測到 ${total} 則疑似機器人留言`;

    const hideBtn = document.getElementById("xbf-btn-hide");
    const blockBtn = document.getElementById("xbf-btn-block");
    if (hideBtn) {
      hideBtn.textContent = `一鍵隱藏選取 (${selected})`;
      hideBtn.disabled = selected === 0 || queueRunning;
    }
    if (blockBtn) {
      blockBtn.textContent = `一鍵隱藏+封鎖選取 (${selected})`;
      blockBtn.disabled = selected === 0 || queueRunning;
    }

    const selectAll = document.getElementById("xbf-select-all");
    if (selectAll) {
      selectAll.checked = total > 0 && selected === total;
      selectAll.indeterminate = selected > 0 && selected < total;
    }

    // 更新面板主題
    panel.dataset.theme = getPanelTheme();
  }

  /** 移除浮動面板並清除所有高亮 */
  function destroyCreatorMode() {
    const panel = document.getElementById(CREATOR_PANEL_ID);
    if (panel) panel.remove();
    document.querySelectorAll(`.${SPAM_HIGHLIGHT_CLASS}`).forEach((el) => {
      clearSpamHighlight(el);
    });
    creatorMode = false;
    currentTweetId = null;
    actionQueue = [];
    queueRunning = false;
  }

  // ===== 模擬點擊佇列 =====

  function randomDelay(min = 1500, max = 3000) {
    return new Promise((resolve) => setTimeout(resolve, Math.random() * (max - min) + min));
  }

  function waitForElement(selector, timeout = 2000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return resolve(null);
        setTimeout(check, 80);
      };
      check();
    });
  }

  /** 從選單項目中找到「隱藏回覆」並點擊 */
  async function clickHideReplyMenuItem() {
    // X 的選單項目 selector
    const items = document.querySelectorAll('[role="menuitem"], [role="option"]');
    const HIDE_TEXTS = ["隱藏回覆", "hide reply", "hide tweet", "hide post"];
    for (const item of items) {
      const text = (item.innerText || item.textContent || "").toLowerCase().trim();
      if (HIDE_TEXTS.some((t) => text.includes(t))) {
        item.click();
        return true;
      }
    }
    return false;
  }

  /** 取得完成後跳轉選項 */
  function getRedirectOption() {
    const panel = document.getElementById(CREATOR_PANEL_ID);
    if (!panel) return "none";
    const checked = panel.querySelector('input[name="xbf-redirect"]:checked');
    return checked ? checked.value : "none";
  }

  /** 設定進度文字 */
  function setProgress(text) {
    const el = document.getElementById("xbf-panel-progress");
    if (el) el.textContent = text;
  }

  /** 模擬點擊佇列主函式 */
  async function enqueueActions(actionType) {
    if (queueRunning) return;

    // 收集目前被勾選的 article
    const checkedBoxes = [...document.querySelectorAll(`.${SPAM_CHECKBOX_CLASS}:checked`)];
    if (checkedBoxes.length === 0) return;

    actionQueue = checkedBoxes.map((cb) => cb.closest('article[data-testid="tweet"]')).filter(Boolean);
    if (actionQueue.length === 0) return;

    queueRunning = true;
    updateFloatingPanel();

    const total = actionQueue.length;
    let done = 0;

    for (const article of actionQueue) {
      if (!article.isConnected) {
        done++;
        continue;
      }

      setProgress(`處理中… ${done + 1} / ${total}`);

      try {
        // 1. 滾動至目標推文
        article.scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise((r) => setTimeout(r, 400));

        // 2. 點擊三點選單 (caret)
        const caret = article.querySelector('[data-testid="caret"]');
        if (!caret) throw new Error("找不到 caret");
        caret.click();

        // 3. 等待選單出現並點擊「隱藏回覆」
        const menu = await waitForElement('[role="menu"]', 2000);
        if (!menu) throw new Error("選單未出現");
        await new Promise((r) => setTimeout(r, 150));
        const clicked = await clickHideReplyMenuItem();
        if (!clicked) throw new Error("找不到隱藏回覆選項");

        // 4. 等待確認對話框「也要封鎖嗎？」
        await new Promise((r) => setTimeout(r, 500));
        const confirmSheet = await waitForElement('[data-testid="confirmationSheetConfirm"]', 2000);
        const cancelSheet = document.querySelector('[data-testid="confirmationSheetCancel"]');

        if (confirmSheet && cancelSheet) {
          if (actionType === "hide_block") {
            // 點擊「封鎖」（紅色按鈕）
            confirmSheet.click();
          } else {
            // 點擊「否」（黑色按鈕）
            cancelSheet.click();
          }
        } else if (confirmSheet) {
          // 只有一個按鈕時直接點擊
          confirmSheet.click();
        }

        // 5. 成功：清除高亮
        await new Promise((r) => setTimeout(r, 300));
        clearSpamHighlight(article);
      } catch (err) {
        // 單一項目失敗：關閉可能殘留的選單再繼續
        const escEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
        document.dispatchEvent(escEvent);
        await new Promise((r) => setTimeout(r, 300));
      }

      done++;
      // 6. 隨機延遲 1.5s ~ 3s
      if (done < total) {
        await randomDelay(1500, 3000);
      }
    }

    queueRunning = false;
    actionQueue = [];
    setProgress(`完成！已處理 ${done} 則留言。`);
    updateFloatingPanel();

    // 7. 完成後跳轉
    const redirect = getRedirectOption();
    await new Promise((r) => setTimeout(r, 800));
    if (redirect === "hidden" && currentTweetId) {
      location.href = `https://x.com/i/status/${currentTweetId}/hidden`;
    } else if (redirect === "blocked") {
      location.href = "https://x.com/settings/blocked_profiles";
    }
  }

  // ===== 創作者模式初始化與 URL 監聽 =====

  function checkCreatorModeInit() {
    const shouldBeCreator = creatorModeEnabled && isOwnPostPage();

    if (shouldBeCreator && !creatorMode) {
      creatorMode = true;
      createFloatingPanel();
      // 重新掃描所有推文以套用高亮邏輯
      rescanAll({ preserveScroll: false });
      updateFloatingPanel();
    } else if (!shouldBeCreator && creatorMode) {
      destroyCreatorMode();
      // 重新掃描恢復正常隱藏邏輯
      rescanAll({ preserveScroll: false });
    } else if (shouldBeCreator && creatorMode) {
      // 同一頁，只更新面板主題
      updateFloatingPanel();
    }
  }

  async function init() {
    injectStyles();
    await loadSettings();
    applyCopyModeClass();
    bindCopyModeListeners();
    checkCreatorModeInit();
    rescanAll();
    startObserver();

    // 監聽 X 的 SPA 路由變化（URL 改變時重新判斷創作者模式）
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        checkCreatorModeInit();
      }
    }, 800);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes.copyMode) {
      copyMode = changes.copyMode.newValue === true;
      applyCopyModeClass();
    }

    if (changes.creatorModeEnabled) {
      creatorModeEnabled = changes.creatorModeEnabled.newValue !== false;
      checkCreatorModeInit();
    }

    if (
      changes.contentKeywords ||
      changes.usernameKeywords ||
      changes.keywords ||
      changes.enabled ||
      changes.markSelected ||
      changes.creatorModeEnabled
    ) {
      loadSettings().then(() => {
        checkCreatorModeInit();
        rescanAll({ preserveScroll: true });
      });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
