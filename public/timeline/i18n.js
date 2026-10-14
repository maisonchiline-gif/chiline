// i18n.js — Единый модуль локализации (RU / EN + автоперевод на все языки мира)

const rawLang = navigator.language || navigator.userLanguage || 'ru';
export const sysLang = (typeof rawLang === 'string' ? rawLang : 'ru').slice(0, 2).toLowerCase();

// Базовый язык до загрузки автоперевода: 'ru' для русского, 'en' для остальных
export let currentLang = (sysLang === 'ru') ? 'ru' : 'en';

const dict = {
    ru: {
        pageTitle: "Хронология Композиторов",
        btnZoomAll: "Отдалить камеру ко всем",
        btnSort: "Сортировка",
        btnAppearance: "Внешний вид",
        btnFacts: "Факты",
        searchPlaceholder: "Поиск...",
        composersCount: "Композиторов:",
        ageFrom: "Возраст: от",
        to: "до",
        yearsLabel: "лет",
        worksFrom: "Произведений: от",
        erasLabel: "Эпохи:",
        toggleAll: "Вкл/Выкл все",
        countriesLabel: "Страны:",
        displayMode: "Режим отображения:",
        modeTimeline: "Таймлайн",
        modeRating: "Рейтинг",
        layout: "Компоновка:",
        layoutCompact: "Компактно",
        layoutLinear: "Списком",
        grouping: "Группировка:",
        groupNone: "Общая",
        groupCountry: "По странам",
        groupEra: "По эпохам",
        sorting: "Сортировка:",
        sortBirth: "Рождение",
        sortDeath: "Смерть",
        xAxis: "Показатель (Ось X):",
        metricWorks: "Произведения",
        metricAge: "Годы жизни",
        metricProductivity: "Продуктивность",
        coloring: "Расцветка:",
        colorEra: "Эпохи",
        colorCountry: "Страны",
        blockScale: "Масштаб блоков:",
        exportSVG: "Экспорт в SVG",
        btnFirstFact: "К первому факту",
        btnPrevFact: "⬅ В прошлое",
        factModeInfo: "Режим композиторов",
        btnNextFact: "В будущее ➡",
        btnLastFact: "В наше время",
        premiumTitle: "Поддержите проект!",
        premiumP1: "Мы вложили огромное количество времени и сил в создание этого интерактивного таймлайна.",
        premiumP2: "У нас грандиозные планы по развитию проекта!",
        premiumP3_1: "Функции <strong>«Рейтинг»</strong> и <strong>«Экспорт в SVG»</strong> доступны по коду на ",
        premiumP3_2: ". Спасибо, что вы с нами!",
        premiumPlaceholder: "Введите код...",
        premiumUnlock: "Разблокировать",
        premiumError: "Неверный код.",
        premiumSuccess: "Спасибо за поддержку! Функции «Рейтинг» и «Экспорт» успешно разблокированы.",
        noDataExport: "Нет данных для экспорта",
        lifespan: "Годы жизни",
        years: "лет",
        perYear: "в год",
        era: "Эпоха",
        country: "Страна",
        works: "Произведений",
        avgPerYear: "В среднем в год",
        rankAuthors: "Авторов:",
        rankAvgAge: "Ср. возраст:",
        rankAvgProd: "В среднем в год:",
        bcSuffix: " до н.э.",
        adSuffix: " г."
    },
    en: {
        pageTitle: "Composers Timeline",
        btnZoomAll: "Zoom out to all",
        btnSort: "Filters & Sorting",
        btnAppearance: "Appearance",
        btnFacts: "Historical Facts",
        searchPlaceholder: "Search...",
        composersCount: "Composers:",
        ageFrom: "Age: from",
        to: "to",
        yearsLabel: "years",
        worksFrom: "Works: from",
        erasLabel: "Eras:",
        toggleAll: "Toggle all",
        countriesLabel: "Countries:",
        displayMode: "Display mode:",
        modeTimeline: "Timeline",
        modeRating: "Ranking",
        layout: "Layout:",
        layoutCompact: "Compact",
        layoutLinear: "List",
        grouping: "Grouping:",
        groupNone: "None",
        groupCountry: "By country",
        groupEra: "By era",
        sorting: "Sort by:",
        sortBirth: "Birth",
        sortDeath: "Death",
        xAxis: "X-Axis Metric:",
        metricWorks: "Works",
        metricAge: "Lifespan",
        metricProductivity: "Productivity",
        coloring: "Coloring:",
        colorEra: "Eras",
        colorCountry: "Countries",
        blockScale: "Block scale:",
        exportSVG: "Export to SVG",
        btnFirstFact: "To first fact",
        btnPrevFact: "⬅ Past",
        factModeInfo: "Composers mode",
        btnNextFact: "Future ➡",
        btnLastFact: "Present time",
        premiumTitle: "Support the project!",
        premiumP1: "We invested a huge amount of time and effort into creating this interactive timeline.",
        premiumP2: "We have grand plans to develop the project!",
        premiumP3_1: "The <strong>Ranking</strong> and <strong>SVG Export</strong> features are available via code on ",
        premiumP3_2: ". Thank you for being with us!",
        premiumPlaceholder: "Enter code...",
        premiumUnlock: "Unlock",
        premiumError: "Invalid code.",
        premiumSuccess: "Thank you for your support! Ranking and Export features are now unlocked.",
        noDataExport: "No data to export",
        lifespan: "Lifespan",
        years: "years",
        perYear: "per year",
        era: "Era",
        country: "Country",
        works: "Works",
        avgPerYear: "Average per year",
        rankAuthors: "Composers:",
        rankAvgAge: "Avg. age:",
        rankAvgProd: "Average per year:",
        bcSuffix: " BC",
        adSuffix: " AD"
    }
};

