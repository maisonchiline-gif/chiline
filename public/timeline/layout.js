/**
 * ==========================================
 * ШАГ 2: LAYOUT ENGINE (Алгоритмы укладки)
 * ==========================================
 */

import { store, Utils } from './data.js';

// --- ПОМОЩНИКИ ИЕРАРХИИ ---
function getMainGroup(groupBy, groupName) {
    if (groupBy !== 'era') return groupName;
    const e = groupName.toLowerCase();
    if (e.includes('романтизм')) return 'Романтизм';
    if (e === 'xx век' || e === 'авангард') return 'XX век и Авангард';
    return groupName; // Классицизм, Барокко и т.д.
}

function getSubGroup(groupBy, groupName) {
    if (groupBy !== 'era') return null; // Подгруппы только у эпох
    const e = groupName.toLowerCase();
    
    // Для романтизма оставляем только стадию эпохи
    if (e.includes('романтизм')) {
        if (e.includes('ранний')) return 'Ранний';
        if (e.includes('зрелый')) return 'Зрелый';
        if (e.includes('поздний')) return 'Поздний';
        return groupName;
    }
    
    if (e === 'xx век' || e === 'авангард') return groupName;
    return null; // У Классицизма, Барокко и др. нет подгрупп
}

const LAYOUT_CONSTANTS = {
    PIXELS_PER_YEAR: 5,       
    TRACK_HEIGHT: 50,          
    TRACK_GAP: 8,              
    GROUP_GAP: 8,             
    MIN_WIDTH: 10,             
    RATING_MAX_WIDTH: 1500     
};

class LayoutEngine {
    constructor(dataStore) {
        this.store = dataStore;
        this.trackEndsPos = new Float32Array(2000); 
        this.trackEndsNeg = new Float32Array(2000);
        this.isFirstRun = true;
    }

    updateLayout(config) {
        this._applyFilters(config);
        if (this.store.filteredCount === 0) return;

        this._applySorting(config);

        if (config.mode === 'timeline') {
            this._calculateTimelinePacking(config);
        } else if (config.mode === 'rating') {
            this._calculateRatingDistribution(config);
        }
        
        if (this.isFirstRun) {
            for (let i = 0; i < this.store.filteredCount; i++) {
                const soaIdx = this.store.filteredItems[i].soaIdx;
                this.store.animX[soaIdx] = this.store.layoutX[soaIdx];
                this.store.animY[soaIdx] = this.store.layoutY[soaIdx];
                this.store.animW[soaIdx] = this.store.layoutW[soaIdx];
                this.store.animH[soaIdx] = this.store.layoutH[soaIdx];
            }
            this.isFirstRun = false;
        }
    }

