# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案說明

「平平睡眠記錄」是一個靜態網頁應用，用於記錄特殊作息（每天最多 4 次睡眠），資料儲存於 Supabase，部署於 GitHub Pages。

**無建置流程**：純 HTML + CSS + Vanilla JS，不需要 npm / build step。

## 開發方式

本地預覽需透過 HTTP server（不可直接用 `file://`，否則 Supabase JS SDK 可能有 CORS 問題）：

```bash
# 在專案根目錄啟動
npx serve .
# 或
python3 -m http.server 8080
```

瀏覽器開啟：
- `http://localhost:8080/` — 今日記錄（主頁）
- `http://localhost:8080/monthly.html` — 月報

## 架構概覽

### 腳本載入順序（兩個頁面都相同）

```
config.js → utils.js → db.js → main.js（或 monthly.js）
```

全部用全域變數共享，無模組系統。

### 各檔案職責

| 檔案 | 職責 |
|------|------|
| `js/config.js` | Supabase URL 與 anon key（唯一需填寫的設定） |
| `js/utils.js` | 所有時間工具函式（全部以台北時區處理） |
| `js/db.js` | Supabase CRUD 操作（getDB、getRecordsByDate、getRecordsByMonth、addRecord、updateRecord、deleteRecord） |
| `js/main.js` | 今日記錄頁邏輯（日期導航、表單新增 / 編輯、deleteRecord） |
| `js/monthly.js` | 月報頁邏輯（月份導航、表格、Chart.js 長條圖） |
| `css/style.css` | 全部樣式（深色主題，兩頁共用） |

### 外部 CDN 依賴

- `@supabase/supabase-js@2`（UMD 版，掛在 `window.supabase`）
- `chart.js@4`（UMD 版，僅 monthly.html 使用）

## 核心概念：邏輯日

**一天定義：18:00（台北）開始，隔天 17:59:59 結束。**

睡著時間若早於 18:00，歸屬於「前一個邏輯日」。  
例如：凌晨 02:00 睡著 → 邏輯日為昨天。

計算邏輯在 `js/utils.js` 的 `getLogicalDate(localStr)` 函式。

## 資料庫 Schema

```sql
CREATE TABLE sleep_records (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  logical_date        DATE         NOT NULL,          -- 邏輯日 (YYYY-MM-DD)
  session_number      INTEGER      NOT NULL CHECK (session_number BETWEEN 1 AND 4),
  sleep_start         TIMESTAMPTZ  NOT NULL,           -- 睡著時間 (UTC)
  sleep_end           TIMESTAMPTZ,                     -- 起床時間 (UTC，可為 null 表示睡眠中)
  duration_minutes    INTEGER,                         -- sleep_end - sleep_start，分鐘
  interruption_minutes INTEGER DEFAULT 0,             -- 零碎起床時長（分鐘，從 duration 中扣除）
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(logical_date, session_number)
);
```

**有效睡眠時長** = `duration_minutes - interruption_minutes`（每日合計取最大值 0）。

## 時間處理原則

- 所有時間儲存為 UTC ISO 字串（`TIMESTAMPTZ`）
- 顯示時一律用 `Intl.DateTimeFormat` 轉換為台北時間（`Asia/Taipei`）
- 表單 `datetime-local` 輸入值視為台北時間，轉 UTC 時使用 `+08:00` offset
- 注意：`Intl.DateTimeFormat` 的 `hour12: false` 在午夜可能回傳 `'24'`，需手動換成 `'00'`（`utils.js` 已處理）

## 部署

GitHub Pages：push 到 `main` branch 即自動部署（無 CI/CD 設定，靜態檔案直接服務）。
