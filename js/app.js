import { loadProgress, exportProgress, importProgress, markThemeCompleted } from './storage.js';
import { getManifest, getVocabData, getKanjiData } from './dataService.js';
import { shuffleArray, getDistractors } from './utils.js';
import { playJapaneseAudio } from './audio.js';
import { getDueItems, processReview } from './srs.js';

let appState = null;
let manifestData = null;

const initUI = () => {
    lucide.createIcons();
};

const buildMasterDictionary = async () => {
    let vocabData = await getVocabData(manifestData.levels[0].vocab_file);
    let kanjiData = await getKanjiData(manifestData.levels[0].kanji_file);
    if (!Array.isArray(vocabData)) vocabData = [vocabData];
    if (!Array.isArray(kanjiData)) kanjiData = [kanjiData];

    const dict = {};
    vocabData.forEach(block => block.themes?.forEach(theme => theme.items?.forEach(item => dict[item.id] = { ...item, type: 'vocab', allItems: theme.items })));
    kanjiData.forEach(block => block.themes?.forEach(theme => theme.items?.forEach(item => dict[item.id] = { ...item, type: 'kanji', allItems: theme.items })));
    return dict;
};

// --- RENDERIZADORES GLOBALES (Optimizados para iPad) ---

const renderDashboard = () => {
    appState = loadProgress(); 
    const dueItems = getDueItems();
    const dueCount = dueItems.length;

    // Cálculo del progreso global
    const completedVocab = appState.progress.completed_vocab_themes.length;
    const completedKanji = appState.progress.completed_kanji_themes.length;
    const totalMastery = Math.min(100, Math.round(((completedVocab + completedKanji) / 6) * 100));

    document.getElementById('app-view').innerHTML = `
        <div class="w-full pt-4 pb-[calc(3rem+env(safe-area-inset-bottom))] animate-fade-in space-y-6">
            
            <!-- HEADER ESTILO APPS DE APPLE: Nivel activo + Barra de Maestría -->
            <header class="flex justify-between items-center px-1">
                <div class="flex items-center gap-3.5">
                    <div class="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm tracking-wider shadow-sm shadow-indigo-600/30">
                        N5
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h1 class="text-xl font-bold text-gray-900 tracking-tight">Kondo Japonés</h1>
                            <span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                        </div>
                        <p class="text-xs text-gray-400 font-medium">JLPT Inicial · ${totalMastery}% dominado</p>
                    </div>
                </div>
                
                <button id="btn-export-quick" class="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-600 flex items-center justify-center transition-all" title="Ajustes y Backup">
                    <i data-lucide="sliders-horizontal" class="w-5 h-5"></i>
                </button>
            </header>

            <!-- WIDGET SUPERIOR: Repaso Diario Leitner -->
            <section class="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 text-white p-7 rounded-[2rem] shadow-xl shadow-indigo-500/10 border border-indigo-400/20">
                <div class="absolute -right-6 -bottom-8 opacity-10 select-none text-9xl font-black font-serif pointer-events-none">
                    復
                </div>
                
                <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div class="space-y-1.5">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/15 text-indigo-100 backdrop-blur-md uppercase tracking-wider">
                            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Repaso Espaciado (SRS)
                        </span>
                        <h2 class="text-2xl font-bold tracking-tight text-white">Memoria a Largo Plazo</h2>
                        <p class="text-sm text-indigo-200 max-w-sm">Refuerza las tarjetas que tu cerebro está a punto de olvidar.</p>
                    </div>

                    <div class="flex items-center gap-3 w-full md:w-auto">
                        <button id="btn-start-srs" class="flex-1 md:flex-initial bg-white text-indigo-900 hover:bg-indigo-50 active:scale-95 transition-all px-6 py-3.5 rounded-2xl font-bold text-base shadow-sm flex items-center justify-center gap-3 ${dueCount === 0 ? 'opacity-85' : ''}">
                            <span class="w-2.5 h-2.5 rounded-full ${dueCount > 0 ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}"></span>
                            <span>${dueCount > 0 ? `Repasar (${dueCount})` : 'Al día'}</span>
                        </button>
                        <button id="btn-srs-stats" class="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all backdrop-blur-md" title="Ver Cajas de Memoria">
                            <i data-lucide="bar-chart-3" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>
            </section>

            <!-- RUTAS DE APRENDIZAJE: Vocabulario y Kanjis -->
            <section class="space-y-3">
                <div class="flex justify-between items-baseline px-1">
                    <h3 class="text-lg font-bold text-gray-900">Rutas de Estudio</h3>
                    <span class="text-xs font-semibold text-gray-400 uppercase tracking-widest">Temario Oficial</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    <!-- Tarjeta Vocabulario: Icono auténtico 'あ' (Hiragana) -->
                    <div id="btn-start-vocab" class="group relative overflow-hidden bg-white p-6 rounded-[2rem] border border-gray-200/80 shadow-sm hover:shadow-md hover:border-rose-200 active:scale-[0.99] transition-all cursor-pointer">
                        <div class="absolute right-4 -bottom-3 text-8xl font-black text-rose-500/[0.05] select-none font-serif group-hover:scale-105 transition-transform">
                            語
                        </div>
                        <div class="relative z-10 flex flex-col h-full justify-between gap-6">
                            <div class="flex items-start justify-between">
                                <!-- Badge auténtico de Hiragana / Vocabulario -->
                                <div class="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 font-serif font-black text-2xl shadow-sm">
                                    あ
                                </div>
                                <span class="px-3 py-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 group-hover:bg-rose-50 group-hover:text-rose-600 transition-colors">
                                    800 Palabras
                                </span>
                            </div>
                            <div>
                                <h4 class="text-xl font-bold text-gray-900 group-hover:text-rose-600 transition-colors">Vocabulario</h4>
                                <p class="text-sm text-gray-500 mt-1">Palabras en kana, katakana, expresiones y partículas esenciales.</p>
                            </div>
                        </div>
                    </div>

                    <!-- Tarjeta Kanjis: Icono auténtico '漢' (Kanji / Carácter) -->
                    <div id="btn-start-kanji" class="group relative overflow-hidden bg-white p-6 rounded-[2rem] border border-gray-200/80 shadow-sm hover:shadow-md hover:border-slate-300 active:scale-[0.99] transition-all cursor-pointer">
                        <div class="absolute right-4 -bottom-3 text-8xl font-black text-slate-800/[0.05] select-none font-serif group-hover:scale-105 transition-transform">
                            字
                        </div>
                        <div class="relative z-10 flex flex-col h-full justify-between gap-6">
                            <div class="flex items-start justify-between">
                                <!-- Badge auténtico de Kanji -->
                                <div class="w-14 h-14 rounded-2xl bg-slate-900 text-amber-300 border border-slate-800 flex items-center justify-center font-serif font-black text-2xl shadow-sm">
                                    漢
                                </div>
                                <span class="px-3 py-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 group-hover:bg-slate-100 group-hover:text-slate-900 transition-colors">
                                    100 Kanjis
                                </span>
                            </div>
                            <div>
                                <h4 class="text-xl font-bold text-gray-900 group-hover:text-slate-900 transition-colors">Kanjis</h4>
                                <p class="text-sm text-gray-500 mt-1">Despiece de radicales, forja visual y lectura en contexto (Jukugos).</p>
                            </div>
                        </div>
                    </div>

                </div>
            </section>

        </div>
    `;
    lucide.createIcons();

    if (dueCount > 0) document.getElementById('btn-start-srs').addEventListener('click', () => startSRSSession(dueItems));
    document.getElementById('btn-srs-stats').addEventListener('click', renderSRSStats);
    document.getElementById('btn-start-vocab').addEventListener('click', async () => renderBlockList(await getVocabData(manifestData.levels[0].vocab_file), 'vocab'));
    document.getElementById('btn-start-kanji').addEventListener('click', async () => renderBlockList(await getKanjiData(manifestData.levels[0].kanji_file), 'kanji'));
    document.getElementById('btn-export-quick')?.addEventListener('click', () => {
        document.getElementById('btn-export')?.click();
    });
};

