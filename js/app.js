import { loadProgress, exportProgress, importProgress, markThemeCompleted } from './storage.js';
import { getManifest, getVocabData, getKanjiData } from './dataService.js';
import { shuffleArray, getDistractors } from './utils.js';
import { playJapaneseAudio } from './audio.js';
import { getDueItems, processReview } from './srs.js';

let appState = null;
let manifestData = null;

const initUI = () => {
    lucide.createIcons();
    document.getElementById('btn-export').addEventListener('click', exportProgress);
    document.getElementById('input-import').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (confirm('¿Sobrescribir tu progreso actual con este archivo?')) {
            importProgress(file, () => { location.reload(); });
        }
        event.target.value = '';
    });
};

const buildMasterDictionary = async () => {
    let vocabData = await getVocabData(manifestData.levels[0].vocab_file);
    let kanjiData = await getKanjiData(manifestData.levels[0].kanji_file);
    if (!Array.isArray(vocabData)) vocabData = [vocabData];
    if (!Array.isArray(kanjiData)) kanjiData = [kanjiData];

    const dict = {};
    // Ahora iteramos también por los bloques
    vocabData.forEach(block => block.themes?.forEach(theme => theme.items?.forEach(item => dict[item.id] = { ...item, type: 'vocab', allItems: theme.items })));
    kanjiData.forEach(block => block.themes?.forEach(theme => theme.items?.forEach(item => dict[item.id] = { ...item, type: 'kanji', allItems: theme.items })));
    return dict;
};

// --- RENDERIZADORES GLOBALES ---

const renderDashboard = () => {
    appState = loadProgress(); 
    const dueItems = getDueItems();
    const dueCount = dueItems.length;
    const appView = document.getElementById('app-view');
    
    appView.innerHTML = `
        <div class="flex flex-col gap-6 w-full max-w-md mx-auto mt-4 pb-8">
            <section class="bg-indigo-600 p-6 rounded-2xl shadow-lg border border-indigo-500 text-white relative overflow-hidden">
                <div class="absolute -right-4 -top-4 opacity-10 transform rotate-12"><i data-lucide="brain-circuit" class="w-32 h-32"></i></div>
                <h2 class="text-2xl font-bold mb-1 relative z-10">Repaso Diario</h2>
                <p class="text-indigo-200 mb-4 relative z-10 text-sm">Sistema de Memoria a Largo Plazo</p>
                <button id="btn-start-srs" class="w-full bg-white text-indigo-600 py-4 px-4 rounded-xl font-bold shadow-md hover:bg-gray-50 transition-colors flex items-center justify-between gap-2 ${dueCount === 0 ? 'opacity-90 cursor-not-allowed' : ''}" ${dueCount === 0 ? 'disabled' : ''}>
                    <span class="flex items-center gap-2">${dueCount > 0 ? '<i data-lucide="play-circle"></i> Iniciar Sesión' : '<i data-lucide="check-circle"></i> Todo al día'}</span>
                    <span class="${dueCount > 0 ? 'bg-red-500 text-white' : 'bg-green-100 text-green-700'} px-3 py-1 rounded-full text-sm shadow-inner">${dueCount} pendientes</span>
                </button>
                <button id="btn-srs-stats" class="w-full bg-indigo-700 text-indigo-100 py-3 rounded-xl font-bold shadow-sm hover:bg-indigo-800 transition-colors flex justify-center items-center gap-2 mt-3 relative z-10 text-sm border border-indigo-500">
                    <i data-lucide="bar-chart-2" class="w-4 h-4"></i> Mi Memoria (Estadísticas)
                </button>
            </section>

            <section class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 class="text-lg font-bold mb-4 text-gray-800">Aprender Nuevos Temas</h3>
                <div class="flex flex-col gap-4">
                    <button id="btn-start-vocab" class="w-full bg-primary text-white py-4 px-4 rounded-xl font-bold shadow-md hover:bg-red-600 transition-colors flex items-center justify-center gap-2"><i data-lucide="book-type"></i> Vocabulario</button>
                    <button id="btn-start-kanji" class="w-full bg-secondary text-white py-4 px-4 rounded-xl font-bold shadow-md hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"><i data-lucide="pen-tool"></i> Kanjis</button>
                </div>
            </section>
        </div>
    `;
    lucide.createIcons();

    if (dueCount > 0) document.getElementById('btn-start-srs').addEventListener('click', () => startSRSSession(dueItems));
    
    document.getElementById('btn-start-vocab').addEventListener('click', async () => renderBlockList(await getVocabData(manifestData.levels[0].vocab_file), 'vocab'));
    document.getElementById('btn-start-kanji').addEventListener('click', async () => renderBlockList(await getKanjiData(manifestData.levels[0].kanji_file), 'kanji'));
    document.getElementById('btn-srs-stats').addEventListener('click', renderSRSStats);
};

