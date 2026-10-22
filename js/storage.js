export const loadProgress = () => {
    const defaultState = {
        progress: {
            completed_vocab_themes: [],
            unlocked_vocab_themes: [],
            completed_kanji_themes: [],
            unlocked_kanji_themes: []
        },
        leitner: {}
    };
    const saved = localStorage.getItem('kanjimaster_state');
    if (saved) {
        const parsed = JSON.parse(saved);
        // Seguro antiquiebres: Asegura que los arrays existan siempre
        if (!parsed.progress.unlocked_vocab_themes) parsed.progress.unlocked_vocab_themes = [];
        if (!parsed.progress.unlocked_kanji_themes) parsed.progress.unlocked_kanji_themes = [];
        if (!parsed.progress.completed_vocab_themes) parsed.progress.completed_vocab_themes = [];
        if (!parsed.progress.completed_kanji_themes) parsed.progress.completed_kanji_themes = [];
        return parsed;
    }
    return defaultState;
};

export const saveProgress = (state) => {
    localStorage.setItem('kanjimaster_state', JSON.stringify(state));
};

export const markThemeCompleted = (type, themeId, nextThemeId, items = []) => {
    const state = loadProgress();
    const compKey = `completed_${type}_themes`;
    const unlKey = `unlocked_${type}_themes`;

    // 1. Marca el tema actual como completado
    if (!state.progress[compKey].includes(themeId)) {
        state.progress[compKey].push(themeId);
    }

    // 2. Desbloquea el siguiente tema de forma segura
    const safeNextId = (nextThemeId !== "null" && nextThemeId !== null && nextThemeId !== undefined) ? nextThemeId : null;
    if (safeNextId && !state.progress[unlKey].includes(safeNextId)) {
        state.progress[unlKey].push(safeNextId);
    }

    // 3. Inyecta los ítems aprobados en la Caja 1 del SRS
    items.forEach(item => {
        if (!state.leitner[item.id]) {
            state.leitner[item.id] = { box: 1, nextReview: Date.now() };
        }
    });

    saveProgress(state);
    return state;
};

export const exportProgress = () => {
    const state = localStorage.getItem('kanjimaster_state');
    const blob = new Blob([state], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kanjimaster_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
};

export const importProgress = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const state = JSON.parse(e.target.result);
            if (state.progress) {
                localStorage.setItem('kanjimaster_state', JSON.stringify(state));
                alert('Progreso restaurado con éxito.');
                callback();
            } else alert('Archivo no válido.');
        } catch (err) {
            alert('Error al leer el archivo.');
        }
    };
    reader.readAsText(file);
};