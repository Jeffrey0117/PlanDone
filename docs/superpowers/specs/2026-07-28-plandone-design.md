# PlanDone — 一年計畫日記 設計 Spec

> 2026-07-28 定案。個人年度規劃本:年視圖 → 點月份 → 編輯月計畫與每日短記。

## 目標

- 涵蓋 **2026-07 ~ 2027-06** 共 12 個月,從當月(2026-07)開始用。
- 跨裝置同一份資料(雲端後端),個人使用,通行碼簡易鎖。
- 部署 cloudpipe 動態專案 `plandone.isnowfriend.com`,GitHub repo `PlanDone`(push 自動部署)。

## 架構

- 單一 Node/Express 服務:靜態前端(`public/`)+ JSON API + flat-file 儲存。
- **儲存**:`data/plandone.json`(gitignore,部署不清除),原子寫入(tmp + rename)。
  - 原規劃 SQLite,因 Node 22 的 `node:sqlite` 仍需實驗 flag、better-sqlite3 有 native 部署地雷,改 flat JSON;儲存層抽在 `src/store.js`,之後要換 SQLite 只動這一檔。
- 依賴僅 `express` + `zod`。

## 資料模型(plandone.json)

```json
{
  "months": { "2026-07": { "plan": "本月計畫文字…" } },
  "days":   { "2026-07-28": { "note": "當日短記…" } }
}
```

## API(皆需 header `X-Plan-Code` = env `PLANDONE_CODE`;缺 env 直接啟動失敗)

- `GET  /api/all` — 回全部資料(年視圖預覽 + 月頁一次拿齊)。
- `PUT  /api/month/:ym` — body `{plan: string ≤20000}`;ym 限 2026-07~2027-06。
- `PUT  /api/day/:date` — body `{note: string ≤2000}`;date 需為範圍內合法日期。
- 驗證用 zod,錯誤回 400;通行碼錯回 401。

## 前端(單頁,hash 路由)

- `#/` **年視圖**:12 張月卡(2026-07~2027-06),當月高亮;卡上預覽月計畫前幾行 + 該月已寫日記天數。
- `#/2026-07` **月頁**:「本月計畫」textarea(離開焦點 / 停止輸入 1.5s 自動存);下方週一開頭日曆格,今天標記,寫過的日子有綠點;點日子展開輸入框寫短記(同樣自動存)。上/下月切換,超出範圍隱藏。
- 首次進站(或 401)跳通行碼輸入層,通過後存 localStorage,之後 API 全帶 header。
- 風格:米白紙感、細格線、密度優先一屏看完(Jeff 排版偏好)。

## 部署

- cloudpipe 註冊專案 `plandone`(runner: node,`node server.js`),env 設 `PLANDONE_CODE`。
- GitHub repo `Jeffrey0117/PlanDone`(public),webhook push 自動部署。

## 驗收

- 線上輸碼後:年視圖載入、月計畫可寫可自動存、日記可寫、重整資料仍在。
- 錯誤碼被 401 擋;無通行碼直打 API 被擋。
- 換瀏覽器輸同碼看到同一份資料。
