let curYear, curMonth;
let chartInstance = null;
let scheduleChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { year, month } = getCurrentYearMonth();
    curYear = year;
    curMonth = month;

    updateMonthDisplay();
    await initAuth();
    await loadMonthData();

    document.getElementById('prev-month').addEventListener('click', () => {
        curMonth--;
        if (curMonth < 1) { curMonth = 12; curYear--; }
        updateMonthDisplay();
        loadMonthData();
    });

    document.getElementById('next-month').addEventListener('click', () => {
        const { year: maxY, month: maxM } = getCurrentYearMonth();
        if (curYear < maxY || (curYear === maxY && curMonth < maxM)) {
            curMonth++;
            if (curMonth > 12) { curMonth = 1; curYear++; }
            updateMonthDisplay();
            loadMonthData();
        }
    });

    const scheduleWrap = document.querySelector('.chart-wrap.chart-wrap--tall');
    let swipeStartX = 0;
    let swipeStartY = 0;
    scheduleWrap.addEventListener('touchstart', e => {
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
    }, { passive: true });
    scheduleWrap.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - swipeStartX;
        const dy = e.changedTouches[0].clientY - swipeStartY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) {
                document.getElementById('prev-month').click();
            } else {
                document.getElementById('next-month').click();
            }
        }
    }, { passive: true });

    initDownloadSection();
});

function updateMonthDisplay() {
    document.getElementById('current-month').textContent = `${curYear} 年 ${curMonth} 月`;
    const { year: maxY, month: maxM } = getCurrentYearMonth();
    document.getElementById('next-month').disabled = (curYear === maxY && curMonth >= maxM);
}

function setContentLoading(loading) {
    const { year: maxY, month: maxM } = getCurrentYearMonth();
    document.getElementById('prev-month').disabled = loading;
    document.getElementById('next-month').disabled = loading || (curYear === maxY && curMonth >= maxM);
    const targets = [
        document.getElementById('month-summary'),
        ...document.querySelectorAll('.chart-section'),
        document.querySelector('.table-section'),
    ];
    targets.forEach(el => {
        el.classList.toggle('content-loading', loading);
        el.classList.toggle('content-ready', !loading);
    });
}

async function loadMonthData() {
    setContentLoading(true);
    try {
        const records = await getRecordsByMonth(curYear, curMonth);
        renderTable(records);
        renderChart(records);
        renderSleepScheduleChart(records);
    } catch (e) {
        const tbody = document.getElementById('month-table-body');
        tbody.innerHTML = `<tr><td colspan="8" class="state-msg error">${e.message}</td></tr>`;
    }
    setContentLoading(false);
}

function groupByDate(records) {
    const map = {};
    records.forEach(r => {
        if (!map[r.logical_date]) map[r.logical_date] = [];
        map[r.logical_date].push(r);
    });
    return map;
}

