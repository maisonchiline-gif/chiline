/**
 * ==========================================
 * ШАГ 1: DATA & MEMORY (Structure of Arrays)
 * ==========================================
 */

const CURRENT_YEAR = new Date().getFullYear();

const ERA_COLORS = { "Средневековье": "#5d4037", "Возрождение": "#d84315", "барокко": "#f9a825", "классицизм": "#2e7d32", "ранний романтизм": "#00838f", "зрелый романтизм": "#00678f", "поздний романтизм": "#004a8f", "XX век": "#4527a0", "авангард": "#c62828"};
const COUNTRY_COLORS = { "Германия": "#b17719", "Австрия": "#f9a825", "франция": "#1565c0","нидерланды": "#0d3a6e", "италия": "#d84315", "россия": "#2e7d32", "великобритания": "#9467bd", "Польша": "#8c564b", "США": "#e377c2", "чехия": "#60703a", "испания": "#bcbd22", "Другое": "#7f7f7f" };

const Utils = {

    _darkCache: {},

    darkenColor: function(col, factor = 0.35) {
        if (!col) return '#222222';
        const cacheKey = col + '_' + factor;
        if (this._darkCache[cacheKey]) return this._darkCache[cacheKey];

        let r = 127, g = 127, b = 127;

        if (col.startsWith('#')) {
            let hex = col.slice(1);
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            const num = parseInt(hex.slice(0, 6), 16);
            r = (num >> 16) & 255;
            g = (num >> 8) & 255;
            b = num & 255;
        } else if (col.startsWith('hsl')) {
            const m = col.match(/\d+/g);
            if (m) {
                const h = parseInt(m[0]) / 360;
                const s = parseInt(m[1]) / 100;
                const l = parseInt(m[2]) / 100;
                const hue2rgb = (p, q, t) => {
                    if (t < 0) t += 1;
                    if (t > 1) t -= 1;
                    if (t < 1/6) return p + (q - p) * 6 * t;
                    if (t < 1/2) return q;
                    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                    return p;
                };
                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                const p = 2 * l - q;
                r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
                g = Math.round(hue2rgb(p, q, h) * 255);
                b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
            }
        }

        // Смешиваем оригинальный цвет с глубоким темным фоном (#121212)
        const bg = 18;
        const dr = Math.round(bg + (r - bg) * factor);
        const dg = Math.round(bg + (g - bg) * factor);
        const db = Math.round(bg + (b - bg) * factor);

        const toHex = n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
        const res = '#' + toHex(dr) + toHex(dg) + toHex(db);
        this._darkCache[cacheKey] = res;
        return res;
    },

    parseCSV: function(str) {
        const arr = [];
        let quote = false, row = 0, col = 0;
        for (let c = 0; c < str.length; c++) {
            let cc = str[c], nc = str[c+1];
            arr[row] = arr[row] || [];
            arr[row][col] = arr[row][col] || '';
            
            if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++c; continue; }
            if (cc === '"') { quote = !quote; continue; }
            if (cc === ',' && !quote) { ++col; continue; }
            if (cc === '\r' && nc === '\n' && !quote) { ++row; col = 0; ++c; continue; }
            if (cc === '\n' && !quote) { ++row; col = 0; continue; }
            if (cc === '\r' && !quote) { ++row; col = 0; continue; }
            
            arr[row][col] += cc;
        }
        return arr;
    },

    parseSafeYear: function(val) {
        if (val == null) return null;
        const num = parseInt(val.toString().replace(/[^0-9-]/g, ''));
        return isNaN(num) ? null : num;
    },

    getHashColor: function(str) {
        if (!str) return "#555";
        let hash = 0; 
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return 'hsl(' + (Math.abs(hash) % 360) + ', 65%, 45%)';
    },

    getColor: function(type, val) {
        const dict = type === 'era' ? ERA_COLORS : COUNTRY_COLORS;
        if (!val) return dict["Другое"];
        const valLower = val.toLowerCase().trim();
        for (let key in dict) {
            if (valLower.includes(key.toLowerCase())) return dict[key];
        }
        return this.getHashColor(val);
    },


    getBaseGroup: function(c) {
        if (!c) return 'Другое';
        const str = c.toLowerCase().trim();
        if (str.includes('германия') || str.includes('австрия')) return 'Австрия и Германия';
        if (str.includes('франция') || str.includes('нидерланды')) return 'Франция и Нидерланды';
        return c.trim();
    }
};

