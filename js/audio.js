export const playJapaneseAudio = (text) => {
    if (!('speechSynthesis' in window)) {
        console.warn('Tu navegador no soporta síntesis de voz.');
        return;
    }
    
    // Cancelamos cualquier audio anterior que se esté reproduciendo
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.85; // Un poco más lento para estudiantes
    
    window.speechSynthesis.speak(utterance);
};