const renderSRSStats = async () => {
    const state = loadProgress();
    const dict = await buildMasterDictionary();
    const boxes = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const box1Items = [];

    Object.keys(state.leitner).forEach(itemId => {
        const itemData = state.leitner[itemId];
        if(boxes[itemData.box] !== undefined) boxes[itemData.box]++;
        if(itemData.box === 1 && dict[itemId]) box1Items.push(dict[itemId]);
    });

    const box1Html = box1Items.length > 0 
        ? `<div class="mt-4 bg-white p-4 rounded-xl shadow-inner border border-red-100 max-h-48 overflow-y-auto">
            <p class="text-xs font-bold text-gray-500 uppercase mb-3">Palabras atascadas:</p>
            <div class="flex flex-wrap gap-2">
                ${box1Items.map(item => `<span class="bg-gray-100 text-gray-800 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200">${item.kanji || item.kana}</span>`).join('')}
            </div>
           </div>
           <button id="btn-train-mistakes" class="w-full bg-red-600 text-white py-4 rounded-xl font-bold shadow-md hover:bg-red-700 mt-4 text-lg transition-transform hover:scale-[1.02]"><i data-lucide="dumbbell" class="inline w-5 h-5 mr-2"></i> Entrenar Fallos</button>`
        : `<p class="text-sm text-green-600 mt-3 font-bold bg-green-50 p-3 rounded-lg"><i data-lucide="check-circle" class="inline w-5 h-5 mr-1"></i> ¡No tienes fallos pendientes en Caja 1!</p>`;

    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col gap-4 w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
            <button id="btn-back-dash" class="text-gray-500 flex items-center gap-1 self-start hover:text-indigo-600 transition-colors py-2"><i data-lucide="arrow-left" class="w-6 h-6"></i> Volver</button>
            <h2 class="text-3xl font-bold text-gray-800">Estado de Memoria</h2>
            <p class="text-base text-gray-500 mb-4">Así retiene la información tu cerebro a largo plazo.</p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-red-50 border border-red-200 p-6 rounded-2xl apple-shadow md:col-span-2">
                    <div class="flex justify-between items-center">
                        <span class="font-bold text-red-800 text-lg">Caja 1 (Fallos)</span>
                        <span class="bg-red-200 text-red-900 px-4 py-1.5 rounded-full font-bold text-lg">${boxes[1]}</span>
                    </div>
                    ${box1Html}
                </div>
                <div class="bg-orange-50 border border-orange-200 p-5 rounded-2xl flex justify-between items-center apple-shadow">
                    <span class="font-bold text-orange-800">Caja 2 (Corto plazo)</span><span class="bg-orange-200 text-orange-900 px-4 py-1.5 rounded-full font-bold">${boxes[2]}</span>
                </div>
                <div class="bg-yellow-50 border border-yellow-200 p-5 rounded-2xl flex justify-between items-center apple-shadow">
                    <span class="font-bold text-yellow-800">Caja 3 (Consolidando)</span><span class="bg-yellow-200 text-yellow-900 px-4 py-1.5 rounded-full font-bold">${boxes[3]}</span>
                </div>
                <div class="bg-blue-50 border border-blue-200 p-5 rounded-2xl flex justify-between items-center apple-shadow">
                    <span class="font-bold text-blue-800">Caja 4 (Medio plazo)</span><span class="bg-blue-200 text-blue-900 px-4 py-1.5 rounded-full font-bold">${boxes[4]}</span>
                </div>
                <div class="bg-green-50 border-2 border-green-300 p-5 rounded-2xl flex justify-between items-center apple-shadow md:col-span-2">
                    <span class="font-bold text-green-800 text-lg"><i data-lucide="award" class="inline w-6 h-6 mb-1 mr-1"></i> Caja 5 (Memoria a Largo Plazo)</span><span class="bg-green-500 text-white px-5 py-2 rounded-full font-bold text-lg">${boxes[5]}</span>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back-dash').addEventListener('click', renderDashboard);
    if(document.getElementById('btn-train-mistakes')) {
        document.getElementById('btn-train-mistakes').addEventListener('click', () => startMistakesReview(box1Items));
    }
};

const renderBlockList = (blocksData, type) => {
    // 1. Filtro de seguridad: ignora cualquier elemento suelto que no sea un bloque con 'themes'
    const validBlocks = blocksData.filter(b => b && Array.isArray(b.themes));
    const flatThemes = validBlocks.flatMap(b => b.themes);
    const isVocab = type === 'vocab';
    const unlockedKey = `unlocked_${type}_themes`;
    
    const html = validBlocks.map((block, index) => {
        const themesInBlock = block.themes.length;
        const completedInBlock = block.themes.filter(t => appState.progress[`completed_${type}_themes`]?.includes(t.theme_id)).length;
        const firstThemeId = block.themes[0]?.theme_id;
        
        // 2. REGLA DE DESBLOQUEO: La Unidad 1 (index === 0) SIEMPRE está desbloqueada por defecto
        const isUnlocked = index === 0 || (firstThemeId && appState.progress[unlockedKey]?.includes(firstThemeId));
        const isMastered = completedInBlock === themesInBlock && themesInBlock > 0;

        // Auto-reparación de progreso: asegura que el ID inicial esté registrado en localStorage
        if (index === 0 && firstThemeId && !appState.progress[unlockedKey]?.includes(firstThemeId)) {
            appState.progress[unlockedKey].push(firstThemeId);
            localStorage.setItem('kanjimaster_progress', JSON.stringify(appState.progress));
        }

        return `
            <div class="relative overflow-hidden bg-white border ${isUnlocked ? 'border-gray-200/80 hover:border-gray-300 active:scale-[0.99] cursor-pointer' : 'border-gray-100 bg-gray-50/50 opacity-60'} p-6 rounded-[1.75rem] transition-all block-card shadow-sm" data-index="${index}" data-unlocked="${isUnlocked}">
                <div class="flex items-center justify-between gap-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base ${isMastered ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : (isUnlocked ? (isVocab ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-indigo-50 text-indigo-600 border border-indigo-100') : 'bg-gray-100 text-gray-400')}">
                            ${index + 1}
                        </div>
                        <div>
                            <span class="text-[11px] font-bold uppercase tracking-wider text-gray-400">Unidad ${index + 1}</span>
                            <h3 class="font-bold text-lg text-gray-900 leading-snug">${block.block_title.replace(/^Bloque \d+:\s*/, '')}</h3>
                        </div>
                    </div>
                    <div>
                        ${isMastered ? '<div class="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><i data-lucide="check" class="w-5 h-5"></i></div>' : (isUnlocked ? '<div class="w-9 h-9 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center"><i data-lucide="chevron-right" class="w-5 h-5"></i></div>' : '<i data-lucide="lock" class="w-5 h-5 text-gray-400 mr-2"></i>')}
                    </div>
                </div>

                <div class="mt-5 flex items-center justify-between gap-4">
                    <div class="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div class="h-2 rounded-full ${isMastered ? 'bg-emerald-500' : (isVocab ? 'bg-rose-500' : 'bg-indigo-600')} transition-all" style="width: ${(completedInBlock / themesInBlock) * 100}%"></div>
                    </div>
                    <span class="text-xs font-semibold text-gray-400">${completedInBlock}/${themesInBlock} temas</span>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('app-view').innerHTML = `
        <div class="w-full pt-4 pb-[calc(3rem+env(safe-area-inset-bottom))] animate-fade-in space-y-6">
            <header class="flex items-center justify-between px-1">
                <button id="btn-back" class="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors py-2">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> Inicio
                </button>
                <span class="text-xs font-bold px-3 py-1 bg-gray-100 rounded-full text-gray-600 uppercase tracking-widest">${type}</span>
            </header>

            <div class="px-1">
                <h2 class="text-2xl font-bold text-gray-900 tracking-tight">${isVocab ? 'Unidades de Vocabulario' : 'Unidades de Kanji'}</h2>
                <p class="text-sm text-gray-500 mt-1">Completa cada tema con un 100% de aciertos para avanzar.</p>
            </div>

            <div class="space-y-3">
                ${html}
            </div>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back').addEventListener('click', renderDashboard);

    document.querySelectorAll('.block-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.currentTarget.getAttribute('data-unlocked') !== 'true') return alert('Unidad bloqueada. Completa las anteriores primero.');
            const ctx = { type, blocks: validBlocks, bIdx: parseInt(e.currentTarget.getAttribute('data-index')), flat: flatThemes };
            if(type === 'vocab') renderVocabThemeList(ctx);
            else renderKanjiThemeList(ctx);
        });
    });
};

const renderSuccessScreen = (type, currentTheme, itemsCount, backCallback) => {
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col items-center justify-center h-full w-full text-center px-4 animate-fade-in py-12">
            <div class="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mb-8 border-4 border-green-400 apple-shadow scale-110"><i data-lucide="award" class="w-16 h-16 text-green-600"></i></div>
            <h2 class="text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">¡Maestría Alcanzada!</h2>
            <p class="text-gray-600 mb-10 text-lg">Has superado el examen de "${currentTheme.theme_title}" con un 100%.</p>
            <div class="bg-blue-50 border border-blue-100 rounded-2xl p-6 w-full md:max-w-md mb-10 text-left flex items-start gap-5 apple-shadow">
                <i data-lucide="layers" class="w-8 h-8 text-blue-500 mt-1"></i>
                <div><p class="font-bold text-gray-900 text-lg">Tema Desbloqueado y Guardado</p><p class="text-sm text-gray-600 mt-1">${itemsCount} elementos inyectados en tu memoria SRS.</p></div>
            </div>
            <button id="btn-success-back" class="w-full md:max-w-md bg-gray-900 text-white py-5 rounded-2xl font-bold apple-shadow hover:bg-gray-800 transition-transform hover:-translate-y-1 text-xl">Continuar</button>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-success-back').addEventListener('click', backCallback);
};