class DataStore {
    constructor() {
        this.rawItems = [];         
        this.filteredItems = [];    
        this.facts = [];            
        
        this.filteredCount = 0;     
        this.capacity = 0;
        
        this.layoutX = null;        
        this.layoutY = null;        
        this.layoutW = null;        
        this.layoutH = null;        
        this.trackIndices = null;   
        this.ranks = null; // <-- НОВЫЙ МАССИВ ДЛЯ ХРАНЕНИЯ МЕСТА В РЕЙТИНГЕ
        
        this.instanceColor = null;
        this.instanceColor2 = null; 
        this.transitionYears = null;
        this.activeStartYears = null; // <-- ДОБАВИТЬ: Год начала творчества
        this.activeEndYears = null;   // <-- ДОБАВИТЬ: Год окончания творчества  
        this.soaToRawMap = null;

        this.ratingGroups = [];
        this.globalStats = { works: 0, age: 0, count: 0 };
        this.tchaikovskyWorks = [];

        this.transitionYears = null; // Int16Array: точный год перехода (0 = нет перехода)
        this.instanceColor2 = null;  // Array: цвет второй эпохи (hex / hsl)
    }

    allocateMemory(exactSize) {

        this.transitionYears = new Int16Array(this.capacity);
        this.instanceColor2 = new Array(this.capacity);

        this.capacity = exactSize;
        
        this.layoutX = new Float32Array(this.capacity);
        this.layoutY = new Float32Array(this.capacity);
        this.layoutW = new Float32Array(this.capacity);
        this.layoutH = new Float32Array(this.capacity);
        
        this.trackIndices = new Int32Array(this.capacity); // Увеличили до Int32 для надежности
        this.ranks = new Int32Array(this.capacity); // Выделяем память под рейтинги

        this.animX = new Float32Array(this.capacity);
        this.animY = new Float32Array(this.capacity);
        this.animW = new Float32Array(this.capacity);
        this.animH = new Float32Array(this.capacity);
        
        this.instanceColor = new Array(this.capacity);
        this.instanceColor2 = new Array(this.capacity);
        this.transitionYears = new Int16Array(this.capacity);
        this.activeStartYears = new Int16Array(this.capacity); // <-- ДОБАВИТЬ
        this.activeEndYears = new Int16Array(this.capacity);   // <-- ДОБАВИТЬ
        this.soaToRawMap = new Int32Array(this.capacity);
    }

    getRawItemBySoaIdx(soaIdx) {
        return this.rawItems[this.soaToRawMap[soaIdx]];
    }

