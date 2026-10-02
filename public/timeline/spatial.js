/**
 * ==========================================
 * ШАГ 4: CULLING & HIT-TESTING (Пространственный индекс)
 * ==========================================
 */

import { store } from './data.js';

class SpatialIndex {
    constructor(dataStore) {
        this.store = dataStore;
        this.tracks = []; 
        this.visibleBuffer = new Int32Array(0);
    }

    build() {
        if (this.visibleBuffer.length < this.store.capacity) {
            this.visibleBuffer = new Int32Array(this.store.capacity);
        }

        const trackMap = new Map();

        for (let i = 0; i < this.store.filteredCount; i++) {
            const soaIdx = this.store.filteredItems[i].soaIdx; // ИСПРАВЛЕНО
            const trackIdx = this.store.trackIndices[soaIdx];
            
            if (!trackMap.has(trackIdx)) {
                trackMap.set(trackIdx, {
                    y: this.store.layoutY[soaIdx],
                    h: this.store.layoutH[soaIdx],
                    items: [] 
                });
            }
            trackMap.get(trackIdx).items.push(soaIdx);
        }

        this.tracks = Array.from(trackMap.values()).sort(function(a, b) { return a.y - b.y; });

        for (let i = 0; i < this.tracks.length; i++) {
            const self = this;
            this.tracks[i].items.sort(function(a, b) { 
                return self.store.layoutX[a] - self.store.layoutX[b]; 
            });
        }
    }

    queryVisible(minX, maxX, minY, maxY) {
        let count = 0;
        const tracksLen = this.tracks.length;
        if (tracksLen === 0) return count;

        let startTrack = tracksLen;
        let tL = 0, tR = tracksLen - 1;
        while (tL <= tR) {
            const tM = (tL + tR) >> 1;
            if (this.tracks[tM].y + this.tracks[tM].h >= minY) {
                startTrack = tM;
                tR = tM - 1; 
            } else {
                tL = tM + 1;
            }
        }

        for (let i = startTrack; i < tracksLen; i++) {
            const track = this.tracks[i];
            if (track.y > maxY) break;

            const items = track.items;
            const itemsLen = items.length;
            if (itemsLen === 0) continue;

            let firstItem = itemsLen;
            let iL = 0, iR = itemsLen - 1;
            
            while (iL <= iR) {
                const iM = (iL + iR) >> 1;
                const soaIdx = items[iM];
                const itemRightEdge = this.store.layoutX[soaIdx] + this.store.layoutW[soaIdx];
                
                if (itemRightEdge >= minX) {
                    firstItem = iM;
                    iR = iM - 1; 
                } else {
                    iL = iM + 1;
                }
            }

            for (let j = firstItem; j < itemsLen; j++) {
                const soaIdx = items[j];
                const itemLeftEdge = this.store.layoutX[soaIdx];
                if (itemLeftEdge > maxX) break; 
                
                this.visibleBuffer[count++] = soaIdx;
            }
        }

        return count;
    }

    hitTest(x, y) {
        const tracksLen = this.tracks.length;
        if (tracksLen === 0) return null;

        let targetTrack = null;
        let tL = 0, tR = tracksLen - 1;
        
        while (tL <= tR) {
            const tM = (tL + tR) >> 1;
            const track = this.tracks[tM];
            
            if (y >= track.y && y <= track.y + track.h) {
                targetTrack = track;
                break;
            }
            if (y < track.y) {
                tR = tM - 1;
            } else {
                tL = tM + 1;
            }
        }

        if (!targetTrack) {
            const padY = 24; 
            let minD = padY + 1;

            if (tR >= 0) {
                const d = y - (this.tracks[tR].y + this.tracks[tR].h);
                if (d >= 0 && d <= padY) {
                    minD = d;
                    targetTrack = this.tracks[tR];
                }
            }
            if (tL < tracksLen) {
                const d = this.tracks[tL].y - y;
                if (d >= 0 && d < minD) {
                    targetTrack = this.tracks[tL];
                }
            }
        }

        if (!targetTrack) return null;

        const items = targetTrack.items;
        let iL = 0, iR = items.length - 1;
        let targetItemIdx = null;

        while (iL <= iR) {
            const iM = (iL + iR) >> 1;
            const soaIdx = items[iM];
            const iX = this.store.layoutX[soaIdx];
            const iW = this.store.layoutW[soaIdx];

            if (x >= iX && x <= iX + iW) {
                targetItemIdx = soaIdx;
                break;
            }
            if (x < iX) {
                iR = iM - 1;
            } else {
                iL = iM + 1;
            }
        }

        if (targetItemIdx === null) {
            const padX = 15; 
            let minD = padX + 1;

            if (iR >= 0) {
                const soaIdx = items[iR];
                const iX = this.store.layoutX[soaIdx];
                const iW = this.store.layoutW[soaIdx];
                const d = x - (iX + iW);
                if (d >= 0 && d <= padX) {
                    minD = d;
                    targetItemIdx = soaIdx;
                }
            }
            if (iL < items.length) {
                const soaIdx = items[iL];
                const iX = this.store.layoutX[soaIdx];
                const d = iX - x;
                if (d >= 0 && d < minD) {
                    targetItemIdx = soaIdx;
                }
            }
        }

        return targetItemIdx;
    }
}

const spatialIndex = new SpatialIndex(store);
export { spatialIndex };