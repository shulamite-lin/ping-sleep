let curYear, curMonth;
let chartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { year, month } = getCurrentYearMonth();
    curYear = year;
    curMonth = month;

    updateMonthDisplay();
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
});

function updateMonthDisplay() {
    document.getElementById('current-month').textContent = `${curYear} 年 ${curMonth} 月`;
    const { year: maxY, month: maxM } = getCurrentYearMonth();
    document.getElementById('next-month').disabled = (curYear === maxY && curMonth >= maxM);
}

async function loadMonthData() {
    const tbody = document.getElementById('month-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="state-msg">載入中⋯</td></tr>';
    document.getElementById('month-summary').innerHTML = '';

    try {
        const records = await getRecordsByMonth(curYear, curMonth);
        renderTable(records);
        renderChart(records);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="state-msg error">${e.message}</td></tr>`;
    }
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
        tbody.innerHTML = '<tr><td colspan="6" class="state-msg">本月尚無睡眠記錄</td></tr>';
        summaryEl.innerHTML = '';
        return;
    }

    const byDate = groupByDate(records);
    const sortedDates = Object.keys(byDate).sort();
    const dailyTotals = [];
    let totalMonthMin = 0;

    const rows = sortedDates.map(date => {
        const dayRecs = byDate[date].sort((a, b) => a.session_number - b.session_number);
        const dayTotal = dayRecs.reduce((s, r) => s + (r.duration_minutes || 0), 0);
        totalMonthMin += dayTotal;
        dailyTotals.push(dayTotal);

        const sessionCells = [1, 2, 3, 4].map(n => {
            const r = dayRecs.find(x => x.session_number === n);
            if (!r) return '<td class="session-empty">—</td>';
            const s = formatTime(r.sleep_start);
            const e = r.sleep_end ? formatTime(r.sleep_end) : '🌙';
            const dur = r.duration_minutes ? `<br><small class="dur-small">${formatDuration(r.duration_minutes)}</small>` : '';
            return `<td class="session-cell"><span class="sn-dot sn${n}"></span>${s}→${e}${dur}</td>`;
        }).join('');

        return `<tr>
            <td class="date-cell">${formatLogicalDate(date)}</td>
            ${sessionCells}
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

    const byDate = {};
    records.forEach(r => {
        byDate[r.logical_date] = (byDate[r.logical_date] || 0) + (r.duration_minutes || 0);
    });

    const lastDay = new Date(curYear, curMonth, 0).getDate();
    const labels = [], data = [];
    for (let d = 1; d <= lastDay; d++) {
        const key = `${curYear}-${String(curMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        labels.push(`${d}`);
        data.push(byDate[key] ? +(byDate[key] / 60).toFixed(2) : 0);
    }

    chartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '睡眠時數',
                data,
                backgroundColor: data.map(v => v === 0 ? 'rgba(100,116,139,0.2)' : 'rgba(129,140,248,0.75)'),
                borderColor: data.map(v => v === 0 ? 'rgba(100,116,139,0.3)' : 'rgba(129,140,248,1)'),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: ctx => `${curMonth}月${ctx[0].label}日`,
                        label: ctx => ctx.raw > 0 ? `${ctx.raw.toFixed(1)} 小時` : '無記錄'
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
