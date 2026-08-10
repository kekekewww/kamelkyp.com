# Kamel 音樂委託網站設計規格

- 日期：2026-08-10
- 狀態：各章節已逐項確認，等待文件整體審查
- 網域：kamelkyp.com
- Repository：kekekewww/kamelkyp.com
- 品牌名稱：Kamel
- 本名顯示：楊子賢，只在 Landing Page 出現一次

## 1. 專案目標

建立一個中英文雙語、響應式、高互動性的音樂委託網站，服務對象包括：

- 需要完整歌曲混音或 Vocal 混音的獨立音樂人與歌手。
- 需要歌曲銜接、剪輯或重編的舞蹈團體、活動使用者與一般委託者。
- 想先聆聽作品、閱讀價格與條款，再決定是否送出委託的人。

網站必須同時完成以下工作：

1. 清楚介紹 Kamel 的能力、作品、聯絡方式與社群連結。
2. 讓訪客依服務類別逐步查看內容，避免一次顯示四種服務造成資訊疲勞。
3. 在頁面內預覽 YouTube、雲端檔案、GitHub Raw 音訊、Cloudflare R2 與其他允許的外部媒體。
4. 提供具備草稿、條款確認、完整複核與防機器人驗證的委託表單。
5. 將完整表單同步至 Google Form，並把完整內容寄至管理者 Gmail。
6. 提供只屬於 Kamel 的簡單後台，用來管理公開內容、價格、條款、作品、連結及案件狀態。
7. 讓所有正式專案檔案、程式碼、部署與資料都在雲端處理。

本規格中的「Bootstrap」是可擴充的專案骨架，不代表採用 Bootstrap CSS 框架。

## 2. 不包含的範圍

第一版不包含：

- 客戶帳號系統。
- 客戶端進度查詢入口。
- 網站內付款。
- 客戶或管理員直接上傳檔案。
- 跨裝置表單草稿。
- 訪客分析或行為追蹤。
- 自動翻譯。
- 淺色主題。
- 原始 HTML、Script 或任意 iframe 編輯。
- 媒體下載按鈕。
- 工程檔的永久保存保證。

## 3. 雲端架構

### 3.1 技術選型

- 前端與伺服器框架：React Router 8 Framework Mode、TypeScript、Vite。
- 執行環境：Cloudflare Workers。
- 關聯資料庫：Cloudflare D1。
- 管理後台保護：Cloudflare Access Email OTP。
- 防機器人：Cloudflare Turnstile。
- 表單同步：Google Apps Script Web App 與 Google Forms。
- 管理者通知：Gmail，由 Apps Script MailApp 發送。
- 原始碼與規格：GitHub repository。
- 測試與部署：GitHub Actions 搭配 Wrangler。
- 外部媒體：YouTube、Google Drive、Dropbox、MediaFire、GitHub Raw、Cloudflare R2 及核准的其他來源。
- 匯率來源：Frankfurter API 的每日 TWD/USD 參考匯率。

### 3.2 雲端資料流

    GitHub main
        |
        v
    GitHub Actions -- test/build --> Cloudflare Preview/Production
                                      |
                    +-----------------+-----------------+
                    |                                   |
                    v                                   v
             Cloudflare D1                       Cloudflare Access
          content/prices/terms/                 protects /admin
          deidentified cases
                    |
                    v
             Commission Worker
          validate + Turnstile + price lock
                    |
             signed HMAC request
                    v
             Google Apps Script
               |             |
               v             v
          Google Form      Gmail notice

### 3.3 全雲端工作方式

- GitHub 的 main 分支是程式碼與設計文件的唯一正式來源。
- 後續修改以 GitHub 雲端 commit 或 Pull Request 完成。
- 建置、測試、預覽與正式部署由 GitHub Actions 和 Cloudflare 執行。
- 不以本機 working copy、localhost 或本機資料庫作為正式流程的一部分。
- 唯一本機性質的資料是訪客瀏覽器中的未送出表單草稿；它不會進入 Kamel 的電腦，也不會跨裝置同步。
- Cloudflare、Google 與 GitHub 的密鑰只放在各自的 Secrets 管理介面，不寫入 repository。

## 4. 語言、網址與價格顯示

### 4.1 語言選擇

- 支援繁體中文與英文。
- 根路徑依瀏覽器語言導向 /zh 或 /en。
- 使用者切換語言後，以瀏覽器儲存偏好。
- 每個公開頁面都有獨立且可分享的語言 URL。
- 中文顯示新臺幣；英文顯示美元。
- 內容由 Kamel 分別輸入中文與英文，不做自動翻譯。
- 缺少某語言內容時，不自動把另一語言內容發布到該語言網址。