const generateThemeListHtml = (ctx) => {
    return ctx.blocks[ctx.bIdx].themes.map((theme, index) => {
        const unlockedKey = `unlocked_${ctx.type}_themes`;
        const completedKey = `completed_${ctx.type}_themes`;
        const isUnlocked = appState.progress[unlockedKey].includes(theme.theme_id);
        const isCompleted = appState.progress[completedKey].includes(theme.theme_id);
        const isCheckpoint = theme.type === 'checkpoint';
        const flatIndex = ctx.flat.findIndex(t => t.theme_id === theme.theme_id);
        const nextThemeId = ctx.flat[flatIndex + 1] ? ctx.flat[flatIndex + 1].theme_id : null;
        
        let statusIcon = isCompleted ? (isCheckpoint ? '<i data-lucide="award" class="text-yellow-500 w-7 h-7"></i>' : '<i data-lucide="check-circle" class="text-green-500 w-7 h-7"></i>') 
                     : (isUnlocked ? (isCheckpoint ? '<i data-lucide="swords" class="text-red-500 animate-pulse w-7 h-7"></i>' : '<i data-lucide="unlock" class="text-blue-500 w-7 h-7"></i>') 
                     : '<i data-lucide="lock" class="text-gray-400 w-7 h-7"></i>');

        let borderClass = isCompleted ? (isCheckpoint ? 'border-yellow-500 bg-yellow-50' : 'border-green-500 bg-green-50') 
                        : (isUnlocked ? (isCheckpoint ? 'border-red-500 bg-red-50' : (ctx.type === 'vocab' ? 'border-primary bg-white hover:-translate-y-1 hover:shadow-md' : 'border-secondary bg-white hover:-translate-y-1 hover:shadow-md')) : 'border-gray-200 bg-gray-100 opacity-60');

        return `
            <div class="${borderClass} border-2 p-6 rounded-2xl transition-all cursor-pointer theme-card flex flex-col justify-center" data-flat-index="${flatIndex}" data-unlocked="${isUnlocked}" data-next="${nextThemeId}" data-checkpoint="${isCheckpoint}">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-xl leading-tight ${isCheckpoint && !isCompleted && isUnlocked ? 'text-red-700' : 'text-gray-800'}">${theme.theme_title}</h3>
                    <div class="ml-4">${statusIcon}</div>
                </div>
                <p class="text-sm text-gray-500 font-medium">${isCheckpoint ? 'Examen de control' : `${theme.items?.length || 0} elementos`}</p>
            </div>
        `;
    }).join('');
};

// --- MOTOR SRS Y CHECKPOINTS ---

const startSRSSession = async (dueItemsIds) => {
    const dict = await buildMasterDictionary();
    const sessionQueue = shuffleArray(dueItemsIds.map(due => dict[due.id]).filter(item => item !== undefined));
    let currentIndex = 0;

    const showReviewCard = () => {
        if (currentIndex >= sessionQueue.length) {
            alert("¡Sesión de repaso terminada!");
            return renderDashboard();
        }
        const item = sessionQueue[currentIndex];
        const targetDisplay = item.kanji || item.kana;
        const correctAnswer = item.meaning;
        const options = shuffleArray([correctAnswer, ...getDistractors(item, item.allItems, 'meaning', 3)]);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <div class="flex justify-between items-center text-gray-500 font-bold mb-8 px-2">
                    <span class="bg-indigo-100 text-indigo-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">Repaso Oficial</span>
                    <span class="text-sm bg-gray-100 px-3 py-1 rounded-full">${currentIndex + 1} / ${sessionQueue.length}</span>
                    <button id="btn-quit" class="hover:text-indigo-600 transition-colors p-2"><i data-lucide="x" class="w-6 h-6"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center text-center mb-10 gap-6">
                    <p class="text-gray-400 text-sm font-bold uppercase tracking-widest">${item.type === 'kanji' ? 'Significado' : 'Traducción'}</p>
                    <div class="text-8xl md:text-9xl font-bold text-gray-800 drop-shadow-sm mb-4 tracking-wider">${targetDisplay}</div>
                    ${item.type === 'vocab' && item.kana ? `<button id="btn-audio" class="p-5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 shadow-sm transition-transform hover:scale-105 active:scale-95"><i data-lucide="volume-2" class="w-8 h-8"></i></button>` : ''}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="options-container">
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 py-6 px-6 rounded-2xl font-bold text-xl text-gray-700 hover:border-indigo-500 hover:text-indigo-600 transition-colors apple-shadow text-center md:text-left active:bg-gray-50" data-answer="${opt}">${opt}</button>`).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', renderDashboard);
        if (item.type === 'vocab' && item.kana) {
            document.getElementById('btn-audio').addEventListener('click', () => playJapaneseAudio(item.kana));
        }

        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const isCorrect = e.currentTarget.getAttribute('data-answer') === correctAnswer;
                optionButtons.forEach(b => b.disabled = true);
                if (isCorrect) e.currentTarget.classList.add('bg-green-100', 'border-green-500', 'text-green-800');
                else {
                    e.currentTarget.classList.add('bg-red-100', 'border-red-500', 'text-red-800');
                    Array.from(optionButtons).find(b => b.getAttribute('data-answer') === correctAnswer).classList.add('bg-green-100', 'border-green-500', 'text-green-800');
                }
                processReview(item.id, isCorrect);
                setTimeout(() => { currentIndex++; showReviewCard(); }, 1200);
            });
        });
    };
    showReviewCard();
};

const startMistakesReview = (box1Items) => {
    let queue = shuffleArray([...box1Items]);
    let currentIndex = 0;

    const showCard = () => {
        if(currentIndex >= queue.length) {
            if(confirm("Vuelta completada. ¿Quieres hacer otra ronda con estos mismos fallos?")) {
                currentIndex = 0; queue = shuffleArray([...box1Items]); return showCard();
            } else return renderSRSStats();
        }
        
        const item = queue[currentIndex];
        let flipped = false;

        const renderState = () => {
            document.getElementById('app-view').innerHTML = `
                <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
                    <div class="flex justify-between items-center text-gray-500 font-bold mb-8 px-2">
                        <span class="bg-red-100 text-red-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">Entrenando Fallos</span>
                        <span class="text-sm bg-gray-100 px-3 py-1 rounded-full">${currentIndex + 1} / ${queue.length}</span>
                        <button id="btn-quit" class="hover:text-primary p-2"><i data-lucide="x" class="w-6 h-6"></i></button>
                    </div>
                    
                    <div id="flashcard" class="flex-grow flex flex-col items-center justify-center text-center gap-8 cursor-pointer bg-white border-2 ${flipped ? 'border-indigo-400' : 'border-gray-200'} rounded-3xl apple-shadow p-8 mb-8 hover:bg-gray-50 transition-all active:scale-[0.98]">
                        <p class="text-gray-400 font-bold uppercase tracking-widest text-sm flex items-center gap-2"><i data-lucide="hand" class="w-4 h-4"></i> ${flipped ? 'Solución revelada' : 'Toca la tarjeta para revelar'}</p>
                        ${flipped && item.kana ? `<p class="text-2xl text-gray-500 font-medium">${item.kana}</p>` : ''}
                        <h2 class="text-8xl md:text-9xl font-bold text-gray-900 tracking-wider">${item.kanji || item.kana}</h2>
                        ${flipped ? `<div class="bg-indigo-50 text-indigo-700 font-bold text-3xl py-4 px-8 rounded-2xl border border-indigo-200 mt-6 w-full shadow-inner">${item.meaning}</div>` : ''}
                    </div>

                    ${flipped ? `<button id="btn-next" class="w-full bg-gray-900 text-white py-6 rounded-2xl font-bold apple-shadow hover:bg-gray-800 flex justify-center gap-2 text-xl transition-transform hover:-translate-y-1">Siguiente <i data-lucide="arrow-right" class="w-6 h-6"></i></button>` : ''}
                </div>
            `;
            lucide.createIcons();
            document.getElementById('btn-quit').addEventListener('click', renderSRSStats);
            
            if(!flipped) {
                document.getElementById('flashcard').addEventListener('click', () => {
                    flipped = true;
                    if(item.kana) playJapaneseAudio(item.kana);
                    renderState();
                });
            } else {
                document.getElementById('btn-next').addEventListener('click', () => { currentIndex++; showCard(); });
            }
        };
        renderState();
    };
    showCard();
};

