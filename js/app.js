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
    vocabData.forEach(theme => theme.items?.forEach(item => dict[item.id] = { ...item, type: 'vocab', allItems: theme.items }));
    kanjiData.forEach(theme => theme.items?.forEach(item => dict[item.id] = { ...item, type: 'kanji', allItems: theme.items }));
    return dict;
};

// --- RENDERIZADORES COMPARTIDOS ---

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
                <p class="text-indigo-200 mb-6 relative z-10 text-sm">Sistema de Memoria a Largo Plazo</p>
                <button id="btn-start-srs" class="w-full bg-white text-indigo-600 py-4 px-4 rounded-xl font-bold shadow-md hover:bg-gray-50 transition-colors flex items-center justify-between gap-2 ${dueCount === 0 ? 'opacity-90 cursor-not-allowed' : ''}" ${dueCount === 0 ? 'disabled' : ''}>
                    <span class="flex items-center gap-2">${dueCount > 0 ? '<i data-lucide="play-circle"></i> Iniciar Sesión' : '<i data-lucide="check-circle"></i> Todo al día'}</span>
                    <span class="${dueCount > 0 ? 'bg-red-500 text-white' : 'bg-green-100 text-green-700'} px-3 py-1 rounded-full text-sm shadow-inner">${dueCount} pendientes</span>
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
    document.getElementById('btn-start-vocab').addEventListener('click', async () => renderVocabThemeList(await getVocabData(manifestData.levels[0].vocab_file)));
    document.getElementById('btn-start-kanji').addEventListener('click', async () => renderKanjiThemeList(await getKanjiData(manifestData.levels[0].kanji_file)));
};

const renderSuccessScreen = (type, currentTheme, itemsCount, backCallback) => {
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col items-center justify-center h-full max-w-md mx-auto w-full text-center px-4 animate-fade-in pt-8">
            <div class="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 border-4 border-green-400 shadow-md"><i data-lucide="award" class="w-12 h-12 text-green-600"></i></div>
            <h2 class="text-3xl font-bold text-gray-800 mb-2">¡Completado!</h2>
            <p class="text-gray-600 mb-8">Has dominado "${currentTheme.theme_title}".</p>
            <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 w-full mb-8 text-left flex items-start gap-4 shadow-sm">
                <i data-lucide="layers" class="w-6 h-6 text-blue-500 mt-1"></i>
                <div><p class="font-bold text-gray-800 text-sm">Añadidos al Repaso Diario</p><p class="text-xs text-gray-500">${itemsCount} elementos transferidos.</p></div>
            </div>
            <button id="btn-success-back" class="w-full bg-gray-900 text-white py-4 rounded-xl font-bold shadow-md hover:bg-gray-800 transition-colors">Continuar</button>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-success-back').addEventListener('click', backCallback);
};

