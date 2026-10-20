import { loadProgress, exportProgress, importProgress } from './storage.js';
import { getManifest, getVocabData, getKanjiData } from './dataService.js';
import { shuffleArray, getDistractors } from './utils.js';
import { playJapaneseAudio } from './audio.js';

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

// --- VISTAS GLOBALES ---

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
                    <!-- ¡Botón de Kanji Activado! -->
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

// --- MÓDULO VOCABULARIO (Ya implementado en Fase 2) ---
// Mantenemos renderVocabThemeList y startVocabExercise tal y como estaban
const renderVocabThemeList = (vocabData) => {
    const isUnlocked = appState.progress.unlocked_vocab_themes.includes(vocabData.theme_id);
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col gap-4 w-full max-w-md mx-auto mt-4">
            <button id="btn-back" class="text-gray-500 hover:text-primary flex items-center gap-1 self-start mb-2"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver</button>
            <h2 class="text-2xl font-bold text-gray-800">Temas de Vocabulario</h2>
            <div class="${isUnlocked ? 'bg-white border-primary' : 'bg-gray-100 border-gray-200'} border-2 p-5 rounded-xl shadow-sm cursor-pointer transition-transform transform hover:scale-[1.02]" id="theme-card">
                <div class="flex justify-between items-center">
                    <h3 class="font-bold text-lg text-gray-800">${vocabData.theme_title}</h3>
                    ${isUnlocked ? '<i data-lucide="unlock" class="text-green-500"></i>' : '<i data-lucide="lock" class="text-gray-400"></i>'}
                </div>
                <p class="text-sm text-gray-500 mt-1">${vocabData.items.length} palabras</p>
            </div>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back').addEventListener('click', renderDashboard);
    document.getElementById('theme-card').addEventListener('click', () => {
        if (!isUnlocked) return alert('Debes completar el tema anterior para desbloquear este.');
        startVocabExercise(vocabData);
    });
};

const startVocabExercise = (vocabData) => {
    const exerciseItems = shuffleArray(vocabData.items);
    let currentIndex = 0;

    const showQuestion = () => {
        if (currentIndex >= exerciseItems.length) {
            alert("¡Tema de Vocabulario completado!");
            return renderDashboard();
        }
        const currentItem = exerciseItems[currentIndex];
        const correctAnswer = currentItem.meaning;
        const options = shuffleArray([correctAnswer, ...getDistractors(currentItem, vocabData.items, 'meaning', 3)]);

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
                    ${options.map(opt => `<button class="option-btn bg-white border-2 border-gray-200 p-4 rounded-xl font-bold text-gray-700 hover:border-primary hover:text-primary transition-colors text-left" data-answer="${opt}">${opt}</button>`).join('')}
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

// --- MÓDULO KANJI (NUEVO FASE 3) ---

const renderKanjiThemeList = (kanjiData) => {
    const isUnlocked = appState.progress.unlocked_kanji_themes.includes(kanjiData.theme_id);
    document.getElementById('app-view').innerHTML = `
        <div class="flex flex-col gap-4 w-full max-w-md mx-auto mt-4">
            <button id="btn-back" class="text-gray-500 hover:text-primary flex items-center gap-1 self-start mb-2"><i data-lucide="arrow-left" class="w-5 h-5"></i> Volver</button>
            <h2 class="text-2xl font-bold text-gray-800">Temas de Kanjis</h2>
            <div class="${isUnlocked ? 'bg-white border-secondary' : 'bg-gray-100 border-gray-200'} border-2 p-5 rounded-xl shadow-sm cursor-pointer transition-transform transform hover:scale-[1.02]" id="theme-card">
                <div class="flex justify-between items-center">
                    <h3 class="font-bold text-lg text-gray-800">${kanjiData.theme_title}</h3>
                    ${isUnlocked ? '<i data-lucide="unlock" class="text-green-500"></i>' : '<i data-lucide="lock" class="text-gray-400"></i>'}
                </div>
                <p class="text-sm text-gray-500 mt-1">${kanjiData.items.length} kanjis</p>
            </div>
        </div>
    `;
    lucide.createIcons();
    document.getElementById('btn-back').addEventListener('click', renderDashboard);
    document.getElementById('theme-card').addEventListener('click', () => {
        if (!isUnlocked) return alert('Debes completar el tema anterior.');
        startKanjiExercise(kanjiData);
    });
};

const startKanjiExercise = (kanjiData) => {
    // 1. Crear una cola de ejercicios en 2 bloques (Fase 1 primero, luego Fase 2 barajada)
    const baseItems = shuffleArray(kanjiData.items);
    const exerciseQueue = [
        ...baseItems.map(item => ({ ...item, phase: 1 })),
        ...shuffleArray(baseItems).map(item => ({ ...item, phase: 2 })) // Se barajan de nuevo para la Fase 2
    ];
    
    let currentIndex = 0;

    const showQuestion = () => {
        if (currentIndex >= exerciseQueue.length) {
            alert("¡Tema de Kanjis completado con éxito! Has dominado el análisis y la retención.");
            return renderDashboard();
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
                    // Fase 1: Feedback de acierto rápido
                    slotsContainer.innerHTML = `<div class="text-xl font-bold text-green-600 bg-green-100 px-6 py-4 rounded-xl border-2 border-green-500">¡Piezas correctas!</div>`;
                } else {
                    // Fase 2: Animación visual fusionando las piezas en el Kanji final
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

        // --- RENDERIZADO DIFERENCIADO POR FASES ---

        const headerBadge = isPhase1 
            ? `<span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-blue-200">Fase 1: Análisis</span>`
            : `<span class="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-purple-200">Fase 2: Memoria</span>`;

        // En Fase 1 mostramos el Kanji en grande. En Fase 2 mostramos la Mnemotecnia.
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

const bootApp = async () => {
    try {
        initUI();
        appState = loadProgress();
        manifestData = await getManifest();
        if (!manifestData) throw new Error("No se pudo cargar el manifest.json");
        renderDashboard();
    } catch (error) {
        document.getElementById('app-view').innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg max-w-md mx-auto mt-4"><p class="font-bold">Error al iniciar la app.</p><p class="text-sm">${error.message}</p></div>`;
    }
};

document.addEventListener('DOMContentLoaded', bootApp);