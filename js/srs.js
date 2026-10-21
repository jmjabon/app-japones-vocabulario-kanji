import { loadProgress, saveProgress } from './storage.js';

// Intervalos clásicos de Leitner en milisegundos (1 día = 86,400,000 ms)
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const INTERVALS = {
    1: 0,                 // Inmediato (Sale en la próxima sesión)
    2: 1 * DAY_IN_MS,     // 1 día
    3: 3 * DAY_IN_MS,     // 3 días
    4: 7 * DAY_IN_MS,     // 7 días
    5: 21 * DAY_IN_MS     // 21 días (Asimilado a largo plazo)
};

// Obtiene la lista de IDs que caducan hoy
export const getDueItems = () => {
    const state = loadProgress();
    const now = Date.now();
    const dueItems = [];
    
    for (const [id, data] of Object.entries(state.leitner)) {
        if (now >= data.nextReview) {
            dueItems.push({ id, box: data.box });
        }
    }
    
    return dueItems;
};

// Procesa la respuesta de una tarjeta y actualiza la BBDD
export const processReview = (itemId, isCorrect) => {
    const state = loadProgress();
    if (!state.leitner[itemId]) return;

    let currentBox = state.leitner[itemId].box;

    if (isCorrect) {
        // Sube de caja si acierta, máximo hasta la caja 5
        currentBox = Math.min(currentBox + 1, 5);
    } else {
        // Castigo severo: si falla, vuelve a la caja 1 sin importar dónde estaba
        currentBox = 1;
    }

    // Guardar la nueva caja y calcular cuándo volverá a salir
    state.leitner[itemId] = {
        box: currentBox,
        nextReview: Date.now() + INTERVALS[currentBox]
    };

    saveProgress(state);
};