const generateThemeListHtml = (themes, type) => {
    return themes.map((theme, index) => {
        const unlockedKey = `unlocked_${type}_themes`;
        const completedKey = `completed_${type}_themes`;
        
        const isUnlocked = appState.progress[unlockedKey].includes(theme.theme_id);
        const isCompleted = appState.progress[completedKey].includes(theme.theme_id);
        const nextThemeId = themes[index + 1] ? themes[index + 1].theme_id : null;
        const isCheckpoint = theme.type === 'checkpoint';
        
        let statusIcon, borderClass;

        if (isCheckpoint) {
            statusIcon = isCompleted ? '<i data-lucide="award" class="text-yellow-500"></i>' 
                       : (isUnlocked ? '<i data-lucide="swords" class="text-red-500 animate-pulse"></i>' : '<i data-lucide="lock" class="text-gray-400"></i>');
            borderClass = isCompleted ? 'border-yellow-500 bg-yellow-50' 
                        : (isUnlocked ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-100 opacity-70');
        } else {
            statusIcon = isCompleted ? '<i data-lucide="check-circle" class="text-green-500"></i>' 
                       : (isUnlocked ? '<i data-lucide="unlock" class="text-blue-500"></i>' : '<i data-lucide="lock" class="text-gray-400"></i>');
            borderClass = isCompleted ? 'border-green-500 bg-green-50' 
                        : (isUnlocked ? (type === 'vocab' ? 'border-primary bg-white' : 'border-secondary bg-white') : 'border-gray-200 bg-gray-100 opacity-70');
        }

        return `
            <div class="${borderClass} border-2 p-5 rounded-xl shadow-sm transition-transform transform hover:scale-[1.02] cursor-pointer theme-card" data-index="${index}" data-unlocked="${isUnlocked}" data-next="${nextThemeId}" data-checkpoint="${isCheckpoint}">
                <div class="flex justify-between items-center">
                    <h3 class="font-bold text-lg ${isCheckpoint && !isCompleted && isUnlocked ? 'text-red-700' : 'text-gray-800'}">${theme.theme_title}</h3>
                    ${statusIcon}
                </div>
                <p class="text-sm text-gray-500 mt-1">${isCheckpoint ? 'Examen de control' : `${theme.items?.length || 0} ítems`}</p>
            </div>
        `;
    }).join('');
};

// --- MOTOR SRS ---

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
                    <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">Repaso SRS</span>
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

// --- MOTOR DE CHECKPOINTS ---

const startCheckpoint = (checkpointData, currentIndex, allThemes, type) => {
    const numThemesRequired = checkpointData.requires_count || 2;
    const themesToTest = allThemes.slice(currentIndex - numThemesRequired, currentIndex);
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
        document.getElementById('btn-quit').addEventListener('click', renderDashboard);

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
            const nextThemeId = allThemes[currentIndex + 1] ? allThemes[currentIndex + 1].theme_id : null;
            appState = markThemeCompleted(type, checkpointData.theme_id, nextThemeId, []);
        }

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col items-center justify-center h-full max-w-md mx-auto w-full text-center px-4 pt-4">
                <div class="w-24 h-24 ${passed ? 'bg-green-100 border-green-400 text-green-600' : 'bg-red-100 border-red-400 text-red-600'} rounded-full flex items-center justify-center mb-4 border-4 shadow-md"><i data-lucide="${passed ? 'trophy' : 'alert-triangle'}" class="w-12 h-12"></i></div>
                <h2 class="text-3xl font-bold text-gray-800 mb-1">${passed ? '¡Prueba Superada!' : 'Prueba Fallida'}</h2>
                <p class="text-gray-500 font-bold mb-6">Nota: ${finalScore}%</p>
                <div class="bg-white border border-gray-200 rounded-xl p-5 w-full mb-8 text-left shadow-sm"><h4 class="font-bold text-gray-800 mb-4 uppercase text-xs tracking-wider">Diagnóstico por Temas</h4>${diagnosticsHtml}${!passed ? '<p class="text-xs text-red-500 mt-4 font-bold bg-red-50 p-2 rounded">Necesitas un 80% para desbloquear el siguiente tema.</p>' : ''}</div>
                <button id="btn-success-back" class="w-full bg-gray-900 text-white py-4 rounded-xl font-bold shadow-md hover:bg-gray-800 transition-colors">Volver</button>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-success-back').addEventListener('click', () => type === 'vocab' ? renderVocabThemeList(allThemes) : renderKanjiThemeList(allThemes));
    };

    showExamQuestion();
};

// --- MÓDULO VOCABULARIO ---

const renderVocabThemeList = (vocabThemes) => {
    if (!Array.isArray(vocabThemes)) vocabThemes = [vocabThemes];
    const themeCardsHtml = generateThemeListHtml(vocabThemes, 'vocab');
    document.getElementById('app-view').innerHTML = `<div class="flex flex-col gap-4 w-full max-w-md mx-auto mt-4 pb-8"><button id="btn-back" class="text-gray-500 flex items-center gap-1 self-start mb-2"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver</button><h2 class="text-2xl font-bold text-gray-800 mb-2">Vocabulario</h2>${themeCardsHtml}</div>`;
    lucide.createIcons();
    document.getElementById('btn-back').addEventListener('click', renderDashboard);
    
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const isUnlocked = e.currentTarget.getAttribute('data-unlocked') === 'true';
            if (!isUnlocked) return alert('Desbloquea primero el tema anterior.');
            const index = parseInt(e.currentTarget.getAttribute('data-index'));
            const isCp = e.currentTarget.getAttribute('data-checkpoint') === 'true';
            if (isCp) startCheckpoint(vocabThemes[index], index, vocabThemes, 'vocab');
            else startVocabExercise(vocabThemes[index], e.currentTarget.getAttribute('data-next'), vocabThemes);
        });
    });
};