   _applyFilters(config) {
        const minYear = config.minYear;
        const maxYear = config.maxYear;
        const allowedEras = config.allowedEras;
        const allowedCountries = config.allowedCountries;
        const query = config.query;
        const minLifespan = config.minLifespan !== undefined ? config.minLifespan : 0;
        const maxLifespan = config.maxLifespan !== undefined ? config.maxLifespan : 120;
        const minWorks = config.minWorks !== undefined ? config.minWorks : 0;
        const maxWorks = config.maxWorks !== undefined ? config.maxWorks : 99999;
        const q = query ? query.toLowerCase().trim() : '';

        // ПОДСЧЁТ: Считаем количество композиторов для каждой страны заранее
        const countryCounts = {};
        for (let i = 0; i < this.store.rawItems.length; i++) {
            this.store.rawItems[i].parsedCountries.forEach(function(c) {
                countryCounts[c] = (countryCounts[c] || 0) + 1;
            });
        }

        // Прячем всё ТОЛЬКО если оба фильтра полностью пустые
        if (allowedEras.size === 0 && allowedCountries.size === 0) {
            this.store.filteredItems = [];
            this.store.filteredCount = 0;
            return;
        }

        const filtered = [];
        
        for (let i = 0; i < this.store.rawItems.length; i++) {
            const item = this.store.rawItems[i];
            
            if (item.death < minYear || item.birth > maxYear) continue;
            if (item.lifespan < minLifespan || item.lifespan > maxLifespan) continue;
            if (item.works < minWorks || item.works > maxWorks) continue;
            if (q && !item.name.toLowerCase().includes(q) && !item.engName.toLowerCase().includes(q)) continue;

            let groupsToRender = ['Общая'];
            let filterMode = 'none';
            
            if (config.groupBy === 'era') {
                groupsToRender = item.parsedEras;
                filterMode = 'era';
            } else if (config.groupBy === 'country') {
                groupsToRender = item.parsedCountries;
                filterMode = 'country';
            }

            const hasValidEra = allowedEras.size === 0 || item.parsedEras.some(function(e) { return allowedEras.has(e); });
            const hasValidCountry = allowedCountries.size === 0 || item.parsedCountries.some(function(c) { return allowedCountries.has(c); });

            if (filterMode === 'none') {
                if (!hasValidEra || !hasValidCountry) continue;
            }

            let instanceOffset = 0;
            let processedGroups = [];

            for (let g = 0; g < groupsToRender.length; g++) {
                const grp = groupsToRender[g]; 
                
                if (filterMode === 'era') {
                    if (allowedEras.size > 0 && !allowedEras.has(grp)) continue;
                    if (!hasValidCountry) continue;
                }
                
                if (filterMode === 'country') {
                    if (allowedCountries.size > 0 && !allowedCountries.has(grp)) continue;
                    if (!hasValidEra) continue;
                }

                let layoutGroupName = grp;
                if (filterMode === 'country') {
                    layoutGroupName = Utils.getBaseGroup(grp);
                    
                    // ПУНКТ 4 (ОБНОВЛЕННЫЙ): Если композиторов от 1 до 3 на страну, объединяем в "Другие"
                    if (countryCounts[grp] <= 4) {
                        layoutGroupName = 'Другие';
                    }
                }

                if (filterMode !== 'none' && processedGroups.indexOf(layoutGroupName) !== -1) {
                    continue; 
                }
                processedGroups.push(layoutGroupName);

                const soaIdx = item.soaBaseIdx + instanceOffset;
                
                filtered.push({
                    rawIdx: i,
                    soaIdx: soaIdx,
                    group: layoutGroupName 
                });
                
                let color = '#7f7f7f';
                if (config.colorMode === 'country') {
                    let colorTarget = filterMode === 'country' ? grp : item.primaryGroup;
                    
                    // ПУНКТ 3 (ОБНОВЛЕННЫЙ): Если представителей страны от 1 до 3, цвет серый
                    if (countryCounts[colorTarget] <= 4) {
                        color = '#7f7f7f';
                    } else {
                        color = Utils.getColor('country', colorTarget);
                    }
                } else {
                    color = filterMode === 'era' ? Utils.getColor('era', grp) : Utils.getColor('era', item.parsedEras[0]);
                }
                // 1. Записываем первичный цвет (уже есть):
                this.store.instanceColor[soaIdx] = color;

                // 2. Логика второго цвета (актуальна при colorMode === 'era'):
                if (config.colorMode === 'era' && item.transitionYear && item.colorEra2) {
                    this.store.instanceColor2[soaIdx] = item.colorEra2;
                    this.store.transitionYears[soaIdx] = item.transitionYear;
                } else {
                    this.store.instanceColor2[soaIdx] = null;
                    this.store.transitionYears[soaIdx] = 0;
                }

                this.store.activeStartYears[soaIdx] = (item.activeStart > item.birth && item.activeStart < item.death) ? item.activeStart : 0;
                this.store.activeEndYears[soaIdx] = (item.activeEnd > item.birth && item.activeEnd < item.death) ? item.activeEnd : 0;
                
                instanceOffset++;
            }
        }

        this.store.filteredItems = filtered;
        this.store.filteredCount = filtered.length;
    }

