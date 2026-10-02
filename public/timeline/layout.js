/**
 * ==========================================
 * ШАГ 2: LAYOUT ENGINE (Алгоритмы укладки)
 * ==========================================
 */

import { store, Utils } from './data.js';

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

        // === ИЗМЕНЕННАЯ ЛОГИКА ===
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

            // Если размер списка 0, значит галочки сняты, фильтр игнорируется (возвращает true)
            const hasValidEra = allowedEras.size === 0 || item.parsedEras.some(function(e) { return allowedEras.has(e); });
            const hasValidCountry = allowedCountries.size === 0 || item.parsedCountries.some(function(c) { return allowedCountries.has(c); });

            if (filterMode === 'none') {
                if (!hasValidEra || !hasValidCountry) continue;
            }

            let instanceOffset = 0;
            for (let g = 0; g < groupsToRender.length; g++) {
                const grp = groupsToRender[g];
                
                // В режиме группировки дополнительно отсеиваем конкретные блоки, 
                // но только если фильтр этой категории активен (size > 0)
                if (filterMode === 'era') {
                    if (allowedEras.size > 0 && !allowedEras.has(grp)) continue;
                    if (!hasValidCountry) continue;
                }
                
                if (filterMode === 'country') {
                    if (allowedCountries.size > 0 && !allowedCountries.has(grp)) continue;
                    if (!hasValidEra) continue;
                }

                const soaIdx = item.soaBaseIdx + instanceOffset;
                
                filtered.push({
                    rawIdx: i,
                    soaIdx: soaIdx,
                    group: grp
                });
                
                let color = '#7f7f7f';
                if (config.colorMode === 'country') {
                    color = filterMode === 'country' ? Utils.getColor('country', grp) : Utils.getColor('country', item.primaryGroup);
                } else {
                    color = filterMode === 'era' ? Utils.getColor('era', grp) : Utils.getColor('era', item.parsedEras[0]);
                }
                this.store.instanceColor[soaIdx] = color;
                
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

        let groupCounts = {};
        let groupEarliestBirth = {};

        if (groupBy && groupBy !== 'none') {
            for (let i = 0; i < this.store.filteredCount; i++) {
                const inst = this.store.filteredItems[i];
                const item = this.store.rawItems[inst.rawIdx];
                const group = inst.group;
                
                groupCounts[group] = (groupCounts[group] || 0) + 1;
                if (groupEarliestBirth[group] === undefined || item.birth < groupEarliestBirth[group]) {
                    groupEarliestBirth[group] = item.birth;
                }
            }
        }
        
        const self = this;
        this.store.filteredItems.sort(function(a, b) {
            const itemA = self.store.rawItems[a.rawIdx];
            const itemB = self.store.rawItems[b.rawIdx];
            
            if (groupBy && groupBy !== 'none') {
                if (a.group !== b.group) {
                    const diff = groupCounts[b.group] - groupCounts[a.group];
                    if (diff !== 0) return diff;
                    const birthDiff = groupEarliestBirth[a.group] - groupEarliestBirth[b.group];
                    if (birthDiff !== 0) return birthDiff;
                    return a.group.localeCompare(b.group);
                }
            }

            if (mode === 'timeline') {
                if (sortBy === 'birth') return itemA.birth - itemB.birth;
                if (sortBy === 'death') return itemA.death - itemB.death;
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
        
        let currentGroup = null;
        let globalTrackOffset = 0;
        let maxTrackInCurrentGroup = 0;
        let maxUsedTrack = 0;

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
                    trackIdx = i - half;
                }
                
                this.store.layoutX[soaIdx] = x;
                this.store.layoutY[soaIdx] = trackIdx * (TRACK_HEIGHT + TRACK_GAP) - (TRACK_HEIGHT / 2);
                this.store.layoutW[soaIdx] = w;
                this.store.layoutH[soaIdx] = TRACK_HEIGHT;
                this.store.trackIndices[soaIdx] = trackIdx;
                this.store.ranks[soaIdx] = 0;
            } else {
                let itemGroup = inst.group;
                if (currentGroup !== null && currentGroup !== itemGroup) {
                    globalTrackOffset += maxTrackInCurrentGroup + 1;
                    globalTrackOffset += Math.ceil(GROUP_GAP / (TRACK_HEIGHT + TRACK_GAP)); 
                    maxTrackInCurrentGroup = 0;
                    this.trackEndsPos.fill(-Infinity); 
                }
                currentGroup = itemGroup;

                if (compact) {
                    let d = 0;
                    const requiredX = x - 10; 
                    while (this.trackEndsPos[d] > requiredX) d++;
                    trackIdx = d;
                    this.trackEndsPos[d] = x + w;
                } else {
                    if (i === 0 || currentGroup !== itemGroup) trackIdx = 0;
                    else trackIdx = maxTrackInCurrentGroup + 1;
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

        this.store.globalStats = {
            works: globalWorks,
            age: globalAge,
            count: this.store.rawItems.length
        };

        this.store.ratingGroups = [];
        let currentGroupData = null;
        let currentGroup = null;
        let currentYOffset = 0;
        let localRank = 0;

        for (let i = 0; i < this.store.filteredCount; i++) {
            const inst = this.store.filteredItems[i];
            const item = this.store.rawItems[inst.rawIdx];
            const soaIdx = inst.soaIdx;

            let itemGroup = inst.group;

            if (currentGroup !== itemGroup) {
                if (currentGroupData) {
                    currentGroupData.yEnd = currentYOffset - RATING_GROUP_GAP;
                    this.store.ratingGroups.push(currentGroupData);
                }
                if (currentGroup !== null) currentYOffset += RATING_GROUP_GAP;
                
                currentGroup = itemGroup;
                localRank = 0;
                currentGroupData = {
                    name: itemGroup,
                    yStart: currentYOffset - (TRACK_HEIGHT / 2),
                    yEnd: 0,
                    count: 0,
                    works: 0,
                    lifespan: 0
                };
            }

            currentGroupData.count++;
            currentGroupData.works += item.works;
            currentGroupData.lifespan += item.lifespan;

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
            
            // ИСПРАВЛЕНИЕ: Даем каждому элементу уникальный trackIdx, чтобы Spatial Index не склеивал строки
            this.store.trackIndices[soaIdx] = i; 
            
            // Сохраняем локальное место отдельно
            this.store.ranks[soaIdx] = localRank; 

            currentYOffset += TRACK_HEIGHT + TRACK_GAP;
            localRank++;
        }

        if (currentGroupData) {
            currentGroupData.yEnd = currentYOffset - TRACK_GAP - (TRACK_HEIGHT / 2) + TRACK_HEIGHT;
            this.store.ratingGroups.push(currentGroupData);
        }
    }
}

const layoutEngine = new LayoutEngine(store);
export { layoutEngine, LAYOUT_CONSTANTS };