const startVocabExercise = (vocabTheme, nextThemeId, allThemesData) => {
    const exerciseItems = shuffleArray(vocabTheme.items);
    let currentIndex = 0;
    const showQuestion = () => {
        if (currentIndex >= exerciseItems.length) {
            appState = markThemeCompleted('vocab', vocabTheme.theme_id, nextThemeId !== "null" ? nextThemeId : null, vocabTheme.items);
            return renderSuccessScreen('vocab', vocabTheme, vocabTheme.items.length, () => renderVocabThemeList(allThemesData));
        }
        const item = exerciseItems[currentIndex];
        const correct = item.meaning;
        const options = shuffleArray([correct, ...getDistractors(item, vocabTheme.items, 'meaning', 3)]);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4">
                <div class="flex justify-between text-gray-500 text-sm font-bold mb-6"><span>Pregunta ${currentIndex + 1} / ${exerciseItems.length}</span><button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button></div>
                <div class="flex-grow flex flex-col items-center justify-center gap-8 mb-8"><h2 class="text-5xl font-bold text-gray-800 tracking-wider">${item.kanji || item.kana}</h2><button id="btn-audio" class="p-4 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100"><i data-lucide="volume-2" class="w-8 h-8"></i></button></div>
                <div class="grid grid-cols-1 gap-3 pb-8" id="options-container">${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 p-4 rounded-xl font-bold text-gray-700 hover:border-primary hover:text-primary text-left" data-answer="${opt}">${opt}</button>`).join('')}</div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', renderDashboard);
        document.getElementById('btn-audio').addEventListener('click', () => playJapaneseAudio(item.kana));
        playJapaneseAudio(item.kana);

        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ans = e.target.getAttribute('data-answer');
                optionButtons.forEach(b => b.disabled = true);
                if (ans === correct) e.target.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                else {
                    e.target.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
                    Array.from(optionButtons).find(b => b.getAttribute('data-answer') === correct).classList.add('bg-green-100', 'border-green-500');
                }
                setTimeout(() => { currentIndex++; showQuestion(); }, 1500);
            });
        });
    };
    showQuestion();
};

// --- MÓDULO KANJI REFACTORIZADO (MISIONES MODULARES) ---

const renderKanjiThemeList = (kanjiThemes) => {
    if (!Array.isArray(kanjiThemes)) kanjiThemes = [kanjiThemes];
    const themeCardsHtml = generateThemeListHtml(kanjiThemes, 'kanji');
    document.getElementById('app-view').innerHTML = `<div class="flex flex-col gap-4 w-full max-w-md mx-auto mt-4 pb-8"><button id="btn-back" class="text-gray-500 flex items-center gap-1 self-start mb-2"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver</button><h2 class="text-2xl font-bold text-gray-800 mb-2">Kanjis</h2>${themeCardsHtml}</div>`;
    lucide.createIcons();
    document.getElementById('btn-back').addEventListener('click', renderDashboard);
    
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const isUnlocked = e.currentTarget.getAttribute('data-unlocked') === 'true';
            if (!isUnlocked) return alert('Desbloquea primero el tema anterior.');
            const index = parseInt(e.currentTarget.getAttribute('data-index'));
            const isCp = e.currentTarget.getAttribute('data-checkpoint') === 'true';
            
            if (isCp) startCheckpoint(kanjiThemes[index], index, kanjiThemes, 'kanji');
            else renderKanjiSubmenu(kanjiThemes[index], e.currentTarget.getAttribute('data-next'), kanjiThemes);
        });
    });
};

const renderKanjiSubmenu = (kanjiTheme, nextThemeId, allThemesData) => {
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 pb-8 animate-fade-in">
            <button id="btn-back-submenu" class="text-gray-500 flex items-center gap-1 self-start mb-6"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver a temas</button>
            <h2 class="text-2xl font-bold text-gray-800 mb-2">${kanjiTheme.theme_title}</h2>
            <p class="text-gray-600 mb-8 text-sm">Elige qué habilidad quieres practicar.</p>
            
            <div class="flex flex-col gap-4">
                <button id="btn-m1" class="bg-white border-2 border-secondary p-5 rounded-2xl shadow-sm hover:bg-gray-50 transition-colors flex items-center gap-4 text-left">
                    <div class="bg-secondary text-white p-3 rounded-xl"><i data-lucide="puzzle"></i></div>
                    <div>
                        <h3 class="font-bold text-gray-800 text-lg">Misión 1: Estructura</h3>
                        <p class="text-sm text-gray-500">Analiza y construye los kanjis.</p>
                    </div>
                </button>

                <button id="btn-m2" class="bg-white border-2 border-indigo-400 p-5 rounded-2xl shadow-sm hover:bg-gray-50 transition-colors flex items-center gap-4 text-left">
                    <div class="bg-indigo-500 text-white p-3 rounded-xl"><i data-lucide="book-open"></i></div>
                    <div>
                        <h3 class="font-bold text-gray-800 text-lg">Misión 2: Vocabulario</h3>
                        <p class="text-sm text-gray-500">Aprende Jukugos y sus lecturas.</p>
                    </div>
                </button>

                <button id="btn-m3" class="bg-gray-900 border-2 border-gray-900 p-5 rounded-2xl shadow-md hover:bg-gray-800 transition-colors flex items-center gap-4 text-left mt-4">
                    <div class="bg-yellow-500 text-gray-900 p-3 rounded-xl"><i data-lucide="award"></i></div>
                    <div>
                        <h3 class="font-bold text-white text-lg">Misión 3: Integración</h3>
                        <p class="text-sm text-gray-300">Prueba final para completar el tema.</p>
                    </div>
                </button>
            </div>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back-submenu').addEventListener('click', () => renderKanjiThemeList(allThemesData));

    document.getElementById('btn-m1').addEventListener('click', () => startKanjiMission1(kanjiTheme, allThemesData));
    document.getElementById('btn-m2').addEventListener('click', () => startKanjiMission2(kanjiTheme, allThemesData));
    document.getElementById('btn-m3').addEventListener('click', () => startKanjiMission3(kanjiTheme, nextThemeId, allThemesData));
};