function renderTable(records) {
    const tbody = document.getElementById('month-table-body');
    const summaryEl = document.getElementById('month-summary');

    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="state-msg">本月尚無睡眠記錄</td></tr>';
        summaryEl.innerHTML = '';
        return;
    }

    const byDate = groupByDate(records);
    const sortedDates = Object.keys(byDate).sort();
    const dailyTotals = [];
    let totalMonthMin = 0;

    const rows = sortedDates.map(date => {
        const dayRecs = byDate[date].sort((a, b) => a.session_number - b.session_number);
        const dayInterrupt = dayRecs.reduce((s, r) => s + (r.interruption_minutes || 0), 0);
        const dayTotal = dayRecs.reduce((s, r) => {
            const effective = (r.duration_minutes || 0) + (r.interruption_minutes || 0);
            return s + Math.max(effective, 0);
        }, 0);
        totalMonthMin += dayTotal;
        dailyTotals.push(dayTotal);

        const sessionCells = [1, 2, 3, 4, 5].map(n => {
            const r = dayRecs.find(x => x.session_number === n);
            if (!r) return '<td class="session-empty">—</td>';
            const s = formatTime(r.sleep_start);
            const e = r.sleep_end ? formatTime(r.sleep_end) : '🌙';
            const dur = r.duration_minutes ? `<br><small class="dur-small">${formatDuration(r.duration_minutes)}</small>` : '';
            return `<td class="session-cell"><span class="sn-dot sn${n}"></span>${s}→${e}${dur}</td>`;
        }).join('');

        const interruptCell = dayInterrupt !== 0
            ? `<td class="interrupt-cell">${dayInterrupt > 0 ? '+' : ''}${dayInterrupt} 分</td>`
            : `<td class="session-empty">—</td>`;

        return `<tr>
            <td class="date-cell">${formatLogicalDate(date)}</td>
            ${sessionCells}
            ${interruptCell}
            <td class="total-cell">${dayTotal > 0 ? formatDuration(dayTotal) : '—'}</td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rows;

    // Summary
    const avgMin = Math.round(totalMonthMin / sortedDates.length);
    const maxMin = Math.max(...dailyTotals);
    const validTotals = dailyTotals.filter(d => d > 0);
    const minMin = validTotals.length ? Math.min(...validTotals) : 0;

    summaryEl.innerHTML = `
        <div class="summary-grid">
            <div class="summary-card"><span class="sl">記錄天數</span><span class="sv">${sortedDates.length} 天</span></div>
            <div class="summary-card"><span class="sl">日均睡眠</span><span class="sv">${formatDuration(avgMin)}</span></div>
            <div class="summary-card"><span class="sl">最長單日</span><span class="sv">${formatDuration(maxMin)}</span></div>
            <div class="summary-card"><span class="sl">最短單日</span><span class="sv">${minMin > 0 ? formatDuration(minMin) : '—'}</span></div>
        </div>`;
}

function renderChart(records) {
    const canvas = document.getElementById('sleep-chart');
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    if (records.length === 0) return;

    const byDate = groupByDate(records);
    const lastDay = new Date(curYear, curMonth, 0).getDate();
    const labels = [], sleepData = [];

    for (let d = 1; d <= lastDay; d++) {
        const key = `${curYear}-${String(curMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        labels.push(`${d}`);
        const dayRecs = (byDate[key] || []).slice().sort((a, b) => a.session_number - b.session_number);

        const sleepMin = dayRecs.reduce((s, r) => s + Math.max((r.duration_minutes || 0) + (r.interruption_minutes || 0), 0), 0);
        sleepData.push(sleepMin > 0 ? +(sleepMin / 60).toFixed(2) : 0);
    }

    chartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: '睡眠時數',
                    data: sleepData,
                    backgroundColor: sleepData.map(v => v === 0 ? 'rgba(100,116,139,0.2)' : 'rgba(129,140,248,0.75)'),
                    borderColor: sleepData.map(v => v === 0 ? 'rgba(100,116,139,0.3)' : 'rgba(129,140,248,1)'),
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 12 }
                },
                tooltip: {
                    callbacks: {
                        title: ctx => `${curMonth}月${ctx[0].label}日`,
                        label: ctx => ctx.raw > 0 ? `睡眠時數：${ctx.raw.toFixed(1)} 小時` : '睡眠時數：無記錄'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '小時', color: '#94a3b8', font: { size: 12 } },
                    ticks: { color: '#94a3b8', font: { size: 11 } },
                    grid: { color: 'rgba(148,163,184,0.08)' }
                },
                x: {
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 10 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 16
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

// 正常睡眠時段（22:00～次日06:00）底色帶
// （依賴呼叫方 y 軸為「邏輯時間」刻度：18 起算，22:00=22、06:00 次日=30）
const normalSleepBandPlugin = {
    id: 'normalSleepBand',
    beforeDatasetsDraw(chart) {
        const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
        const sleepTop    = y.getPixelForValue(30); // 06:00 次日（邏輯時間 30）
        const sleepBottom = y.getPixelForValue(22); // 22:00（邏輯時間 22）
        ctx.save();
        // 非睡眠時段：淺灰藍
        ctx.fillStyle = '#d0dae6';
        ctx.fillRect(left, top, right - left, sleepTop - top);               // 06:00 以上
        ctx.fillRect(left, sleepBottom, right - left, bottom - sleepBottom); // 22:00 以下
        // 正常睡眠時段：中深藍，有別於卡片背景 #1c2740
        ctx.fillStyle = '#273d5e';
        ctx.fillRect(left, sleepTop, right - left, sleepBottom - sleepTop);
        ctx.restore();
    }
};

function renderSleepScheduleChart(records) {
    const canvas = document.getElementById('schedule-chart');
    if (scheduleChartInstance) { scheduleChartInstance.destroy(); scheduleChartInstance = null; }
    if (records.length === 0) return;

    const SESSION_COLORS = [
        { bg: 'rgba(129,140,248,0.75)', border: '#818cf8' },
        { bg: 'rgba(52,211,153,0.75)',  border: '#34d399' },
        { bg: 'rgba(251,146,60,0.75)',  border: '#fb923c' },
        { bg: 'rgba(244,114,182,0.75)', border: '#f472b6' },
        { bg: 'rgba(56,189,248,0.75)',  border: '#38bdf8' },
    ];

    const lastDay = new Date(curYear, curMonth, 0).getDate();
    const labels = Array.from({ length: lastDay }, (_, i) => String(i + 1));

    // byDate[logical_date][session_number] = record（已有 sleep_end 的才收錄）
    const byDate = {};
    records.forEach(r => {
        if (!r.sleep_end) return;
        if (!byDate[r.logical_date]) byDate[r.logical_date] = {};
        byDate[r.logical_date][r.session_number] = r;
    });

    // 每日第 1 次入睡時刻（不限已結束，含睡眠中的紀錄）
    const byDateAll = groupByDate(records);

    const toLogical = (h, m) => (h >= 18 ? h : h + 24) + m / 60;

    const sessionData = [[], [], [], [], []];
    const onsetData = [];

    for (let d = 1; d <= lastDay; d++) {
        const key = `${curYear}-${String(curMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayMap = byDate[key] || {};

        for (let sn = 1; sn <= 5; sn++) {
            const r = dayMap[sn];
            if (!r) { sessionData[sn - 1].push(null); continue; }

            const sp = _twParts(new Date(r.sleep_start));
            const ep = _twParts(new Date(r.sleep_end));

            const sh = sp.hour === '24' ? 0 : parseInt(sp.hour);
            const eh = ep.hour === '24' ? 0 : parseInt(ep.hour);
            // 邏輯日從 18:00 開始：0~17 點屬於隔天早晨，+24 放到正確位置
            const startDec = toLogical(sh, parseInt(sp.minute));
            let   endDec   = toLogical(eh, parseInt(ep.minute));
            // 起床時間落在下一個邏輯日（例如 16:15→18:04），再 +24 往上延伸
            if (endDec < startDec) endDec += 24;

            sessionData[sn - 1].push([startDec, endDec]);
        }

        const dayRecsAll = (byDateAll[key] || []).slice().sort((a, b) => a.session_number - b.session_number);
        const first = dayRecsAll[0];
        if (!first) { onsetData.push(null); continue; }
        const fp = _twParts(new Date(first.sleep_start));
        const fh = fp.hour === '24' ? 0 : parseInt(fp.hour);
        onsetData.push(toLogical(fh, parseInt(fp.minute)));
    }

    // Y 軸最大值：至少 42，若有跨邏輯日的記錄則動態延伸
    let yMax = 42;
    sessionData.forEach(arr => arr.forEach(v => { if (v) yMax = Math.max(yMax, Math.ceil(v[1])); }));
    onsetData.forEach(v => { if (v != null) yMax = Math.max(yMax, Math.ceil(v)); });

    const toHHmm = dec => {
        const h = Math.floor(dec) % 24;
        const m = Math.round((dec % 1) * 60);
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    };

    const datasets = SESSION_COLORS.map((c, i) => ({
        label: `第 ${i + 1} 次`,
        data: sessionData[i],
        backgroundColor: c.bg,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false,
        barPercentage: 0.9,
        categoryPercentage: 0.8,
    }));

    // 入睡時刻趨勢：黑色空心圓，不連線
    datasets.push({
        type: 'line',
        label: '入睡時刻趨勢',
        data: onsetData,
        showLine: false,
        pointBackgroundColor: 'transparent',
        pointBorderColor: '#0b1120',
        pointBorderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: true,
        fill: false,
        order: -1,
    });

    scheduleChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets },
        options: {
            grouped: false,   // 同一日期的所有次數疊在同一直線（Chart.js v4 頂層設定）
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#94a3b8',
                        font: { size: 11 },
                        boxWidth: 12,
                        padding: 12,
                        filter: (item, chartData) =>
                            chartData.datasets[item.datasetIndex].data.some(v => v !== null)
                    }
                },
                tooltip: {
                    callbacks: {
                        title: ctx => `${curMonth}月${labels[ctx[0].dataIndex]}日`,
                        label: ctx => {
                            const v = ctx.raw;
                            if (v == null) return null;
                            if (Array.isArray(v)) return `第${ctx.datasetIndex + 1}次：${toHHmm(v[0])} → ${toHHmm(v[1])}`;
                            return `入睡時刻：${toHHmm(v)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 10 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 16
                    },
                    grid: { display: false }
                },
                y: {
                    min: 18,
                    max: yMax,
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 11 },
                        stepSize: 2,
                        callback: value => `${String(value % 24).padStart(2, '0')}:00`
                    },
                    grid: {
                        color: ctx => ctx.tick.value === 24 ? 'rgba(129,140,248,0.2)' : 'rgba(148,163,184,0.08)'
                    }
                }
            }
        },
        plugins: [normalSleepBandPlugin]
    });
}

