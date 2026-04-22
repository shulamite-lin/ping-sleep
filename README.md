# 睡眠記錄系統

一天定義：18:00 開始 → 隔天 17:59:59 結束（適合多次睡眠的特殊作息）

## 部署步驟

### 第一步：建立 Supabase 資料庫

1. 前往 [supabase.com](https://supabase.com) 建立免費帳號與新專案
2. 進入專案 → 左側選單 **SQL Editor** → 點 **New query**
3. 貼上以下 SQL 並執行：

```sql
CREATE TABLE sleep_records (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  logical_date     DATE         NOT NULL,
  session_number   INTEGER      NOT NULL CHECK (session_number BETWEEN 1 AND 4),
  sleep_start      TIMESTAMPTZ  NOT NULL,
  sleep_end        TIMESTAMPTZ,
  duration_minutes INTEGER,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(logical_date, session_number)
);

-- 允許公開讀寫（家用，無需登入）
ALTER TABLE sleep_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON sleep_records FOR ALL USING (true) WITH CHECK (true);
```

4. 進入專案 → **Project Settings** → **API**，複製：
   - **Project URL**（類似 `https://xxxx.supabase.co`）
   - **anon public** key

### 第二步：填入設定

編輯 `js/config.js`，將兩個值填入：

```javascript
const SUPABASE_URL = 'https://xxxx.supabase.co';   // 貼上 Project URL
const SUPABASE_ANON_KEY = 'eyJ...';                 // 貼上 anon key
```

### 第三步：部署到 GitHub Pages

1. 在 GitHub 建立新 repository（例如 `ping-sleep`），設為 **Public**
2. 將所有檔案推送到 `main` branch
3. 進入 repository → **Settings** → **Pages**
4. Source 選 **Deploy from a branch**，Branch 選 `main`，資料夾選 `/ (root)`
5. 儲存後等約 1 分鐘，網址為：`https://[你的帳號].github.io/ping-sleep/`

## 功能說明

- **今日記錄**：查看當天各次睡眠，可新增、編輯、刪除
- **日期切換**：左右箭頭切換查看其他日期的記錄
- **邏輯日**：填寫睡著時間後，系統自動計算邏輯日（18:00前算前一天）
- **月報**：左右箭頭切換月份，顯示表格與長條圖
