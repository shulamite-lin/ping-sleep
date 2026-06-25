async function initAuth() {
    const db = getDB();
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        const { error } = await db.auth.signInAnonymously();
        if (error) console.error('[Auth] signInAnonymously error:', error);
    }
}