const startKanjiMission1 = (kanjiTheme, allThemesData) => {
    const baseItems = shuffleArray(kanjiTheme.items);
    const exerciseQueue = [...baseItems.map(item => ({ ...item, phase: 1 })), ...shuffleArray(baseItems).map(item => ({ ...item, phase: 2 }))];
    let currentIndex = 0;

    const showQuestion = () => {
        if (currentIndex >= exerciseQueue.length) {
            alert("¡Estructura dominada! Pasa a la Misión 2.");
            return renderKanjiSubmenu(kanjiTheme, null, allThemesData);
        }

        const currentItem = exerciseQueue[currentIndex];
        const isPhase1 = currentItem.phase === 1;
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
            : `<div class="bg-purple-50 p-6 rounded-2xl border border-purple-100 mb-6 text-center shadow-inner"><h3 class="text-2xl font-bold text-gray-800 mb-3 uppercase tracking-wide">${currentItem.meaning}</h3><p class="text-gray-600 text-sm italic">"${currentItem.mnemonic}"</p></div>`;

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4">
                <div class="flex justify-between items-center text-gray-500 font-bold mb-6">
                    <span class="${isPhase1 ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-purple-100 text-purple-800 border-purple-200'} px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border">Misión 1</span>
                    <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                </div>
                ${questionContent}
                <div class="flex-grow flex flex-col items-center justify-center mb-6"><div id="slots-container" class="flex gap-4 p-4 min-h-[6rem]"></div></div>
                <div class="bg-gray-100 p-6 rounded-t-3xl -mx-4 pb-12 shadow-inner border-t border-gray-200"><div id="pieces-container" class="flex flex-wrap justify-center gap-3"></div></div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => renderKanjiSubmenu(kanjiTheme, null, allThemesData));
        updateBoard();
    };
    showQuestion();
};