    async load(csvText, factsJsonText, thCsvText) {

        if (thCsvText) {
            const thRaw = Utils.parseCSV(thCsvText);
            thRaw.shift(); // Пропускаем заголовки
            
            thRaw.forEach(r => {
                const title = r[0] || r[1]; // Название или Заголовок
                const year = Utils.parseSafeYear(r[2]); // Год создания (индекс 2)
                
                if (title && year !== null) {
                    this.tchaikovskyWorks.push({ title, year });
                }
            });
        }
        
        try {
            this.facts = JSON.parse(factsJsonText);
            this.facts.sort(function(a, b) { return b.year - a.year; });
            
            // --- НОВАЯ ЛОГИКА: Расчет смещения для фактов, попавших на один год ---
            const yearCounts = {};
            for(let i = 0; i < this.facts.length; i++) {
                const y = this.facts[i].year;
                yearCounts[y] = (yearCounts[y] || 0) + 1;
            }
            
            const yearIndex = {};
            for(let i = 0; i < this.facts.length; i++) {
                const y = this.facts[i].year;
                yearIndex[y] = (yearIndex[y] || 0);
                
                const count = yearCounts[y];
                const idx = yearIndex[y];
                
                if (count === 1) {
                    this.facts[i].yOffsetMult = 0; // Факт один — ставим по центру
                } else {
                    // Раскидываем симметрично: -1 (вверх), +1 (вниз), -2, +2 и т.д.
                    const step = Math.floor(idx / 2) + 1;
                    const sign = (idx % 2 === 0) ? -1 : 1; 
                    this.facts[i].yOffsetMult = sign * step;
                }
                yearIndex[y]++;
            }
        } catch (e) {
            console.error("Ошибка парсинга фактов:", e);
        }

        const rawData = Utils.parseCSV(csvText);
        rawData.shift(); 

        this.rawItems = [];
        let totalInstancesRequired = 0;
        
        const self = this;
        
        rawData.forEach(function(r, i) {
            const name = r[0];
            let birth = Utils.parseSafeYear(r[2]);
            if (!name || birth === null) return;

            let death = Utils.parseSafeYear(r[3]) || CURRENT_YEAR;
            if (death <= birth) death = birth + 1;

            const rawEra = r[5] ? String(r[5]).trim() : 'Другое';
            
            let countries = [];
            if (r[7] && String(r[7]).trim() !== '') countries.push(String(r[7]).trim()); 
            if (r[6] && String(r[6]).trim() !== '') countries.push(String(r[6]).trim()); 
            
            const parsedEras = rawEra.split(',').map(function(e) { return e.trim(); });
            
            let parsedCountries = [];
            countries.forEach(function(c) {
                c.split(',').forEach(function(subC) {
                    const cleanName = subC.trim();
                    if (cleanName) {
                        parsedCountries.push(cleanName);
                    }
                });
            });
            parsedCountries = [...new Set(parsedCountries)];
            if (parsedCountries.length === 0) parsedCountries.push('Другое');
            
            const bestCountry = parsedCountries[0];
            const rawWorks = parseInt(r[8]) || 0;

            const rawTransitionYear = Utils.parseSafeYear(r[9]) || 0;
            const rawActiveStart = Utils.parseSafeYear(r[10]) || 0;
            const rawActiveEnd = Utils.parseSafeYear(r[11]) || 0;

            const reqInstances = Math.max(1, parsedEras.length, parsedCountries.length);

            self.rawItems.push({
                id: 'comp_' + i,
                rawIdx: i,
                soaBaseIdx: totalInstancesRequired, 
                reqInstances: reqInstances,
                name: name,
                engName: r[1] || '',
                birth: birth,
                death: death,
                lifespan: death - birth,
                era: rawEra,
                country: countries.join(', '),
                works: rawWorks,
                parsedEras: parsedEras,
                parsedCountries: parsedCountries,
                primaryGroup: bestCountry,
                colorEra: Utils.getColor('era', parsedEras[0]),
                colorEra2: (parsedEras.length > 1) ? Utils.getColor('era', parsedEras[1]) : null,
                transitionYear: rawTransitionYear,
                activeStart: rawActiveStart, // <-- ДОБАВИТЬ
                activeEnd: rawActiveEnd,     // <-- ДОБАВИТЬ
                colorCountry: Utils.getColor('country', bestCountry)
            });
            
            totalInstancesRequired += reqInstances;
        });

        this.allocateMemory(totalInstancesRequired);
        
        this.rawItems.forEach(function(item) {
            for (let j = 0; j < item.reqInstances; j++) {
                self.soaToRawMap[item.soaBaseIdx + j] = item.rawIdx;
            }
        });

        this.filteredItems = [];
        this.filteredCount = 0;
    }
}

const store = new DataStore();
export { store, Utils };