    _applySorting(config) {
        const mode = config.mode;
        const sortBy = config.sortBy;
        const groupBy = config.groupBy;

        let mainCounts = {};
        let mainEarliest = {};
        let subCounts = {};
        let subEarliest = {};

        if (groupBy && groupBy !== 'none') {
            for (let i = 0; i < this.store.filteredCount; i++) {
                const inst = this.store.filteredItems[i];
                const item = this.store.rawItems[inst.rawIdx];
                
                const gMain = getMainGroup(groupBy, inst.group);
                const gSub = getSubGroup(groupBy, inst.group);
                
                mainCounts[gMain] = (mainCounts[gMain] || 0) + 1;
                if (mainEarliest[gMain] === undefined || item.birth < mainEarliest[gMain]) {
                    mainEarliest[gMain] = item.birth;
                }
                
                if (gSub) {
                    subCounts[gSub] = (subCounts[gSub] || 0) + 1;
                    if (subEarliest[gSub] === undefined || item.birth < subEarliest[gSub]) {
                        subEarliest[gSub] = item.birth;
                    }
                }
            }
        }
        
        const self = this;
        this.store.filteredItems.sort(function(a, b) {
            const itemA = self.store.rawItems[a.rawIdx];
            const itemB = self.store.rawItems[b.rawIdx];
            
            if (groupBy && groupBy !== 'none') {
                const mainA = getMainGroup(groupBy, a.group);
                const mainB = getMainGroup(groupBy, b.group);
                
                // 1. Сортируем группы первого уровня (Страны / Эпохи)
                if (mainA !== mainB) {
                    // --- СТРАНЫ ---
                    if (groupBy === 'country') {
                        // Сборная группа малочисленных стран «Другие» всегда в самом низу
                        if (mainA === 'Другие') return 1;
                        if (mainB === 'Другие') return -1;

                        // Страна с бОльшим количеством композиторов всегда выше (меньший Y)
                        const diff = mainCounts[mainB] - mainCounts[mainA];
                        if (diff !== 0) return diff;
                        return mainA.localeCompare(mainB);
                    }

                    // --- ЭПОХИ ---
                    if (groupBy === 'era') {
                        const diff = mainEarliest[mainB] - mainEarliest[mainA];
                        if (diff !== 0) return diff;
                        return mainB.localeCompare(mainA);
                    }

                    const diff = mainEarliest[mainA] - mainEarliest[mainB];
                    if (diff !== 0) return diff;
                    return mainA.localeCompare(mainB);
                }
                
                const subA = getSubGroup(groupBy, a.group);
                const subB = getSubGroup(groupBy, b.group);
                
                // 2. Подгруппы (актуально для эпох)
                if (subA !== subB) {
                    if (!subA) return 1;
                    if (!subB) return -1;
                    if (groupBy === 'era') {
                        const diff = subEarliest[subB] - subEarliest[subA];
                        if (diff !== 0) return diff;
                        return subB.localeCompare(subA);
                    }
                    const diff = subEarliest[subA] - subEarliest[subB];
                    if (diff !== 0) return diff;
                    return subA.localeCompare(subB);
                }
            }

            // Внутренняя сортировка композиторов внутри группы остаётся без изменений
            if (mode === 'timeline') {
                if (sortBy === 'birth') return itemA.birth - itemB.birth;
                if (sortBy === 'death') {
                    if (itemA.death !== itemB.death) return itemA.death - itemB.death;
                    return itemA.birth - itemB.birth;
                }
            } else if (mode === 'rating') {
                if (sortBy === 'works') return itemB.works - itemA.works;
                if (sortBy === 'age') return itemB.lifespan - itemA.lifespan;
                if (sortBy === 'productivity') return (itemB.works / itemB.lifespan) - (itemA.works / itemA.lifespan);
            }
            return 0;
        });
    }

