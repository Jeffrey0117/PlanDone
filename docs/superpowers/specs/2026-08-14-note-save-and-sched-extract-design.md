# PlanDone — 日記儲存鈕 + 日記→行程單向帶入 設計 Spec

> 2026-08-14 定案。兩件事:日記框的儲存踏實感、日記帶時間的行自動帶進行程。

## 1. 日記儲存鈕(renderNoteTab)

- textarea 下方加 footer:右側一顆「儲存」鈕。
- 狀態:有未存改動 → 亮起「儲存」(可點);已存 → 灰掉「已儲存 ✓」(disabled)。
- 自動存(1.5s debounce + blur)照舊;按鈕是即時狀態指示 + 手動觸發。
- 日記的兩個入口(日頁、日彈窗)共用 renderNoteTab,一處改兩處生效。

## 2. 日記 → 行程 帶入(單向)

- 時機:日記 commit(自動存或按鈕)時。
- 規則:掃描日記每行,行首符合 `HH:MM` 或 `HH:MM-HH:MM`(沿用 parseSched 的正則)→ 視為候選行程。
- **去重:同一天行程已有相同「開始時間」的項目 → 跳過**(行程那邊改過文字/結束時間都不會被重加或蓋掉)。
- 帶入的行與 note 同一個 PUT /api/day 一起送(dayBodySchema 本來就允許 note+sched 同時)。
- 有帶入時 flashSaved「已帶 N 筆進行程 📅」。
- 單向:行程改動不回寫日記。已知邊界:行程刪掉某筆後再改同天日記會被重新帶入(已與使用者確認可接受)。

## 改動範圍

- `public/app.js`:renderNoteTab 加 footer/按鈕;新 helper `extractSchedFromNote(date, noteText)`;commit 合併 patch。
- `public/style.css`:.note-foot / .note-save 樣式。
- `public/index.html`:版號 bump(app v=33 / css v=42)。
- 後端不動。

## 驗收

- 日記打字 → 按鈕亮「儲存」;1.5s 後或點按鈕 → 變「已儲存 ✓」。
- 日記打 `14:00 xxx` 存檔 → 同天行程出現 `14:00 xxx`;行程改成 `14:00 yyy` 後再改日記重存 → 行程仍是 yyy、不重複。
- 無時間行不帶入;`25:00`/`9:99` 不合法時間不帶入。