const startCheckpoint = (checkpointData, flatIndex, ctx) => {
    const numThemesRequired = checkpointData.requires_count || 2;
    const themesToTest = ctx.flat.slice(flatIndex - numThemesRequired, flatIndex);
    let questionPool = [];
    themesToTest.forEach(theme => theme.items?.forEach(item => questionPool.push({ ...item, sourceThemeId: theme.theme_id, sourceThemeTitle: theme.theme_title, allItems: theme.items })));

    const examQuestions = shuffleArray(questionPool).slice(0, 20);
    let questionIndex = 0;
    const stats = {};
    themesToTest.forEach(t => stats[t.theme_id] = { title: t.theme_title, total: 0, correct: 0 });

    const showExamQuestion = () => {
        if (questionIndex >= examQuestions.length) return renderCheckpointResults();

        const item = examQuestions[questionIndex];
        const targetDisplay = item.kanji || item.kana;
        const options = shuffleArray([item.meaning, ...getDistractors(item, item.allItems, 'meaning', 3)]);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <div class="flex justify-between items-center text-red-600 font-bold mb-8 px-2">
                    <span class="bg-red-100 text-red-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border border-red-200"><i data-lucide="swords" class="w-4 h-4 inline mr-1"></i> Examen de Control</span>
                    <span class="text-sm bg-gray-100 px-3 py-1 rounded-full text-gray-600">${questionIndex + 1} / ${examQuestions.length}</span>
                    <button id="btn-quit" class="hover:text-red-800 p-2"><i data-lucide="x" class="w-6 h-6"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center text-center mb-10 gap-6">
                    <div class="text-8xl md:text-9xl font-bold text-gray-900 drop-shadow-sm tracking-wider">${targetDisplay}</div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="options-container">
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 py-6 px-6 rounded-2xl font-bold text-xl text-gray-700 hover:border-red-500 hover:text-red-600 transition-colors apple-shadow active:bg-gray-50 text-center md:text-left" data-answer="${opt}">${opt}</button>`).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => ctx.type === 'vocab' ? renderVocabThemeList(ctx) : renderKanjiThemeList(ctx));

        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => btn.addEventListener('click', (e) => {
            const isCorrect = e.currentTarget.getAttribute('data-answer') === item.meaning;
            optionButtons.forEach(b => b.disabled = true);
            stats[item.sourceThemeId].total += 1;
            if (isCorrect) {
                stats[item.sourceThemeId].correct += 1;
                e.currentTarget.classList.add('bg-green-100', 'border-green-500', 'text-green-800');
            } else {
                e.currentTarget.classList.add('bg-red-100', 'border-red-500', 'text-red-800');
                Array.from(optionButtons).find(b => b.getAttribute('data-answer') === item.meaning).classList.add('bg-green-100', 'border-green-500');
            }
            setTimeout(() => { questionIndex++; showExamQuestion(); }, 1200);
        }));
    };

    const renderCheckpointResults = () => {
        let totalQuestions = 0, totalCorrect = 0, diagnosticsHtml = '';
        Object.values(stats).forEach(themeStat => {
            if (themeStat.total === 0) return;
            totalQuestions += themeStat.total; totalCorrect += themeStat.correct;
            const pct = Math.round((themeStat.correct / themeStat.total) * 100);
            diagnosticsHtml += `<div class="flex justify-between items-center mb-3 border-b border-gray-100 pb-3"><span class="text-base font-bold text-gray-700">${themeStat.title}</span><span class="text-base px-3 py-1 rounded-full ${pct < 80 ? 'bg-red-100 text-red-700 font-bold' : 'bg-green-100 text-green-700 font-bold'}">${pct}%</span></div>`;
        });
        const finalScore = Math.round((totalCorrect / totalQuestions) * 100);
        const passed = finalScore >= 80;

        if (passed) appState = markThemeCompleted(ctx.type, checkpointData.theme_id, ctx.flat[flatIndex + 1] ? ctx.flat[flatIndex + 1].theme_id : null, []);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col items-center justify-center h-full w-full text-center px-4 pt-10 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <div class="w-32 h-32 ${passed ? 'bg-green-100 border-green-400 text-green-600' : 'bg-red-100 border-red-400 text-red-600'} rounded-full flex items-center justify-center mb-6 border-4 apple-shadow scale-110"><i data-lucide="${passed ? 'trophy' : 'alert-triangle'}" class="w-16 h-16"></i></div>
                <h2 class="text-4xl font-extrabold text-gray-900 mb-2">${passed ? '¡Prueba Superada!' : 'Prueba Fallida'}</h2>
                <p class="text-gray-500 font-bold mb-8 text-xl">Nota Final: ${finalScore}%</p>
                <div class="bg-white border border-gray-200 rounded-3xl p-8 w-full md:max-w-xl mb-10 text-left apple-shadow">
                    <h4 class="font-bold text-gray-800 mb-6 uppercase text-sm tracking-widest border-b pb-2">Diagnóstico por Temas</h4>
                    ${diagnosticsHtml}
                    ${!passed ? '<p class="text-sm text-red-700 mt-6 font-bold bg-red-50 p-4 rounded-xl flex items-center gap-2"><i data-lucide="info" class="w-5 h-5"></i> Necesitas un 80% mínimo para avanzar.</p>' : ''}
                </div>
                <button id="btn-success-back" class="w-full md:max-w-xl bg-gray-900 text-white py-5 rounded-2xl font-bold apple-shadow hover:bg-gray-800 transition-transform hover:-translate-y-1 text-xl">Volver al Menú</button>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-success-back').addEventListener('click', () => ctx.type === 'vocab' ? renderVocabThemeList(ctx) : renderKanjiThemeList(ctx));
    };

    showExamQuestion();
};

// --- MÓDULO VOCABULARIO ---

const renderVocabThemeList = (ctx) => {
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col gap-5 w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
            <button id="btn-back-blocks" class="text-gray-500 flex items-center gap-1 self-start mb-2 py-2 hover:text-indigo-600 transition-colors"><i data-lucide="arrow-left" class="w-6 h-6"></i> Volver a Bloques</button>
            <h2 class="text-3xl font-extrabold text-gray-800 mb-3">${ctx.blocks[ctx.bIdx].block_title}</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${generateThemeListHtml(ctx)}
            </div>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back-blocks').addEventListener('click', () => renderBlockList(ctx.blocks, 'vocab'));
    
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.currentTarget.getAttribute('data-unlocked') !== 'true') return alert('Desbloquea primero el tema anterior.');
            const flatIndex = parseInt(e.currentTarget.getAttribute('data-flat-index'));
            const isCp = e.currentTarget.getAttribute('data-checkpoint') === 'true';
            if (isCp) startCheckpoint(ctx.flat[flatIndex], flatIndex, ctx); 
            else renderVocabSubmenu(ctx.flat[flatIndex], e.currentTarget.getAttribute('data-next'), ctx);
        });
    });
};

const renderVocabSubmenu = (vocabTheme, nextThemeId, ctx) => {
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
            <button id="btn-back-submenu" class="text-gray-500 flex items-center gap-1 self-start mb-6 py-2 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-6 h-6"></i> Volver a temas</button>
            <h2 class="text-3xl font-extrabold text-gray-900 mb-2">${vocabTheme.theme_title}</h2>
            <p class="text-gray-500 mb-8 text-base">Entrena libremente. Supera el Examen al 100% para guardar progreso.</p>
            
            <h3 class="font-bold text-gray-400 uppercase tracking-widest text-sm mb-4">Entrenamiento Libre</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                <button id="btn-v-study" class="bg-white border-2 border-gray-100 p-5 rounded-2xl apple-shadow hover:border-primary transition-all flex items-center gap-5 text-left active:scale-95">
                    <div class="bg-blue-100 text-blue-600 p-4 rounded-2xl"><i data-lucide="book-open" class="w-6 h-6"></i></div>
                    <div><h3 class="font-bold text-gray-900 text-lg">Flashcards</h3><p class="text-sm text-gray-500">Aprende sin presión.</p></div>
                </button>
                <button id="btn-v-listen" class="bg-white border-2 border-gray-100 p-5 rounded-2xl apple-shadow hover:border-primary transition-all flex items-center gap-5 text-left active:scale-95">
                    <div class="bg-purple-100 text-purple-600 p-4 rounded-2xl"><i data-lucide="headphones" class="w-6 h-6"></i></div>
                    <div><h3 class="font-bold text-gray-900 text-lg">Oído (Listening)</h3><p class="text-sm text-gray-500">Escucha y traduce.</p></div>
                </button>
                <button id="btn-v-inverse" class="bg-white border-2 border-gray-100 p-5 rounded-2xl apple-shadow hover:border-primary transition-all flex items-center gap-5 text-left active:scale-95">
                    <div class="bg-orange-100 text-orange-600 p-4 rounded-2xl"><i data-lucide="arrow-left-right" class="w-6 h-6"></i></div>
                    <div><h3 class="font-bold text-gray-900 text-lg">Inversa</h3><p class="text-sm text-gray-500">Español -> Japonés.</p></div>
                </button>
                <button id="btn-v-read" class="bg-white border-2 border-gray-100 p-5 rounded-2xl apple-shadow hover:border-primary transition-all flex items-center gap-5 text-left active:scale-95">
                    <div class="bg-green-100 text-green-600 p-4 rounded-2xl"><i data-lucide="eye" class="w-6 h-6"></i></div>
                    <div><h3 class="font-bold text-gray-900 text-lg">Lectura Rápida</h3><p class="text-sm text-gray-500">Japonés -> Español.</p></div>
                </button>
            </div>

            <h3 class="font-bold text-red-400 uppercase tracking-widest text-sm mb-4">Evaluación</h3>
            <button id="btn-v-exam" class="bg-red-50 border-2 border-red-500 p-6 rounded-2xl apple-shadow hover:bg-red-100 transition-all flex items-center gap-5 text-left md:w-1/2 active:scale-95">
                <div class="bg-red-500 text-white p-4 rounded-2xl"><i data-lucide="award" class="w-6 h-6"></i></div>
                <div><h3 class="font-bold text-red-900 text-xl">Examen del Tema</h3><p class="text-sm text-red-700">Requiere 100% aciertos.</p></div>
            </button>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back-submenu').addEventListener('click', () => renderVocabThemeList(ctx));
    document.getElementById('btn-v-study').addEventListener('click', () => startVocabStudy(vocabTheme, ctx));
    document.getElementById('btn-v-listen').addEventListener('click', () => startVocabPractice('listening', vocabTheme, ctx));
    document.getElementById('btn-v-inverse').addEventListener('click', () => startVocabPractice('inverse', vocabTheme, ctx));
    document.getElementById('btn-v-read').addEventListener('click', () => startVocabPractice('reading', vocabTheme, ctx));
    document.getElementById('btn-v-exam').addEventListener('click', () => startVocabExam(vocabTheme, nextThemeId, ctx));
};