### 4.2 美元匯率

- 每日從 Frankfurter 取得 TWD/USD 參考匯率並保存 D1 快照。
- 英文價格依該日匯率換算，顯示到小數點後兩位，不使用心理價位式取整。
- 送出表單時鎖定匯率、匯率日期、來源、TWD 原價與 USD 金額。
- 匯率快照超過三個工作日仍無法更新時，英文表單停止送出並保留瀏覽器草稿，避免使用不可靠價格。
- 中文價格不受匯率服務故障影響。

## 5. 公開資訊架構

### 5.1 頁面

- /：語言判斷與轉址。
- /:lang：Landing Page。
- /:lang/mixing：只顯示完整歌曲混音與 Vocal 混音。
- /:lang/mixing/full：完整歌曲混音詳情。
- /:lang/mixing/vocal：Vocal 混音詳情。
- /:lang/song-transition：只顯示單純歌曲銜接與編輯／剪輯銜接。
- /:lang/song-transition/simple：單純歌曲銜接詳情。
- /:lang/song-transition/edit：編輯／剪輯銜接詳情。
- /:lang/commission：只顯示「混音」與「歌曲銜接」兩個大類。
- /:lang/commission/:category：只顯示該大類的兩個服務。
- /:lang/commission/:service：服務說明與委託流程入口。
- /:lang/works：作品列表。
- /:lang/works/:slug：作品詳情。
- /:lang/other：其他內容／Blog 列表。
- /:lang/other/:slug：內部文章詳情；外部項目可直接開啟核准連結。
- /:lang/terms：現行服務條款。
- /:lang/privacy：隱私說明。
- /admin：管理後台。

### 5.2 導覽行為

桌面版：

- 滑鼠移到 Mixing 或 Song Transition，或以鍵盤聚焦時，顯示該類別的兩個子服務。
- 點擊主選單文字本身，進入該類別總覽。
- 子選單不混入另一類別的服務。
- 子選單支援 Escape 關閉、方向鍵與 Tab 操作。

手機版：

- 以選單按鈕開啟導覽。
- Mixing 與 Song Transition 使用可展開的兩層 Accordion。
- 點擊類別名稱可進入總覽；點擊展開按鈕顯示兩個子服務。
- 觸控目標至少 44 × 44 CSS pixels。

### 5.3 Landing Page

Landing Page 由以下區塊構成：

1. 品牌與自我介紹。
2. 名稱「Kamel」，以及只出現一次的「楊子賢」。
3. 擅長項目、服務對象與簡短定位。
4. 主要 Showreel，可在頁面內播放。
5. Mixing 與 Song Transition 兩個服務入口。
6. 精選作品。
7. 精選其他內容或公告。
8. 完整 Footer。

社群、作品平台、聯絡方式與其他網站不塞進自我介紹欄，而集中在 Footer 的可擴充連結群組。

## 6. 視覺與互動設計

### 6.1 視覺方向

採用「安靜的數位錄音工作台」風格：

- 深礦物藍背景：#071724。
- 工作台藍：#0B2030。
- 粉筆白：#F3F1EA。
- 冷灰：#A9B3BC。
- 珊瑚紅重點色：#FF5C4D。
- 英文展示字：Barlow Condensed。
- 中文與一般內文：Noto Sans TC。
- 價格、時間與案件編號：IBM Plex Mono。
- 字型採自託管，避免第三方字型連線造成額外隱私請求。

### 6.2 版面

桌面：

- Landing Page 約 30% 自我介紹欄、70% Showreel 與內容欄。
- 自我介紹欄比最初 mockup 更寬，確保多行中文與英文都有足夠閱讀空間。
- 主要內容使用清楚的水平分區與細線，不以大量卡片堆疊。
- Footer 使用多欄排列。

手機：

- 單欄閱讀順序：品牌／介紹、Showreel、服務、精選內容、Footer。
- 不強迫保留桌面的左側欄。
- 波形播放器改成較短的可拖曳時間軸。
- Footer 群組改成 Accordion。

### 6.3 Micro-interactions

允許但保持克制：

- 一般 hover、focus 與展開收合為 140–220ms。
- 面板或頁面階段切換最長 320ms。
- 導覽與面板使用滑入／滑出、淡入／淡出。
- Accordion 使用開啟／關閉滑動。
- 行動版 Bottom Sheet 可有輕微拉起／推回感。
- 按鈕 hover 放大約 1–2%，按下縮放至約 0.98。
- 表單步驟切換使用方向一致的推入／推出。
- 波形只移動播放頭與必要狀態，不做裝飾性持續動畫。
- 優先使用 transform 與 opacity，避免大範圍 layout animation。
- prefers-reduced-motion 開啟時移除空間位移、縮放及非必要動畫。

