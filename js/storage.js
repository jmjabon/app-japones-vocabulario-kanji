const STORAGE_KEY = 'nihongo_app_state';

const defaultState = {
    version: 1,
    last_backup: Date.now(),
    progress: {
        unlocked_vocab_themes": ["v_tema_01"],
        unlocked_kanji_themes": ["k_tema_01"],
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