let currentLogicalDate = getCurrentLogicalDate();
let editingId = null;

document.addEventListener('DOMContentLoaded', async () => {
    updateDateDisplay();
    initForm();
    await loadRecords();

    document.getElementById('prev-day').addEventListener('click', () => {
        const [y, m, d] = currentLogicalDate.split('-').map(Number);
        const prev = new Date(y, m - 1, d - 1);
        currentLogicalDate = toDateStr(prev);
        updateDateDisplay();
        loadRecords();
    });

    document.getElementById('next-day').addEventListener('click', () => {
        const [y, m, d] = currentLogicalDate.split('-').map(Number);
        const next = new Date(y, m - 1, d + 1);
        const nextStr = toDateStr(next);
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

    document.getElementById('cancel-edit').addEventListener('click', resetForm);
    document.getElementById('record-form').addEventListener('submit', handleSubmit);
    document.getElementById('sleep-start').addEventListener('input', onStartChange);
    document.getElementById('sleep-end').addEventListener('input', updateDurationPreview);
});

function toDateStr(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function updateDateDisplay() {
    const today = getCurrentLogicalDate();
    document.getElementById('current-date').textContent = formatLogicalDate(currentLogicalDate);
    document.getElementById('next-day').disabled = currentLogicalDate >= today;
    document.getElementById('today-btn').style.display = currentLogicalDate === today ? 'none' : 'inline-flex';
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
        const msg = parseSupabaseError(e);
        container.innerHTML = `<div class="state-msg error">${msg}</div>`;
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
        const isEditing = editingId === r.id;
        return `
        <div class="record-card ${sleeping ? 'sleeping' : ''} ${isEditing ? 'editing' : ''}">
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
                <button class="btn-icon btn-edit" onclick="startEdit('${r.id}')" title="編輯">✏️</button>
                <button class="btn-icon btn-delete" onclick="confirmDelete('${r.id}')" title="刪除">🗑</button>
            </div>
        </div>`;
    }).join('');
}

async function initForm() {
    document.getElementById('sleep-start').value = nowLocalInput();
    onStartChange();
    try {
        const records = await getRecordsByDate(currentLogicalDate);
        const maxSn = records.reduce((max, r) => Math.max(max, r.session_number), 0);
        document.getElementById('session-number').value = Math.min(maxSn + 1, 4);
    } catch {}
}

function resetForm() {
    editingId = null;
    document.getElementById('record-form').reset();
    document.getElementById('sleep-start').value = nowLocalInput();
    document.getElementById('form-title').textContent = '新增記錄';
    document.getElementById('cancel-edit').style.display = 'none';
    document.getElementById('duration-preview').textContent = '';
    document.getElementById('submit-btn').textContent = '儲存記錄';
    onStartChange();
    // 更新建議的次數
    getRecordsByDate(currentLogicalDate).then(records => {
        const maxSn = records.reduce((max, r) => Math.max(max, r.session_number), 0);
        document.getElementById('session-number').value = Math.min(maxSn + 1, 4);
    }).catch(() => {});
    // 重新渲染移除 editing 樣式
    getRecordsByDate(currentLogicalDate).then(renderRecords).catch(() => {});
}

async function startEdit(id) {
    editingId = id;
    try {
        const records = await getRecordsByDate(currentLogicalDate);
        const r = records.find(x => x.id === id);
        if (!r) { showToast('找不到該記錄', 'error'); return; }

        document.getElementById('session-number').value = r.session_number;
        document.getElementById('sleep-start').value = formatToInput(new Date(r.sleep_start));
        document.getElementById('sleep-end').value = r.sleep_end ? formatToInput(new Date(r.sleep_end)) : '';
        document.getElementById('form-title').textContent = `編輯第 ${r.session_number} 次記錄`;
        document.getElementById('cancel-edit').style.display = 'inline-flex';
        document.getElementById('submit-btn').textContent = '更新記錄';
        onStartChange();
        renderRecords(records);

        document.getElementById('form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
        showToast('載入失敗：' + e.message, 'error');
    }
}

function onStartChange() {
    const val = document.getElementById('sleep-start').value;
    const infoEl = document.getElementById('logical-date-info');
    if (val) {
        const ld = getLogicalDate(val);
        infoEl.textContent = formatLogicalDate(ld);
        infoEl.style.color = '';
    } else {
        infoEl.textContent = '—';
    }
    updateDurationPreview();
}

function updateDurationPreview() {
    const s = document.getElementById('sleep-start').value;
    const e = document.getElementById('sleep-end').value;
    const el = document.getElementById('duration-preview');
    if (s && e) {
        const mins = calcDuration(inputToUTC(s), inputToUTC(e));
        if (mins > 0) {
            el.textContent = `預計時長：${formatDuration(mins)}`;
            el.className = 'duration-preview ok';
        } else {
            el.textContent = '⚠ 起床時間需晚於睡著時間';
            el.className = 'duration-preview warn';
        }
    } else {
        el.textContent = '';
        el.className = 'duration-preview';
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

    if (endUtc && calcDuration(startUtc, endUtc) <= 0) {
        showToast('起床時間需晚於睡著時間', 'error');
        return;
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
            showToast('✓ 記錄已更新');
        } else {
            await addRecord(payload);
            showToast('✓ 記錄已新增');
        }

        currentLogicalDate = logicalDate;
        updateDateDisplay();
        resetForm();
        await loadRecords();

    } catch (err) {
        showToast(parseSupabaseError(err), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = editingId ? '更新記錄' : '儲存記錄';
    }
}

async function confirmDelete(id) {
    if (!confirm('確定要刪除這筆記錄？')) return;
    try {
        await deleteRecord(id);
        showToast('✓ 已刪除');
        if (editingId === id) resetForm();
        await loadRecords();
    } catch (e) {
        showToast(parseSupabaseError(e), 'error');
    }
}

function parseSupabaseError(e) {
    const msg = e.message || String(e);
    if (msg.includes('does not exist') || msg.includes('relation')) {
        return '資料表不存在，請確認已在 Supabase 執行建表 SQL';
    }
    if (msg.includes('Invalid API key') || msg.includes('apikey')) {
        return 'Supabase API Key 錯誤，請檢查 config.js';
    }
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
        return '網路連線失敗，請確認 Supabase URL 是否正確';
    }
    if (msg.includes('unique') || msg.includes('duplicate')) {
        return `第 ${document.getElementById('session-number')?.value} 次記錄已存在，請選擇不同次數`;
    }
    return '發生錯誤：' + msg;
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 4000);
}