### 6.4 無障礙

- 目標為 WCAG 2.2 AA。
- 所有操作可用鍵盤完成。
- 清楚顯示 focus 樣式。
- 文字與控制項符合對比要求。
- 表單錯誤同時用文字、圖示與 aria 關聯表示，不只依靠顏色。
- 媒體不自動播放。
- 音訊與影片控制提供可理解的 accessible name。
- 觸控目標至少 44 × 44 CSS pixels。
- 標題層級、Landmark 與語言屬性正確。

## 7. Footer

Footer 可由後台新增、排序、停用與編輯連結。預設可用群組：

- Navigate。
- Services。
- Find Me／社群。
- Work & Resources／作品存放與其他網站。
- Contact。
- Legal、語言、版權與網站資訊。

規則：

- 群組與連結數量不固定。
- 沒有內容的群組不顯示。
- 外部連結標示會離開本站，並採安全的 rel 屬性。
- 桌面為多欄，手機為 Accordion。
- Footer 可以日後加入其他相關內容，不需要修改版面結構。

## 8. 服務選擇與委託流程

### 8.1 避免資訊疲勞

任何單一頁面都不會同時把四種服務展開顯示：

1. 委託入口先選 Mixing 或 Song Transition。
2. 選 Mixing 後，只出現完整歌曲混音與 Vocal 混音。
3. 選 Song Transition 後，只出現單純歌曲銜接與編輯／剪輯銜接。
4. 選定服務後才顯示價格、工作內容、交付項目、時間與表單入口。

從主導覽直接點擊 Mixing 或 Song Transition 時，也遵循相同類別限定。

### 8.2 表單階段

1. 服務內容與價格。
2. 委託資料。
3. 服務條款與隱私說明。
4. 完整複核。
5. Turnstile 驗證與送出。
6. 成功畫面。

行為：

- 可從複核頁返回任一區段編輯。
- 價格在伺服器重新計算，不能信任前端傳入的總額。
- 未送出內容只存在該瀏覽器草稿。
- 草稿不跨裝置，不建立客戶帳號。
- 送出成功後清除草稿。
- 不寄客戶確認信。
- 成功畫面顯示案件編號、日期、服務類型與提醒使用者截圖或自行保存。
- 成功畫面不顯示完整表單內容。

## 9. 通用表單欄位

必填：

- 希望被稱呼的名稱，可使用本名、藝名或其他名稱。
- 電子郵件，接受任何有效網域。
- 常用聯絡平台及帳號；至少提供一種有效聯絡方式。
- 工程／素材連結。
- 使用目的。
- 是否已成年。
- 未成年者勾選「監護人已授權」。
- Credit 同意：正式發布時標示 Kamel，並從指定的社群帳號中任選至少一個。
- 作品集公開選擇：是或否。
- 統一同意現行服務條款與隱私說明。

選填：

- 希望完成或使用日期。
- 其他補充聯絡方式。
- 其他專案說明。
- 學生證明連結。

學生證明規則：

- 不直接上傳。
- 提供可檢視的雲端連結。
- 可遮蔽不必要的敏感資料，但必須保留可確認學生身份與有效狀態的資訊。
- Kamel 手動確認。
- 如無法驗證，透過 Email 告知並恢復一般價格。

檔案連結規則：

- 可使用 Google Drive、Dropbox、MediaFire 或其他可下載／檢視連結。
- 網站只驗證 URL 格式與允許的協定，不承諾能自動判定分享權限。
- 送出前提示委託者確認連結權限。
- 網站不接受任何直接檔案上傳。

## 10. 價格與服務內容

### 10.1 完整歌曲混音

- 基本價格：NT$8,000。
- 軌道數量：不限。
- 包含：完整歌曲混音與母帶、Vocal 完整處理、編輯、修音及相關處理。
- 交付：
  - Final Master。
  - Vocal Stem。
  - Instrumental Mix Stem。
  - 全部為 24-bit / 48 kHz WAV。
- 標準時間：7–14 個工作日。
- 實際完工時間於確認委託時依情況調整。
- 表單詢問：曲風、參考歌曲連結、BPM、Key、期望方向。
- BPM 與 Key 可填「不確定／希望協助判定」。

### 10.2 Vocal 混音

- 基本價格：NT$4,000。
- Vocal 與和音軌道數量：不限。
- 包含：和音編輯、修音、對拍、效果設計、與既有伴奏融合、混音與母帶。
- 交付：
  - Final Master。
  - Vocal Stem。
  - Instrumental Mix Stem。
  - 全部為 24-bit / 48 kHz WAV。