const startVocabStudy = (vocabTheme, ctx) => {
    let currentIndex = 0;
    const showCard = () => {
        if(currentIndex >= vocabTheme.items.length) {
            alert("¡Repaso terminado! Listo para el gimnasio.");
            return renderVocabSubmenu(vocabTheme, null, ctx);
        }
        const item = vocabTheme.items[currentIndex];
        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
                <div class="flex justify-between text-gray-500 font-bold mb-6 px-2">
                    <span class="bg-blue-100 text-blue-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">Estudio Libre</span>
                    <button id="btn-quit" class="hover:text-primary p-2"><i data-lucide="x" class="w-6 h-6"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center gap-6 mb-10 text-center">
                    <p class="text-gray-400 font-bold tracking-widest text-lg">${item.kana}</p>
                    <h2 class="text-8xl md:text-9xl font-bold text-gray-900 tracking-wider">${item.kanji || item.kana}</h2>
                    <div class="bg-blue-50 text-blue-700 font-bold text-2xl py-3 px-8 rounded-2xl border border-blue-200 mt-4">${item.meaning}</div>
                    
                    <!-- Botón de audio explícito para Safari iOS -->
                    <button id="btn-audio" class="mt-8 p-6 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 apple-shadow transition-transform hover:scale-110 active:scale-95 flex flex-col items-center gap-2">
                        <i data-lucide="volume-2" class="w-10 h-10 text-blue-600"></i>
                    </button>
                    <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2">Toca para escuchar</p>
                </div>
                <button id="btn-next" class="w-full md:max-w-md mx-auto bg-gray-900 text-white py-6 rounded-2xl font-bold apple-shadow hover:bg-gray-800 flex justify-center items-center gap-3 text-xl transition-transform hover:-translate-y-1">Siguiente <i data-lucide="arrow-right" class="w-6 h-6"></i></button>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => renderVocabSubmenu(vocabTheme, null, ctx));
        document.getElementById('btn-audio').addEventListener('click', () => playJapaneseAudio(item.kana));
        document.getElementById('btn-next').addEventListener('click', () => { currentIndex++; showCard(); });
    };
    showCard();
};

const startVocabPractice = (mode, vocabTheme, ctx) => {
    const exerciseItems = shuffleArray(vocabTheme.items);
    let currentIndex = 0;

    const showQuestion = () => {
        if(currentIndex >= exerciseItems.length) {
            alert("¡Entrenamiento completado!"); return renderVocabSubmenu(vocabTheme, null, ctx);
        }

        const item = exerciseItems[currentIndex];
        let correct = '', options = [], topHtml = '';

        if(mode === 'listening') {
            correct = item.meaning; options = shuffleArray([correct, ...getDistractors(item, vocabTheme.items, 'meaning', 3)]);
            topHtml = `
                <button id="btn-audio-q" class="p-8 bg-purple-100 text-purple-600 rounded-full apple-shadow animate-pulse mb-6 hover:scale-105 active:scale-95 transition-transform"><i data-lucide="volume-2" class="w-12 h-12"></i></button>
                <p class="text-gray-500 font-bold uppercase tracking-widest text-sm flex items-center gap-2"><i data-lucide="hand" class="w-4 h-4"></i> Toca para escuchar</p>
            `;
        } else if (mode === 'inverse') {
            correct = item.kanji || item.kana; options = shuffleArray([correct, ...getDistractors(item, vocabTheme.items, item.kanji ? 'kanji' : 'kana', 3)]);
            topHtml = `<p class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Traduce al Japonés</p><h2 class="text-5xl md:text-6xl font-bold text-gray-900 text-center leading-tight px-4">${item.meaning}</h2>`;
        } else if (mode === 'reading') {
            correct = item.meaning; options = shuffleArray([correct, ...getDistractors(item, vocabTheme.items, 'meaning', 3)]);
            topHtml = `
                <p class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Traduce al Español</p>
                <h2 class="text-7xl md:text-8xl font-bold text-gray-900 text-center tracking-widest mb-4">${item.kanji || item.kana}</h2>
                <button id="btn-audio-q" class="p-4 bg-gray-100 text-gray-600 rounded-full apple-shadow active:scale-95"><i data-lucide="volume-2" class="w-6 h-6 text-blue-600"></i></button>
            `;
        }

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
                <div class="flex justify-between items-center text-gray-500 font-bold mb-8 px-2">
                    <span class="bg-gray-200 text-gray-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">Entrenamiento</span>
                    <button id="btn-quit" class="hover:text-primary p-2"><i data-lucide="x" class="w-6 h-6"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center mb-10">${topHtml}</div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="options-container">
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 py-6 px-6 rounded-2xl font-bold text-gray-800 hover:border-primary hover:text-primary text-center md:text-left text-xl apple-shadow active:bg-gray-50" data-answer="${opt}">${opt}</button>`).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => renderVocabSubmenu(vocabTheme, null, ctx));
        if(document.getElementById('btn-audio-q')) document.getElementById('btn-audio-q').addEventListener('click', () => playJapaneseAudio(item.kana));

        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => btn.addEventListener('click', (e) => {
            const ans = e.target.getAttribute('data-answer');
            optionButtons.forEach(b => b.disabled = true);
            if (ans === correct) {
                e.target.classList.add('bg-green-100', 'border-green-500', 'text-green-800');
                if(mode !== 'listening') playJapaneseAudio(item.kana);
            } else {
                e.target.classList.add('bg-red-100', 'border-red-500', 'text-red-800');
                Array.from(optionButtons).find(b => b.getAttribute('data-answer') === correct).classList.add('bg-green-100', 'border-green-500');
            }
            setTimeout(() => { currentIndex++; showQuestion(); }, 1200);
        }));
    };
    showQuestion();
};

const startVocabExam = (vocabTheme, nextThemeId, ctx) => {
    const exerciseItems = shuffleArray([...vocabTheme.items, ...vocabTheme.items]); 
    let currentIndex = 0, mistakes = 0;

    const showQuestion = () => {
        if(currentIndex >= exerciseItems.length) {
            if(mistakes === 0) {
                appState = markThemeCompleted('vocab', vocabTheme.theme_id, nextThemeId !== "null" && nextThemeId !== null ? nextThemeId : null, vocabTheme.items);
                return renderSuccessScreen('vocab', vocabTheme, vocabTheme.items.length, () => renderVocabThemeList(ctx));
            } else {
                alert(`Has fallado ${mistakes} pregunta(s). Necesitas un 100% de aciertos para superar el tema. ¡Sigue entrenando!`);
                return renderVocabSubmenu(vocabTheme, nextThemeId, ctx);
            }
        }

        const item = exerciseItems[currentIndex];
        const isInverse = currentIndex % 2 !== 0; 
        const correct = isInverse ? (item.kanji || item.kana) : item.meaning;
        const options = shuffleArray([correct, ...getDistractors(item, vocabTheme.items, isInverse ? (item.kanji ? 'kanji' : 'kana') : 'meaning', 3)]);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
                <div class="flex justify-between items-center text-red-500 font-bold mb-8 px-2">
                    <span class="bg-red-100 text-red-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide"><i data-lucide="swords" class="inline w-4 h-4 mr-1"></i> Examen Oficial</span>
                    <span class="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">${currentIndex + 1} / ${exerciseItems.length}</span>
                    <button id="btn-quit" class="hover:text-red-700 p-2"><i data-lucide="x" class="w-6 h-6"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center mb-10 text-center">
                    <p class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">${isInverse ? 'Traduce al Japonés' : 'Traduce al Español'}</p>
                    <h2 class="${isInverse ? 'text-5xl md:text-6xl px-4' : 'text-7xl md:text-8xl tracking-widest'} font-bold text-gray-900 leading-tight">${isInverse ? item.meaning : (item.kanji || item.kana)}</h2>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="options-container">
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 py-6 px-6 rounded-2xl font-bold text-gray-800 hover:border-red-500 hover:text-red-600 text-center md:text-left text-xl apple-shadow active:bg-gray-50" data-answer="${opt}">${opt}</button>`).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => renderVocabSubmenu(vocabTheme, nextThemeId, ctx));
        
        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => btn.addEventListener('click', (e) => {
            const ans = e.target.getAttribute('data-answer');
            optionButtons.forEach(b => b.disabled = true);
            if (ans === correct) e.target.classList.add('bg-green-100', 'border-green-500', 'text-green-800');
            else {
                mistakes++;
                e.target.classList.add('bg-red-100', 'border-red-500', 'text-red-800');
                Array.from(optionButtons).find(b => b.getAttribute('data-answer') === correct).classList.add('bg-green-100', 'border-green-500');
            }
            setTimeout(() => { currentIndex++; showQuestion(); }, 1200);
        }));
    };
    showQuestion();
};