// Словарь терминов из базы данных (эпохи, подгруппы, страны) в нижнем регистре
const dataDict = {
    en: {
        // Эпохи и группы эпох
        "средневековье": "Middle Ages",
        "возрождение": "Renaissance",
        "барокко": "Baroque",
        "классицизм": "Classicism",
        "романтизм": "Romanticism",
        "ранний романтизм": "Early Romanticism",
        "зрелый романтизм": "High Romanticism",
        "поздний романтизм": "Late Romanticism",
        "ранний": "Early",
        "зрелый": "High",
        "поздний": "Late",
        "xx век": "20th Century",
        "авангард": "Avant-garde",
        "xx век и авангард": "20th Century & Avant-garde",
        "xxi век": "21st Century",

        // Страны и группы стран
        "франция": "France",
        "сша": "USA",
        "италия": "Italy",
        "испания": "Spain",
        "россия": "Russia",
        "венгрия": "Hungary",
        "австрия": "Austria",
        "германия": "Germany",
        "чехия": "Czechia",
        "великобритания": "UK",
        "дания": "Denmark",
        "польша": "Poland",
        "бразилия": "Brazil",
        "нидерланды": "Netherlands",
        "словения": "Slovenia",
        "украина": "Ukraine",
        "норвегия": "Norway",
        "австро-венгрия": "Austria-Hungary",
        "греция": "Greece",
        "литва": "Lithuania",
        "аргентина": "Argentina",
        "эстония": "Estonia",
        "финляндия": "Finland",
        "япония": "Japan",
        "австрия и германия": "Austria & Germany",
        "франция и нидерланды": "France & Netherlands",
        "другое": "Other",
        "другие": "Others",
        "общая": "General"
    }
};

/**
 * Перевод ключей интерфейса
 */
export function t(key) {
    return (dict[currentLang] && dict[currentLang][key]) || (dict.en && dict.en[key]) || key;
}

/**
 * Перевод данных (эпох, стран, групп и списков через запятую)
 */
export function tData(rawStr) {
    if (!rawStr || currentLang === 'ru') return rawStr;
    const str = String(rawStr).trim();

    // Если передан список через запятую (например: "Классицизм, Ранний Романтизм")
    if (str.includes(',')) {
        return str.split(',').map(part => tData(part.trim())).join(', ');
    }

    const lower = str.toLowerCase();
    const targetMap = dataDict[currentLang] || dataDict.en;
    return (targetMap && targetMap[lower]) || (dataDict.en && dataDict.en[lower]) || str;
}

