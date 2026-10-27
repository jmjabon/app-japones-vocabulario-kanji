const fetchJSON = async (url) => {
    try {
        const cacheBusterUrl = `${url}?t=${Date.now()}`;
        const response = await fetch(cacheBusterUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return null;
    }
};

export const getManifest = () => fetchJSON('./data/manifest.json');
export const getVocabData = (fileName) => fetchJSON(`./data/${fileName}`);
export const getKanjiData = (fileName) => fetchJSON(`./data/${fileName}`);

export const getKanaData = async () => {
    try {
        const response = await fetch('./data/kana_data.json');
        return await response.json();
    } catch (error) {
        console.error("Error cargando Kana Data:", error);
        return null;
    }
};