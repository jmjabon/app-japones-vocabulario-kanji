import { loadProgress, exportProgress, importProgress, markThemeCompleted } from './storage.js';
import { getManifest, getVocabData, getKanjiData } from './dataService.js';
import { shuffleArray, getDistractors } from './utils.js';
import { playJapaneseAudio } from './audio.js';

let appState = null;
let manifestData = null;

// --- INICIALIZACIÓN ---

const initUI = () => {
    lucide.createIcons();
    
    // Controles de Exportar / Importar
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

// --- RENDERIZADO GLOBAL ---

const renderDashboard = () => {
    const appView = document.getElementById('app-view');
    appView.innerHTML = `
        <div class="flex flex-col gap-6 w-full max-w-md mx-auto mt-4">
            <section class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 class="text-xl font-bold mb-2 text-gray-800">Bienvenido</h2>
                <p class="text-gray-600 mb-6">Nivel activo: <span class="font-bold text-primary">${manifestData.levels[0].name}</span></p>
                
                <div class="flex flex-col gap-4">
                    <button id="btn-start-vocab" class="w-full bg-primary text-white py-4 px-4 rounded-xl font-bold shadow-md hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
                        <i data-lucide="book-type"></i> Vocabulario
                    </button>
                    <button id="btn-start-kanji" class="w-full bg-secondary text-white py-4 px-4 rounded-xl font-bold shadow-md hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
                        <i data-lucide="pen-tool"></i> Kanjis
                    </button>
                </div>
            </section>
        </div>
    `;
    lucide.createIcons();

    document.getElementById('btn-start-vocab').addEventListener('click', async () => {
        const vocabData = await getVocabData(manifestData.levels[0].vocab_file);
        renderVocabThemeList(vocabData);
    });

    document.getElementById('btn-start-kanji').addEventListener('click', async () => {
        const kanjiData = await getKanjiData(manifestData.levels[0].kanji_file);
        renderKanjiThemeList(kanjiData);
    });
};

const renderSuccessScreen = (type, currentTheme, itemsCount, backCallback) => {
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col items-center justify-center h-full max-w-md mx-auto w-full text-center px-4 animate-fade-in pt-8">
            <div class="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 border-4 border-green-400 shadow-md">
                <i data-lucide="award" class="w-12 h-12 text-green-600"></i>
            </div>
            <h2 class="text-3xl font-bold text-gray-800 mb-2">¡Completado!</h2>
            <p class="text-gray-600 mb-8">Has dominado "${currentTheme.theme_title}".</p>
            
            <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 w-full mb-8 text-left flex items-start gap-4 shadow-sm">
                <i data-lucide="layers" class="w-6 h-6 text-blue-500 mt-1"></i>
                <div>
                    <p class="font-bold text-gray-800 text-sm">Añadidos al Repaso Diario</p>
                    <p class="text-xs text-gray-500">${itemsCount} elementos transferidos al motor de memoria a largo plazo.</p>
                </div>
            </div>

            <button id="btn-success-back" class="w-full bg-gray-900 text-white py-4 rounded-xl font-bold shadow-md hover:bg-gray-800 transition-colors">
                Continuar
            </button>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-success-back').addEventListener('click', backCallback);
};

// --- MÓDULO VOCABULARIO ---

const renderVocabThemeList = (vocabThemes) => {
    // --- PARCHE DE SEGURIDAD ---
    if (!vocabThemes) return alert("Error de lectura en el JSON de Vocabulario.");
    if (!Array.isArray(vocabThemes)) vocabThemes = [vocabThemes]; // Lo fuerza a ser un Array

    const appView = document.getElementById('app-view');
    
    const themeCardsHtml = vocabThemes.map((theme, index) => {
        const isUnlocked = appState.progress.unlocked_vocab_themes.includes(theme.theme_id);
        const isCompleted = appState.progress.completed_vocab_themes.includes(theme.theme_id);
        const nextThemeId = vocabThemes[index + 1] ? vocabThemes[index + 1].theme_id : null;
        
        let statusIcon = isCompleted ? '<i data-lucide="check-circle" class="text-green-500"></i>' 
                     : (isUnlocked ? '<i data-lucide="unlock" class="text-blue-500"></i>' 
                     : '<i data-lucide="lock" class="text-gray-400"></i>');

        let borderClass = isCompleted ? 'border-green-500 bg-green-50' 
                        : (isUnlocked ? 'border-primary bg-white' : 'border-gray-200 bg-gray-100 opacity-70');

        return `
            <div class="${borderClass} border-2 p-5 rounded-xl shadow-sm transition-transform transform hover:scale-[1.02] cursor-pointer theme-card" data-index="${index}" data-unlocked="${isUnlocked}" data-next="${nextThemeId}">
                <div class="flex justify-between items-center">
                    <h3 class="font-bold text-lg text-gray-800">${theme.theme_title}</h3>
                    ${statusIcon}
                </div>
                <p class="text-sm text-gray-500 mt-1">${theme.items.length} palabras</p>
            </div>
        `;
    }).join('');

    appView.innerHTML = `
        <div class="flex flex-col gap-4 w-full max-w-md mx-auto mt-4">
            <button id="btn-back" class="text-gray-500 hover:text-primary flex items-center gap-1 self-start mb-2"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver</button>
            <h2 class="text-2xl font-bold text-gray-800 mb-2">Temas de Vocabulario</h2>
            ${themeCardsHtml}
        </div>
    `;
    lucide.createIcons();

    document.getElementById('btn-back').addEventListener('click', renderDashboard);
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const isUnlocked = e.currentTarget.getAttribute('data-unlocked') === 'true';
            if (!isUnlocked) return alert('Desbloquea primero el tema anterior.');
            
            const themeIndex = e.currentTarget.getAttribute('data-index');
            const nextThemeId = e.currentTarget.getAttribute('data-next');
            startVocabExercise(vocabThemes[themeIndex], nextThemeId, vocabThemes);
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

        const currentItem = exerciseItems[currentIndex];
        const correctAnswer = currentItem.meaning;
        const distractors = getDistractors(currentItem, vocabTheme.items, 'meaning', 3);
        const options = shuffleArray([correctAnswer, ...distractors]);

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4">
                <div class="flex justify-between text-gray-500 text-sm font-bold mb-6">
                    <span>Pregunta ${currentIndex + 1} de ${exerciseItems.length}</span>
                    <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                </div>

                <div class="flex-grow flex flex-col items-center justify-center gap-8 mb-8">
                    <h2 class="text-5xl font-bold text-gray-800 tracking-wider">${currentItem.kanji || currentItem.kana}</h2>
                    <button id="btn-audio" class="p-4 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors shadow-sm"><i data-lucide="volume-2" class="w-8 h-8"></i></button>
                </div>

                <div class="grid grid-cols-1 gap-3 pb-8" id="options-container">
                    ${options.map(opt => `
                        <button class="option-btn bg-white border-2 border-gray-200 p-4 rounded-xl font-bold text-gray-700 hover:border-primary hover:text-primary transition-colors text-left" data-answer="${opt}">
                            ${opt}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();

        document.getElementById('btn-quit').addEventListener('click', renderDashboard);
        document.getElementById('btn-audio').addEventListener('click', () => playJapaneseAudio(currentItem.kana));
        playJapaneseAudio(currentItem.kana);

        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const selectedAnswer = e.target.getAttribute('data-answer');
                optionButtons.forEach(b => b.disabled = true);

                if (selectedAnswer === correctAnswer) {
                    e.target.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                } else {
                    e.target.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
                    Array.from(optionButtons).find(b => b.getAttribute('data-answer') === correctAnswer).classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                }

                setTimeout(() => { currentIndex++; showQuestion(); }, 1500);
            });
        });
    };

    showQuestion();
};

// --- MÓDULO KANJI ---

const renderKanjiThemeList = (kanjiThemes) => {
    // --- PARCHE DE SEGURIDAD ---
    if (!kanjiThemes) return alert("Error de lectura en el JSON de Kanjis.");
    if (!Array.isArray(kanjiThemes)) kanjiThemes = [kanjiThemes]; // Lo fuerza a ser un Array
    
    const appView = document.getElementById('app-view');
    
    const themeCardsHtml = kanjiThemes.map((theme, index) => {
        const isUnlocked = appState.progress.unlocked_kanji_themes.includes(theme.theme_id);
        const isCompleted = appState.progress.completed_kanji_themes.includes(theme.theme_id);
        const nextThemeId = kanjiThemes[index + 1] ? kanjiThemes[index + 1].theme_id : null;
        
        let statusIcon = isCompleted ? '<i data-lucide="check-circle" class="text-green-500"></i>' 
                     : (isUnlocked ? '<i data-lucide="unlock" class="text-blue-500"></i>' 
                     : '<i data-lucide="lock" class="text-gray-400"></i>');

        let borderClass = isCompleted ? 'border-green-500 bg-green-50' 
                        : (isUnlocked ? 'border-secondary bg-white' : 'border-gray-200 bg-gray-100 opacity-70');

        return `
            <div class="${borderClass} border-2 p-5 rounded-xl shadow-sm transition-transform transform hover:scale-[1.02] cursor-pointer theme-card" data-index="${index}" data-unlocked="${isUnlocked}" data-next="${nextThemeId}">
                <div class="flex justify-between items-center">
                    <h3 class="font-bold text-lg text-gray-800">${theme.theme_title}</h3>
                    ${statusIcon}
                </div>
                <p class="text-sm text-gray-500 mt-1">${theme.items.length} kanjis</p>
            </div>
        `;
    }).join('');

    appView.innerHTML = `
        <div class="flex flex-col gap-4 w-full max-w-md mx-auto mt-4">
            <button id="btn-back" class="text-gray-500 hover:text-primary flex items-center gap-1 self-start mb-2"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver</button>
            <h2 class="text-2xl font-bold text-gray-800 mb-2">Temas de Kanjis</h2>
            ${themeCardsHtml}
        </div>
    `;
    lucide.createIcons();

    document.getElementById('btn-back').addEventListener('click', renderDashboard);
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const isUnlocked = e.currentTarget.getAttribute('data-unlocked') === 'true';
            if (!isUnlocked) return alert('Desbloquea primero el tema anterior.');
            
            const themeIndex = e.currentTarget.getAttribute('data-index');
            const nextThemeId = e.currentTarget.getAttribute('data-next');
            startKanjiExercise(kanjiThemes[themeIndex], nextThemeId, kanjiThemes);
        });
    });
};

const startKanjiExercise = (kanjiTheme, nextThemeId, allThemesData) => {
    const baseItems = shuffleArray(kanjiTheme.items);
    const exerciseQueue = [
        ...baseItems.map(item => ({ ...item, phase: 1 })),
        ...shuffleArray(baseItems).map(item => ({ ...item, phase: 2 }))
    ];
    
    let currentIndex = 0;

    const showQuestion = () => {
        if (currentIndex >= exerciseQueue.length) {
            appState = markThemeCompleted('kanji', kanjiTheme.theme_id, nextThemeId !== "null" ? nextThemeId : null, kanjiTheme.items);
            return renderSuccessScreen('kanji', kanjiTheme, kanjiTheme.items.length, () => renderKanjiThemeList(allThemesData));
        }

        const currentItem = exerciseQueue[currentIndex];
        const isPhase1 = currentItem.phase === 1;

        const correctRadicals = currentItem.radicals;
        const totalSlots = correctRadicals.length;
        const availablePieces = shuffleArray([...correctRadicals, ...currentItem.dummy_radicals]);
        
        let selectedPieces = [];

        const updateBoard = () => {
            const slotsContainer = document.getElementById('slots-container');
            const piecesContainer = document.getElementById('pieces-container');
            
            slotsContainer.innerHTML = Array.from({ length: totalSlots }).map((_, i) => {
                const piece = selectedPieces[i];
                return `
                    <div class="w-16 h-16 border-2 border-dashed ${piece ? 'border-secondary bg-gray-100' : 'border-gray-300'} rounded-xl flex items-center justify-center text-3xl font-bold text-gray-800 cursor-pointer transition-colors" data-slot-index="${i}">
                        ${piece ? piece.char : ''}
                    </div>
                `;
            }).join('');

            piecesContainer.innerHTML = availablePieces.map((char, index) => {
                const isSelected = selectedPieces.some(p => p.originalIndex === index);
                if (isSelected) return `<div class="w-14 h-14 opacity-0"></div>`;
                return `
                    <button class="radical-piece w-14 h-14 bg-white border-2 border-gray-200 rounded-lg shadow-sm text-2xl font-bold text-gray-700 hover:border-secondary hover:text-secondary transition-colors" data-char="${char}" data-original-index="${index}">
                        ${char}
                    </button>
                `;
            }).join('');

            bindPuzzleEvents();
        };

        const checkVictory = () => {
            if (selectedPieces.length !== totalSlots) return;

            const userChars = selectedPieces.map(p => p.char).sort().join('');
            const targetChars = correctRadicals.slice().sort().join('');
            const slotsContainer = document.getElementById('slots-container');

            if (userChars === targetChars) {
                if (isPhase1) {
                    slotsContainer.innerHTML = `<div class="text-xl font-bold text-green-600 bg-green-100 px-6 py-4 rounded-xl border-2 border-green-500 shadow-sm">¡Piezas correctas!</div>`;
                } else {
                    slotsContainer.innerHTML = `
                        <div class="w-32 h-32 bg-green-100 border-4 border-green-500 rounded-2xl flex items-center justify-center text-6xl font-bold text-green-700 shadow-lg scale-110 transition-transform duration-300">
                            ${currentItem.kanji}
                        </div>
                    `;
                }
                setTimeout(() => { currentIndex++; showQuestion(); }, 1600);
            } else {
                slotsContainer.classList.add('animate-pulse', 'border-red-500');
                setTimeout(() => {
                    selectedPieces = [];
                    slotsContainer.classList.remove('animate-pulse', 'border-red-500');
                    updateBoard();
                }, 800);
            }
        };

        const bindPuzzleEvents = () => {
            document.querySelectorAll('.radical-piece').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (selectedPieces.length >= totalSlots) return;
                    selectedPieces.push({
                        char: e.target.getAttribute('data-char'),
                        originalIndex: parseInt(e.target.getAttribute('data-original-index'))
                    });
                    updateBoard();
                    checkVictory();
                });
            });

            document.querySelectorAll('#slots-container > div').forEach((slot) => {
                slot.addEventListener('click', (e) => {
                    const idx = e.currentTarget.getAttribute('data-slot-index');
                    if (selectedPieces[idx]) {
                        selectedPieces.splice(idx, 1);
                        updateBoard();
                    }
                });
            });
        };

        const headerBadge = isPhase1 
            ? `<span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-blue-200">Fase 1: Análisis</span>`
            : `<span class="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-purple-200">Fase 2: Memoria</span>`;

        const questionContent = isPhase1
            ? `
                <div class="text-center mb-4">
                    <div class="text-8xl font-bold text-gray-800 mb-2 drop-shadow-sm">${currentItem.kanji}</div>
                    <h3 class="text-xl font-bold text-gray-700 uppercase tracking-wide mb-1">${currentItem.meaning}</h3>
                    <p class="text-gray-500 text-sm">Identifica los componentes de este kanji.</p>
                </div>
              `
            : `
                <div class="bg-purple-50 p-6 rounded-2xl border border-purple-100 mb-6 text-center shadow-inner">
                    <h3 class="text-2xl font-bold text-gray-800 mb-3 uppercase tracking-wide">${currentItem.meaning}</h3>
                    <p class="text-gray-600 text-sm italic">"${currentItem.mnemonic}"</p>
                </div>
              `;

        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4">
                <div class="flex justify-between items-center text-gray-500 font-bold mb-6">
                    ${headerBadge}
                    <span class="text-xs">Paso ${currentIndex + 1} de ${exerciseQueue.length}</span>
                    <button id="btn-quit" class="hover:text-primary transition-colors"><i data-lucide="x"></i></button>
                </div>
                
                ${questionContent}

                <div class="flex-grow flex flex-col items-center justify-center mb-6">
                    <div id="slots-container" class="flex gap-4 p-4 min-h-[6rem]"></div>
                </div>

                <div class="bg-gray-100 p-6 rounded-t-3xl -mx-4 pb-12 shadow-inner border-t border-gray-200">
                    <p class="text-center text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest">Elige ${totalSlots} componentes</p>
                    <div id="pieces-container" class="flex flex-wrap justify-center gap-3"></div>
                </div>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('btn-quit').addEventListener('click', renderDashboard);
        
        updateBoard();
    };

    showQuestion();
};

// --- ARRANQUE DE LA APLICACIÓN ---

const bootApp = async () => {
    try {
        initUI();
        appState = loadProgress();
        manifestData = await getManifest();
        if (!manifestData) throw new Error("No se pudo cargar el manifest.json");
        
        renderDashboard();
    } catch (error) {
        document.getElementById('app-view').innerHTML = `
            <div class="p-4 bg-red-100 text-red-700 rounded-lg max-w-md mx-auto mt-4">
                <p class="font-bold">Error fatal al iniciar la app.</p>
                <p class="text-sm">${error.message}</p>
            </div>
        `;
    }
};

document.addEventListener('DOMContentLoaded', bootApp);