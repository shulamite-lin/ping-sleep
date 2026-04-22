const TZ = 'Asia/Taipei';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 取得台北時區的日期時間元件
function _twParts(date) {
    const parts = {};
    new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date).forEach(p => parts[p.type] = p.value);
    return parts;
}

// 取得目前台北時間的 datetime-local input 格式字串 "YYYY-MM-DDTHH:mm"
function nowLocalInput() {
    const p = _twParts(new Date());
    const h = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day}T${h}:${p.minute}`;
}

// Date 物件 → datetime-local input 格式（台北時間）
function formatToInput(date) {
    const p = _twParts(date);
    const h = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day}T${h}:${p.minute}`;
}

// datetime-local input 字串 → UTC ISO 字串（台北時區 UTC+8）
function inputToUTC(localStr) {
    return new Date(localStr + ':00+08:00').toISOString();
}

// UTC ISO 字串 → 顯示用時間 "HH:mm"（台北時間）
function formatTime(utcStr) {
    if (!utcStr) return '—';
    return new Intl.DateTimeFormat('zh-TW', {
        timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(utcStr)).replace('24:', '00:');
}

// datetime-local input 字串 "YYYY-MM-DDTHH:mm" → 邏輯日 "YYYY-MM-DD"
// 一天定義：18:00 開始，隔天 17:59:59 結束
function getLogicalDate(localStr) {
    if (!localStr) return null;
    const [datePart, timePart] = localStr.split('T');
    const hours = parseInt(timePart.split(':')[0]);
    if (hours < 18) {
        const [y, m, d] = datePart.split('-').map(Number);
        const prev = new Date(y, m - 1, d - 1);
        return [
            prev.getFullYear(),
            String(prev.getMonth() + 1).padStart(2, '0'),
            String(prev.getDate()).padStart(2, '0')
        ].join('-');
    }
    return datePart;
}

// 取得目前的邏輯日
function getCurrentLogicalDate() {
    return getLogicalDate(nowLocalInput());
}

// 邏輯日字串 "YYYY-MM-DD" → 顯示文字 "4月22日（二）"
function formatLogicalDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    return `${m}月${d}日（${weekday}）`;
}

// 分鐘數 → "X 小時 Y 分" 或 "Y 分"
function formatDuration(minutes) {
    if (minutes == null || isNaN(minutes) || minutes < 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h} 小時 ${m} 分`;
    if (h > 0) return `${h} 小時`;
    return `${m} 分`;
}

// 計算兩個 UTC ISO 字串之間的分鐘差
function calcDuration(startUtc, endUtc) {
    if (!startUtc || !endUtc) return null;
    return Math.round((new Date(endUtc) - new Date(startUtc)) / 60000);
}

// 取得目前台北時間的年月 {year, month}
function getCurrentYearMonth() {
    const p = _twParts(new Date());
    return { year: parseInt(p.year), month: parseInt(p.month) };
}
