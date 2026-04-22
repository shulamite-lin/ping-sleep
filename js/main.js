let currentLogicalDate = getCurrentLogicalDate();
let editingId = null;

document.addEventListener('DOMContentLoaded', async () => {
    updateDateDisplay();
    await loadRecords();

    document.getElementById('prev-day').addEventListener('click', () => {
        const [y, m, d] = currentLogicalDate.split('-').map(Number);
        const prev = new Date(y, m - 1, d - 1);
        currentLogicalDate = [
            prev.getFullYear(),
            String(prev.getMonth() + 1).padStart(2, '0'),
            String(prev.getDate()).padStart(2, '0')
        ].join('-');
        updateDateDisplay();
        loadRecords();
    });

    document.getElementById('next-day').addEventListener('click', () => {
        const [y, m, d] = currentLogicalDate.split('-').map(Number);
        const next = new Date(y, m - 1, d + 1);
        const nextStr = [
            next.getFullYear(),
            String(next.getMonth() + 1).padStart(2, '0'),
            String(next.getDate()).padStart(2, '0')
        ].join('-');
        if (nextStr <= getCurrentLogicalDate()) {
            currentLogicalDate = nextStr;
            updateDateDisplay();
            loadRecords();
        }
    });

    document.getElementById('today-btn').addEventListener('click', () => {
        currentLogicalDate = getCurrentLogicalDate();
        updateDateDisplay();
        loadRecords();
    });

    document.getElementById('add-btn').addEventListener('click', () => openModal(null));
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal();
    });

    document.getElementById('record-form').addEventListener('submit', handleSubmit);
    document.getElementById('sleep-start').addEventListener('input', onStartChange);
    document.getElementById('sleep-end').addEventListener('input', updateDurationPreview);
});

function updateDateDisplay() {
    const today = getCurrentLogicalDate();
    document.getElementById('current-date').textContent = formatLogicalDate(currentLogicalDate);
    document.getElementById('next-day').disabled = currentLogicalDate >= today;
    const isToday = currentLogicalDate === today;
    document.getElementById('today-btn').style.display = isToday ? 'none' : 'inline-flex';
}

async function loadRecords() {
    const container = document.getElementById('records-container');
    const totalEl = document.getElementById('total-duration');
    container.innerHTML = '<div class="state-msg">載入中⋯</div>';
    totalEl.textContent = '計算中⋯';

    try {
        const records = await getRecordsByDate(currentLogicalDate);
        renderRecords(records);
    } catch (e) {
        container.innerHTML = `<div class="state-msg error">${e.message}</div>`;
        totalEl.textContent = '—';
    }
}

function renderRecords(records) {
    const container = document.getElementById('records-container');
    const totalEl = document.getElementById('total-duration');

    if (records.length === 0) {
        container.innerHTML = '<div class="state-msg">這一天尚無睡眠記錄</div>';
        totalEl.textContent = '—';
        return;
    }

    const totalMin = records.reduce((s, r) => s + (r.duration_minutes || 0), 0);
    totalEl.textContent = totalMin > 0 ? formatDuration(totalMin) : '（有未完成記錄）';

    const colors = ['#818cf8', '#34d399', '#fb923c', '#f472b6'];

    container.innerHTML = records.map(r => {
        const color = colors[(r.session_number - 1) % colors.length];
        const sleeping = !r.sleep_end;
        return `
        <div class="record-card ${sleeping ? 'sleeping' : ''}">
            <div class="record-badge" style="background:${color}">第 ${r.session_number} 次</div>
            <div class="record-body">
                <div class="record-times">
                    <div class="time-block">
                        <span class="time-label">睡著</span>
                        <span class="time-value">${formatTime(r.sleep_start)}</span>
                    </div>
                    <div class="time-arrow">→</div>
                    <div class="time-block">
                        <span class="time-label">起床</span>
                        <span class="time-value ${sleeping ? 'still-sleeping' : ''}">${sleeping ? '睡眠中' : formatTime(r.sleep_end)}</span>
                    </div>
                </div>
                <div class="record-duration">${sleeping ? '—' : formatDuration(r.duration_minutes)}</div>
            </div>
            <div class="record-actions">
                <button class="btn-icon btn-edit" onclick="openModal('${r.id}')" title="編輯">✏️</button>
                <button class="btn-icon btn-delete" onclick="confirmDelete('${r.id}')" title="刪除">🗑</button>
            </div>
        </div>`;
    }).join('');
}