const renderSRSStats = async () => {
    const state = loadProgress();
    const dict = await buildMasterDictionary();
    const boxes = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const box1Items = [];

    Object.keys(state.leitner).forEach(itemId => {
        const itemData = state.leitner[itemId];
        if(boxes[itemData.box] !== undefined) boxes[itemData.box]++;
        if(itemData.box === 1 && dict[itemId]) {
            box1Items.push(dict[itemId]);
        }
    });

    const box1Html = box1Items.length > 0 
        ? `<div class="mt-4 bg-white p-4 rounded-xl shadow-inner border border-red-100 max-h-40 overflow-y-auto">
            <p class="text-xs font-bold text-gray-500 uppercase mb-2">Palabras atascadas:</p>
            <div class="flex flex-wrap gap-2">
                ${box1Items.map(item => `<span class="bg-gray-100 text-gray-700 px-2 py-1 rounded text-sm">${item.kanji || item.kana}</span>`).join('')}
            </div>
           </div>
           <button id="btn-train-mistakes" class="w-full bg-red-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-red-700 mt-4"><i data-lucide="dumbbell" class="inline w-4 h-4 mr-1"></i> Entrenar Fallos (Infinito)</button>`
        : `<p class="text-sm text-green-600 mt-2 font-bold"><i data-lucide="check-circle" class="inline w-4 h-4"></i> ¡No tienes fallos pendientes!</p>`;

    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col gap-4 w-full max-w-md mx-auto mt-4 pb-8 animate-fade-in">
            <button id="btn-back-dash" class="text-gray-500 flex items-center gap-1 self-start"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver</button>
            <h2 class="text-2xl font-bold text-gray-800">Estado de Memoria</h2>
            <p class="text-sm text-gray-500 mb-2">Así retiene la información tu cerebro.</p>
            
            <div class="flex flex-col gap-3">
                <div class="bg-red-50 border border-red-200 p-4 rounded-xl shadow-sm">
                    <div class="flex justify-between items-center">
                        <span class="font-bold text-red-800">Caja 1 (Fallos / Recientes)</span>
                        <span class="bg-red-200 text-red-900 px-3 py-1 rounded-full font-bold">${boxes[1]}</span>
                    </div>
                    ${box1Html}
                </div>
                <div class="bg-orange-50 border border-orange-200 p-4 rounded-xl flex justify-between items-center shadow-sm">
                    <span class="font-bold text-orange-800">Caja 2 (Corto plazo)</span><span class="bg-orange-200 text-orange-900 px-3 py-1 rounded-full font-bold">${boxes[2]}</span>
                </div>
                <div class="bg-yellow-50 border border-yellow-200 p-4 rounded-xl flex justify-between items-center shadow-sm">
                    <span class="font-bold text-yellow-800">Caja 3 (Consolidando)</span><span class="bg-yellow-200 text-yellow-900 px-3 py-1 rounded-full font-bold">${boxes[3]}</span>
                </div>
                <div class="bg-blue-50 border border-blue-200 p-4 rounded-xl flex justify-between items-center shadow-sm">
                    <span class="font-bold text-blue-800">Caja 4 (Medio plazo)</span><span class="bg-blue-200 text-blue-900 px-3 py-1 rounded-full font-bold">${boxes[4]}</span>
                </div>
                <div class="bg-green-50 border border-green-300 p-4 rounded-xl flex justify-between items-center shadow-md">
                    <span class="font-bold text-green-800"><i data-lucide="award" class="inline w-4 h-4 mb-1"></i> Caja 5 (Largo Plazo)</span><span class="bg-green-500 text-white px-3 py-1 rounded-full font-bold">${boxes[5]}</span>
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
    // Aplanamos los temas de todos los bloques para saber la secuencia global
    const flatThemes = blocksData.flatMap(b => b.themes);
    
    const html = blocksData.map((block, index) => {
        const themesInBlock = block.themes.length;
        const completedInBlock = block.themes.filter(t => appState.progress[`completed_${type}_themes`].includes(t.theme_id)).length;
        
        // Un bloque está desbloqueado si su primer tema está desbloqueado en el progreso
        const firstThemeId = block.themes[0].theme_id;
        const isUnlocked = appState.progress[`unlocked_${type}_themes`].includes(firstThemeId);

        return `
            <div class="border-2 ${isUnlocked ? 'border-indigo-500 bg-white cursor-pointer hover:scale-[1.02]' : 'border-gray-200 bg-gray-50 opacity-70'} p-5 rounded-2xl shadow-sm transition-transform block-card" data-index="${index}" data-unlocked="${isUnlocked}">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-bold text-lg text-gray-800">${block.block_title}</h3>
                    ${isUnlocked ? (completedInBlock === themesInBlock ? '<i data-lucide="check-circle" class="text-green-500"></i>' : '<i data-lucide="folder-open" class="text-indigo-500"></i>') : '<i data-lucide="lock" class="text-gray-400"></i>'}
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 mb-2 overflow-hidden">
                    <div class="bg-indigo-500 h-2 rounded-full transition-all" style="width: ${(completedInBlock/themesInBlock)*100}%"></div>
                </div>
                <p class="text-xs text-gray-500 font-bold text-right">${completedInBlock} / ${themesInBlock} temas</p>
            </div>
        `;
    }).join('');

    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col gap-4 w-full max-w-md mx-auto mt-4 pb-8 animate-fade-in">
            <button id="btn-back" class="text-gray-500 flex items-center gap-1 self-start mb-2"><i data-lucide="arrow-left" class="w-5 h-5"></i> Menú Principal</button>
            <h2 class="text-2xl font-bold text-gray-800 mb-1">${type === 'vocab' ? 'Vocabulario (N5)' : 'Kanjis (N5)'}</h2>
            <p class="text-sm text-gray-500 mb-2">Selecciona un bloque de estudio.</p>
            ${html}
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back').addEventListener('click', renderDashboard);

    document.querySelectorAll('.block-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.currentTarget.getAttribute('data-unlocked') !== 'true') return alert('Bloque bloqueado. Supera los temas del bloque anterior.');
            const bIdx = parseInt(e.currentTarget.getAttribute('data-index'));
            // Contexto que pasaremos entre vistas
            const ctx = { type, blocks: blocksData, bIdx, flat: flatThemes };
            if(type === 'vocab') renderVocabThemeList(ctx);
            else renderKanjiThemeList(ctx);
        });
    });
};

const renderSuccessScreen = (type, currentTheme, itemsCount, backCallback) => {
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col items-center justify-center h-full max-w-md mx-auto w-full text-center px-4 animate-fade-in pt-8">
            <div class="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 border-4 border-green-400 shadow-md"><i data-lucide="award" class="w-12 h-12 text-green-600"></i></div>
            <h2 class="text-3xl font-bold text-gray-800 mb-2">¡Maestría Alcanzada!</h2>
            <p class="text-gray-600 mb-8">Has superado el examen de "${currentTheme.theme_title}" con un 100%.</p>
            <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 w-full mb-8 text-left flex items-start gap-4 shadow-sm">
                <i data-lucide="layers" class="w-6 h-6 text-blue-500 mt-1"></i>
                <div><p class="font-bold text-gray-800 text-sm">Tema Desbloqueado y Guardado</p><p class="text-xs text-gray-500">${itemsCount} elementos inyectados en tu memoria SRS.</p></div>
            </div>
            <button id="btn-success-back" class="w-full bg-gray-900 text-white py-4 rounded-xl font-bold shadow-md hover:bg-gray-800 transition-colors">Continuar</button>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-success-back').addEventListener('click', backCallback);
};