// --- MÓDULO KANJI ---

const renderKanjiThemeList = (ctx) => {
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col gap-5 w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
            <button id="btn-back-blocks" class="text-gray-500 flex items-center gap-1 self-start mb-2 py-2 hover:text-indigo-600 transition-colors"><i data-lucide="arrow-left" class="w-6 h-6"></i> Volver a Bloques</button>
            <h2 class="text-3xl font-extrabold text-gray-800 mb-3">${ctx.blocks[ctx.bIdx].block_title}</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${generateThemeListHtml(ctx)}
            </div>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back-blocks').addEventListener('click', () => renderBlockList(ctx.blocks, 'kanji'));
    
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.currentTarget.getAttribute('data-unlocked') !== 'true') return alert('Desbloquea primero el tema anterior.');
            const flatIndex = parseInt(e.currentTarget.getAttribute('data-flat-index'));
            const isCp = e.currentTarget.getAttribute('data-checkpoint') === 'true';
            if (isCp) startCheckpoint(ctx.flat[flatIndex], flatIndex, ctx);
            else renderKanjiSubmenu(ctx.flat[flatIndex], e.currentTarget.getAttribute('data-next'), ctx);
        });
    });
};

const renderKanjiSubmenu = (kanjiTheme, nextThemeId, ctx) => {
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
            <button id="btn-back-submenu" class="text-gray-500 flex items-center gap-1 self-start mb-6 py-2 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-6 h-6"></i> Volver a temas</button>
            <h2 class="text-3xl font-extrabold text-gray-900 mb-2">${kanjiTheme.theme_title}</h2>
            <p class="text-gray-500 mb-8 text-base">Entrena libremente. Supera el Examen al 100% para avanzar.</p>
            
            <h3 class="font-bold text-gray-400 uppercase tracking-widest text-sm mb-4">Zona de Entrenamiento</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                <button id="btn-k-gallery" class="bg-white border-2 border-gray-100 p-5 rounded-2xl apple-shadow hover:border-secondary transition-all flex items-center gap-5 text-left active:scale-95">
                    <div class="bg-blue-100 text-blue-600 p-4 rounded-2xl"><i data-lucide="book-open" class="w-6 h-6"></i></div>
                    <div><h3 class="font-bold text-gray-900 text-lg">Galería</h3><p class="text-sm text-gray-500">Mnemotecnias y trazos.</p></div>
                </button>
                <button id="btn-k-despiece" class="bg-white border-2 border-gray-100 p-5 rounded-2xl apple-shadow hover:border-secondary transition-all flex items-center gap-5 text-left active:scale-95">
                    <div class="bg-purple-100 text-purple-600 p-4 rounded-2xl"><i data-lucide="scissors" class="w-6 h-6"></i></div>
                    <div><h3 class="font-bold text-gray-900 text-lg">Despiece</h3><p class="text-sm text-gray-500">Separa en radicales.</p></div>
                </button>
                <button id="btn-k-forja" class="bg-white border-2 border-gray-100 p-5 rounded-2xl apple-shadow hover:border-secondary transition-all flex items-center gap-5 text-left active:scale-95">
                    <div class="bg-orange-100 text-orange-600 p-4 rounded-2xl"><i data-lucide="hammer" class="w-6 h-6"></i></div>
                    <div><h3 class="font-bold text-gray-900 text-lg">Forja</h3><p class="text-sm text-gray-500">Construye desde cero.</p></div>
                </button>
                <button id="btn-k-jukugo" class="bg-white border-2 border-gray-100 p-5 rounded-2xl apple-shadow hover:border-secondary transition-all flex items-center gap-5 text-left active:scale-95">
                    <div class="bg-indigo-100 text-indigo-600 p-4 rounded-2xl"><i data-lucide="message-circle" class="w-6 h-6"></i></div>
                    <div><h3 class="font-bold text-gray-900 text-lg">Jukugos</h3><p class="text-sm text-gray-500">Palabras y lecturas.</p></div>
                </button>
            </div>

            <h3 class="font-bold text-red-400 uppercase tracking-widest text-sm mb-4">Evaluación</h3>
            <button id="btn-k-exam" class="bg-red-50 border-2 border-red-500 p-6 rounded-2xl apple-shadow hover:bg-red-100 transition-all flex items-center gap-5 text-left md:w-1/2 active:scale-95">
                <div class="bg-red-500 text-white p-4 rounded-2xl"><i data-lucide="award" class="w-6 h-6"></i></div>
                <div><h3 class="font-bold text-red-900 text-xl">Examen del Tema</h3><p class="text-sm text-red-700">Requiere 100% aciertos.</p></div>
            </button>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back-submenu').addEventListener('click', () => renderKanjiThemeList(ctx));
    document.getElementById('btn-k-gallery').addEventListener('click', () => startKanjiGallery(kanjiTheme, ctx));
    document.getElementById('btn-k-despiece').addEventListener('click', () => startKanjiPuzzle(kanjiTheme, ctx, 1));
    document.getElementById('btn-k-forja').addEventListener('click', () => startKanjiPuzzle(kanjiTheme, ctx, 2));
    document.getElementById('btn-k-jukugo').addEventListener('click', () => startKanjiJukugo(kanjiTheme, ctx));
    document.getElementById('btn-k-exam').addEventListener('click', () => startKanjiExam(kanjiTheme, nextThemeId, ctx));
};

const startKanjiGallery = (kanjiTheme, ctx) => {
    let currentIndex = 0;
    const showCard = () => {
        if(currentIndex >= kanjiTheme.items.length) { alert("Galería terminada."); return renderKanjiSubmenu(kanjiTheme, null, ctx); }
        const item = kanjiTheme.items[currentIndex];
        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
                <div class="flex justify-between items-center text-gray-500 font-bold mb-6 px-2">
                    <span class="bg-blue-100 text-blue-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">Galería</span>
                    <button id="btn-quit" class="hover:text-primary p-2"><i data-lucide="x" class="w-6 h-6"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center gap-6 mb-10 text-center">
                    <h2 class="text-9xl font-bold text-gray-900 tracking-wider">${item.kanji}</h2>
                    <div class="bg-secondary text-white font-bold text-2xl py-3 px-8 rounded-2xl apple-shadow mt-4">${item.meaning}</div>
                    
                    <div class="w-full md:max-w-md bg-gray-50 border border-gray-200 p-6 rounded-3xl text-left apple-shadow mt-6">
                        <p class="text-xs font-bold text-gray-500 uppercase mb-2 tracking-widest">Mnemotecnia</p>
                        <p class="text-base text-gray-800 italic leading-relaxed">"${item.mnemonic}"</p>
                        <div class="mt-5 flex gap-3 justify-center items-center">
                            ${item.radicals.map(r => `<span class="bg-white border-2 border-gray-200 px-4 py-2 rounded-xl text-2xl font-bold text-gray-700">${r}</span>`).join('<span class="text-gray-400 font-bold">+</span>')}
                        </div>
                    </div>
                </div>
                <button id="btn-next" class="w-full md:max-w-md mx-auto bg-gray-900 text-white py-6 rounded-2xl font-bold apple-shadow hover:bg-gray-800 flex justify-center items-center gap-2 text-xl transition-transform hover:-translate-y-1">Siguiente <i data-lucide="arrow-right" class="w-6 h-6"></i></button>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => renderKanjiSubmenu(kanjiTheme, null, ctx));
        document.getElementById('btn-next').addEventListener('click', () => { currentIndex++; showCard(); });
    };
    showCard();
};