const startKanjiMission2 = (kanjiTheme, allThemesData) => {
    let phase3Items = [];
    kanjiTheme.items.forEach(item => {
        if (item.context_words) item.context_words.forEach(cw => phase3Items.push({ ...cw }));
    });
    const exerciseQueue = shuffleArray(phase3Items);
    let currentIndex = 0;
    let showingPresentation = true;

    const showQuestion = () => {
        if (currentIndex >= exerciseQueue.length) {
            alert("¡Vocabulario completado! Haz la Misión 3 para terminar.");
            return renderKanjiSubmenu(kanjiTheme, null, allThemesData);
        }

        const currentItem = exerciseQueue[currentIndex];

        if (showingPresentation) {
            // TARJETA DE PRESENTACIÓN DOCENTE
            document.getElementById('app-view').innerHTML = `
                <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 animate-fade-in">
                    <div class="flex justify-between items-center text-gray-500 font-bold mb-2">
                        <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-indigo-200">Aprende</span>
                        <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                    </div>
                    
                    <div class="flex-grow flex flex-col items-center justify-center text-center gap-4">
                        <div class="text-sm font-bold text-gray-400 tracking-widest">${currentItem.type_reading || 'ON'}</div>
                        <div class="text-7xl font-bold text-gray-800 mb-2">${currentItem.word}</div>
                        <div class="text-xl font-bold text-indigo-600 mb-4 bg-indigo-50 px-6 py-2 rounded-xl">${currentItem.meaning}</div>
                        
                        <div class="w-full bg-yellow-50 border border-yellow-200 p-4 rounded-xl text-left shadow-sm mt-4">
                            <p class="text-xs font-bold text-yellow-800 uppercase mb-1 flex items-center gap-1"><i data-lucide="lightbulb" class="w-4 h-4"></i> Etimología</p>
                            <p class="text-sm text-yellow-900">${currentItem.etymology || 'Forma compuesta'}</p>
                        </div>
                        
                        <button id="btn-audio" class="mt-4 p-5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors shadow-sm"><i data-lucide="volume-2" class="w-8 h-8"></i></button>
                    </div>

                    <div class="pb-8 mt-6">
                        <button id="btn-continue" class="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-colors flex justify-center items-center gap-2">Practicar Lectura <i data-lucide="arrow-right"></i></button>
                    </div>
                </div>
            `;
            lucide.createIcons();
            playJapaneseAudio(currentItem.correct); // Autoplay

            document.getElementById('btn-quit').addEventListener('click', () => renderKanjiSubmenu(kanjiTheme, null, allThemesData));
            document.getElementById('btn-audio').addEventListener('click', () => playJapaneseAudio(currentItem.correct));
            document.getElementById('btn-continue').addEventListener('click', () => {
                showingPresentation = false;
                showQuestion();
            });

        } else {
            // TARJETA DE EVALUACIÓN
            const options = shuffleArray([currentItem.correct, ...currentItem.distractors.slice(0, 3)]);
            const highlightedWord = currentItem.word.replace(currentItem.target, `<span class="text-indigo-600">${currentItem.target}</span>`);

            document.getElementById('app-view').innerHTML = `
                <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4 animate-fade-in">
                    <div class="flex justify-between items-center text-gray-500 font-bold mb-6">
                        <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-indigo-200">Práctica</span>
                        <span class="text-xs">${currentIndex + 1} / ${exerciseQueue.length}</span>
                    </div>
                    <div class="flex-grow flex flex-col items-center justify-center text-center mb-8">
                        <p class="text-gray-500 text-sm font-bold uppercase mb-2">Lectura del kanji destacado</p>
                        <div class="text-6xl font-bold text-gray-800 mb-6 tracking-widest">${highlightedWord}</div>
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
                if (ans === currentItem.correct) e.currentTarget.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                else {
                    e.currentTarget.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
                    Array.from(optionButtons).find(b => b.getAttribute('data-answer') === currentItem.correct).classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                }
                setTimeout(() => { 
                    currentIndex++; 
                    showingPresentation = true; // Resetea para la siguiente palabra
                    showQuestion(); 
                }, 1500);
            }));
        }
    };
    showQuestion();
};

const startKanjiMission3 = (kanjiTheme, nextThemeId, allThemesData) => {
    // Mini-test final del tema actual (solo jukugos por rapidez)
    let phase3Items = [];
    kanjiTheme.items.forEach(item => { if (item.context_words) item.context_words.forEach(cw => phase3Items.push({ ...cw })); });
    const exerciseQueue = shuffleArray(phase3Items).slice(0, 10); // Máximo 10 preguntas
    let currentIndex = 0;

    const showQuestion = () => {
        if (currentIndex >= exerciseQueue.length) {
            appState = markThemeCompleted('kanji', kanjiTheme.theme_id, nextThemeId !== "null" ? nextThemeId : null, kanjiTheme.items);
            return renderSuccessScreen('kanji', kanjiTheme, kanjiTheme.items.length, () => renderKanjiThemeList(allThemesData));
        }
        
        const currentItem = exerciseQueue[currentIndex];
        const options = shuffleArray([currentItem.correct, ...currentItem.distractors.slice(0, 3)]);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4">
                <div class="flex justify-between items-center text-gray-500 font-bold mb-6">
                    <span class="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-yellow-200"><i data-lucide="award" class="w-3 h-3 inline"></i> Examen Final</span>
                    <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                </div>
                <div class="flex-grow flex flex-col items-center justify-center text-center mb-8">
                    <div class="text-6xl font-bold text-gray-800 mb-6 tracking-widest">${currentItem.word}</div>
                </div>
                <div class="grid grid-cols-2 gap-3 pb-8 w-full" id="options-container">
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 py-5 rounded-xl font-bold text-xl text-gray-700 hover:border-yellow-500 hover:text-yellow-600 shadow-sm" data-answer="${opt}">${opt}</button>`).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', () => renderKanjiSubmenu(kanjiTheme, null, allThemesData));

        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => btn.addEventListener('click', (e) => {
            const isCorrect = e.currentTarget.getAttribute('data-answer') === currentItem.correct;
            optionButtons.forEach(b => b.disabled = true);
            if (isCorrect) e.currentTarget.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
            else {
                e.currentTarget.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
                Array.from(optionButtons).find(b => b.getAttribute('data-answer') === currentItem.correct).classList.add('bg-green-100', 'border-green-500');
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