const generateThemeListHtml = (ctx) => {
    const blockThemes = ctx.blocks[ctx.bIdx].themes;
    return blockThemes.map((theme, index) => {
        const unlockedKey = `unlocked_${ctx.type}_themes`;
        const completedKey = `completed_${ctx.type}_themes`;
        const isUnlocked = appState.progress[unlockedKey].includes(theme.theme_id);
        const isCompleted = appState.progress[completedKey].includes(theme.theme_id);
        const isCheckpoint = theme.type === 'checkpoint';
        
        // Calculamos el índice plano absoluto para saber cuál es el siguiente tema general
        const flatIndex = ctx.flat.findIndex(t => t.theme_id === theme.theme_id);
        const nextThemeId = ctx.flat[flatIndex + 1] ? ctx.flat[flatIndex + 1].theme_id : null;
        
        let statusIcon = isCompleted ? (isCheckpoint ? '<i data-lucide="award" class="text-yellow-500"></i>' : '<i data-lucide="check-circle" class="text-green-500"></i>') 
                     : (isUnlocked ? (isCheckpoint ? '<i data-lucide="swords" class="text-red-500 animate-pulse"></i>' : '<i data-lucide="unlock" class="text-blue-500"></i>') 
                     : '<i data-lucide="lock" class="text-gray-400"></i>');

        let borderClass = isCompleted ? (isCheckpoint ? 'border-yellow-500 bg-yellow-50' : 'border-green-500 bg-green-50') 
                        : (isUnlocked ? (isCheckpoint ? 'border-red-500 bg-red-50' : (ctx.type === 'vocab' ? 'border-primary bg-white' : 'border-secondary bg-white')) : 'border-gray-200 bg-gray-100 opacity-70');

        return `
            <div class="${borderClass} border-2 p-5 rounded-xl shadow-sm transition-transform transform hover:scale-[1.02] cursor-pointer theme-card" data-flat-index="${flatIndex}" data-unlocked="${isUnlocked}" data-next="${nextThemeId}" data-checkpoint="${isCheckpoint}">
                <div class="flex justify-between items-center">
                    <h3 class="font-bold text-lg ${isCheckpoint && !isCompleted && isUnlocked ? 'text-red-700' : 'text-gray-800'}">${theme.theme_title}</h3>
                    ${statusIcon}
                </div>
                <p class="text-sm text-gray-500 mt-1">${isCheckpoint ? 'Examen de control' : `${theme.items?.length || 0} ítems`}</p>
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
        const distractors = getDistractors(item, item.allItems, 'meaning', 3);
        const options = shuffleArray([correctAnswer, ...distractors]);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4">
                <div class="flex justify-between items-center text-gray-500 font-bold mb-6">
                    <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">Repaso Oficial</span>
                    <span class="text-xs">${currentIndex + 1} / ${sessionQueue.length}</span>
                    <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center text-center mb-8 gap-4">
                    <p class="text-gray-400 text-sm font-bold uppercase tracking-widest">${item.type === 'kanji' ? 'Significado' : 'Traducción'}</p>
                    <div class="text-7xl font-bold text-gray-800 drop-shadow-sm mb-2">${targetDisplay}</div>
                    ${item.type === 'vocab' && item.kana ? `<button id="btn-audio" class="p-4 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 shadow-sm"><i data-lucide="volume-2" class="w-8 h-8"></i></button>` : ''}
                </div>
                <div class="grid grid-cols-1 gap-3 pb-8" id="options-container">
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 py-4 px-6 rounded-xl font-bold text-lg text-gray-700 hover:border-indigo-500 hover:text-indigo-600 transition-colors shadow-sm text-left" data-answer="${opt}">${opt}</button>`).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', renderDashboard);
        if (item.type === 'vocab' && item.kana) {
            document.getElementById('btn-audio').addEventListener('click', () => playJapaneseAudio(item.kana));
            playJapaneseAudio(item.kana);
        }

        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const selectedAnswer = e.currentTarget.getAttribute('data-answer');
                const isCorrect = selectedAnswer === correctAnswer;
                optionButtons.forEach(b => b.disabled = true);
                if (isCorrect) e.currentTarget.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                else {
                    e.currentTarget.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
                    Array.from(optionButtons).find(b => b.getAttribute('data-answer') === correctAnswer).classList.add('bg-green-100', 'border-green-500', 'text-green-700');
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
                currentIndex = 0;
                queue = shuffleArray([...box1Items]);
                return showCard();
            } else {
                return renderSRSStats();
            }
        }
        
        const item = queue[currentIndex];
        let flipped = false;

        const renderState = () => {
            document.getElementById('app-view').innerHTML = `
                <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 animate-fade-in">
                    <div class="flex justify-between items-center text-gray-500 font-bold mb-6">
                        <span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">Entrenando Fallos</span>
                        <span class="text-xs">${currentIndex + 1} / ${queue.length}</span>
                        <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                    </div>
                    
                    <div id="flashcard" class="flex-grow flex flex-col items-center justify-center text-center gap-6 cursor-pointer bg-white border-2 ${flipped ? 'border-indigo-400' : 'border-gray-200'} rounded-2xl shadow-sm p-6 mb-8 hover:bg-gray-50 transition-all">
                        <p class="text-gray-400 font-bold uppercase tracking-widest text-sm">${flipped ? 'Solución' : 'Toca para revelar'}</p>
                        ${flipped && item.kana ? `<p class="text-lg text-gray-500">${item.kana}</p>` : ''}
                        <h2 class="text-7xl font-bold text-gray-800">${item.kanji || item.kana}</h2>
                        ${flipped ? `<div class="bg-indigo-50 text-indigo-700 font-bold text-2xl py-3 px-6 rounded-xl border border-indigo-200 mt-4 w-full">${item.meaning}</div>` : ''}
                    </div>

                    ${flipped ? `<button id="btn-next" class="w-full bg-gray-900 text-white py-5 rounded-xl font-bold shadow-md hover:bg-gray-800 flex justify-center gap-2 pb-8">Siguiente <i data-lucide="arrow-right"></i></button>` : ''}
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
    
    themesToTest.forEach(theme => {
        theme.items?.forEach(item => {
            questionPool.push({ ...item, sourceThemeId: theme.theme_id, sourceThemeTitle: theme.theme_title, allItems: theme.items });
        });
    });

    const examQuestions = shuffleArray(questionPool).slice(0, 20);
    let questionIndex = 0;
    const stats = {};
    themesToTest.forEach(t => stats[t.theme_id] = { title: t.theme_title, total: 0, correct: 0 });

    const showExamQuestion = () => {
        if (questionIndex >= examQuestions.length) return renderCheckpointResults();

        const item = examQuestions[questionIndex];
        const targetDisplay = item.kanji || item.kana;
        const correctAnswer = item.meaning;
        const distractors = getDistractors(item, item.allItems, 'meaning', 3);
        const options = shuffleArray([correctAnswer, ...distractors]);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4">
                <div class="flex justify-between items-center text-gray-500 font-bold mb-6">
                    <span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-red-200"><i data-lucide="swords" class="w-3 h-3 inline"></i> Examen</span>
                    <span class="text-xs">${questionIndex + 1} / ${examQuestions.length}</span>
                    <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center text-center mb-8 gap-4">
                    <div class="text-7xl font-bold text-gray-800 drop-shadow-sm mb-2">${targetDisplay}</div>
                </div>
                <div class="grid grid-cols-1 gap-3 pb-8" id="options-container">
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 py-4 px-6 rounded-xl font-bold text-lg text-gray-700 hover:border-red-500 hover:text-red-600 transition-colors shadow-sm text-left" data-answer="${opt}">${opt}</button>`).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => ctx.type === 'vocab' ? renderVocabThemeList(ctx) : renderKanjiThemeList(ctx));

        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const isCorrect = e.currentTarget.getAttribute('data-answer') === correctAnswer;
                optionButtons.forEach(b => b.disabled = true);
                stats[item.sourceThemeId].total += 1;
                if (isCorrect) stats[item.sourceThemeId].correct += 1;

                if (isCorrect) e.currentTarget.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                else {
                    e.currentTarget.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
                    Array.from(optionButtons).find(b => b.getAttribute('data-answer') === correctAnswer).classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                }
                setTimeout(() => { questionIndex++; showExamQuestion(); }, 1200);
            });
        });
    };

    const renderCheckpointResults = () => {
        let totalQuestions = 0, totalCorrect = 0, diagnosticsHtml = '';
        Object.values(stats).forEach(themeStat => {
            if (themeStat.total === 0) return;
            totalQuestions += themeStat.total;
            totalCorrect += themeStat.correct;
            const pct = Math.round((themeStat.correct / themeStat.total) * 100);
            diagnosticsHtml += `<div class="flex justify-between items-center mb-2 border-b border-gray-100 pb-2"><span class="text-sm font-bold text-gray-700">${themeStat.title}</span><span class="text-sm ${pct < 80 ? 'text-red-500 font-bold' : 'text-green-600'}">${pct}%</span></div>`;
        });
        const finalScore = Math.round((totalCorrect / totalQuestions) * 100);
        const passed = finalScore >= 80;

        if (passed) {
            const nextThemeId = ctx.flat[flatIndex + 1] ? ctx.flat[flatIndex + 1].theme_id : null;
            appState = markThemeCompleted(ctx.type, checkpointData.theme_id, nextThemeId, []);
        }

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col items-center justify-center h-full max-w-md mx-auto w-full text-center px-4 pt-4">
                <div class="w-24 h-24 ${passed ? 'bg-green-100 border-green-400 text-green-600' : 'bg-red-100 border-red-400 text-red-600'} rounded-full flex items-center justify-center mb-4 border-4 shadow-md"><i data-lucide="${passed ? 'trophy' : 'alert-triangle'}" class="w-12 h-12"></i></div>
                <h2 class="text-3xl font-bold text-gray-800 mb-1">${passed ? '¡Prueba Superada!' : 'Prueba Fallida'}</h2>
                <p class="text-gray-500 font-bold mb-6">Nota: ${finalScore}%</p>
                <div class="bg-white border border-gray-200 rounded-xl p-5 w-full mb-8 text-left shadow-sm"><h4 class="font-bold text-gray-800 mb-4 uppercase text-xs tracking-wider">Diagnóstico por Temas</h4>${diagnosticsHtml}${!passed ? '<p class="text-xs text-red-500 mt-4 font-bold bg-red-50 p-2 rounded">Necesitas un 80% para avanzar.</p>' : ''}</div>
                <button id="btn-success-back" class="w-full bg-gray-900 text-white py-4 rounded-xl font-bold shadow-md hover:bg-gray-800 transition-colors">Volver</button>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-success-back').addEventListener('click', () => ctx.type === 'vocab' ? renderVocabThemeList(ctx) : renderKanjiThemeList(ctx));
    };

    showExamQuestion();
};

