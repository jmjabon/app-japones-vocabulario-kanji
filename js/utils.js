// Algoritmo Fisher-Yates para barajar arrays de forma óptima
export const shuffleArray = (array) => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
};

// Generador de distractores dinámicos
export const getDistractors = (correctItem, allItems, field, count = 3) => {
    // Filtramos para quitar la respuesta correcta
    const others = allItems.filter(item => item.id !== correctItem.id);
    const shuffledOthers = shuffleArray(others);
    // Extraemos solo el campo que nos interesa (ej: 'meaning')
    return shuffledOthers.slice(0, count).map(item => item[field]);
};