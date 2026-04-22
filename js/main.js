let currentLogicalDate = getCurrentLogicalDate();
let editingId = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. 先同步綁定所有事件（不等待任何 async 操作）
    document.getElementById('prev-day').addEventListener('click', navPrevDay);
    document.getElementById('next-day').addEventListener('click', navNextDay);
    document.getElementById('today-btn').addEventListener('click', navToday);
    document.getElementById('cancel-edit').addEventListener('click', resetForm);
    document.getElementById('record-form').addEventListener('submit', handleSubmit);
    document.getElementById('sleep-start').addEventListener('input', onStartChange);
    document.getElementById('sleep-end').addEventListener('input', updateDurationPreview);

    // 2. 初始化 UI
    updateDateDisplay();
    document.getElementById('sleep-start').value = nowLocalInput();
    onStartChange();

    // 3. 非同步載入資料
    loadRecords();
});

function toDateStr(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function navPrevDay() {
    const [y, m, d] = currentLogicalDate.split('-').map(Number);
    currentLogicalDate = toDateStr(new Date(y, m - 1, d - 1));
    updateDateDisplay();
    loadRecords();
}

function navNextDay() {
    const [y, m, d] = currentLogicalDate.split('-').map(Number);
    const nextStr = toDateStr(new Date(y, m - 1, d + 1));
    if (nextStr <= getCurrentLogicalDate()) {
        currentLogicalDate = nextStr;
        updateDateDisplay();
        loadRecords();
    }
}

function navToday() {
    currentLogicalDate = getCurrentLogicalDate();
    updateDateDisplay();
    loadRecords();
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
    totalEl.textContent = '—';

    try {
        const records = await getRecordsByDate(currentLogicalDate);
        renderRecords(records);
        if (!editingId) {
            const maxSn = records.reduce((max, r) => Math.max(max, r.session_number), 0);
            document.getElementById('session-number').value = Math.min(maxSn + 1, 4);
        }
    } catch (e) {
        console.error('[Supabase] loadRecords error:', e);
        container.innerHTML = `<div class="state-msg error">${parseSupabaseError(e)}</div>`;
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
        <div class="record-card ${sleeping ? 'sleeping' : ''} ${editingId === r.id ? 'editing' : ''}">
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
                <button class="btn-icon" onclick="startEdit('${r.id}')" title="編輯">✏️</button>
                <button class="btn-icon" onclick="confirmDelete('${r.id}')" title="刪除">🗑</button>
            </div>
        </div>`;
    }).join('');
}

function resetForm() {
    editingId = null;
    document.getElementById('record-form').reset();
    document.getElementById('sleep-start').value = nowLocalInput();
    document.getElementById('sleep-end').value = '';
    document.getElementById('form-title').textContent = '新增記錄';
    document.getElementById('cancel-edit').style.display = 'none';
    document.getElementById('submit-btn').textContent = '儲存記錄';
    document.getElementById('duration-preview').textContent = '';
    document.getElementById('duration-preview').className = 'duration-preview';
    onStartChange();
    loadRecords();
}

async function startEdit(id) {
    try {
        const records = await getRecordsByDate(currentLogicalDate);
        const r = records.find(x => x.id === id);
        if (!r) { showToast('找不到該記錄', 'error'); return; }

        editingId = id;
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
        console.error('[Supabase] startEdit error:', e);
        showToast('載入失敗：' + e.message, 'error');
    }
}

function onStartChange() {
    const val = document.getElementById('sleep-start').value;
    const infoEl = document.getElementById('logical-date-info');
    infoEl.textContent = val ? formatLogicalDate(getLogicalDate(val)) : '—';
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
    const isEditing = !!editingId;
    const currentEditId = editingId;

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = '儲存中⋯';

    const payload = {
        session_number: sn,
        sleep_start: startUtc,
        sleep_end: endUtc,
        duration_minutes: duration,
        logical_date: logicalDate
    };

    console.log('[Supabase] saving:', JSON.stringify(payload));

    try {
        if (isEditing) {
            await updateRecord(currentEditId, payload);
            showToast('✓ 記錄已更新');
        } else {
            await addRecord(payload);
            showToast('✓ 記錄已新增');
        }

        // 重設表單
        editingId = null;
        document.getElementById('record-form').reset();
        document.getElementById('sleep-start').value = nowLocalInput();
        document.getElementById('sleep-end').value = '';
        document.getElementById('form-title').textContent = '新增記錄';
        document.getElementById('cancel-edit').style.display = 'none';
        document.getElementById('submit-btn').textContent = '儲存記錄';
        document.getElementById('duration-preview').textContent = '';
        onStartChange();

        currentLogicalDate = logicalDate;
        updateDateDisplay();
        await loadRecords();

    } catch (err) {
        console.error('[Supabase] save error:', err);
        showToast(parseSupabaseError(err), 'error');
        btn.disabled = false;
        btn.textContent = isEditing ? '更新記錄' : '儲存記錄';
    }
}

async function confirmDelete(id) {
    if (!confirm('確定要刪除這筆記錄？')) return;
    try {
        await deleteRecord(id);
        showToast('✓ 已刪除');
        if (editingId === id) {
            editingId = null;
            document.getElementById('form-title').textContent = '新增記錄';
            document.getElementById('cancel-edit').style.display = 'none';
            document.getElementById('submit-btn').textContent = '儲存記錄';
        }
        await loadRecords();
    } catch (e) {
        console.error('[Supabase] delete error:', e);
        showToast(parseSupabaseError(e), 'error');
    }
}

function parseSupabaseError(e) {
    const raw = e.message || String(e);
    const msg = raw.toLowerCase();
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('no such table')) {
        return '資料表不存在，請到 Supabase SQL Editor 執行建表 SQL';
    }
    if (msg.includes('api key') || msg.includes('apikey') || msg.includes('invalid key') || msg.includes('jwt')) {
        return 'API Key 錯誤，請檢查 js/config.js 中的 SUPABASE_ANON_KEY';
    }
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network')) {
        return '無法連線到 Supabase，請確認 SUPABASE_URL 是否正確';
    }
    if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('23505')) {
        return '這一天的同一次數已有記錄，請選擇不同的次數';
    }
    return '錯誤：' + raw;
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 5000);
}