- 標準時間：5–7 個工作日。
- 實際完工時間於確認委託時依情況調整。
- 表單詢問：曲風、參考歌曲連結、BPM、Key、期望方向。
- BPM 與 Key 可填「不確定／希望協助判定」。

### 10.3 完整混音與 Vocal 混音的素材要求

- 提供乾聲／原始未處理檔案。
- 盡可能提供 24-bit / 48 kHz WAV。
- 所有分軌使用相同起始點。
- 正確命名每個檔案，確保工作流程順利。
- 若來源不是建議格式或原始音質不足，Kamel 不負責由來源造成的音質降低。
- 不符合整理規則時，可退回請委託者修正；若雙方同意由 Kamel 整理，追加服務基價的 5%，並重新確認時程。

### 10.4 單純歌曲銜接

- 1–5 首：NT$1,000。
- 第 6 首起：每首加 NT$200。
- 公式：NT$1,000 + max(歌曲數 - 5, 0) × NT$200。
- 不包含額外歌曲編輯。
- 可使用銜接音效或效果確保順暢。
- 委託者必須提供歌曲順序與銜接時間點。
- 若需要 Kamel 協助討論與規劃順序或時間點，諮詢費為服務基價的 50%，先告知並取得同意。
- 標準時間：3–5 個工作日。
- 素材盡可能提供高音質版本。
- 交付：24-bit / 48 kHz WAV、MP3、AAC。
- 必填：歌曲連結、順序、銜接時間點、目標總長度、是否需要無縫播放、希望的銜接風格。

### 10.5 編輯／剪輯歌曲銜接

- 1–5 首：NT$4,000。
- 第 6 首起：每首追加基本價格的 20%，即 NT$800。
- 公式：NT$4,000 + max(歌曲數 - 5, 0) × NT$800。
- 包含：刪減段落、重排歌曲結構、調整速度／音高、加入音效、延長開場或結尾、混音與平衡、重新母帶。
- 標準時間：7–14 個工作日。
- 素材盡可能提供高音質版本；Kamel 不負責由來源品質造成的音質損失。
- 交付：24-bit / 48 kHz WAV、MP3、AAC。
- 必填：各段時長、銜接點、目標總長度、風格、歌曲連結與順序。
- 選填：刪減、重排、速度、音高、開場、結尾、音效與其他細節。
- 參考連結欄位為選填。

### 10.6 急件

- 四種服務都可提出急件需求。
- 急件費為服務基價的 50%。
- 是否接收由 Kamel 依排程手動確認。
- 網站不保證急件一定可接受。

### 10.7 學生優惠

- 所有服務與送出前已知加購項目統一折扣 30%。
- 計算順序：
  1. 計算服務基價。
  2. 加入送出前已選定的急件、諮詢或整理費。
  3. 合計乘以 70%。
- 學生報價在證明通過前標示為「待確認」。
- 系統同時保存一般價格與學生預估價格。
- 證明未通過時，Kamel 以 Email 通知並恢復一般價格。
- 通過後的折扣價格成為鎖定初始報價。

### 10.8 價格基準

「服務基價」是依服務類型與歌曲數量計算的原始價格。急件 50%、諮詢 50% 與素材整理 5% 都以服務基價分別計算；三者不互相複利。服務基價加上送出前已知附加費後，再套用學生 30% 折扣，結果成為「鎖定初始報價」。

送出後下列費用以鎖定初始報價計算，不因前一次追加而提高基準：

- 第 6 次起的小範圍修改：每次 10%。
- 第 2 次起的重大修改：每次 50%。
- 事後索取工程檔：50%。

若學生證明尚未確認，網站同時展示一般基準與折扣後的暫定基準，最終由 Kamel 確認。

## 11. 付款、修改與取消條款

### 11.1 付款

- 支援銀行匯款與 PayPal。
- Kamel 確認接收委託後，委託者支付 50% 訂金。
- 收到訂金才開始工作。
- 委託者確認預覽後，支付剩餘 50%。
- 收到尾款後正式交付成品。
- 網站不處理線上付款或保存付款工具資料。

### 11.2 小範圍修改

- 前 5 次免費。
- 第 6 次起，每次追加鎖定初始報價的 10%。
- 小範圍修改指不改變整體方向的局部音量、單一段落、局部銜接、局部效果或相近調整。

### 11.3 重大修改