/**
 * Получение имени композитора с учётом текущего языка
 */
export function getComposerName(item) {
    if (!item) return '';
    return currentLang === 'ru' ? item.name : (item.engName || item.name);
}

/**
 * Автоперевод всего сайта (включая данные для Canvas и исторические факты)
 * на любой язык мира с кэшированием в localStorage
 */
export async function initAutoTranslate(factsArray = []) {
    if (sysLang === 'ru') return;

    // 1. Сначала переводим исторические факты на английский или целевой язык
    const targetLang = sysLang;
    const cacheKey = `timeline_i18n_v1_${targetLang}`;

    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.ui && parsed.data) {
                dict[targetLang] = parsed.ui;
                dataDict[targetLang] = parsed.data;
                currentLang = targetLang;
            }
            if (parsed.facts && parsed.facts.length === factsArray.length) {
                for (let i = 0; i < factsArray.length; i++) {
                    factsArray[i].titleTranslated = parsed.facts[i].t;
                    factsArray[i].textTranslated = parsed.facts[i].x;
                }
                return;
            }
        }
    } catch (e) {
        console.warn('Ошибка чтения кэша переводов:', e);
    }

    // Вспомогательная функция пакетного перевода через бесплатный GTX-эндпоинт
    async function translateBatch(lines, fromLang, toLang) {
        const sep = ' ||| ';
        const chunks = [];
        let currentChunk = [];
        let currentLen = 0;

        for (const line of lines) {
            if (currentLen + line.length > 1400) {
                chunks.push(currentChunk);
                currentChunk = [line];
                currentLen = line.length;
            } else {
                currentChunk.push(line);
                currentLen += line.length + sep.length;
            }
        }
        if (currentChunk.length > 0) chunks.push(currentChunk);

        const results = [];
        for (const chunk of chunks) {
            const q = encodeURIComponent(chunk.join('\n'));
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&dt=t&q=${q}`;
            const res = await fetch(url);
            const data = await res.json();
            const translatedText = data[0].map(item => item[0]).join('');
            results.push(...translatedText.split('\n').map(s => s.trim()));
        }
        return results;
    }

    try {
        // Если язык системы НЕ английский и НЕ русский (например, de, fr, es, zh, ja) —
        // переводим английский словарь UI и словарь стран/эпох на язык пользователя
        if (targetLang !== 'en') {
            const uiKeys = Object.keys(dict.en);
            const uiValues = uiKeys.map(k => dict.en[k]);
            const dataKeys = Object.keys(dataDict.en);
            const dataValues = dataKeys.map(k => dataDict.en[k]);

            const allTranslated = await translateBatch([...uiValues, ...dataValues], 'en', targetLang);

            dict[targetLang] = {};
            uiKeys.forEach((k, idx) => {
                dict[targetLang][k] = allTranslated[idx] || dict.en[k];
            });

            dataDict[targetLang] = {};
            dataKeys.forEach((k, idx) => {
                dataDict[targetLang][k] = allTranslated[uiKeys.length + idx] || dataDict.en[k];
            });

            currentLang = targetLang;
        }

        // Переводим исторические факты из facts.json с русского на язык пользователя
        if (factsArray && factsArray.length > 0) {
            const factLines = [];
            factsArray.forEach(f => {
                factLines.push(f.title);
                factLines.push(f.text);
            });

            const translatedFacts = await translateBatch(factLines, 'ru', targetLang);
            const cachedFacts = [];

            for (let i = 0; i < factsArray.length; i++) {
                const tTitle = translatedFacts[i * 2] || factsArray[i].title;
                const tText = translatedFacts[i * 2 + 1] || factsArray[i].text;
                factsArray[i].titleTranslated = tTitle;
                factsArray[i].textTranslated = tText;
                cachedFacts.push({ t: tTitle, x: tText });
            }

            localStorage.setItem(cacheKey, JSON.stringify({
                ui: dict[targetLang] || dict.en,
                data: dataDict[targetLang] || dataDict.en,
                facts: cachedFacts
            }));
        }
    } catch (err) {
        console.warn('Автоперевод недоступен (офлайн или блокировка сети), используется базовый EN словарь:', err);
    }
}