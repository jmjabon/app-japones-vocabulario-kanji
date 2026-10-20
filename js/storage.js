const STORAGE_KEY = 'nihongo_app_state';

const defaultState = {
    version: 1,
    last_backup: Date.now(),
    progress: {
        unlocked_vocab_themes: ["v_tema_01"],
        unlocked_kanji_themes: ["k_tema_01"],
        completed_checkpoints: []
    },
    leitner: {}
};

export const loadProgress = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : { ...defaultState };
    } catch (error) {
        console.error('Error loading state:', error);
        return { ...defaultState };
    }
};

export const saveProgress = (state) => {
    try {
        state.last_backup = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error('Error saving state. Storage might be full.', error);
    }
};

export const exportProgress = () => {
    const state = loadProgress();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `nihongo_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const importProgress = (file, onSuccess) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedState = JSON.parse(e.target.result);
            if (importedState.version && importedState.progress) {
                saveProgress(importedState);
                onSuccess();
            } else {
                alert('Archivo JSON no válido para esta aplicación.');
            }
        } catch (error) {
            alert('Error al leer el archivo. Asegúrate de que es un JSON válido.');
        }
    };
    reader.readAsText(file);
};

const STORAGE_KEY = 'nihongo_app_state';

const defaultState = {
    version: 1,
    last_backup: Date.now(),
    progress: {
        unlocked_vocab_themes: ["v_tema_01"],
        completed_vocab_themes: [], // NUEVO
        unlocked_kanji_themes: ["k_tema_01"],
        completed_kanji_themes: [], // NUEVO
        completed_checkpoints: []
    },
    leitner: {}
};

export const loadProgress = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        // Fusionamos por si el usuario tiene una versión antigua sin las nuevas claves
        return stored ? { ...defaultState, ...JSON.parse(stored), progress: { ...defaultState.progress, ...JSON.parse(stored).progress } } : { ...defaultState };
    } catch (error) {
        return { ...defaultState };
    }
};

export const saveProgress = (state) => {
    try {
        state.last_backup = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error('Error saving state.', error);
    }
};

// --- NUEVA LÓGICA DE PROGRESIÓN ---

export const markThemeCompleted = (type, currentThemeId, nextThemeId, items) => {
    const state = loadProgress();
    
    // 1. Marcar tema actual como completado
    const completedKey = `completed_${type}_themes`;
    if (!state.progress[completedKey].includes(currentThemeId)) {
        state.progress[completedKey].push(currentThemeId);
    }

    // 2. Desbloquear el siguiente tema
    if (nextThemeId) {
        const unlockedKey = `unlocked_${type}_themes`;
        if (!state.progress[unlockedKey].includes(nextThemeId)) {
            state.progress[unlockedKey].push(nextThemeId);
        }
    }

    // 3. Inyectar ítems nuevos en la Caja 1 del SRS (Leitner)
    items.forEach(item => {
        if (!state.leitner[item.id]) {
            state.leitner[item.id] = {
                box: 1,
                nextReview: Date.now() // Listo para el primer repaso de consolidación
            };
        }
    });

    saveProgress(state);
    return state; // Devolvemos el estado actualizado
};

// Exportaciones existentes (exportProgress e importProgress se mantienen igual...)
export const exportProgress = () => {
    const state = loadProgress();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nihongo_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const importProgress = (file, onSuccess) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedState = JSON.parse(e.target.result);
            if (importedState.version) {
                saveProgress(importedState);
                onSuccess();
            } else { alert('JSON no válido.'); }
        } catch (err) { alert('Error de lectura.'); }
    };
    reader.readAsText(file);
};