import { loadProgress, exportProgress, importProgress } from './storage.js';
import { getManifest } from './dataService.js';

// Estado global en memoria para evitar llamadas constantes a localStorage
let appState = null;
let manifestData = null;

const initUI = () => {
    // Inicializar Iconos Lucide
    lucide.createIcons();

    // Bindear eventos de Exportar/Importar
    document.getElementById('btn-export').addEventListener('click', exportProgress);
    
    document.getElementById('input-import').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        if (confirm('¿Estás seguro de sobrescribir tu progreso actual con este archivo?')) {
            importProgress(file, () => {
                alert('Progreso importado con éxito. La aplicación se recargará.');
                location.reload();
            });
        }
        event.target.value = ''; // Limpiar input
    });
};

const renderDashboard = () => {
    const appView = document.getElementById('app-view');
    // Esto es un placeholder. En la Fase 2 crearemos componentes reales.
    appView.innerHTML = `
        <div class="flex flex-col gap-6">
            <section class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 class="text-xl font-bold mb-2">Bienvenido de nuevo</h2>
                <p class="text-gray-600">Nivel actual cargado: <span class="font-bold text-primary">${manifestData.levels[0].name}</span></p>
                <div class="mt-4 grid grid-cols-2 gap-4">
                    <button class="bg-primary text-white py-3 px-4 rounded-lg font-bold shadow-md hover:bg-red-600 transition-colors">
                        Vocabulario
                    </button>
                    <button class="bg-secondary text-white py-3 px-4 rounded-lg font-bold shadow-md hover:bg-gray-800 transition-colors">
                        Kanjis
                    </button>
                </div>
            </section>
        </div>
    `;
};

const bootApp = async () => {
    try {
        initUI();
        appState = loadProgress();
        manifestData = await getManifest();

        if (!manifestData) {
            throw new Error("No se pudo cargar el manifest.json");
        }

        renderDashboard();
    } catch (error) {
        document.getElementById('app-view').innerHTML = `
            <div class="p-4 bg-red-100 text-red-700 rounded-lg">
                <p class="font-bold">Error fatal al iniciar la app.</p>
                <p class="text-sm">${error.message}</p>
            </div>
        `;
    }
};

// Iniciar aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', bootApp);