- 第 1 次免費。
- 第 2 次起，每次追加鎖定初始報價的 50%。
- 重大修改包括：
  - 歌曲銜接時改變整體架構。
  - 混音時調整整體處理方向。
  - 更換大量主要素材或已確認版本。
- 進行前必須先告知費用與時程並取得同意。

### 11.4 取消、延遲與無法完成

- 委託者中途取消：訂金不退還。
- 因 Kamel 自身原因造成延遲但仍完成：總價調整為原應付總額的 60%。
- 因 Kamel 自身原因確定無法完成：退還訂金。
- 委託者連續 7 天未回覆、未提供素材或未付款：案件暫停。
- 暫停後重新開始需要重新排隊。

## 12. 時程、交付與工程檔

- 所有標準工作日僅為預估。
- Kamel 在確認接案時依排程、素材狀態與專案複雜度重新確認。
- 委託者可隨時透過已提供的任何聯絡方式詢問進度。
- 網站不提供客戶進度 Portal。
- 正式成品交付後至少保存 7 天，委託者應在期間內下載。
- Kamel 不保證永久保存成品或工程檔。
- 工程檔不屬於一般交付內容。
- 正式交付後，若工程檔仍存在且可提供，費用為鎖定初始報價的 50%。
- 即使交付工程檔，也不移轉 Kamel 的通用模板、技術、工作流程與其他專案資產。

## 13. 所有權、授權與保密

### 13.1 委託者素材

- 委託者提供的人聲、原創歌曲、伴奏與分軌，權利仍屬委託者或原權利人。
- 委託者保證對提供的素材具備進行委託所需的權利與授權。
- 網站條款不能替委託者轉移其本來不擁有的第三方歌曲、Cover、伴奏或其他素材權利。

### 13.2 完成品

- 全額付款後，Kamel 對該次服務所製作的最終交付成果權利依約移轉給委託者，但不包含第三方原有權利。
- 工程檔、通用模板、處理技術與工作流程權利屬 Kamel。

### 13.3 Credit 與作品集

- 公開使用時必須提供 Kamel 的 Credit。
- 委託者從 Kamel 指定的社群帳號中任選至少一個標示。
- 是否允許 Kamel 將成果放入作品集，為獨立的是／否選項，不預先勾選。
- 已同意公開後若要下架，可再協議。

### 13.4 保密

- 在委託者正式發布作品前，或委託者明確同意公開前，Kamel 保密專案內容。
- Kamel 不使用分包商或未告知的協作者。
- Kamel 可拒絕侵權、違法、仇恨或其他不適合承接的內容。
- 在訂金支付前，Kamel 沒有必須承接的義務。

網站正式上線前，服務條款、隱私說明與權利移轉文字必須由熟悉適用法域的法律專業人士審閱。

## 14. 條款版本

- 條款分為通用服務條款、服務特定條款與隱私說明。
- 委託者以一個統一必填勾選表示已閱讀並同意當次顯示的全部文件。
- 勾選處提供每份完整文件的連結。
- 系統記錄當次條款版本與同意時間。
- 已發布條款版本不可直接覆寫。
- 編輯條款會建立新草稿版本。
- 發布新版本只影響之後的新委託。
- 舊委託仍對應送出當時版本。
- 依保存政策完成清理後，條款同意技術資料不永久保留；永久案件紀錄只保留核准的去識別欄位。

## 15. 表單同步與錯誤處理

### 15.1 正常流程

1. 瀏覽器提交完整表單及 Turnstile Token。
2. Worker 驗證欄位、連結、條款版本、Turnstile 與伺服器價格。
3. Worker 產生案件編號並建立不含個資的暫時提交狀態。
4. Worker 以 HMAC、時間戳與案件編號簽署完整 payload。
5. Apps Script 驗證簽章與時間差。
6. Apps Script 以案件編號檢查是否重複。
7. Apps Script 建立 Google Form Response。
8. Apps Script 寄送完整 Gmail 通知。
9. 成功後 Worker 建立去識別案件紀錄並回傳成功資料。
10. 瀏覽器顯示成功畫面並清除草稿。

### 15.2 重試與冪等

- 案件編號是跨 Worker、Apps Script、Google Form 與 Gmail 的冪等鍵。
- Apps Script 已建立 Form Response 但 Gmail 暫時失敗時，重試不得重複建立回覆，只重試未完成的通知。
- 完整資料未同步成功前，瀏覽器保留草稿。
- Worker 與 D1 不保存完整表單供稍後重送。
- Apps Script 回傳可辨識但不洩漏內部資訊的狀態。
- 成功回應只在 Google Form 與 Gmail 工作均完成後送出。
- 重複點擊提交按鈕不產生重複案件。

### 15.3 使用者錯誤

