import { loadProgress, exportProgress, importProgress } from './storage.js';
import { getManifest, getVocabData } from './dataService.js';
import { shuffleArray, getDistractors } from './utils.js';
import { playJapaneseAudio } from './audio.js';

let appState = null;
let manifestData = null;
let currentVocabTheme = null; // Guardará los datos del tema activo

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

// --- RENDERIZADORES DE VISTAS ---

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
                    <button class="w-full bg-secondary text-white py-4 px-4 rounded-xl font-bold shadow-md hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 opacity-50 cursor-not-allowed">
                        <i data-lucide="pen-tool"></i> Kanjis (Próximamente)
                    </button>
                </div>
            </section>
        </div>
    `;
    lucide.createIcons();

    document.getElementById('btn-start-vocab').addEventListener('click', async () => {
        // Cargar los datos del JSON de vocabulario definido en el manifest
        const vocabFile = manifestData.levels[0].vocab_file;
        const vocabData = await getVocabData(vocabFile);
        renderVocabThemeList(vocabData);
    });
};

const renderVocabThemeList = (vocabData) => {
    const appView = document.getElementById('app-view');
    
    // Verificamos si el tema está desbloqueado en el localStorage
    const isUnlocked = appState.progress.unlocked_vocab_themes.includes(vocabData.theme_id);
    
    appView.innerHTML = `
        <div class="flex flex-col gap-4 w-full max-w-md mx-auto mt-4">
            <button id="btn-back" class="text-gray-500 hover:text-primary flex items-center gap-1 self-start mb-2">
                <i data-lucide="arrow-left" class="w-5 h-5"></i> Volver
            </button>
            
            <h2 class="text-2xl font-bold text-gray-800">Temas de Vocabulario</h2>
            
            <div class="${isUnlocked ? 'bg-white border-primary' : 'bg-gray-100 border-gray-200'} border-2 p-5 rounded-xl shadow-sm cursor-pointer transition-transform transform hover:scale-[1.02]" id="theme-card">
                <div class="flex justify-between items-center">
                    <h3 class="font-bold text-lg text-gray-800">${vocabData.theme_title}</h3>
                    ${isUnlocked 
                        ? '<i data-lucide="unlock" class="text-green-500"></i>' 
                        : '<i data-lucide="lock" class="text-gray-400"></i>'}
                </div>
                <p class="text-sm text-gray-500 mt-1">${vocabData.items.length} palabras</p>
            </div>
        </div>
    `;
    lucide.createIcons();

    document.getElementById('btn-back').addEventListener('click', renderDashboard);
    
    document.getElementById('theme-card').addEventListener('click', () => {
        if (!isUnlocked) {
            alert('Debes completar el tema anterior para desbloquear este.');
            return;
        }
        startVocabExercise(vocabData);
    });
};

// --- LÓGICA DEL EJERCICIO DE VOCABULARIO ---

const startVocabExercise = (vocabData) => {
    currentVocabTheme = vocabData;
    // Barajamos las preguntas para que no salgan en el mismo orden
    const exerciseItems = shuffleArray(vocabData.items);
    let currentIndex = 0;

    const showQuestion = () => {
        if (currentIndex >= exerciseItems.length) {
            alert("¡Tema completado! Aquí guardaremos tu progreso en el futuro.");
            renderDashboard();
            return;
        }

        const currentItem = exerciseItems[currentIndex];
        
        // 1. Obtener la respuesta correcta y 3 distractores
        const correctAnswer = currentItem.meaning;
        const distractors = getDistractors(currentItem, currentVocabTheme.items, 'meaning', 3);
        
        // 2. Unir todo y barajar las 4 opciones
        const options = shuffleArray([correctAnswer, ...distractors]);

        const appView = document.getElementById('app-view');
        appView.innerHTML = `
            <div class="flex flex-col h-full max-w-md mx-auto w-full pt-4">
                <div class="flex justify-between text-gray-500 text-sm font-bold mb-6">
                    <span>Pregunta ${currentIndex + 1} de ${exerciseItems.length}</span>
                    <button id="btn-quit" class="hover:text-primary"><i data-lucide="x"></i></button>
                </div>

                <div class="flex-grow flex flex-col items-center justify-center gap-8 mb-8">
                    <h2 class="text-5xl font-bold text-gray-800 tracking-wider">${currentItem.kanji || currentItem.kana}</h2>
                    <button id="btn-audio" class="p-4 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors shadow-sm">
                        <i data-lucide="volume-2" class="w-8 h-8"></i>
                    </button>
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

        // Eventos de la pregunta
        document.getElementById('btn-quit').addEventListener('click', renderDashboard);
        
        const playBtn = document.getElementById('btn-audio');
        playBtn.addEventListener('click', () => playJapaneseAudio(currentItem.kana));
        
        // Reproducir audio automáticamente al mostrar la tarjeta (Requiere que el usuario haya hecho click antes para entrar)
        playJapaneseAudio(currentItem.kana);

        // Lógica de respuesta
        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const selectedAnswer = e.target.getAttribute('data-answer');
                
                // Desactivar todos los botones para evitar doble clic
                optionButtons.forEach(b => b.disabled = true);

                if (selectedAnswer === correctAnswer) {
                    e.target.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                } else {
                    e.target.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
                    // Mostrar la correcta
                    const correctBtn = Array.from(optionButtons).find(b => b.getAttribute('data-answer') === correctAnswer);
                    correctBtn.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                }

                // Pasar a la siguiente tras 1.5 segundos
                setTimeout(() => {
                    currentIndex++;
                    showQuestion();
                }, 1500);
            });
        });
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
        document.getElementById('app-view').innerHTML = `
            <div class="p-4 bg-red-100 text-red-700 rounded-lg max-w-md mx-auto mt-4">
                <p class="font-bold">Error al iniciar la app.</p>
                <p class="text-sm">${error.message}</p>
            </div>
        `;
    }
};

document.addEventListener('DOMContentLoaded', bootApp);