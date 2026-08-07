# PlanDone — Life in Weeks 人生週曆 設計 Spec

> 2026-08-07 定案。獨立頁 `#/weeks`:把 Jeff 的人生(1999-01-18 起算 90 年)畫成一格一週的網格。

## 定位

純人生網格(不與日記資料聯動、不標計畫年)。給規劃本一個 memento mori 錨點。

## 隱私

- 生日**不進前端碼、不進 public repo**:存 env `PLANDONE_BIRTHDAY=1999-01-18`(與 `PLANDONE_CODE` 同路,走 cloudpipe env API 設定)。
- `GET /api/all` 回應多帶頂層欄位 `birthday`(此 API 本來就要通行碼)。
- env 缺少時**不擋啟動**(與 PLANDONE_CODE 不同):頁面顯示「未設定生日」,其餘功能不受影響。

## 版面(`renderWeeksPage`)

- 90 列 × 52 欄,一列 ≈ 一年、一格 = 一週(週 i 涵蓋 `birth + i*7 天` 起 7 天;52 週/年的近似與 Wait But Why / Bryan Braun 相同)。
- 每 10 列(每 10 年)列首顯示年齡刻度(0/10/…/80),列間加一點間距做十年分組。
- 格子狀態:已過 = 墨色填滿(`--ink`);當前週 = 朱色(`--accent`)+ 輕微 pulse;未來 = 細框空格。
- 頂部一行摘要:`27 歲 · 第 1,412 週 / 4,680 週 · 已走 30.2%`。
- hover(桌機):event delegation 惰性設 `title` = 該週日期範圍 + 當時年齡。手機無互動。
- 手機:格子縮到很小但仍完整呈現(密度優先),不做橫向捲動。

## 入口

- 頂欄新增 chip(`index.html` 加 `<a id="weeksChip" class="chip chip-link" href="#/weeks" hidden>`),資料載入後顯示為 `⌛ 30.2%`(birthday 缺失時保持隱藏)。

## 路由

- `parseRoute` 加 `hash === 'weeks'` → `{ type: 'weeks' }`(在既有 `week` 判斷之前);crumbs 顯示「人生週曆」。

## 技術

- 純 DOM(90 個 row div,每個 52 個 cell),零依賴,沿用 app.js vanilla 風格。
- 改動檔:`server.js`(+3 行)、`public/app.js`(+~80 行)、`public/style.css`(+~50 行)、`public/index.html`(chip + 版號 bump)。不動資料模型。

## 驗收

- 線上 `#/weeks`:網格正確(當前週位置與摘要數字互相吻合)、hover 顯示日期、chip 百分比正確。
- repo 內 grep 不到 `1999`(生日不落码)。
- 未設 env 的環境:頁面顯示「未設定生日」而非壞掉。