- 欄位錯誤回到相對應區段並保留輸入。
- 分享連結權限問題以提醒說明，不假裝已驗證權限。
- 匯率過期時阻止英文送出，顯示稍後再試並保留草稿。
- Turnstile 失敗可重新驗證，不清除草稿。
- Google 暫時故障時顯示送出未完成，不顯示成功案件。

## 16. 資料保存與隱私

### 16.1 D1 永久紀錄

永久保存的去識別案件資料只包含：

- 案件編號。
- 服務類型。
- 鎖定價格。
- 日期。
- 狀態。

不永久保存姓名、Email、聯絡帳號、素材連結、學生證明或表單內容。

### 16.2 完整資料

- 完整表單只進入 Google Form／相關 Google Sheet 與管理者 Gmail。
- D1 不保存完整 payload。
- 管理後台不顯示完整表單。
- Kamel 透過 Google Form、Sheet 或 Gmail 查看完整內容。

### 16.3 清理

- 案件標記為交付、取消或暫停後 7 天，後台產生清理提醒。
- Kamel 手動刪除 Google Form／Sheet 回覆、Gmail 通知及其他含可識別資料的紀錄。
- 姓名、Email、聯絡方式、素材連結、學生證明與專案細節全部刪除。
- 清理完成後在後台確認。
- D1 移除暫時同步狀態、條款版本、同意時間、payload hash 與清理提醒，只保留五個永久欄位。
- 不使用訪客分析、廣告追蹤或跨站追蹤。

## 17. 管理後台

### 17.1 登入