// --- MÓDULO VOCABULARIO ---

const renderVocabThemeList = (ctx) => {
    const blockTitle = ctx.blocks[ctx.bIdx].block_title;
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col gap-4 w-full max-w-md mx-auto mt-4 pb-8 animate-fade-in">
            <button id="btn-back-blocks" class="text-gray-500 flex items-center gap-1 self-start mb-2"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver a Bloques</button>
            <h2 class="text-2xl font-bold text-gray-800 mb-2">${blockTitle}</h2>
            ${generateThemeListHtml(ctx)}
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back-blocks').addEventListener('click', () => renderBlockList(ctx.blocks, 'vocab'));
    
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.currentTarget.getAttribute('data-unlocked') !== 'true') return alert('Desbloquea primero el tema anterior.');
            const flatIndex = parseInt(e.currentTarget.getAttribute('data-flat-index'));
            const nextThemeId = e.currentTarget.getAttribute('data-next');
            const isCp = e.currentTarget.getAttribute('data-checkpoint') === 'true';
            const theme = ctx.flat[flatIndex];
            
            if (isCp) startCheckpoint(theme, flatIndex, ctx); 
            else renderVocabSubmenu(theme, nextThemeId, ctx);
        });
    });
};

const renderVocabSubmenu = (vocabTheme, nextThemeId, ctx) => {
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 pb-8 animate-fade-in">
            <button id="btn-back-submenu" class="text-gray-500 flex items-center gap-1 self-start mb-6"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver a temas</button>
            <h2 class="text-2xl font-bold text-gray-800 mb-1">${vocabTheme.theme_title}</h2>
            <p class="text-gray-500 mb-6 text-sm">Entrena libremente. El tema se guardará cuando pases el Examen al 100%.</p>
            
            <h3 class="font-bold text-gray-400 uppercase tracking-widest text-xs mb-3">Zona de Entrenamiento (Libre)</h3>
            <div class="flex flex-col gap-3 mb-6">
                <button id="btn-v-study" class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-primary transition-colors flex items-center gap-4 text-left">
                    <div class="bg-blue-100 text-blue-600 p-3 rounded-xl"><i data-lucide="book-open"></i></div>
                    <div><h3 class="font-bold text-gray-800">Estudio (Flashcards)</h3><p class="text-xs text-gray-500">Aprende sin presión.</p></div>
                </button>
                <button id="btn-v-listen" class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-primary transition-colors flex items-center gap-4 text-left">
                    <div class="bg-purple-100 text-purple-600 p-3 rounded-xl"><i data-lucide="headphones"></i></div>
                    <div><h3 class="font-bold text-gray-800">Oído (Audio)</h3><p class="text-xs text-gray-500">Escucha y traduce.</p></div>
                </button>
                <button id="btn-v-inverse" class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-primary transition-colors flex items-center gap-4 text-left">
                    <div class="bg-orange-100 text-orange-600 p-3 rounded-xl"><i data-lucide="arrow-left-right"></i></div>
                    <div><h3 class="font-bold text-gray-800">Traducción Inversa</h3><p class="text-xs text-gray-500">Español -> Japonés.</p></div>
                </button>
                <button id="btn-v-read" class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-primary transition-colors flex items-center gap-4 text-left">
                    <div class="bg-green-100 text-green-600 p-3 rounded-xl"><i data-lucide="eye"></i></div>
                    <div><h3 class="font-bold text-gray-800">Lectura Rápida</h3><p class="text-xs text-gray-500">Japonés -> Español.</p></div>
                </button>
            </div>

            <h3 class="font-bold text-red-400 uppercase tracking-widest text-xs mb-3">Zona de Evaluación</h3>
            <button id="btn-v-exam" class="bg-red-50 border-2 border-red-500 p-5 rounded-xl shadow-md hover:bg-red-100 transition-colors flex items-center gap-4 text-left">
                <div class="bg-red-500 text-white p-3 rounded-xl"><i data-lucide="award"></i></div>
                <div><h3 class="font-bold text-red-900 text-lg">Examen del Tema</h3><p class="text-xs text-red-700">Requiere 100% para aprobar.</p></div>
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
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 animate-fade-in">
                <div class="flex justify-between text-gray-500 font-bold mb-6">
                    <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold uppercase">Estudio</span>
                    <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center gap-4 mb-8 text-center">
                    <p class="text-gray-400 font-bold tracking-widest">${item.kana}</p>
                    <h2 class="text-7xl font-bold text-gray-800 tracking-wider">${item.kanji || item.kana}</h2>
                    <div class="bg-blue-50 text-blue-700 font-bold text-xl py-2 px-6 rounded-xl border border-blue-200 mt-2">${item.meaning}</div>
                    <button id="btn-audio" class="mt-6 p-6 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 shadow-sm"><i data-lucide="volume-2" class="w-10 h-10"></i></button>
                </div>
                <button id="btn-next" class="w-full bg-gray-900 text-white py-5 rounded-xl font-bold shadow-md hover:bg-gray-800 flex justify-center gap-2 pb-8">Siguiente <i data-lucide="arrow-right"></i></button>
            </div>
        `;
        lucide.createIcons();
        playJapaneseAudio(item.kana);
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
            alert("¡Entrenamiento completado!");
            return renderVocabSubmenu(vocabTheme, null, ctx);
        }

        const item = exerciseItems[currentIndex];
        let correct = '', options = [], topHtml = '';

        if(mode === 'listening') {
            correct = item.meaning;
            options = shuffleArray([correct, ...getDistractors(item, vocabTheme.items, 'meaning', 3)]);
            topHtml = `<button id="btn-audio-q" class="p-8 bg-purple-100 text-purple-600 rounded-full shadow-sm animate-pulse mb-4"><i data-lucide="volume-2" class="w-12 h-12"></i></button><p class="text-gray-500 font-bold uppercase tracking-widest text-sm">¿Qué significa?</p>`;
        } else if (mode === 'inverse') {
            correct = item.kanji || item.kana;
            options = shuffleArray([correct, ...getDistractors(item, vocabTheme.items, item.kanji ? 'kanji' : 'kana', 3)]);
            topHtml = `<p class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Traduce al Japonés</p><h2 class="text-4xl font-bold text-gray-800 text-center">${item.meaning}</h2>`;
        } else if (mode === 'reading') {
            correct = item.meaning;
            options = shuffleArray([correct, ...getDistractors(item, vocabTheme.items, 'meaning', 3)]);
            topHtml = `<p class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Traduce al Español</p><h2 class="text-6xl font-bold text-gray-800 text-center tracking-widest">${item.kanji || item.kana}</h2><button id="btn-audio-q" class="mt-4 p-3 bg-gray-100 text-gray-600 rounded-full"><i data-lucide="volume-2"></i></button>`;
        }

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 animate-fade-in">
                <div class="flex justify-between text-gray-500 font-bold mb-6">
                    <span class="bg-gray-200 text-gray-800 px-3 py-1 rounded-full text-xs font-bold uppercase">Entrenamiento</span>
                    <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center mb-8">${topHtml}</div>
                <div class="grid grid-cols-1 gap-3 pb-8" id="options-container">
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 p-4 rounded-xl font-bold text-gray-700 hover:border-primary hover:text-primary text-left text-lg shadow-sm" data-answer="${opt}">${opt}</button>`).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => renderVocabSubmenu(vocabTheme, null, ctx));
        
        if(document.getElementById('btn-audio-q')) {
            document.getElementById('btn-audio-q').addEventListener('click', () => playJapaneseAudio(item.kana));
            if(mode === 'listening') playJapaneseAudio(item.kana);
        }

        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => btn.addEventListener('click', (e) => {
            const ans = e.target.getAttribute('data-answer');
            optionButtons.forEach(b => b.disabled = true);
            if (ans === correct) {
                e.target.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                if(mode !== 'listening') playJapaneseAudio(item.kana);
            } else {
                e.target.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
                Array.from(optionButtons).find(b => b.getAttribute('data-answer') === correct).classList.add('bg-green-100', 'border-green-500');
            }
            setTimeout(() => { currentIndex++; showQuestion(); }, 1200);
        }));
    };
    showQuestion();
};