async function openModal(id) {
    editingId = id;
    const form = document.getElementById('record-form');
    form.reset();
    document.getElementById('logical-date-info').textContent = '';
    document.getElementById('duration-preview').textContent = '';
    document.getElementById('modal-title').textContent = id ? '編輯睡眠記錄' : '新增睡眠記錄';

    if (id) {
        try {
            const records = await getRecordsByDate(currentLogicalDate);
            const r = records.find(x => x.id === id);
            if (r) {
                document.getElementById('session-number').value = r.session_number;
                document.getElementById('sleep-start').value = formatToInput(new Date(r.sleep_start));
                if (r.sleep_end) {
                    document.getElementById('sleep-end').value = formatToInput(new Date(r.sleep_end));
                }
                onStartChange();
            }
        } catch (e) {
            showToast('無法載入記錄：' + e.message, 'error');
            return;
        }
    } else {
        document.getElementById('sleep-start').value = nowLocalInput();
        onStartChange();
        try {
            const records = await getRecordsByDate(currentLogicalDate);
            const maxSn = records.reduce((max, r) => Math.max(max, r.session_number), 0);
            document.getElementById('session-number').value = Math.min(maxSn + 1, 4);
        } catch {}
    }

    document.getElementById('modal').classList.add('active');
    document.getElementById('sleep-start').focus();
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
    editingId = null;
}

function onStartChange() {
    const val = document.getElementById('sleep-start').value;
    if (val) {
        const ld = getLogicalDate(val);
        document.getElementById('logical-date-info').textContent = `邏輯日：${formatLogicalDate(ld)}`;
    }
    updateDurationPreview();
}

function updateDurationPreview() {
    const s = document.getElementById('sleep-start').value;
    const e = document.getElementById('sleep-end').value;
    const el = document.getElementById('duration-preview');
    if (s && e) {
        const mins = calcDuration(inputToUTC(s), inputToUTC(e));
        el.textContent = mins > 0 ? `時長：${formatDuration(mins)}` : '⚠ 起床時間需晚於睡著時間';
        el.className = mins > 0 ? 'duration-preview ok' : 'duration-preview warn';
    } else {
        el.textContent = '';
    }
}

async function handleSubmit(e) {
    e.preventDefault();
    const sn = parseInt(document.getElementById('session-number').value);
    const startVal = document.getElementById('sleep-start').value;
    const endVal = document.getElementById('sleep-end').value;

    if (!startVal) { showToast('請填寫睡著時間', 'error'); return; }

    const startUtc = inputToUTC(startVal);
    const endUtc = endVal ? inputToUTC(endVal) : null;

    if (endUtc) {
        const mins = calcDuration(startUtc, endUtc);
        if (mins <= 0) { showToast('起床時間需晚於睡著時間', 'error'); return; }
    }

    const logicalDate = getLogicalDate(startVal);
    const duration = endUtc ? calcDuration(startUtc, endUtc) : null;

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = '儲存中⋯';

    try {
        const payload = {
            session_number: sn,
            sleep_start: startUtc,
            sleep_end: endUtc,
            duration_minutes: duration,
            logical_date: logicalDate
        };
        if (editingId) {
            await updateRecord(editingId, payload);
            showToast('記錄已更新 ✓');
        } else {
            await addRecord(payload);
            showToast('記錄已新增 ✓');
        }
        closeModal();
        currentLogicalDate = logicalDate;
        updateDateDisplay();
        await loadRecords();
    } catch (err) {
        showToast('儲存失敗：' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '儲存';
    }
}

async function confirmDelete(id) {
    if (!confirm('確定要刪除這筆記錄？')) return;
    try {
        await deleteRecord(id);
        showToast('已刪除 ✓');
        await loadRecords();
    } catch (e) {
        showToast('刪除失敗：' + e.message, 'error');
    }
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}