const startKanjiPuzzle = (kanjiTheme, ctx, phase) => {
    const exerciseQueue = shuffleArray(kanjiTheme.items);
    let currentIndex = 0;

    const showQuestion = () => {
        if (currentIndex >= exerciseQueue.length) {
            alert(phase === 1 ? "¡Despiece dominado!" : "¡Forja completada!");
            return renderKanjiSubmenu(kanjiTheme, null, ctx);
        }

        const item = exerciseQueue[currentIndex];
        const isPhase1 = phase === 1;
        const totalSlots = item.radicals.length;
        const availablePieces = shuffleArray([...item.radicals, ...item.dummy_radicals]);
        let selectedPieces = [];

        const updateBoard = () => {
            document.getElementById('slots-container').innerHTML = Array.from({ length: totalSlots }).map((_, i) => `<div class="w-20 h-20 md:w-24 md:h-24 border-4 border-dashed ${selectedPieces[i] ? 'border-secondary bg-gray-50' : 'border-gray-300'} rounded-2xl flex items-center justify-center text-4xl md:text-5xl font-bold text-gray-800 cursor-pointer transition-colors" data-slot-index="${i}">${selectedPieces[i] ? selectedPieces[i].char : ''}</div>`).join('');
            document.getElementById('pieces-container').innerHTML = availablePieces.map((char, index) => {
                if (selectedPieces.some(p => p.originalIndex === index)) return `<div class="w-16 h-16 md:w-20 md:h-20 opacity-0"></div>`;
                return `<button class="radical-piece w-16 h-16 md:w-20 md:h-20 bg-white border-2 border-gray-200 rounded-2xl apple-shadow text-3xl font-bold text-gray-700 hover:border-secondary hover:text-secondary transition-all active:scale-95" data-char="${char}" data-original-index="${index}">${char}</button>`;
            }).join('');

            document.querySelectorAll('.radical-piece').forEach(btn => btn.addEventListener('click', (e) => {
                if (selectedPieces.length >= totalSlots) return;
                selectedPieces.push({ char: e.target.getAttribute('data-char'), originalIndex: parseInt(e.target.getAttribute('data-original-index')) });
                updateBoard(); checkVictory();
            }));

            document.querySelectorAll('#slots-container > div').forEach(slot => slot.addEventListener('click', (e) => {
                const idx = e.currentTarget.getAttribute('data-slot-index');
                if (selectedPieces[idx]) { selectedPieces.splice(idx, 1); updateBoard(); }
            }));
        };

        const checkVictory = () => {
            if (selectedPieces.length !== totalSlots) return;
            if (selectedPieces.map(p => p.char).sort().join('') === item.radicals.slice().sort().join('')) {
                document.getElementById('slots-container').innerHTML = isPhase1 
                    ? `<div class="text-2xl font-bold text-green-700 bg-green-100 px-8 py-5 rounded-2xl border-4 border-green-500 apple-shadow scale-110 transition-transform">¡Correcto!</div>`
                    : `<div class="w-40 h-40 bg-green-100 border-4 border-green-500 rounded-3xl flex items-center justify-center text-8xl font-bold text-green-700 apple-shadow scale-110 transition-transform">${item.kanji}</div>`;
                setTimeout(() => { currentIndex++; showQuestion(); }, 1500);
            } else {
                const sc = document.getElementById('slots-container');
                sc.classList.add('animate-pulse', 'border-red-500');
                setTimeout(() => { selectedPieces = []; sc.classList.remove('animate-pulse', 'border-red-500'); updateBoard(); }, 800);
            }
        };

        const qContent = isPhase1
            ? `<div class="text-center mb-6"><div class="text-9xl font-bold text-gray-900 mb-4 drop-shadow-sm">${item.kanji}</div><h3 class="text-2xl font-bold text-gray-600 uppercase tracking-widest">${item.meaning}</h3></div>`
            : `<div class="bg-orange-50 p-8 rounded-3xl border border-orange-100 mb-8 text-center apple-shadow md:max-w-md mx-auto w-full"><h3 class="text-3xl font-bold text-gray-900 mb-4 uppercase tracking-widest">${item.meaning}</h3><p class="text-gray-600 text-base italic leading-relaxed">"${item.mnemonic}"</p></div>`;

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <div class="flex justify-between items-center text-gray-500 font-bold mb-8 px-2">
                    <span class="${isPhase1 ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-orange-100 text-orange-800 border-orange-200'} px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border">${isPhase1 ? 'Despiece' : 'Forja'}</span>
                    <button id="btn-quit" class="hover:text-primary p-2"><i data-lucide="x" class="w-6 h-6"></i></button>
                </div>
                ${qContent}
                <div class="flex-grow flex flex-col items-center justify-center mb-8"><div id="slots-container" class="flex gap-5 p-4 min-h-[7rem]"></div></div>
                <div class="bg-gray-50 p-8 rounded-t-[2.5rem] -mx-4 pb-12 shadow-[inset_0_4px_10px_rgba(0,0,0,0.05)] border-t border-gray-200 md:max-w-xl md:mx-auto md:rounded-[2.5rem] md:mb-4"><div id="pieces-container" class="flex flex-wrap justify-center gap-4"></div></div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => renderKanjiSubmenu(kanjiTheme, null, ctx));
        updateBoard();
    };
    showQuestion();
};