const startVocabExam = (vocabTheme, nextThemeId, ctx) => {
    const exerciseItems = shuffleArray([...vocabTheme.items, ...vocabTheme.items]); 
    let currentIndex = 0;
    let mistakes = 0;

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
        const distractors = getDistractors(item, vocabTheme.items, isInverse ? (item.kanji ? 'kanji' : 'kana') : 'meaning', 3);
        const options = shuffleArray([correct, ...distractors]);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 animate-fade-in">
                <div class="flex justify-between text-red-500 font-bold mb-6">
                    <span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold uppercase"><i data-lucide="swords" class="inline w-3 h-3"></i> Examen Oficial</span>
                    <span class="text-xs text-gray-500">${currentIndex + 1} / ${exerciseItems.length}</span>
                    <button id="btn-quit" class="hover:text-red-700"><i data-lucide="x"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center mb-8 text-center">
                    <p class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">${isInverse ? 'Traduce al Japonés' : 'Traduce al Español'}</p>
                    <h2 class="${isInverse ? 'text-4xl' : 'text-6xl tracking-widest'} font-bold text-gray-800">${isInverse ? item.meaning : (item.kanji || item.kana)}</h2>
                </div>
                <div class="grid grid-cols-1 gap-3 pb-8" id="options-container">
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 p-4 rounded-xl font-bold text-gray-700 hover:border-red-500 hover:text-red-600 text-left text-lg shadow-sm" data-answer="${opt}">${opt}</button>`).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => renderVocabSubmenu(vocabTheme, nextThemeId, ctx));
        
        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => btn.addEventListener('click', (e) => {
            const ans = e.target.getAttribute('data-answer');
            optionButtons.forEach(b => b.disabled = true);
            if (ans === correct) {
                e.target.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
            } else {
                mistakes++;
                e.target.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
                Array.from(optionButtons).find(b => b.getAttribute('data-answer') === correct).classList.add('bg-green-100', 'border-green-500');
            }
            setTimeout(() => { currentIndex++; showQuestion(); }, 1200);
        }));
    };
    showQuestion();
};

// --- MÓDULO KANJI ---