// ===== 下載功能 =====

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 5000);
}

function initDownloadSection() {
    document.getElementById('dl-start-year').value  = 2026;
    document.getElementById('dl-start-month').value = 4;
    const { year, month } = getCurrentYearMonth();
    document.getElementById('dl-end-year').value  = year;
    document.getElementById('dl-end-month').value = month;
    document.getElementById('dl-btn').addEventListener('click', handleDownload);
}

async function handleDownload() {
    const startYear  = parseInt(document.getElementById('dl-start-year').value);
    const startMonth = parseInt(document.getElementById('dl-start-month').value);
    const endYear    = parseInt(document.getElementById('dl-end-year').value);
    const endMonth   = parseInt(document.getElementById('dl-end-month').value);

    if (isNaN(startYear) || isNaN(startMonth) || isNaN(endYear) || isNaN(endMonth)) {
        showToast('請填寫完整的起迄年月', 'error');
        return;
    }
    if (startYear * 100 + startMonth > endYear * 100 + endMonth) {
        showToast('起始年月不能晚於結束年月', 'error');
        return;
    }
    const { year: nowY, month: nowM } = getCurrentYearMonth();
    if (endYear * 100 + endMonth > nowY * 100 + nowM) {
        showToast('結束年月不能超過當下年月', 'error');
        return;
    }

    const btn = document.getElementById('dl-btn');
    btn.disabled = true;
    btn.textContent = '查詢中⋯';

    try {
        const records = await getRecordsByDateRange(startYear, startMonth, endYear, endMonth);
        if (records.length === 0) {
            showToast('該區間無資料');
            return;
        }
        const csv = buildCSV(records);
        triggerDownload(csv, startYear, startMonth, endYear, endMonth);
        showToast(`已下載 ${records.length} 筆記錄`);
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '下載 CSV';
    }
}

function escapeCsvField(val) {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function buildCSV(records) {
    const headers = ['id', 'logical_date', 'session_number', 'sleep_start', 'sleep_end',
                     'duration_minutes', 'interruption_minutes', 'created_at', 'updated_at'];
    const rows = records.map(r =>
        headers.map(col => escapeCsvField(r[col] ?? '')).join(',')
    );
    return '﻿' + [headers.join(','), ...rows].join('\r\n');
}

function triggerDownload(csv, sy, sm, ey, em) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `sleep_${sy}${String(sm).padStart(2,'0')}-${ey}${String(em).padStart(2,'0')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}
