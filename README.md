# XbotFilter

X/Twitter 自訂關鍵字與帳號過濾器。在瀏覽 X 時，自動將包含指定關鍵字的貼文或特定使用者名稱的貼文隱藏，避免機器人洗版並保持留言區乾淨。支援複製模式、偵錯標記、滾動錨定以及黑暗模式切換。

## 隱私與合規聲明 / Privacy & Compliance
 
> **Privacy & Compliance:** This extension operates entirely locally on your browser. It does not communicate with any external servers, does not collect any user data, and does not use or interact with the Twitter/X API. It is purely a DOM-manipulation tool for personal browsing experience optimization.
 
> **隱私與合規聲明：** 本擴充功能完全運行於本地端。不與任何外部伺服器連線，不蒐集用戶資料，且不使用或與 Twitter/X API 進行互動。純屬個人瀏覽體驗優化的 DOM 操作工具。

## 功能特點

- 🎯 **多維度過濾**：
  - **貼文內容過濾**：比對貼文內文或全文（不區分大小寫）。
  - **使用者名稱過濾**：比對顯示名稱與帳號（不區分大小寫），防堵特定 bot 帳號。
- ⚙️ **兩種互斥模式（過濾模式 / 選中模式）**：
  設定面板把這兩種模式改成同一列的兩顆按鈕，**同時間只能啟用一個**（再按一次目前啟用中的按鈕會變成全部關閉）：

  | 按鈕 | 行為 |
  |---|---|
  | **過濾模式** | 符合關鍵字的貼文直接隱藏 |
  | **選中模式** | 符合關鍵字的貼文**不隱藏**，改在上方顯示藍色徽章（例如：`已被 貼文內容：[關鍵字] 選中`），用於除錯、確認過濾邏輯是否抓對 |

  啟用中＝綠色，未啟用＝灰色。
- 📋 **文字複製模式（獨立開關）**：
  跟上面兩種模式無關，可以同時開關。開啟時解除 X 對貼文文字的選取限制、阻擋個人頁面 HoverCard、避免選取文字時誤觸連結跳轉，讓複製內容與帳號極度流暢。
- ⚓ **滾動位置錨定 (Scroll Anchoring)**：在過濾或重新掃描貼文時，自動鎖定當前可見推文的滾動高度，避免頁面因隱藏貼文而發生惱人的上下跳動。
- 🌗 **黑暗模式切換**：面板提供一鍵切換 Light/Dark 主題，完美適配 X/Twitter 亮暗色系。
- 📝 **關鍵字編輯管理**：
  - 分頁標籤切換，介面整潔。
  - 支援清單直接**編輯**（儲存/取消）與**刪除**關鍵字。
  - 具備防重複輸入檢查。
- 💾 **設定匯入/匯出**：
  - 支援一鍵匯出為 `.txt` 格式的設定檔（包含區塊與參數標記，方便分享與手動修改），同時支援新版 `.txt` 與舊版 `.json` 檔案的匯入。
  - 內建舊版本相容機制，會自動將舊的單一 `keywords` 設定升級合併至新版結構，並自動修正過濾模式／選中模式可能同時為開啟狀態的舊資料。

## 安裝方式（Chrome / Edge）

1. 開啟瀏覽器的擴充功能管理頁
   - Chrome：`chrome://extensions/`
   - Edge：`edge://extensions/`
2. 開啟右上角的「開發人員模式」
3. 點選「載入未封裝項目」
4. 選擇本專案資料夾（含 `manifest.json` 的目錄）
5. 前往 [x.com](https://x.com)，點擊工具列上的 XbotFilter 圖示進行設定

## 使用方式

1. 點擊擴充功能圖示開啟設定面板。
2. 根據需要切換分頁，並輸入關鍵字或帳號（例如：`免費領取`、`點擊連結`、`USDT` 或 `@spam_bot`）。
3. 點擊「新增」或按下 `Enter` 鍵。
4. 依需求點選「過濾模式」或「選中模式」其中之一（三選一改成二選一，再點一次可全部關閉）；「文字複製模式」可獨立開關。
5. 重新整理 X 頁面或捲動留言區，符合條件的貼文會自動套用過濾設定。

## 技術原理

- **動態監聽**：透過 `MutationObserver` 實時監測頁面 DOM 的變化。當載入新的推文（`article[data-testid="tweet"]`）時，立即執行過濾比對。
- **過濾機制**：
  - 掃描貼文內部的 `[data-testid="tweetText"]` 取得文字內容。
  - 掃描 `[data-testid="User-Name"]` 或 `[data-testid="User-Names"]` 取得帳號及顯示名稱。
  - 比對是否包含使用者設定的關鍵字。符合條件時，依目前啟用的模式，對貼文容器（及外層 `cellInnerDiv`）套用 `display: none` 樣式隱藏，或在貼文上方插入徽章標記。
- **資料儲存**：使用 `chrome.storage.sync` 進行設定儲存，若瀏覽器已登入帳號，可實現跨裝置自動同步設定。過濾模式／選中模式的欄位（`enabled` / `markSelected`）在寫入前一律會先正規化為互斥狀態，避免兩者同時為 `true`。

## 檔案結構

```
XbotFilter/
├── manifest.json   # 擴充功能設定檔 (Manifest V3)
├── content.js      # 注入網頁的過濾與複製模式邏輯 (Content Script)
├── popup.html      # 設定面板結構
├── popup.js        # 設定面板控制邏輯（模式切換、分頁、清單編輯、匯入匯出）
├── popup.css       # 設定面板樣式與亮暗色主題變數
└── README.md       # 本文件
```