const renderKanjiThemeList = (ctx) => {
    const blockTitle = ctx.blocks[ctx.bIdx].block_title;
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col gap-4 w-full max-w-md mx-auto mt-4 pb-8 animate-fade-in">
            <button id="btn-back-blocks" class="text-gray-500 flex items-center gap-1 self-start mb-2"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver a Bloques</button>
            <h2 class="text-2xl font-bold text-gray-800 mb-2">${blockTitle}</h2>
            ${generateThemeListHtml(ctx)}
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back-blocks').addEventListener('click', () => renderBlockList(ctx.blocks, 'kanji'));
    
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.currentTarget.getAttribute('data-unlocked') !== 'true') return alert('Desbloquea primero el tema anterior.');
            const flatIndex = parseInt(e.currentTarget.getAttribute('data-flat-index'));
            const nextThemeId = e.currentTarget.getAttribute('data-next');
            const isCp = e.currentTarget.getAttribute('data-checkpoint') === 'true';
            const theme = ctx.flat[flatIndex];
            
            if (isCp) startCheckpoint(theme, flatIndex, ctx);
            else renderKanjiSubmenu(theme, nextThemeId, ctx);
        });
    });
};

const renderKanjiSubmenu = (kanjiTheme, nextThemeId, ctx) => {
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 pb-8 animate-fade-in">
            <button id="btn-back-submenu" class="text-gray-500 flex items-center gap-1 self-start mb-6"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver a temas</button>
            <h2 class="text-2xl font-bold text-gray-800 mb-1">${kanjiTheme.theme_title}</h2>
            <p class="text-gray-500 mb-6 text-sm">Entrena libremente. Supera el Examen al 100% para avanzar.</p>
            
            <h3 class="font-bold text-gray-400 uppercase tracking-widest text-xs mb-3">Zona de Entrenamiento</h3>
            <div class="flex flex-col gap-3 mb-6">
                <button id="btn-k-gallery" class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-secondary transition-colors flex items-center gap-4 text-left">
                    <div class="bg-blue-100 text-blue-600 p-3 rounded-xl"><i data-lucide="book-open"></i></div>
                    <div><h3 class="font-bold text-gray-800">Galería (Estudio)</h3><p class="text-xs text-gray-500">Mnemotecnias y trazos.</p></div>
                </button>
                <button id="btn-k-despiece" class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-secondary transition-colors flex items-center gap-4 text-left">
                    <div class="bg-purple-100 text-purple-600 p-3 rounded-xl"><i data-lucide="scissors"></i></div>
                    <div><h3 class="font-bold text-gray-800">Despiece</h3><p class="text-xs text-gray-500">Separa en radicales.</p></div>
                </button>
                <button id="btn-k-forja" class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-secondary transition-colors flex items-center gap-4 text-left">
                    <div class="bg-orange-100 text-orange-600 p-3 rounded-xl"><i data-lucide="hammer"></i></div>
                    <div><h3 class="font-bold text-gray-800">Forja</h3><p class="text-xs text-gray-500">Construye desde cero.</p></div>
                </button>
                <button id="btn-k-jukugo" class="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-secondary transition-colors flex items-center gap-4 text-left">
                    <div class="bg-indigo-100 text-indigo-600 p-3 rounded-xl"><i data-lucide="message-circle"></i></div>
                    <div><h3 class="font-bold text-gray-800">Jukugos</h3><p class="text-xs text-gray-500">Palabras y lecturas.</p></div>
                </button>
            </div>

            <h3 class="font-bold text-red-400 uppercase tracking-widest text-xs mb-3">Zona de Evaluación</h3>
            <button id="btn-k-exam" class="bg-red-50 border-2 border-red-500 p-5 rounded-xl shadow-md hover:bg-red-100 transition-colors flex items-center gap-4 text-left">
                <div class="bg-red-500 text-white p-3 rounded-xl"><i data-lucide="award"></i></div>
                <div><h3 class="font-bold text-red-900 text-lg">Examen del Tema</h3><p class="text-xs text-red-700">Requiere 100% para aprobar.</p></div>
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
        if(currentIndex >= kanjiTheme.items.length) {
            alert("Galería terminada.");
            return renderKanjiSubmenu(kanjiTheme, null, ctx);
        }
        const item = kanjiTheme.items[currentIndex];
        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 animate-fade-in">
                <div class="flex justify-between text-gray-500 font-bold mb-6">
                    <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold uppercase">Galería</span>
                    <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center gap-4 mb-8 text-center">
                    <h2 class="text-8xl font-bold text-gray-800 tracking-wider">${item.kanji}</h2>
                    <div class="bg-secondary text-white font-bold text-xl py-2 px-6 rounded-xl shadow-sm mt-2">${item.meaning}</div>
                    
                    <div class="w-full bg-gray-50 border border-gray-200 p-4 rounded-xl text-left shadow-sm mt-4">
                        <p class="text-xs font-bold text-gray-500 uppercase mb-1">Mnemotecnia</p>
                        <p class="text-sm text-gray-700 italic">"${item.mnemonic}"</p>
                        <div class="mt-3 flex gap-2 justify-center">
                            ${item.radicals.map(r => `<span class="bg-white border border-gray-300 px-3 py-1 rounded text-lg font-bold">${r}</span>`).join('+')}
                        </div>
                    </div>
                </div>
                <button id="btn-next" class="w-full bg-gray-900 text-white py-5 rounded-xl font-bold shadow-md hover:bg-gray-800 flex justify-center gap-2 pb-8">Siguiente <i data-lucide="arrow-right"></i></button>
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

        const currentItem = exerciseQueue[currentIndex];
        const isPhase1 = phase === 1;
        const totalSlots = currentItem.radicals.length;
        const availablePieces = shuffleArray([...currentItem.radicals, ...currentItem.dummy_radicals]);
        let selectedPieces = [];

        const updateBoard = () => {
            const slotsContainer = document.getElementById('slots-container');
            const piecesContainer = document.getElementById('pieces-container');
            
            slotsContainer.innerHTML = Array.from({ length: totalSlots }).map((_, i) => `<div class="w-16 h-16 border-2 border-dashed ${selectedPieces[i] ? 'border-secondary bg-gray-100' : 'border-gray-300'} rounded-xl flex items-center justify-center text-3xl font-bold text-gray-800 cursor-pointer" data-slot-index="${i}">${selectedPieces[i] ? selectedPieces[i].char : ''}</div>`).join('');
            piecesContainer.innerHTML = availablePieces.map((char, index) => {
                if (selectedPieces.some(p => p.originalIndex === index)) return `<div class="w-14 h-14 opacity-0"></div>`;
                return `<button class="radical-piece w-14 h-14 bg-white border-2 border-gray-200 rounded-lg shadow-sm text-2xl font-bold text-gray-700 hover:border-secondary hover:text-secondary" data-char="${char}" data-original-index="${index}">${char}</button>`;
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
            if (selectedPieces.map(p => p.char).sort().join('') === currentItem.radicals.slice().sort().join('')) {
                document.getElementById('slots-container').innerHTML = isPhase1 
                    ? `<div class="text-xl font-bold text-green-600 bg-green-100 px-6 py-4 rounded-xl border-2 border-green-500 shadow-sm">¡Correcto!</div>`
                    : `<div class="w-32 h-32 bg-green-100 border-4 border-green-500 rounded-2xl flex items-center justify-center text-6xl font-bold text-green-700 shadow-lg scale-110">${currentItem.kanji}</div>`;
                setTimeout(() => { currentIndex++; showQuestion(); }, 1500);
            } else {
                const sc = document.getElementById('slots-container');
                sc.classList.add('animate-pulse', 'border-red-500');
                setTimeout(() => { selectedPieces = []; sc.classList.remove('animate-pulse', 'border-red-500'); updateBoard(); }, 800);
            }
        };

        const questionContent = isPhase1
            ? `<div class="text-center mb-4"><div class="text-8xl font-bold text-gray-800 mb-2 drop-shadow-sm">${currentItem.kanji}</div><h3 class="text-xl font-bold text-gray-700 uppercase tracking-wide mb-1">${currentItem.meaning}</h3></div>`
            : `<div class="bg-orange-50 p-6 rounded-2xl border border-orange-100 mb-6 text-center shadow-inner"><h3 class="text-2xl font-bold text-gray-800 mb-3 uppercase tracking-wide">${currentItem.meaning}</h3><p class="text-gray-600 text-sm italic">"${currentItem.mnemonic}"</p></div>`;

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4">
                <div class="flex justify-between items-center text-gray-500 font-bold mb-6">
                    <span class="${isPhase1 ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-orange-100 text-orange-800 border-orange-200'} px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border">${isPhase1 ? 'Despiece' : 'Forja'}</span>
                    <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                </div>
                ${questionContent}
                <div class="flex-grow flex flex-col items-center justify-center mb-6"><div id="slots-container" class="flex gap-4 p-4 min-h-[6rem]"></div></div>
                <div class="bg-gray-100 p-6 rounded-t-3xl -mx-4 pb-12 shadow-inner border-t border-gray-200"><div id="pieces-container" class="flex flex-wrap justify-center gap-3"></div></div>
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
    kanjiTheme.items.forEach(item => {
        if (item.context_words) {
            item.context_words.forEach(cw => exerciseQueue.push({
                ...cw, parent_kanji: item.kanji, parent_on: item.onyomi.join(', '), parent_kun: item.kunyomi.join(', ')
            }));
        }
    });
    
    exerciseQueue = shuffleArray(exerciseQueue);
    let currentIndex = 0;
    let subState = 'PUZZLE'; 

    const showStep = () => {
        if (currentIndex >= exerciseQueue.length) {
            alert("¡Jukugos dominados!");
            return renderKanjiSubmenu(kanjiTheme, null, ctx);
        }

        const currentItem = exerciseQueue[currentIndex];

        if (subState === 'PUZZLE') {
            const correctChars = currentItem.word.split('');
            const totalSlots = correctChars.length;
            const dummyPieces = currentItem.dummy_pieces || ['日', '月', '木'];
            const availablePieces = shuffleArray([...correctChars, ...dummyPieces]);
            let selectedPieces = [];

            const updateSemanticBoard = () => {
                const slotsContainer = document.getElementById('sem-slots-container');
                const piecesContainer = document.getElementById('sem-pieces-container');
                
                slotsContainer.innerHTML = Array.from({ length: totalSlots }).map((_, i) => `<div class="w-16 h-16 border-2 border-dashed ${selectedPieces[i] ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'} rounded-xl flex items-center justify-center text-3xl font-bold text-gray-800 cursor-pointer" data-slot-index="${i}">${selectedPieces[i] ? selectedPieces[i].char : ''}</div>`).join('');
                
                piecesContainer.innerHTML = availablePieces.map((char, index) => {
                    if (selectedPieces.some(p => p.originalIndex === index)) return `<div class="w-14 h-14 opacity-0"></div>`;
                    return `<button class="sem-piece w-14 h-14 bg-white border-2 border-gray-200 rounded-lg shadow-sm text-2xl font-bold text-gray-700 hover:border-indigo-500 hover:text-indigo-600" data-char="${char}" data-original-index="${index}">${char}</button>`;
                }).join('');

                document.querySelectorAll('.sem-piece').forEach(btn => btn.addEventListener('click', (e) => {
                    if (selectedPieces.length >= totalSlots) return;
                    selectedPieces.push({ char: e.target.getAttribute('data-char'), originalIndex: parseInt(e.target.getAttribute('data-original-index')) });
                    updateSemanticBoard(); checkSemanticVictory();
                }));

                document.querySelectorAll('#sem-slots-container > div').forEach(slot => slot.addEventListener('click', (e) => {
                    const idx = e.currentTarget.getAttribute('data-slot-index');
                    if (selectedPieces[idx]) { selectedPieces.splice(idx, 1); updateSemanticBoard(); }
                }));
            };

            const checkSemanticVictory = () => {
                if (selectedPieces.length !== totalSlots) return;
                if (selectedPieces.map(p => p.char).join('') === correctChars.join('')) {
                    document.getElementById('sem-slots-container').innerHTML = `<div class="px-8 py-4 bg-indigo-100 border-4 border-indigo-500 rounded-2xl flex items-center justify-center text-5xl font-bold text-indigo-700 shadow-lg scale-110">${currentItem.word}</div>`;
                    setTimeout(() => { subState = 'PRESENTATION'; showStep(); }, 1200);
                } else {
                    const sc = document.getElementById('sem-slots-container');
                    sc.classList.add('animate-pulse', 'border-red-500');
                    setTimeout(() => { selectedPieces = []; sc.classList.remove('animate-pulse', 'border-red-500'); updateSemanticBoard(); }, 800);
                }
            };

            document.getElementById('app-view').innerHTML = `
                <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 animate-fade-in">
                    <div class="flex justify-between items-center text-gray-500 font-bold mb-6">
                        <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-indigo-200">Paso 1: Construye</span>
                        <span class="text-xs">${currentIndex + 1} / ${exerciseQueue.length}</span>
                        <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                    </div>
                    <div class="text-center mb-4">
                        <p class="text-gray-500 text-sm font-bold uppercase mb-2">Une por significado</p>
                        <h3 class="text-3xl font-bold text-gray-800 tracking-wide">"${currentItem.meaning}"</h3>
                    </div>
                    <div class="flex-grow flex flex-col items-center justify-center mb-6"><div id="sem-slots-container" class="flex gap-4 p-4 min-h-[6rem]"></div></div>
                    <div class="bg-gray-100 p-6 rounded-t-3xl -mx-4 pb-12 shadow-inner border-t border-gray-200"><div id="sem-pieces-container" class="flex flex-wrap justify-center gap-3"></div></div>
                </div>
            `;
            lucide.createIcons();
            document.getElementById('btn-quit').addEventListener('click', () => renderKanjiSubmenu(kanjiTheme, null, ctx));
            updateSemanticBoard();

        } else if (subState === 'PRESENTATION') {
            let ruleColor = currentItem.rule === 'ON' ? 'bg-blue-100 text-blue-800 border-blue-200' 
                          : currentItem.rule === 'KUN' ? 'bg-green-100 text-green-800 border-green-200' 
                          : 'bg-red-100 text-red-800 border-red-200';

            document.getElementById('app-view').innerHTML = `
                <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 animate-fade-in">
                    <div class="flex justify-between items-center text-gray-500 font-bold mb-4">
                        <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-indigo-200">Paso 2: Aprende</span>
                        <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                    </div>
                    
                    <div class="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-2 w-full text-center flex flex-col gap-2 shadow-sm">
                        <span class="text-xs font-bold text-gray-500 uppercase">Kanji Objetivo: <span class="text-lg text-gray-800">${currentItem.parent_kanji}</span></span>
                        <div class="flex justify-center gap-2 text-xs">
                            <span class="text-blue-700 font-bold">ON: ${currentItem.parent_on}</span>
                            <span class="text-green-700 font-bold">KUN: ${currentItem.parent_kun}</span>
                        </div>
                    </div>

                    <div class="flex-grow flex flex-col items-center justify-center text-center gap-2 mt-2">
                        <span class="${ruleColor} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border mb-2">Regla: ${currentItem.rule || 'KUN'}</span>
                        <div class="text-lg font-bold text-indigo-600 tracking-widest">${currentItem.full_reading}</div>
                        <div class="text-6xl font-bold text-gray-800 mb-2">${currentItem.word}</div>
                        
                        <div class="w-full bg-yellow-50 border border-yellow-200 p-4 rounded-xl text-left shadow-sm mt-2">
                            <p class="text-xs font-bold text-yellow-800 uppercase mb-1 flex items-center gap-1"><i data-lucide="brain-circuit" class="w-4 h-4"></i> Lógica de lectura</p>
                            <p class="text-sm text-yellow-900">${currentItem.etymology || 'Lectura compuesta.'}</p>
                        </div>
                        
                        <button id="btn-audio" class="mt-4 p-4 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors shadow-sm"><i data-lucide="volume-2" class="w-8 h-8"></i></button>
                    </div>

                    <div class="pb-8 mt-4">
                        <button id="btn-continue" class="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-colors flex justify-center items-center gap-2">Practicar Lectura <i data-lucide="arrow-right"></i></button>
                    </div>
                </div>
            `;
            lucide.createIcons();
            playJapaneseAudio(currentItem.full_reading); 

            document.getElementById('btn-quit').addEventListener('click', () => renderKanjiSubmenu(kanjiTheme, null, ctx));
            document.getElementById('btn-audio').addEventListener('click', () => playJapaneseAudio(currentItem.full_reading));
            document.getElementById('btn-continue').addEventListener('click', () => { subState = 'PRACTICE'; showStep(); });

        } else if (subState === 'PRACTICE') {
            const options = shuffleArray([currentItem.full_reading, ...currentItem.distractors.slice(0, 3)]);
            document.getElementById('app-view').innerHTML = `
                <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 animate-fade-in">
                    <div class="flex justify-between items-center text-gray-500 font-bold mb-6">
                        <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-indigo-200">Paso 3: Práctica</span>
                        <span class="text-xs">${currentIndex + 1} / ${exerciseQueue.length}</span>
                    </div>
                    <div class="flex-grow flex flex-col items-center justify-center text-center mb-8">
                        <p class="text-gray-500 text-sm font-bold uppercase mb-2">¿Cómo se lee esta palabra?</p>
                        <div class="text-6xl font-bold text-gray-800 mb-6 tracking-widest">${currentItem.word}</div>
                        <div class="bg-gray-100 text-gray-700 py-2 px-6 rounded-xl inline-block font-bold border border-gray-200 shadow-sm">"${currentItem.meaning}"</div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 pb-8 w-full" id="options-container">
                        ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 py-5 rounded-xl font-bold text-xl text-gray-700 hover:border-indigo-500 hover:text-indigo-600 shadow-sm" data-answer="${opt}">${opt}</button>`).join('')}
                    </div>
                </div>
            `;
            lucide.createIcons();

            const optionButtons = document.querySelectorAll('.option-btn');
            optionButtons.forEach(btn => btn.addEventListener('click', (e) => {
                const ans = e.currentTarget.getAttribute('data-answer');
                optionButtons.forEach(b => b.disabled = true);
                if (ans === currentItem.full_reading) {
                    e.currentTarget.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                    playJapaneseAudio(currentItem.full_reading);
                } else {
                    e.currentTarget.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
                    Array.from(optionButtons).find(b => b.getAttribute('data-answer') === currentItem.full_reading).classList.add('bg-green-100', 'border-green-500', 'text-green-700');
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
    let currentIndex = 0;
    let mistakes = 0;

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
        let correct, distractors, display;

        if(q.type === 'meaning') {
            correct = q.data.meaning;
            distractors = getDistractors(q.data, kanjiTheme.items, 'meaning', 3);
            display = q.data.kanji;
        } else {
            correct = q.data.full_reading;
            distractors = q.data.distractors.slice(0, 3);
            display = q.data.word;
        }

        const options = shuffleArray([correct, ...distractors]);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4">
                <div class="flex justify-between items-center text-red-500 font-bold mb-6">
                    <span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-red-200"><i data-lucide="award" class="w-3 h-3 inline"></i> Examen Final</span>
                    <span class="text-xs text-gray-500">${currentIndex + 1} / ${exerciseQueue.length}</span>
                    <button id="btn-quit" class="hover:text-red-700"><i data-lucide="x"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center text-center mb-8">
                    <p class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">${q.type === 'meaning' ? 'Traduce al Español' : '¿Cómo se lee?'}</p>
                    <div class="text-6xl font-bold text-gray-800 mb-6 tracking-widest">${display}</div>
                </div>
                <div class="grid grid-cols-2 gap-3 pb-8 w-full" id="options-container">
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 py-5 rounded-xl font-bold text-xl text-gray-700 hover:border-red-500 hover:text-red-600 shadow-sm" data-answer="${opt}">${opt}</button>`).join('')}
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
                e.currentTarget.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
            } else {
                mistakes++;
                e.currentTarget.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
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
        document.getElementById('app-view').innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg max-w-md mx-auto mt-4"><p class="font-bold">Error fatal.</p><p class="text-sm">${error.message}</p></div>`;
    }
};

document.addEventListener('DOMContentLoaded', bootApp);