    _calculateTimelinePacking(config) {
        const PIXELS_PER_YEAR = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
        const TRACK_HEIGHT = LAYOUT_CONSTANTS.TRACK_HEIGHT;
        const TRACK_GAP = LAYOUT_CONSTANTS.TRACK_GAP;
        const GROUP_GAP = LAYOUT_CONSTANTS.GROUP_GAP;
        const MIN_WIDTH = LAYOUT_CONSTANTS.MIN_WIDTH;
        const compact = config.compact;
        const groupBy = config.groupBy;

        this.trackEndsPos.fill(-Infinity);
        this.trackEndsNeg.fill(-Infinity);
        
        // Подсчитываем размер каждой группы, чтобы в режиме «Списком»
        // выстраивать композиторов снизу вверх внутри своей страны
        const groupSizes = {};
        if (groupBy !== 'none' && !compact) {
            for (let i = 0; i < this.store.filteredCount; i++) {
                const g = this.store.filteredItems[i].group;
                groupSizes[g] = (groupSizes[g] || 0) + 1;
            }
        }

        let currentGroup = null;
        let globalTrackOffset = 0;
        let maxTrackInCurrentGroup = 0;
        let maxUsedTrack = 0;
        let indexInCurrentGroup = 0;

        for (let i = 0; i < this.store.filteredCount; i++) {
            const inst = this.store.filteredItems[i];
            const item = this.store.rawItems[inst.rawIdx];
            const soaIdx = inst.soaIdx; 
            
            const x = item.birth * PIXELS_PER_YEAR;
            let w = item.lifespan * PIXELS_PER_YEAR;
            if (w < MIN_WIDTH) w = MIN_WIDTH; 

            let trackIdx = 0;

            if (groupBy === 'none') {
                if (compact) {
                    let d = 0;
                    let placed = false;
                    const requiredX = x - 10; 
                    while (!placed) {
                        if (this.trackEndsPos[d] <= requiredX) {
                            trackIdx = d;
                            this.trackEndsPos[d] = x + w;
                            placed = true;
                        } else if (d > 0 && this.trackEndsNeg[d] <= requiredX) {
                            trackIdx = -d;
                            this.trackEndsNeg[d] = x + w;
                            placed = true;
                        }
                        if (!placed) d++;
                    }
                } else {
                    const half = Math.floor(this.store.filteredCount / 2);
                    // Без группировки: список идёт снизу вверх
                    trackIdx = half - i;
                }
                
                this.store.layoutX[soaIdx] = x;
                this.store.layoutY[soaIdx] = trackIdx * (TRACK_HEIGHT + TRACK_GAP) - (TRACK_HEIGHT / 2);
                this.store.layoutW[soaIdx] = w;
                this.store.layoutH[soaIdx] = TRACK_HEIGHT;
                this.store.trackIndices[soaIdx] = trackIdx;
                this.store.ranks[soaIdx] = 0;
            } else {
                const itemGroup = inst.group;
                if (currentGroup !== itemGroup) {
                    if (currentGroup !== null) {
                        globalTrackOffset += maxTrackInCurrentGroup + 1;
                        globalTrackOffset += Math.ceil(GROUP_GAP / (TRACK_HEIGHT + TRACK_GAP)); 
                        maxTrackInCurrentGroup = 0;
                        this.trackEndsPos.fill(-Infinity); 
                    }
                    currentGroup = itemGroup;
                    indexInCurrentGroup = 0;
                }

                if (compact) {
                    let d = 0;
                    const requiredX = x - 10; 
                    while (this.trackEndsPos[d] > requiredX) d++;
                    trackIdx = d;
                    this.trackEndsPos[d] = x + w;
                } else {
                    // Внутри страны каждый новый композитор располагается выше предыдущего (снизу вверх),
                    // но сами страны остаются на своих местах сверху вниз
                    const groupSize = groupSizes[itemGroup] || 1;
                    trackIdx = (groupSize - 1) - indexInCurrentGroup;
                    indexInCurrentGroup++;
                }

                if (trackIdx > maxTrackInCurrentGroup) maxTrackInCurrentGroup = trackIdx;
                
                const finalTrackIndex = globalTrackOffset + trackIdx;
                if (finalTrackIndex > maxUsedTrack) maxUsedTrack = finalTrackIndex;

                this.store.layoutX[soaIdx] = x;
                this.store.layoutY[soaIdx] = finalTrackIndex * (TRACK_HEIGHT + TRACK_GAP) - (TRACK_HEIGHT / 2);
                this.store.layoutW[soaIdx] = w;
                this.store.layoutH[soaIdx] = TRACK_HEIGHT;
                this.store.trackIndices[soaIdx] = finalTrackIndex;
                this.store.ranks[soaIdx] = 0;
            }
        }

        // Центрирование относительно экватора (Y = 0) одинаково для обоих режимов
        if (groupBy !== 'none') {
            const offset = Math.floor(maxUsedTrack / 2);
            const yOffsetPx = offset * (TRACK_HEIGHT + TRACK_GAP);
            for (let i = 0; i < this.store.filteredCount; i++) {
                const soaIdx = this.store.filteredItems[i].soaIdx;
                this.store.layoutY[soaIdx] -= yOffsetPx;
                this.store.trackIndices[soaIdx] -= offset;
            }
        }
    }

