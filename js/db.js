let _db = null;

function getDB() {
    if (!_db) {
        if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
            throw new Error('請先在 js/config.js 填入 Supabase URL 與 API Key');
        }
        _db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return _db;
}

async function getRecordsByDate(logicalDate) {
    const { data, error } = await getDB()
        .from('sleep_records')
        .select('*')
        .eq('logical_date', logicalDate)
        .order('session_number');
    if (error) throw error;
    return data || [];
}

async function getRecordsByMonth(year, month) {
    const m = String(month).padStart(2, '0');
    const start = `${year}-${m}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${m}-${String(lastDay).padStart(2, '0')}`;
    const { data, error } = await getDB()
        .from('sleep_records')
        .select('*')
        .gte('logical_date', start)
        .lte('logical_date', end)
        .order('logical_date')
        .order('session_number');
    if (error) throw error;
    return data || [];
}

async function addRecord(record) {
    const { data, error } = await getDB()
        .from('sleep_records')
        .insert([record])
        .select();
    if (error) throw error;
    return data[0];
}

async function updateRecord(id, updates) {
    const { data, error } = await getDB()
        .from('sleep_records')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();
    if (error) throw error;
    return data[0];
}

async function deleteRecord(id) {
    const { error } = await getDB()
        .from('sleep_records')
        .delete()
        .eq('id', id);
    if (error) throw error;
}
