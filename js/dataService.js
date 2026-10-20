const fetchJSON = async (url) => {
    try {
        const response = await fetch(url);
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