    _calculateRatingDistribution(config) {
        const TRACK_HEIGHT = LAYOUT_CONSTANTS.TRACK_HEIGHT;
        const TRACK_GAP = LAYOUT_CONSTANTS.TRACK_GAP;
        const RATING_GROUP_GAP = 80;
        const RATING_SUBGROUP_GAP = 25;
        const RATING_MAX_WIDTH = LAYOUT_CONSTANTS.RATING_MAX_WIDTH;
        
        const sortBy = config.sortBy;
        const groupBy = config.groupBy;

        let maxValue = 1;
        let globalWorks = 0;
        let globalAge = 0;

        for (let i = 0; i < this.store.filteredCount; i++) {
            const inst = this.store.filteredItems[i];
            const item = this.store.rawItems[inst.rawIdx];
            let val = 0;
            if (sortBy === 'works') val = item.works;
            else if (sortBy === 'age') val = item.lifespan;
            else if (sortBy === 'productivity') val = item.works / item.lifespan;
            if (val > maxValue) maxValue = val;

            if (inst.soaIdx === item.soaBaseIdx) {
                globalWorks += item.works;
                globalAge += item.lifespan;
            }
        }

        this.store.globalStats = { works: globalWorks, age: globalAge, count: this.store.rawItems.length };

        this.store.ratingGroupBy = groupBy;
        this.store.ratingMainGroups = [];
        this.store.ratingSubGroups = [];
        
        let currMain = null;
        let currSub = null;
        let currMainData = null;
        let currSubData = null;
        
        let currentYOffset = 0;
        let localRank = 0;

        for (let i = 0; i < this.store.filteredCount; i++) {
            const inst = this.store.filteredItems[i];
            const item = this.store.rawItems[inst.rawIdx];
            const soaIdx = inst.soaIdx;

            const gMain = getMainGroup(groupBy, inst.group);
            const gSub = getSubGroup(groupBy, inst.group);

            // Смена главной эпохи
            if (currMain !== gMain) {
                if (currSubData) { 
                    // ИСПРАВЛЕНО: минус вместо плюса
                    currSubData.yEnd = currentYOffset - TRACK_GAP - (TRACK_HEIGHT / 2); 
                    this.store.ratingSubGroups.push(currSubData); 
                    currSubData = null; 
                    currSub = null; 
                }
                if (currMainData) { 
                    // ИСПРАВЛЕНО: минус вместо плюса
                    currMainData.yEnd = currentYOffset - TRACK_GAP - (TRACK_HEIGHT / 2); 
                    this.store.ratingMainGroups.push(currMainData); 
                }
                
                if (currMain !== null) currentYOffset += RATING_GROUP_GAP;
                
                currMain = gMain;
                currMainData = { name: gMain, yStart: currentYOffset - (TRACK_HEIGHT / 2), yEnd: 0, count: 0, works: 0, lifespan: 0 };
                localRank = 0;
            }
            
            // Смена подгруппы
            if (gSub && currSub !== gSub) {
                if (currSubData) { 
                    // ИСПРАВЛЕНО: минус вместо плюса
                    currSubData.yEnd = currentYOffset - TRACK_GAP - (TRACK_HEIGHT / 2); 
                    this.store.ratingSubGroups.push(currSubData); 
                }
                if (currSub !== null) currentYOffset += RATING_SUBGROUP_GAP;
                
                currSub = gSub;
                currSubData = { name: gSub, yStart: currentYOffset - (TRACK_HEIGHT / 2), yEnd: 0, count: 0, works: 0, lifespan: 0 };
            }

            currMainData.count++;
            currMainData.works += item.works;
            currMainData.lifespan += item.lifespan;
            
            if (currSubData) {
                currSubData.count++;
                currSubData.works += item.works;
                currSubData.lifespan += item.lifespan;
            }

            let val = 0;
            if (sortBy === 'works') val = item.works;
            else if (sortBy === 'age') val = item.lifespan;
            else if (sortBy === 'productivity') val = item.works / item.lifespan;

            let w = (val / maxValue) * RATING_MAX_WIDTH;
            if (w < LAYOUT_CONSTANTS.MIN_WIDTH) w = LAYOUT_CONSTANTS.MIN_WIDTH;

            this.store.layoutX[soaIdx] = 0;
            this.store.layoutY[soaIdx] = currentYOffset - (TRACK_HEIGHT / 2);
            this.store.layoutW[soaIdx] = w;
            this.store.layoutH[soaIdx] = TRACK_HEIGHT;
            
            this.store.trackIndices[soaIdx] = i; 
            this.store.ranks[soaIdx] = localRank; 

            currentYOffset += TRACK_HEIGHT + TRACK_GAP;
            localRank++;
        }

        // Финальное закрытие последних групп после цикла
        if (currSubData) { 
            // ИСПРАВЛЕНО: минус вместо плюса
            currSubData.yEnd = currentYOffset - TRACK_GAP - (TRACK_HEIGHT / 2); 
            this.store.ratingSubGroups.push(currSubData); 
        }
        if (currMainData) { 
            // ИСПРАВЛЕНО: минус вместо плюса
            currMainData.yEnd = currentYOffset - TRACK_GAP - (TRACK_HEIGHT / 2); 
            this.store.ratingMainGroups.push(currMainData); 
        }
    }
}

const layoutEngine = new LayoutEngine(store);
export { layoutEngine, LAYOUT_CONSTANTS };