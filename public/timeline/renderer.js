/**
 * ==========================================
 * ШАГ 5: RENDER LOOP & CANVAS 2D
 * ==========================================
 */
import { currentLang, t } from './i18n.js';
import { store } from './data.js';
import { spatialIndex } from './spatial.js';
import { LAYOUT_CONSTANTS } from './layout.js';

const COMPOSER_FONT = '500 25px system-ui, -apple-system, sans-serif';

export class Renderer {
    constructor(canvas, camera) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
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

    /**
     * Отрисовка плашек композиторов (Zero-GC, плавные двухцветные градиенты перехода)
     */
    /**
     * Отрисовка плашек композиторов (Zero-GC, поддержка ныне живущих и переходных авторов)
     */
    _drawComposers(ctx, minX, maxX, minY, maxY, scale, isAnimMoving) {
        const trackScreenHeight = LAYOUT_CONSTANTS.TRACK_HEIGHT * scale;
        const shouldDrawText = trackScreenHeight > 8;

        if (shouldDrawText) {
            ctx.font = COMPOSER_FONT;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
        }

        const count = isAnimMoving 
            ? store.filteredCount 
            : spatialIndex.queryVisible(minX, maxX, minY, maxY);

        if (count === 0) return;

        const currentYear = new Date().getFullYear();
        const isTimeline = (this.currentMode === 'timeline');

        for (let i = 0; i < count; i++) {
            const soaIdx = isAnimMoving 
                ? store.filteredItems[i].soaIdx 
                : spatialIndex.visibleBuffer[i];

            const x = store.animX[soaIdx];
            const y = store.animY[soaIdx];
            const w = store.animW[soaIdx];
            const h = store.animH[soaIdx];

            if (isAnimMoving) {
                if (x + w < minX || x > maxX || y + h < minY || y > maxY) continue;
            }

            const item = store.getRawItemBySoaIdx(soaIdx);
            const instColor = store.instanceColor[soaIdx];
            const transYear = store.transitionYears ? store.transitionYears[soaIdx] : 0;
            const color2 = store.instanceColor2 ? store.instanceColor2[soaIdx] : null;

            const isHovered = (this.hoveredSoaIdx === soaIdx);
            const isActive = (this.activeSoaIdx === soaIdx);
            const drawBorder = isHovered || isActive;

            ctx.globalAlpha = this.currentAlphas[soaIdx];

            const isLiving = (item.death >= currentYear);
            const isTransitional = (isTimeline && transYear > 0 && color2);

            // --- 1. СТИЛЬ ЗАЛИВКИ (FILL STYLE) ---
            if (isTransitional) {
                // Переходный период (включая ныне живущих, например, Сильвестрова)
                const lifespan = item.lifespan > 0 ? item.lifespan : 1;
                const tCenter = (transYear - item.birth) / lifespan;
                
                // Окно сглаживания: ±4 года от точки смены стиля
                const halfWindow = 4 / lifespan;
                const stop1 = Math.max(0, Math.min(1, tCenter - halfWindow));
                const stop2 = Math.max(stop1, Math.min(1, tCenter + halfWindow));

                const grad = ctx.createLinearGradient(x, 0, x + w, 0);
                grad.addColorStop(0, instColor);
                grad.addColorStop(stop1, instColor);
                grad.addColorStop(stop2, color2);

                if (isLiving) {
                    // Для ныне живущих второй цвет в конце плашки плавно растворяется в прозрачность
                    const fadeStart = stop2 + (1 - stop2) * 0.5;
                    if (fadeStart < 1) {
                        grad.addColorStop(fadeStart, color2);
                    }
                    const color2Transparent = color2.startsWith('#')
                        ? color2 + '00'
                        : (color2.startsWith('hsl') ? color2.replace('hsl', 'hsla').replace(')', ', 0)') : 'rgba(0,0,0,0)');
                    grad.addColorStop(1, color2Transparent);
                } else {
                    grad.addColorStop(1, color2);
                }

                ctx.fillStyle = grad;

            } else if (isLiving) {
                // Ныне живущие авторы без смены эпохи (монолитный цвет с затуханием в прозрачность)
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
                // Стандартный композитор одной эпохи
                ctx.fillStyle = instColor;
            }

            // --- 2. ГЕОМЕТРИЯ ПЛАШКИ ---
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

            // --- 3. ОБВОДКА (HOVER / SELECTION) ---
            if (drawBorder) {
                ctx.save();
                if (isLiving) {
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

            // --- 4. ТЕКСТОВЫЕ МЕТКИ ---
            if (shouldDrawText) {
                if (!isTimeline) {
                    // Режим рейтинга
                    const rank = store.ranks[soaIdx] + 1;

                    ctx.textAlign = 'right';
                    const maxNameWidth = 280;
                    const nameTxt = this._getTruncatedText(item, maxNameWidth);
                    if (nameTxt) {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(nameTxt, x - 60, y + h / 2);
                    }

                    ctx.textAlign = 'center';
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.fillText('#' + String(rank), x - 30, y + h / 2);

                    ctx.textAlign = 'left';
                    let valStr = '';
                    if (this.ratingMetric === 'bar_works') {
                        valStr = String(item.works);
                    } else if (this.ratingMetric === 'bar_age') {
                        valStr = String(item.lifespan) + ' лет';
                    } else if (this.ratingMetric === 'bar_productivity') {
                        valStr = (item.works / item.lifespan).toFixed(1) + ' в год';
                    }

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.fillText(valStr, x + 10, y + h / 2);

                } else {
                    // Режим таймлайна
                    ctx.textAlign = 'left';
                    const finalW = store.layoutW[soaIdx];
                    const txt = this._getTruncatedText(item, finalW);
                    if (txt) {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(txt, x + 10, y + h / 2);
                    }
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

    /**
     * Построение мягкого рассеянного градиента эпох на основе данных из CSV
     * Полностью динамический расчёт: без зашитых дат и без внешних зависимостей
     */
    /**
     * Построение мягкого непрерывного фонового градиента
     * Физическое смешивание пересекающихся эпох (Continuous Chronological Blend)
     */
    _buildGradient(ppy) {
        if (!store.rawItems || store.rawItems.length === 0) return;

        // ================= НАСТРОЙКИ РАЗМЫТИЯ =================
        const BLUR_RADIUS = 5; // Радиус перехода в годах (было 20). Меньше = четче, больше = более размыто
        const BLUR_CUTOFF = 10; // Максимальная дальность растекания цвета в годах (было 45)
        const STEP_YEARS  = 20; // Шаг сэмплирования таймлайна (было 15). Меньше шаг = детальнее границы
        // =====================================================

        // Вспомогательный парсер любого цвета (#HEX или hsl) в массив [R, G, B]
        function parseToRgb(col) {
            if (!col) return [127, 127, 127];
            if (col.startsWith('#')) {
                let hex = col.slice(1);
                if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
                const num = parseInt(hex.slice(0, 6), 16);
                return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
            }
            if (col.startsWith('hsl')) {
                const m = col.match(/\d+/g);
                if (m) {
                    const h = parseInt(m[0]) / 360;
                    const s = parseInt(m[1]) / 100;
                    const l = parseInt(m[2]) / 100;
                    if (s === 0) return [Math.round(l * 255), Math.round(l * 255), Math.round(l * 255)];
                    const hue2rgb = (p, q, t) => {
                        let val = t;
                        if (val < 0) val += 1;
                        if (val > 1) val -= 1;
                        if (val < 1/6) return p + (q - p) * 6 * val;
                        if (val < 1/2) return q;
                        if (val < 2/3) return p + (q - p) * (2/3 - val) * 6;
                        return p;
                    };
                    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                    const p = 2 * l - q;
                    return [
                        Math.round(hue2rgb(p, q, h + 1/3) * 255),
                        Math.round(hue2rgb(p, q, h) * 255),
                        Math.round(hue2rgb(p, q, h - 1/3) * 255)
                    ];
                }
            }
            return [127, 127, 127];
        }

        // 1. Формируем временные отрезки активности с учётом дат перехода
        const segments = [];

        for (let i = 0; i < store.rawItems.length; i++) {
            const item = store.rawItems[i];
            const birth = item.birth;
            const death = item.death;
            const eras = item.parsedEras;
            if (!eras || eras.length === 0) continue;

            const soaIdx = item.soaBaseIdx;
            const transYear = (store.transitionYears && store.transitionYears[soaIdx]) 
                ? store.transitionYears[soaIdx] 
                : (item.transitionYear || 0);

            const isTrans = (transYear > birth && transYear < death && eras.length > 1);

            if (isTrans) {
                // До перелома — цвет 1-й эпохи
                segments.push({
                    start: birth,
                    end: transYear,
                    rgb: parseToRgb(item.colorEra)
                });
                // После перелома — цвет 2-й эпохи
                const color2 = (store.instanceColor2 && store.instanceColor2[soaIdx]) 
                    ? store.instanceColor2[soaIdx] 
                    : item.colorEra2;
                segments.push({
                    start: transYear,
                    end: death,
                    rgb: parseToRgb(color2 || item.colorEra)
                });
            } else {
                segments.push({
                    start: birth,
                    end: death,
                    rgb: parseToRgb(item.colorEra)
                });
            }
        }

        if (segments.length === 0) return;

        // 2. Сэмплирование хронологии каждые 15 лет для непрерывного смешивания
        const startYear = 1050;
        const endYear = 2050;
        const totalSpan = endYear - startYear;

        const startX = startYear * ppy;
        const endX = endYear * ppy;

        this.bgGradient = this.ctx.createLinearGradient(startX, 0, endX, 0);

        for (let y = startYear; y <= endYear; y += STEP_YEARS) {
            let totalWeight = 0;
            let sumR = 0, sumG = 0, sumB = 0;

            for (let j = 0; j < segments.length; j++) {
                const seg = segments[j];
                let w = 0;

                if (y >= seg.start && y <= seg.end) {
                    w = 1.0;
                } else if (y < seg.start) {
                    const dist = seg.start - y;
                    if (dist < BLUR_CUTOFF) w = Math.exp(-0.5 * Math.pow(dist / BLUR_RADIUS, 2));
                } else {
                    const dist = y - seg.end;
                    if (dist < BLUR_CUTOFF) w = Math.exp(-0.5 * Math.pow(dist / BLUR_RADIUS, 2));
                }

                if (w > 0) {
                    sumR += seg.rgb[0] * w;
                    sumG += seg.rgb[1] * w;
                    sumB += seg.rgb[2] * w;
                    totalWeight += w;
                }
            }

            // Позиция на градиентной ленте от 0.0 до 1.0
            const pos = Math.max(0, Math.min(1, (y - startYear) / totalSpan));

            if (totalWeight > 0) {
                const r = Math.round(sumR / totalWeight);
                const g = Math.round(sumG / totalWeight);
                const b = Math.round(sumB / totalWeight);

                // Мягкое появление из темноты до 1150 года и растворение после 2026 года
                let alpha = 0.12;
                if (y < 1110) {
                    alpha = 0.12 * Math.max(0, (y - startYear) / 100);
                } else if (y > 2026) {
                    alpha = 0.12 * Math.max(0, (endYear - y) / 24);
                }

                this.bgGradient.addColorStop(pos, `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`);
            } else {
                this.bgGradient.addColorStop(pos, 'rgba(21, 21, 21, 0)');
            }
        }
    }

    _drawErasBackground(ctx, minX, maxX, minY, maxY) {
        const ppy = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
        const currentYear = new Date().getFullYear();
        const lineX = currentYear * ppy; // Координата красной линии настоящего года

        // Если экран сдвинут полностью правее красной линии (в будущее) — фон не рисуем вообще
        if (minX >= lineX) return;

        if (this.lastPPY !== ppy || !this.bgGradient) {
            this._buildGradient(ppy);
            this.lastPPY = ppy;
        }

        if (!this.bgGradient) return;

        ctx.fillStyle = this.bgGradient;
        
        const drawY = minY - 100;
        const drawH = (maxY - minY) + 200;
        
        // СТРОГО ОБРУБАЕМ правый край заливки ровно по красной линии (никаких цветов в будущем)
        const rightX = Math.min(maxX, lineX);
        const drawW = rightX - minX;
        
        if (drawW > 0) {
            ctx.fillRect(minX, drawY, drawW, drawH);
        }
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
        // Добавлен сброс кэша при смене языка (если потребуется)
        if (item._lastW === boxWidth && item._lastLang === currentLang) return item._cachedText;
        
        // Выбираем правильное имя
        const nameToRender = currentLang === 'ru' ? item.name : (item.engName || item.name);
        
        const padding = 20;
        const availableWidth = boxWidth - padding;
        
        const fullWidth = this.ctx.measureText(nameToRender).width; // <-- используем nameToRender
        if (fullWidth <= availableWidth) {
            item._cachedText = nameToRender;
        } else {
            const ellipsis = '...';
            const ew = this.ctx.measureText(ellipsis).width;
            
            if (availableWidth <= ew) {
                item._cachedText = ''; 
            } else {
                let l = 0, r = nameToRender.length; // <-- используем nameToRender
                let res = '';
                while (l <= r) {
                    let m = (l + r) >> 1;
                    let sub = nameToRender.substring(0, m); // <-- используем nameToRender
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
        item._lastLang = currentLang; // <-- Кэшируем язык текста
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
        if (this.currentMode !== 'rating' || !store.ratingMainGroups || store.ratingMainGroups.length === 0) return;
        if (store.ratingMainGroups[0].name === 'Общая') return;

        const globalStats = store.globalStats;
        const sortBy = this.ratingMetric.replace('bar_', '');
        const isEra = store.ratingGroupBy === 'era';

        // Адаптивный масштаб для UI: при отдалении зума (scale < 1) 
        // uiScale плавно растет, сохраняя читаемость текста на экране
        const MIN_UI_SCALE = 1.0; 
        const MAX_UI_SCALE = 4.5; 
        const uiScale = Math.max(MIN_UI_SCALE, Math.min(1 / scale, MAX_UI_SCALE));

        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        
        // 1. Рисуем Главные группы (страны / эпохи)
        for (let i = 0; i < store.ratingMainGroups.length; i++) {
            this._drawSingleGroupLabel(ctx, store.ratingMainGroups[i], true, isEra, minY, maxY, scale, uiScale, globalStats, sortBy);
        }
        // 2. Рисуем Подгруппы (Ранний / Зрелый / Поздний романтизм и т.д.)
        for (let i = 0; i < store.ratingSubGroups.length; i++) {
            this._drawSingleGroupLabel(ctx, store.ratingSubGroups[i], false, isEra, minY, maxY, scale, uiScale, globalStats, sortBy);
        }
        
        ctx.restore();
    }

    _drawSingleGroupLabel(ctx, group, isMain, isEra, minY, maxY, scale, uiScale, globalStats, sortBy) {
        if (group.yEnd < minY || group.yStart > maxY) return;

        // Проверяем, есть ли у главной эпохи вложенные подгруппы
        const hasSubgroups = isEra && isMain && (group.name.includes('Романтизм') || group.name.includes('XX век'));

        // Ближняя линия (-360): вплотную к левому краю фамилий (заканчивающихся на -340).
        // Если у эпохи есть подгруппы, внешняя линия сдвигается левее на ширину блока подгруппы.
        let lineX = -360;
        if (hasSubgroups) {
            lineX = -360 - (190 * uiScale);
        }
        
        // Линия строго одинаковой толщины (2px на экране при любом зуме) для всех групп и подгрупп
        ctx.strokeStyle = isMain ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2 / scale; 
        
        const offsetX = 16 * uiScale;
        
        // Прямая вертикальная линия: ровно от верха первого до низа последнего композитора группы
        ctx.beginPath();
        ctx.moveTo(lineX, group.yStart);
        ctx.lineTo(lineX, group.yEnd);
        ctx.stroke();

        // Динамические размеры шрифтов и интервалов под текущий зум
        const tSize = Math.round((isMain ? 22 : 16) * uiScale);
        const sSize = Math.round((isMain ? 13 : 11) * uiScale);
        const tGap = Math.round((isMain ? 26 : 18) * uiScale);
        const sGap = Math.round((isMain ? 20 : 15) * uiScale);

        const textBlockWorldHeight = tGap + sGap + (20 * uiScale);
        const groupHeight = group.yEnd - group.yStart;
        
        // Вертикальное позиционирование текста (липкий заголовок при скролле)
        let textY;
        if (groupHeight <= textBlockWorldHeight) {
            textY = group.yStart + (groupHeight / 2); 
        } else {
            const screenPaddingWorld = 35 * uiScale; 
            const defaultTextY = group.yStart + (35 * uiScale); 
            const stickyY = Math.max(defaultTextY, minY + screenPaddingWorld); 
            textY = Math.max(
                group.yStart + (25 * uiScale), 
                Math.min(stickyY, group.yEnd - textBlockWorldHeight + (25 * uiScale))
            );
        }

        // Заголовок группы
        ctx.font = `bold ${tSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = isMain ? '#ffffff' : 'rgba(255, 255, 255, 0.75)'; 
        ctx.fillText(group.name, lineX - offsetX, textY - tGap);
        
        // Строки статистики
        ctx.font = `${sSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';

        let stat1 = '';
        let stat2 = '';
        
        if (sortBy === 'works') {
            const pct = globalStats.works > 0 ? Math.round((group.works / globalStats.works) * 100) : 0;
            stat1 = `${t('works')}: ${group.works}` + (isMain ? ` (${pct}%)` : '');
            stat2 = `${t('rankAuthors')} ${group.count}`;
        } else if (sortBy === 'age') {
            const avgAge = group.count > 0 ? Math.round(group.lifespan / group.count) : 0;
            stat1 = `${t('rankAvgAge')} ${avgAge} ${t('years')}`;
            stat2 = `${t('rankAuthors')} ${group.count}`;
        } else if (sortBy === 'productivity') {
            const avgProd = group.lifespan > 0 ? (group.works / group.lifespan).toFixed(1) : '0.0';
            stat1 = `${t('rankAvgProd')} ${avgProd}`;
            stat2 = `${t('rankAuthors')} ${group.count}`;
        }

        ctx.fillText(stat1, lineX - offsetX, textY);
        ctx.fillText(stat2, lineX - offsetX, textY + sGap);
    }
}