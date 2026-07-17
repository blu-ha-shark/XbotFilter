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
  let observer = null;
  let copyModeBound = false;
  let suppressNextClick = false;
  let neutralizedLinks = [];

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
      /* 複製模式：強制可選取，蓋過 X 的 user-select:none 與 hover 干擾 */
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
      /* 關閉個人頁 hover 卡片，避免蓋住選取 */
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

  function applyTweetFilter(article) {
    const match = tweetMatchesFilter(article);

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

  async function init() {
    injectStyles();
    await loadSettings();
    applyCopyModeClass();
    bindCopyModeListeners();
    rescanAll();
    startObserver();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes.copyMode) {
      copyMode = changes.copyMode.newValue === true;
      applyCopyModeClass();
    }

    if (
      changes.contentKeywords ||
      changes.usernameKeywords ||
      changes.keywords ||
      changes.enabled ||
      changes.markSelected
    ) {
      loadSettings().then(() => rescanAll({ preserveScroll: true }));
    } else if (changes.copyMode) {
      // copyMode 已在上方套用，不需重掃貼文
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