const startKanjiJukugo = (kanjiTheme, ctx) => {
    let exerciseQueue = [];
    kanjiTheme.items.forEach(item => { if (item.context_words) item.context_words.forEach(cw => exerciseQueue.push({ ...cw, parent_kanji: item.kanji, parent_on: item.onyomi.join(', '), parent_kun: item.kunyomi.join(', ') })); });
    exerciseQueue = shuffleArray(exerciseQueue);
    let currentIndex = 0, subState = 'PUZZLE'; 

    const showStep = () => {
        if (currentIndex >= exerciseQueue.length) { alert("¡Jukugos dominados!"); return renderKanjiSubmenu(kanjiTheme, null, ctx); }
        const item = exerciseQueue[currentIndex];

        if (subState === 'PUZZLE') {
            const correctChars = item.word.split('');
            const totalSlots = correctChars.length;
            const availablePieces = shuffleArray([...correctChars, ...(item.dummy_pieces || ['日', '月', '木'])]);
            let selectedPieces = [];

            const updateSemBoard = () => {
                document.getElementById('sem-slots-container').innerHTML = Array.from({ length: totalSlots }).map((_, i) => `<div class="w-20 h-20 md:w-24 md:h-24 border-4 border-dashed ${selectedPieces[i] ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'} rounded-2xl flex items-center justify-center text-4xl md:text-5xl font-bold text-gray-800 cursor-pointer transition-colors" data-slot-index="${i}">${selectedPieces[i] ? selectedPieces[i].char : ''}</div>`).join('');
                document.getElementById('sem-pieces-container').innerHTML = availablePieces.map((char, idx) => {
                    if (selectedPieces.some(p => p.originalIndex === idx)) return `<div class="w-16 h-16 md:w-20 md:h-20 opacity-0"></div>`;
                    return `<button class="sem-piece w-16 h-16 md:w-20 md:h-20 bg-white border-2 border-gray-200 rounded-2xl apple-shadow text-3xl font-bold text-gray-700 hover:border-indigo-500 transition-all active:scale-95" data-char="${char}" data-original-index="${idx}">${char}</button>`;
                }).join('');

                document.querySelectorAll('.sem-piece').forEach(btn => btn.addEventListener('click', (e) => {
                    if (selectedPieces.length >= totalSlots) return;
                    selectedPieces.push({ char: e.target.getAttribute('data-char'), originalIndex: parseInt(e.target.getAttribute('data-original-index')) });
                    updateSemBoard(); checkSemVictory();
                }));
                document.querySelectorAll('#sem-slots-container > div').forEach(slot => slot.addEventListener('click', (e) => {
                    const idx = e.currentTarget.getAttribute('data-slot-index');
                    if (selectedPieces[idx]) { selectedPieces.splice(idx, 1); updateSemBoard(); }
                }));
            };

            const checkSemVictory = () => {
                if (selectedPieces.length !== totalSlots) return;
                if (selectedPieces.map(p => p.char).join('') === correctChars.join('')) {
                    document.getElementById('sem-slots-container').innerHTML = `<div class="px-10 py-5 bg-indigo-100 border-4 border-indigo-500 rounded-3xl flex items-center justify-center text-6xl font-bold text-indigo-700 apple-shadow scale-110">${item.word}</div>`;
                    setTimeout(() => { subState = 'PRESENTATION'; showStep(); }, 1200);
                } else {
                    const sc = document.getElementById('sem-slots-container');
                    sc.classList.add('animate-pulse', 'border-red-500');
                    setTimeout(() => { selectedPieces = []; sc.classList.remove('animate-pulse', 'border-red-500'); updateSemBoard(); }, 800);
                }
            };

            document.getElementById('app-view').innerHTML = `
                <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
                    <div class="flex justify-between items-center text-gray-500 font-bold mb-8 px-2">
                        <span class="bg-indigo-100 text-indigo-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">Paso 1: Construye</span>
                        <span class="text-sm bg-gray-100 px-3 py-1 rounded-full">${currentIndex + 1} / ${exerciseQueue.length}</span>
                        <button id="btn-quit" class="hover:text-primary p-2"><i data-lucide="x" class="w-6 h-6"></i></button>
                    </div>
                    <div class="text-center mb-6">
                        <p class="text-gray-400 text-sm font-bold uppercase tracking-widest mb-3">Une por significado</p>
                        <h3 class="text-4xl font-extrabold text-gray-900 tracking-tight leading-tight px-4">"${item.meaning}"</h3>
                    </div>
                    <div class="flex-grow flex flex-col items-center justify-center mb-8"><div id="sem-slots-container" class="flex gap-5 p-4 min-h-[7rem]"></div></div>
                    <div class="bg-gray-50 p-8 rounded-t-[2.5rem] -mx-4 pb-12 shadow-[inset_0_4px_10px_rgba(0,0,0,0.05)] border-t border-gray-200 md:max-w-xl md:mx-auto md:rounded-[2.5rem] md:mb-4"><div id="sem-pieces-container" class="flex flex-wrap justify-center gap-4"></div></div>
                </div>
            `;
            lucide.createIcons();
            document.getElementById('btn-quit').addEventListener('click', () => renderKanjiSubmenu(kanjiTheme, null, ctx));
            updateSemBoard();

        } else if (subState === 'PRESENTATION') {
            let ruleColor = item.rule === 'ON' ? 'bg-blue-100 text-blue-800 border-blue-200' : item.rule === 'KUN' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200';
            document.getElementById('app-view').innerHTML = `
                <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
                    <div class="flex justify-between items-center text-gray-500 font-bold mb-4 px-2">
                        <span class="bg-indigo-100 text-indigo-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">Paso 2: Aprende</span>
                        <button id="btn-quit" class="hover:text-primary p-2"><i data-lucide="x" class="w-6 h-6"></i></button>
                    </div>
                    <div class="bg-white border-2 border-gray-100 rounded-3xl p-5 w-full text-center flex flex-col gap-3 apple-shadow md:max-w-md mx-auto">
                        <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Kanji: <span class="text-xl text-gray-900">${item.parent_kanji}</span></span>
                        <div class="flex justify-center gap-3 text-sm">
                            <span class="text-blue-700 font-bold bg-blue-50 px-3 py-1 rounded-lg">ON: ${item.parent_on}</span>
                            <span class="text-green-700 font-bold bg-green-50 px-3 py-1 rounded-lg">KUN: ${item.parent_kun}</span>
                        </div>
                    </div>
                    <div class="flex-grow flex flex-col items-center justify-center text-center mt-6">
                        <span class="${ruleColor} px-4 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-widest border mb-4">Regla: ${item.rule || 'KUN'}</span>
                        <div class="text-xl font-bold text-indigo-600 tracking-widest mb-1">${item.full_reading}</div>
                        <div class="text-7xl md:text-8xl font-extrabold text-gray-900 mb-3 tracking-wider">${item.word}</div>
                        <div class="w-full bg-yellow-50 border-2 border-yellow-200 p-5 rounded-2xl text-left shadow-sm mt-4 md:max-w-md">
                            <p class="text-xs font-extrabold text-yellow-800 uppercase mb-2 flex items-center gap-2"><i data-lucide="brain-circuit" class="w-4 h-4"></i> Lógica de lectura</p>
                            <p class="text-sm text-yellow-900 font-medium leading-relaxed">${item.etymology || 'Lectura compuesta.'}</p>
                        </div>
                        <button id="btn-audio" class="mt-6 p-6 bg-gray-100 text-gray-700 rounded-full apple-shadow transition-transform hover:scale-110 active:scale-95"><i data-lucide="volume-2" class="w-8 h-8 text-blue-600"></i></button>
                        <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2">Toca para escuchar</p>
                    </div>
                    <button id="btn-continue" class="w-full md:max-w-md mx-auto bg-indigo-600 text-white py-6 rounded-2xl font-bold apple-shadow hover:bg-indigo-700 flex justify-center items-center gap-3 mt-8 text-xl transition-transform hover:-translate-y-1">Practicar <i data-lucide="arrow-right" class="w-6 h-6"></i></button>
                </div>
            `;
            lucide.createIcons();
            document.getElementById('btn-quit').addEventListener('click', () => renderKanjiSubmenu(kanjiTheme, null, ctx));
            document.getElementById('btn-audio').addEventListener('click', () => playJapaneseAudio(item.full_reading));
            document.getElementById('btn-continue').addEventListener('click', () => { subState = 'PRACTICE'; showStep(); });

        } else if (subState === 'PRACTICE') {
            const options = shuffleArray([item.full_reading, ...item.distractors.slice(0, 3)]);
            document.getElementById('app-view').innerHTML = `
                <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
                    <div class="flex justify-between items-center text-gray-500 font-bold mb-8 px-2">
                        <span class="bg-indigo-100 text-indigo-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border border-indigo-200">Paso 3: Práctica</span>
                        <span class="text-sm bg-gray-100 px-3 py-1 rounded-full">${currentIndex + 1} / ${exerciseQueue.length}</span>
                    </div>
                    <div class="flex-grow flex flex-col items-center justify-center text-center mb-10">
                        <p class="text-gray-400 text-sm font-bold uppercase tracking-widest mb-4">¿Cómo se lee esta palabra?</p>
                        <div class="text-7xl md:text-8xl font-bold text-gray-900 mb-6 tracking-widest">${item.word}</div>
                        <div class="bg-gray-100 text-gray-800 py-3 px-8 rounded-2xl inline-block font-bold text-xl apple-shadow border border-gray-200">"${item.meaning}"</div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="options-container">
                        ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 py-6 px-6 rounded-2xl font-bold text-xl text-gray-800 hover:border-indigo-500 hover:text-indigo-600 apple-shadow active:bg-gray-50 text-center md:text-left" data-answer="${opt}">${opt}</button>`).join('')}
                    </div>
                </div>
            `;
            lucide.createIcons();
            const optionButtons = document.querySelectorAll('.option-btn');
            optionButtons.forEach(btn => btn.addEventListener('click', (e) => {
                const ans = e.target.getAttribute('data-answer');
                optionButtons.forEach(b => b.disabled = true);
                if (ans === item.full_reading) {
                    e.target.classList.add('bg-green-100', 'border-green-500', 'text-green-800');
                    playJapaneseAudio(item.full_reading);
                } else {
                    e.target.classList.add('bg-red-100', 'border-red-500', 'text-red-800');
                    Array.from(optionButtons).find(b => b.getAttribute('data-answer') === item.full_reading).classList.add('bg-green-100', 'border-green-500');
                }
                setTimeout(() => { currentIndex++; subState = 'PUZZLE'; showStep(); }, 1800);
            }));
        }
    };
    showStep();
};

const startKanjiExam = (kanjiTheme, nextThemeId, ctx) => {
    let exerciseQueue = [];
    kanjiTheme.items.forEach(item => {
        exerciseQueue.push({ type: 'meaning', data: item });
        if (item.context_words) item.context_words.forEach(cw => exerciseQueue.push({ type: 'reading', data: cw }));
    });
    exerciseQueue = shuffleArray(exerciseQueue);
    let currentIndex = 0, mistakes = 0;

    const showQuestion = () => {
        if (currentIndex >= exerciseQueue.length) {
            if(mistakes === 0) {
                appState = markThemeCompleted('kanji', kanjiTheme.theme_id, nextThemeId !== "null" && nextThemeId !== null ? nextThemeId : null, kanjiTheme.items);
                return renderSuccessScreen('kanji', kanjiTheme, kanjiTheme.items.length, () => renderKanjiThemeList(ctx));
            } else {
                alert(`Has fallado ${mistakes} pregunta(s). Necesitas un 100% de aciertos para superar el tema. ¡Sigue entrenando!`);
                return renderKanjiSubmenu(kanjiTheme, nextThemeId, ctx);
            }
        }
        
        const q = exerciseQueue[currentIndex];
        const correct = q.type === 'meaning' ? q.data.meaning : q.data.full_reading;
        const distractors = q.type === 'meaning' ? getDistractors(q.data, kanjiTheme.items, 'meaning', 3) : q.data.distractors.slice(0, 3);
        const display = q.type === 'meaning' ? q.data.kanji : q.data.word;
        const options = shuffleArray([correct, ...distractors]);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full w-full pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-fade-in">
                <div class="flex justify-between items-center text-red-500 font-bold mb-8 px-2">
                    <span class="bg-red-100 text-red-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border border-red-200"><i data-lucide="award" class="w-4 h-4 inline mr-1"></i> Examen Final</span>
                    <span class="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">${currentIndex + 1} / ${exerciseQueue.length}</span>
                    <button id="btn-quit" class="hover:text-red-700 p-2"><i data-lucide="x" class="w-6 h-6"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center text-center mb-10">
                    <p class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">${q.type === 'meaning' ? 'Traduce al Español' : '¿Cómo se lee?'}</p>
                    <div class="text-8xl md:text-9xl font-bold text-gray-900 mb-6 tracking-widest">${display}</div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="options-container">
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 py-6 px-6 rounded-2xl font-bold text-xl text-gray-800 hover:border-red-500 hover:text-red-600 apple-shadow active:bg-gray-50 text-center md:text-left" data-answer="${opt}">${opt}</button>`).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => renderKanjiSubmenu(kanjiTheme, nextThemeId, ctx));

        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => btn.addEventListener('click', (e) => {
            const isCorrect = e.currentTarget.getAttribute('data-answer') === correct;
            optionButtons.forEach(b => b.disabled = true);
            if (isCorrect) {
                e.currentTarget.classList.add('bg-green-100', 'border-green-500', 'text-green-800');
            } else {
                mistakes++;
                e.currentTarget.classList.add('bg-red-100', 'border-red-500', 'text-red-800');
                Array.from(optionButtons).find(b => b.getAttribute('data-answer') === correct).classList.add('bg-green-100', 'border-green-500');
            }
            setTimeout(() => { currentIndex++; showQuestion(); }, 1200);
        }));
    };
    showQuestion();
};

const bootApp = async () => {
    try {
        initUI();
        appState = loadProgress();
        manifestData = await getManifest();
        if (!manifestData) throw new Error("No se pudo cargar el manifest.json");
        renderDashboard();
    } catch (error) {
        document.getElementById('app-view').innerHTML = `<div class="p-6 bg-red-50 text-red-800 border-2 border-red-200 rounded-3xl max-w-md mx-auto mt-10 apple-shadow"><p class="font-bold text-xl mb-2"><i data-lucide="alert-triangle" class="inline w-6 h-6 mb-1"></i> Error fatal</p><p class="text-sm font-medium">${error.message}</p></div>`;
        lucide.createIcons();
    }
};

document.addEventListener('DOMContentLoaded', bootApp);