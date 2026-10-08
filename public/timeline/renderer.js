/**
 * ==========================================
 * ШАГ 5: RENDER LOOP & CANVAS 2D
 * ==========================================
 */

import { store } from './data.js';
import { spatialIndex } from './spatial.js';
import { LAYOUT_CONSTANTS } from './layout.js';

const COMPOSER_FONT = '500 25px system-ui, -apple-system, sans-serif';

export class Renderer {
    constructor(canvas, camera) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        this.camera = camera;
        
        this.dpr = window.devicePixelRatio || 1;
        this.needsRender = true;
        
        this.hoveredSoaIdx = null; 
        this.activeSoaIdx = null;
        this.showFacts = false;
        
        this.currentMode = 'timeline';
        this.ratingMetric = 'bar_works';
        
        this.currentAlphas = null;         
        this.bgGradient = null;
        this.lastPPY = -1;

        this.render = this.render.bind(this);
        this._handleResize = this._handleResize.bind(this);
        this._handlePointerMove = this._handlePointerMove.bind(this);
        this._handleClick = this._handleClick.bind(this);

        this._init();
    }

    _init() {
        const ro = new ResizeObserver(this._handleResize);
        ro.observe(this.canvas.parentElement || document.body);

        this.canvas.addEventListener('pointermove', this._handlePointerMove);
        this.canvas.addEventListener('click', this._handleClick);
        
        this.dateElements = [];
        this.dateAxisContainer = document.getElementById('dates-axis');
        if (this.dateAxisContainer) {
            for (let i = 0; i < 30; i++) {
                const el = document.createElement('div');
                el.className = 'dom-date-tick';
                
                el.style.opacity = '0';
                el.style.transition = 'opacity 0.4s ease';
                el.style.pointerEvents = 'none';
                el.style.display = 'flex'; 
                
                el._lastYear = null; 
                this.dateAxisContainer.appendChild(el);
                this.dateElements.push(el);
            }
        }

        this.lastTime = performance.now();
        requestAnimationFrame(this.render);
    }

    setSelectedComposerId(id) {
        if (!id) {
            this._setActiveComposer(null);
            return;
        }
        
        let foundIdx = null;
        for (let i = 0; i < store.filteredCount; i++) {
            const inst = store.filteredItems[i];
            const item = store.getRawItemBySoaIdx(inst.soaIdx);
            if (item.id === id) {
                foundIdx = inst.soaIdx;
                break;
            }
        }
        this._setActiveComposer(foundIdx);
    }

    _setActiveComposer(soaIdx) {
        if (this.activeSoaIdx === soaIdx) return;
        this.activeSoaIdx = soaIdx;
        this.requestRender();
    }

    _handleResize(entries) {
        const rect = entries[0].contentRect;
        this.canvas.width = Math.floor(rect.width * this.dpr);
        this.canvas.height = Math.floor(rect.height * this.dpr);
        this.ctx.font = COMPOSER_FONT;
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'left';
        this.camera.clamp();
        this.requestRender();
    }

    requestRender() { this.needsRender = true; }

    _handlePointerMove(e) {
        if (e.pointerType === 'touch') {
            if (this.hoveredSoaIdx !== null) {
                this.hoveredSoaIdx = null;
                this.requestRender();
            }
            return;
        }
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.camera.screenToWorld(sx, sy);

        const fact = this._hitTestFact(world.x, world.y, this.camera.scale);
        if (fact) {
            this.canvas.style.cursor = 'pointer';
            if (this.hoveredSoaIdx !== null) { this.hoveredSoaIdx = null; this.requestRender(); }
            return;
        }
        const hitIdx = spatialIndex.hitTest(world.x, world.y);
        if (this.hoveredSoaIdx !== hitIdx) { this.hoveredSoaIdx = hitIdx; this.requestRender(); }
        this.canvas.style.cursor = hitIdx !== null ? 'pointer' : (this.camera.isDragging ? 'grabbing' : 'grab');
    }

    _handleClick(e) {
        // Блокируем клик на композиторах, если мы в процессе перетаскивания (драга)
        if (this.camera.isDragging) return; 

        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.camera.screenToWorld(sx, sy);

        const fact = this._hitTestFact(world.x, world.y, this.camera.scale);
        if (fact) { this._setActiveComposer(null); return; }

        const hitIdx = spatialIndex.hitTest(world.x, world.y);
        if (hitIdx !== null) {
            this._setActiveComposer(hitIdx); 
        } else {
            this._setActiveComposer(null);
        }
    }

    _hitTestFact(worldX, worldY, scale) {
        if (!this.showFacts) return null;
        const equatorY = 0; 
        let dynamicRadius = 8 * Math.pow(scale, 0.4);
        dynamicRadius = Math.max(2, Math.min(dynamicRadius, 15));
        const hitRadius = (dynamicRadius + 8) / scale; 
        const screenOffset = dynamicRadius * 2.5; 

        const ppy = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
        for (let i = 0; i < store.facts.length; i++) {
            const fact = store.facts[i];
            const fx = fact.year * ppy;
            
            if (Math.abs(worldX - fx) < hitRadius) {
                const fy = equatorY + ((fact.yOffsetMult * screenOffset) / scale);
                if (Math.abs(worldY - fy) < hitRadius) {
                    return fact;
                }
            }
        }
        return null;
    }

    render(time) {
        requestAnimationFrame(this.render);
        
        let dt = time - this.lastTime;
        if (dt > 100) dt = 16; 
        this.lastTime = time;

        if (!this.currentAlphas || this.currentAlphas.length < store.capacity) {
            const newAlphas = new Float32Array(store.capacity);
            newAlphas.fill(0.0); 
            if (this.currentAlphas) newAlphas.set(this.currentAlphas);
            this.currentAlphas = newAlphas;
        }

        let isAlphaAnimating = false;
        const activeComposer = this.activeSoaIdx !== null ? store.getRawItemBySoaIdx(this.activeSoaIdx) : null;
        
        const alphaStep = 0.004 * dt;
        const factAnimStep = dt / 150; 
        let isFactAnimating = false;

        for (let i = 0; i < store.facts.length; i++) {
            const fact = store.facts[i];
            if (fact.animProgress === undefined) fact.animProgress = 0;
            const target = fact.highlight ? 1 : 0;
            if (fact.animProgress !== target) {
                isFactAnimating = true;
                if (fact.animProgress < target) fact.animProgress = Math.min(fact.animProgress + factAnimStep, target);
                else fact.animProgress = Math.max(fact.animProgress - factAnimStep, target);
            }
        }

        for (let i = 0; i < store.filteredCount; i++) {
            const inst = store.filteredItems[i];
            const soaIdx = inst.soaIdx; 
            const item = store.getRawItemBySoaIdx(soaIdx); 
            let targetAlpha = 1.0;

            if (activeComposer && soaIdx !== this.activeSoaIdx) {
                if (Math.max(activeComposer.birth, item.birth) > Math.min(activeComposer.death, item.death)) {
                    targetAlpha = 0.15;
                }
            }
            const currAlpha = this.currentAlphas[soaIdx];
            if (currAlpha !== targetAlpha) {
                isAlphaAnimating = true;
                if (currAlpha < targetAlpha) {
                    this.currentAlphas[soaIdx] = Math.min(currAlpha + alphaStep, targetAlpha);
                } else {
                    this.currentAlphas[soaIdx] = Math.max(currAlpha - alphaStep, targetAlpha);
                }
            }
        }

        let isAnimMoving = false;
        const moveFactor = Math.min(dt * 0.015, 1.0); 

        for (let i = 0; i < store.filteredCount; i++) {
            const soaIdx = store.filteredItems[i].soaIdx; 
            const dx = store.layoutX[soaIdx] - store.animX[soaIdx];
            const dy = store.layoutY[soaIdx] - store.animY[soaIdx];
            const dw = store.layoutW[soaIdx] - store.animW[soaIdx];
            const dh = store.layoutH[soaIdx] - store.animH[soaIdx];

            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(dw) > 0.5 || Math.abs(dh) > 0.5) {
                isAnimMoving = true;
                store.animX[soaIdx] += dx * moveFactor;
                store.animY[soaIdx] += dy * moveFactor;
                store.animW[soaIdx] += dw * moveFactor;
                store.animH[soaIdx] += dh * moveFactor;
            } else {
                store.animX[soaIdx] = store.layoutX[soaIdx];
                store.animY[soaIdx] = store.layoutY[soaIdx];
                store.animW[soaIdx] = store.layoutW[soaIdx];
                store.animH[soaIdx] = store.layoutH[soaIdx];
            }
        }

        const isCameraMoving = this.camera.update(time, dt);

        if (!this.needsRender && !isCameraMoving && !isAlphaAnimating && !isFactAnimating && !isAnimMoving) return;
        this.needsRender = false;
        if (isAlphaAnimating || isFactAnimating || isAnimMoving) this.requestRender();

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const s = this.camera.scale;
        
        ctx.fillStyle = '#151515';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.scale(this.dpr, this.dpr);
        ctx.translate(this.camera.x, this.camera.y);
        ctx.scale(s, s);

        const minX = -this.camera.x / s;
        const maxX = (w / this.dpr - this.camera.x) / s;
        const minY = -this.camera.y / s;
        const maxY = (h / this.dpr - this.camera.y) / s;

        if (this.currentMode === 'timeline') {
            this._drawErasBackground(ctx, minX, maxX, minY, maxY);
            this._drawEquatorAndFacts(ctx, minX, maxX, s);
        } else {
            this._drawRatingGroups(ctx, minX, maxX, minY, maxY, s);
        }
        
        this._drawComposers(ctx, minX, maxX, minY, maxY, s, isAnimMoving);
        
        if (this.currentMode === 'timeline') {
            this._drawGrid(ctx, minX, maxX, minY, maxY, s);
            this._drawCurrentYearLine(ctx, minX, maxX, minY, maxY, s);
        }

        ctx.restore();

        if (this.currentMode === 'timeline') {
            this._updateDOMDates(minX, maxX, s);
        } else {
            for (let i = 0; i < this.dateElements.length; i++) {
                if (this.dateElements[i].style.opacity !== '0') {
                    this.dateElements[i].style.opacity = '0';
                }
            }
        }
        
        if (window.syncPopupPosition) window.syncPopupPosition();
    }

    _drawComposers(ctx, minX, maxX, minY, maxY, scale, isAnimMoving) {
        const trackScreenHeight = LAYOUT_CONSTANTS.TRACK_HEIGHT * scale;
        const shouldDrawText = trackScreenHeight > 8;

        if (shouldDrawText) {
            ctx.font = COMPOSER_FONT;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
        }

        let count = 0;
        let getSoaIdx;

        if (isAnimMoving) {
            count = store.filteredCount;
            getSoaIdx = function(i) { return store.filteredItems[i].soaIdx; }; 
        } else {
            count = spatialIndex.queryVisible(minX, maxX, minY, maxY);
            getSoaIdx = function(i) { return spatialIndex.visibleBuffer[i]; };
        }

        for (let i = 0; i < count; i++) {
            const soaIdx = getSoaIdx(i);
            const item = store.getRawItemBySoaIdx(soaIdx); 
            const instColor = store.instanceColor[soaIdx]; 
            
            const x = store.animX[soaIdx];
            const y = store.animY[soaIdx];
            const w = store.animW[soaIdx];
            const h = store.animH[soaIdx];

            if (isAnimMoving) {
                if (x + w < minX || x > maxX || y + h < minY || y > maxY) continue;
            }

            const isHovered = (this.hoveredSoaIdx === soaIdx);
            const isActive = (this.activeSoaIdx === soaIdx);
            const drawBorder = isHovered || isActive;

            ctx.globalAlpha = this.currentAlphas[soaIdx];
            const currentYear = new Date().getFullYear();
            
            if (item.death >= currentYear) {
                if (item._lastColorBase !== instColor) {
                    item._lastColorBase = instColor;
                    if (instColor.startsWith('#')) {
                        item._gradTransparent = instColor + '00';
                    } else if (instColor.startsWith('hsl')) {
                        item._gradTransparent = instColor.replace('hsl', 'hsla').replace(')', ', 0)');
                    } else {
                        item._gradTransparent = 'rgba(0,0,0,0)';
                    }
                }
                const grad = ctx.createLinearGradient(x, 0, x + w, 0);
                grad.addColorStop(0, instColor);
                grad.addColorStop(0.65, instColor);
                grad.addColorStop(1, item._gradTransparent);
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = instColor;
            }

            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(x, y, w, h, 6);
            } else {
                ctx.moveTo(x + 6, y);
                ctx.lineTo(x + w - 6, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + 6);
                ctx.lineTo(x + w, y + h - 6);
                ctx.quadraticCurveTo(x + w, y + h, x + w - 6, y + h);
                ctx.lineTo(x + 6, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - 6);
                ctx.lineTo(x, y + 6);
                ctx.quadraticCurveTo(x, y, x + 6, y);
            }
            ctx.fill();

            if (drawBorder) {
                ctx.save();
                if (item.death >= currentYear) {
                    const borderGrad = ctx.createLinearGradient(x, 0, x + w, 0);
                    borderGrad.addColorStop(0, '#FFFFFF');
                    borderGrad.addColorStop(0.65, '#FFFFFF');
                    borderGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    ctx.strokeStyle = borderGrad;
                } else {
                    ctx.strokeStyle = '#FFFFFF';
                }
                ctx.lineWidth = 3 / scale; 
                ctx.stroke();
                ctx.restore();
            }

            if (shouldDrawText) {
                if (this.currentMode === 'rating') {
                    const rank = store.ranks[soaIdx] + 1; 
                    
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.textAlign = 'right';
                    ctx.fillText('#' + String(rank), x - 15, y + h / 2);
                    ctx.textAlign = 'left'; 
                }

                const finalW = store.layoutW[soaIdx];
                const txt = this._getTruncatedText(item, finalW);
                if (txt) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(txt, x + 10, y + h / 2); 
                }

                if (this.currentMode === 'rating') {
                    let valStr = '';
                    if (this.ratingMetric === 'bar_works') {
                        valStr = String(item.works);
                    } else if (this.ratingMetric === 'bar_age') {
                        valStr = String(item.lifespan) + ' лет';
                    } else if (this.ratingMetric === 'bar_productivity') {
                        valStr = (item.works / item.lifespan).toFixed(1) + ' в год';
                    }
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.fillText(valStr, x + w + 15, y + h / 2);
                }
            }
        }
        ctx.globalAlpha = 1.0;
    }

    _drawGrid(ctx, minX, maxX, minY, maxY, scale) {
        const ppy = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
        const step = this._getYearStep(scale);

        const startYear = Math.floor((minX / ppy) / step) * step;
        const endYear = Math.ceil((maxX / ppy) / step) * step;

        ctx.save();

        for (let y = startYear; y <= endYear; y += step) {
            const wx = y * ppy;

            if (y === 0) {
                ctx.lineWidth = 3 / scale;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            } else if (y % 100 === 0) {
                ctx.lineWidth = 1 / scale;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            } else {
                ctx.lineWidth = 1 / scale;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            }

            ctx.beginPath();
            ctx.moveTo(wx, minY);
            ctx.lineTo(wx, maxY);
            ctx.stroke();
        }

        ctx.restore();
    }

    _buildGradient(ppy) {
        if (!store.rawItems || store.rawItems.length === 0) return;

        const eraStats = {};
        for (let i = 0; i < store.rawItems.length; i++) {
            const item = store.rawItems[i];
            const era = item.era;
            
            if (!era || era.toLowerCase() === 'другое') continue;
            
            if (!eraStats[era]) {
                eraStats[era] = { 
                    minBirth: item.birth, 
                    maxDeath: item.death, 
                    color: item.colorEra 
                };
            } else {
                if (item.birth < eraStats[era].minBirth) {
                    eraStats[era].minBirth = item.birth;
                }
                if (item.death > eraStats[era].maxDeath) {
                    eraStats[era].maxDeath = item.death;
                }
            }
        }

        const dynamicBands = [];
        for (const eraName in eraStats) {
            const stat = eraStats[eraName];
            const centerYear = (stat.minBirth + stat.maxDeath) / 2;
            
            dynamicBands.push({
                name: eraName,
                center: centerYear,
                color: stat.color
            });
        }

        dynamicBands.sort(function(a, b) {
            return a.center - b.center;
        });

        if (dynamicBands.length === 0) return;

        const minYear = dynamicBands[0].center - 200; 
        const maxYear = 2050; 
        const maxSpan = maxYear - minYear;
        
        const startX = minYear * ppy;
        const endX = maxYear * ppy;
        
        this.bgGradient = this.ctx.createLinearGradient(startX, 0, endX, 0);
        this.bgGradient.addColorStop(0, '#151515');
        
        const BLEND_YEARS = 40; 

        for (let i = 0; i < dynamicBands.length; i++) {
            const era = dynamicBands[i];
            
            let currentPos = (era.center - minYear) / maxSpan;
            currentPos = Math.max(0, Math.min(1, currentPos));
            
            const darkBgColor = 'color-mix(in srgb, ' + era.color + ' 12%, #151515)';
            
            this.bgGradient.addColorStop(currentPos, darkBgColor);
            
            if (i < dynamicBands.length - 1) {
                const nextEra = dynamicBands[i + 1];
                const blendStartYear = nextEra.center - BLEND_YEARS;
                const safeBlendYear = Math.max(era.center, blendStartYear);
                
                let holdPos = (safeBlendYear - minYear) / maxSpan;
                holdPos = Math.max(0, Math.min(1, holdPos));
                
                if (holdPos < currentPos) holdPos = currentPos;

                this.bgGradient.addColorStop(holdPos, darkBgColor);
            } else {
                let holdPos = (2000 - minYear) / maxSpan;
                holdPos = Math.max(0, Math.min(1, holdPos));
                if (holdPos < currentPos) holdPos = currentPos;
                
                this.bgGradient.addColorStop(holdPos, darkBgColor);
            }
        }

        this.bgGradient.addColorStop(1, '#151515');
    }

    _drawErasBackground(ctx, minX, maxX, minY, maxY) {
        const ppy = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
        
        if (this.lastPPY !== ppy || !this.bgGradient) {
            this._buildGradient(ppy);
            this.lastPPY = ppy;
        }

        if (!this.bgGradient) return;

        ctx.fillStyle = this.bgGradient;
        
        const drawY = minY - 100;
        const drawH = (maxY - minY) + 200;
        const drawW = maxX - minX;
        
        ctx.fillRect(minX, drawY, drawW, drawH); 
    }

    _updateDOMDates(minX, maxX, scale) {
        if (!this.dateAxisContainer) return;
        
        const ppy = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
        const step = this._getYearStep(scale);

        const startYear = Math.floor((minX / ppy) / step) * step;
        const endYear = Math.ceil((maxX / ppy) / step) * step;

        let elIdx = 0;
        for (let y = startYear; y <= endYear; y += step) {
            if (elIdx >= this.dateElements.length) break;
            
            const wx = y * ppy;
            const screenX = (wx - minX) * scale;
            const el = this.dateElements[elIdx];
            
            if (el._lastYear !== y) {
                el.textContent = y;
                el._lastYear = y;
            }
            
            el.style.transform = 'translateX(' + screenX + 'px)';
            
            if (el.style.opacity !== '1') {
                el.style.opacity = '1';
            }
            elIdx++;
        }
        
        while (elIdx < this.dateElements.length) {
            const el = this.dateElements[elIdx];
            if (el.style.opacity !== '0') {
                el.style.opacity = '0';
            }
            elIdx++;
        }
    }

    _drawEquatorAndFacts(ctx, minX, maxX, scale) {
        const equatorY = 0;
        const ppy = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1 / scale;
        ctx.beginPath();
        ctx.moveTo(minX, equatorY);
        ctx.lineTo(maxX, equatorY);
        ctx.stroke();

        if (this.showFacts) {
            let dynamicRadius = 8 * Math.pow(scale, 0.4);
            dynamicRadius = Math.max(2, Math.min(dynamicRadius, 15)); 
            const screenOffset = dynamicRadius * 2.5;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1 / scale;
            ctx.beginPath();
            for (let i = 0; i < store.facts.length; i++) {
                const fact = store.facts[i];
                if (fact.yOffsetMult === 0) continue;
                
                const fx = fact.year * ppy;
                if (fx < minX || fx > maxX) continue;

                const fy = equatorY + ((fact.yOffsetMult * screenOffset) / scale);
                ctx.moveTo(fx, equatorY);
                ctx.lineTo(fx, fy);
            }
            ctx.stroke();

            for (let i = 0; i < store.facts.length; i++) {
                const fact = store.facts[i];
                const fx = fact.year * ppy;
                
                if (fx < minX || fx > maxX) continue;

                const fy = equatorY + ((fact.yOffsetMult * screenOffset) / scale);

                ctx.save();
                ctx.translate(fx, fy);
                ctx.scale(1 / scale, 1 / scale);

                ctx.beginPath();
                ctx.arc(0, 0, dynamicRadius, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();

                if (fact.animProgress > 0) {
                    ctx.globalAlpha = fact.animProgress;
                    ctx.fillStyle = '#d6102b';
                    ctx.beginPath();
                    ctx.arc(0, 0, dynamicRadius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1.0; 
                }
                
                ctx.lineWidth = Math.max(1, 2 * Math.pow(scale, 0.3));
                ctx.strokeStyle = '#151515';
                ctx.stroke();

                ctx.restore();
            }
        }
    }

    _getTruncatedText(item, boxWidth) {
        if (item._lastW === boxWidth) return item._cachedText;
        
        const padding = 20;
        const availableWidth = boxWidth - padding;
        
        const fullWidth = this.ctx.measureText(item.name).width;
        if (fullWidth <= availableWidth) {
            item._cachedText = item.name;
        } else {
            const ellipsis = '...';
            const ew = this.ctx.measureText(ellipsis).width;
            
            if (availableWidth <= ew) {
                item._cachedText = ''; 
            } else {
                let l = 0, r = item.name.length;
                let res = '';
                while (l <= r) {
                    let m = (l + r) >> 1;
                    let sub = item.name.substring(0, m);
                    if (this.ctx.measureText(sub).width + ew <= availableWidth) {
                        res = sub + ellipsis;
                        l = m + 1; 
                    } else {
                        r = m - 1; 
                    }
                }
                item._cachedText = res;
            }
        }
        
        item._lastW = boxWidth;
        return item._cachedText;
    }

    _getYearStep(scale) {
        const ppy = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
        const idealGapPixels = 65; 
        
        const idealYearsStep = (idealGapPixels / scale) / ppy;
        
        if (idealYearsStep <= 10) return 10;
        if (idealYearsStep <= 25) return 25;
        if (idealYearsStep <= 50) return 50;
        if (idealYearsStep <= 100) return 100;
        if (idealYearsStep <= 250) return 250;
        if (idealYearsStep <= 500) return 500;
        return 1000;
    }

    _drawCurrentYearLine(ctx, minX, maxX, minY, maxY, scale) {
        const currentYear = new Date().getFullYear();
        const ppy = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
        const lineX = currentYear * ppy;

        if (lineX < minX || lineX > maxX) return;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(lineX, minY);
        ctx.lineTo(lineX, maxY);
        
        ctx.lineWidth = 1 / scale; 
        ctx.strokeStyle = '#d6102b';
        ctx.stroke();
        
        ctx.restore();
    }

    _drawRatingGroups(ctx, minX, maxX, minY, maxY, scale) {
        if (this.currentMode !== 'rating' || !store.ratingGroups || store.ratingGroups.length <= 1) return;
        if (store.ratingGroups[0].name === 'Общая') return;

        const globalStats = store.globalStats;
        const sortBy = this.ratingMetric.replace('bar_', '');

        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        
        for (let i = 0; i < store.ratingGroups.length; i++) {
            const group = store.ratingGroups[i];
            if (group.yEnd < minY || group.yStart > maxY) continue;

            const lineX = -60;
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 3 / scale; 
            
            ctx.beginPath();
            ctx.moveTo(lineX, group.yStart);
            ctx.lineTo(lineX, group.yEnd);
            
            ctx.moveTo(lineX - 10, group.yStart);
            ctx.lineTo(lineX, group.yStart);
            ctx.moveTo(lineX - 10, group.yEnd);
            ctx.lineTo(lineX, group.yEnd);
            ctx.stroke();

            const screenPaddingWorld = 40 / scale;
            let textY = group.yStart + 40;
            const stickyY = Math.max(textY, minY + screenPaddingWorld + 30); 
            textY = Math.max(group.yStart + 30, Math.min(stickyY, group.yEnd - 30));

            ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(group.name, lineX - 25, textY - 25);
            
            ctx.font = '16px system-ui, -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';

            let stat1 = '';
            let stat2 = '';
            
            if (sortBy === 'works') {
                const pct = globalStats.works > 0 ? Math.round((group.works / globalStats.works) * 100) : 0;
                stat1 = 'Произведений: ' + group.works + ' (' + pct + '%)';
                stat2 = 'Авторов: ' + group.count;
            } else if (sortBy === 'age') {
                const avgAge = group.count > 0 ? Math.round(group.lifespan / group.count) : 0;
                stat1 = 'Ср. возраст: ' + avgAge + ' лет';
                stat2 = 'Авторов: ' + group.count;
            } else if (sortBy === 'productivity') {
                const avgProd = group.lifespan > 0 ? (group.works / group.lifespan).toFixed(1) : '0.0';
                stat1 = 'В среднем: ' + avgProd + ' в год';
                stat2 = 'Авторов: ' + group.count;
            }

            ctx.fillText(stat1, lineX - 25, textY);
            ctx.fillText(stat2, lineX - 25, textY + 25);
        }
        ctx.restore();
    }
}