- 路徑為 /admin。
- Cloudflare Access Email OTP 保護 /admin、/admin/* 與管理 API。
- 只允許設定的管理者 Email。
- Session 最長 8 小時。
- Worker 額外驗證 Access JWT、Audience 與允許的管理者 Email，不能只依賴前端頁面隱藏。

### 17.2 功能

後台保持簡單，包含：

- Landing Page 自我介紹。
- 服務說明與價格版本。
- 條款與隱私版本。
- 作品。
- Footer 與社群連結。
- 其他內容／Blog／個人公告。
- SEO 標題、描述與社群預覽圖片連結。
- 案件去識別狀態。
- 資料清理提醒。

不包含：

- 完整表單查看。
- 客戶帳號管理。
- 檔案上傳。
- 付款管理。
- 複雜儀表板。
- 獨立稽核紀錄頁。

### 17.3 內容工作流

所有公開內容使用：

草稿 → 預覽 → 發布 → 編輯／下架

規則：

- 已發布內容的編輯會產生新草稿。
- 舊版本在新草稿發布前維持上線。
- 發布時建立不可變版本。
- 中文與英文分開編輯與發布。
- 預覽 URL 只允許已登入管理者存取。
- 下架不刪除歷史版本。
- 條款版本另遵循不可覆寫規則。

### 17.4 Blog 編輯器

採用安全的 Block JSON，不接受任意 HTML。允許的 Block：

- 標題。
- 段落。
- 清單。
- 引言。
- 外部圖片。
- 核准來源的外部音訊或影片。
- 外部連結。
- 分隔線。

所有 URL、文字與 Embed 都經過驗證與清理。

## 18. 作品與多媒體

### 18.1 作品欄位

全部可選填；沒有媒體也可發布文字作品：

- 標題。
- 日期。
- 服務類型。
- 說明。
- Credit。
- 封面連結。
- Tags。
- 是否精選。
- 一個或多個媒體項目。
- SEO 欄位。

### 18.2 媒體來源

- YouTube。
- Google Drive 或核准的雲端預覽。
- GitHub Raw 音訊。
- Cloudflare R2。
- 其他允許的外部連結。

管理員只輸入外部 URL，不上傳媒體。

### 18.3 播放規則

- 不自動播放。
- 點擊後才載入 YouTube、Drive 等第三方播放器，並先顯示會連線至第三方的提示。
- 開始播放新的媒體時，暫停上一個。
- 離開頁面時停止播放。
- R2 正式環境使用自訂網域與正確 CORS；r2.dev 只用於開發驗證。
- Direct Audio 在 CORS 允許時顯示波形；否則使用簡化播放器或外部連結。
- YouTube 與可控制的直接音訊支援由 Kamel 指定預覽開始與結束時間。
- 一般 iframe 來源只提供 best-effort 預覽，不宣稱可以精確限制段落。
- 網站不顯示下載按鈕，但明確理解串流內容無法保證完全不能被擷取。
- Embed 使用 Allowlist，不接受管理員貼入原始 iframe HTML。

## 19. 資料模型

D1 採版本化與分離公開內容的模型，核心實體包括：

- content_entries：內容身份、類型、slug、狀態。
- content_versions：中英文內容、Block JSON、SEO 與發布時間。
- service_definitions：四種服務的穩定識別碼與表單規則。
- price_versions：TWD 基價、計價公式、折扣與生效時間。
- term_documents：條款文件身份。
- term_versions：不可變條款內容與生效時間。
- works：作品身份、排序與精選狀態。
- work_versions：中英文作品內容。
- media_items：來源類型、URL、預覽段落與排序。
- link_groups：Footer 群組。
- links：社群、作品平台、聯絡與其他連結。
- fx_rates：匯率、來源、日期與取得時間。
- cases：案件編號、服務、價格、日期、狀態，以及清理前的有限技術欄位。
- submission_attempts：不含完整表單的冪等與同步狀態。

重要限制：

- D1 Schema 不設計可長期保存完整委託表單的欄位。
- 所有價目、條款與公開內容使用版本 ID 連結，避免歷史案件被新內容覆蓋。
- 發布版本不可原地修改。
- URL 欄位保存正規化版本，並附媒體來源類型。
- 刪除公開內容採下架或軟刪除；個資清理則依保存政策確實刪除。

## 20. 安全性

- Turnstile 必須由 Worker 伺服器端驗證。
- 對提交 API 施加短期 Rate Limit。
- 所有 D1 Query 使用參數化語句。
- 管理 mutation 驗證 Origin、CSRF Token 與 Access JWT。
- Block JSON、文字、連結與 Embed 做 Allowlist 驗證與輸出轉義。
- 設定嚴格 Content Security Policy。
- Apps Script 請求使用 HMAC、時間戳與案件編號，拒絕過期或重播請求。
- 管理與整合 Secrets 不寫入 GitHub。
- Log 不記錄完整 payload、Email、聯絡帳號、素材連結或學生證明。
- 錯誤訊息不洩漏 Stack Trace、Secret、資料庫結構或 Google 端資訊。
- 價格、折扣、匯率與條款版本在 Worker 重新驗證。
- 外部 URL 只允許 https，並拒絕 javascript、data 與其他危險協定。
- Cloudflare Access 保護頁面之外，管理 API 仍做防禦性 JWT 驗證。

## 21. 測試策略

### 21.1 單元測試

- 四種服務的所有價格邊界。
- 第 5／6 首歌曲的價格。
- 學生 30% 折扣順序。
- 急件、諮詢、整理費。
- 小修改、重大修改與工程檔固定基準。
- TWD/USD 匯率與小數顯示。
- 版本選擇與生效日期。
- URL、表單與 Block JSON 驗證。

### 21.2 整合測試

- D1 Migration。
- 內容草稿、預覽、發布、編輯與下架。
- 條款與價格版本不可變。
- Turnstile 成功、失敗與逾時。
- Access JWT 與管理者 Email。
- Apps Script HMAC、時間戳、重播拒絕與案件冪等。
- Google Form 已寫入、Gmail 失敗後的安全重試。
- 匯率更新與過期阻擋。

### 21.3 瀏覽器測試

- 中文與英文自動選擇、切換與 URL。
- 桌面 hover／focus 導覽。
- 手機 Accordion 導覽。
- 四種委託流程。
- 瀏覽器草稿、返回編輯、完整複核。
- 條款勾選、Turnstile、送出、失敗重試與成功清除。
- YouTube、Direct Audio、R2、Drive 與無法預覽的 fallback。
- 新播放項目暫停上一個。
- 預覽段落。
- 鍵盤、Focus、Reduced Motion、對比與觸控尺寸。

### 21.4 視覺尺寸

至少驗證：

- 390 px。
- 768 px。
- 1024 px。
- 1440 px。

### 21.5 安全測試

- XSS。
- SQL Injection。
- CSRF。
- 管理路徑未授權。
- 價格篡改。
- 條款版本篡改。
- 重複提交。
- 惡意 URL。
- Apps Script 重播請求。

## 22. GitHub 與 Cloudflare 發布流程

### 22.1 Pull Request

每個變更由 GitHub 雲端 Branch／Pull Request 完成。PR 檢查：

- 格式與 Lint。
- TypeScript Type Check。
- 單元測試。
- 整合測試。
- 瀏覽器測試。
- Production Build。
- Migration 檢查。
- 無障礙與安全檢查。

### 22.2 預覽

- PR 通過後部署 Cloudflare Preview。
- 測試用獨立 D1、Turnstile 與 Google Form。
- Preview 不使用正式 Gmail 收件與正式資料。
- 管理預覽仍由 Access 保護。
- 使用者可在雲端 Preview URL 審查，不需要 localhost。

### 22.3 正式部署

- 合併 main 後由 GitHub Actions 使用官方 Wrangler Action 部署。
- Production 使用獨立 D1、Turnstile、Access、Apps Script 與 Google Form。
- 部署前建立 D1 Bookmark。
- Migration 保持向前相容。
- Worker 問題使用 Versions and Deployments Rollback。
- D1 問題使用 Time Travel，保留期依 Cloudflare 方案為準。
- kamelkyp.com 綁定正式 Worker。
- 發布服務條款前需完成法律專業審閱。

### 22.4 雲端設定值

部署時由 Cloudflare／GitHub Secrets 提供：

- D1 Binding。
- Turnstile Site Key 與 Secret。
- Cloudflare Access Audience。
- 允許的管理者 Email。
- Apps Script Web App URL。
- Apps Script HMAC Secret。
- 匯率來源設定。
- Production Domain。
- Google Form 對應設定。

這些值不在 repository 中保存真實 Secret。

## 23. 驗收條件

網站骨架與第一版必須同時符合：

1. 四種服務價格、公式、折扣、修改與追加費用正確。
2. 不在同一選擇畫面展開四種服務。
3. Mixing 只顯示兩種混音；Song Transition 只顯示兩種銜接。
4. 中文與英文使用獨立 URL 與獨立內容。
5. 中文 TWD、英文 USD，送出時鎖定匯率。
6. 表單可保存瀏覽器草稿、返回編輯、完整複核、驗證並重試。
7. 不接受任何檔案上傳。
8. 完整表單只進入 Google Form／Sheet 與 Gmail，不進 D1。
9. D1 永久案件紀錄只含案件編號、服務、價格、日期與狀態。
10. /admin 必須通過 Cloudflare Access Email OTP。
11. 管理後台可完成草稿、預覽、發布、編輯與下架。
12. 媒體不自動播放，支援核准來源與安全 fallback。
13. 桌面與手機版均符合指定版面及克制的 micro-interactions。
14. 鍵盤操作、Focus、Reduced Motion、對比與觸控尺寸達成目標。
15. CI 的 Type Check、測試、Build 與必要安全檢查通過。
16. 正式上線前完成條款與隱私文字的法律專業審閱。
17. 原始碼、測試、Preview、Production 與正式資料皆在雲端處理。
18. 未送出表單草稿是唯一瀏覽器端例外，且送出成功後清除。

## 24. 實作前置順序

在本設計文件獲整體核准後，再建立獨立實作計畫。實作計畫應依下列邊界拆解，但不得在設計審查前開始建置：

1. 雲端 repository 與 CI 骨架。
2. React Router／Workers 基礎架構。
3. D1 Schema、Migration 與版本化內容。
4. 公開頁面、語言與視覺系統。
5. 媒體 Adapter 與播放器。
6. 價格引擎與四種委託流程。
7. Turnstile、Apps Script、Google Form 與 Gmail。
8. Cloudflare Access 與管理後台。
9. 資料清理流程。
10. 全套測試、Preview、法律內容確認與正式部署。

## 25. 參考文件

- Cloudflare Workers Web Frameworks：https://developers.cloudflare.com/workers/framework-guides/web-apps/
- Cloudflare D1：https://developers.cloudflare.com/d1/
- Cloudflare Access Application Paths：https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/
- Cloudflare Access One-time PIN：https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- Cloudflare Turnstile Server-side Validation：https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Cloudflare R2 Public Buckets：https://developers.cloudflare.com/r2/buckets/public-buckets/
- Cloudflare R2 CORS：https://developers.cloudflare.com/r2/buckets/cors/
- Cloudflare Workers Testing：https://developers.cloudflare.com/workers/testing/
- Cloudflare GitHub Actions：https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- Cloudflare Workers Rollbacks：https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
- Cloudflare D1 Time Travel：https://developers.cloudflare.com/d1/reference/time-travel/
- Google Apps Script Web Apps：https://developers.google.com/apps-script/guides/web
- Google Forms FormResponse：https://developers.google.com/apps-script/reference/forms/form-response
- Google Apps Script MailApp：https://developers.google.com/apps-script/reference/mail/mail-app
- Google Apps Script Quotas：https://developers.google.com/apps-script/guides/services/quotas
- Frankfurter API：https://frankfurter.dev/
- YouTube Embedded Player Parameters：https://developers.google.com/youtube/player_parameters
- 臺灣個人資料保護法相關官方資訊：https://www.pdpc.gov.tw/News_Content/100/298/
