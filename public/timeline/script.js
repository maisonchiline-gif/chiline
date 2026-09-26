const ANIMATION_SPEED_MS = 1666; 
document.documentElement.style.setProperty('--anim-time', (ANIMATION_SPEED_MS / 1000) + 's');
const CURRENT_YEAR = new Date().getFullYear();
let HISTORICAL_FACTS = [];

function parseCSV(str) {
    const arr = [];
    let quote = false, row = 0, col = 0;
    for (let c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c+1];
        arr[row] = arr[row] || [];
        arr[row][col] = arr[row][col] || '';
        
        if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
        if (cc == '"') { quote = !quote; continue; }
        if (cc == ',' && !quote) { ++col; continue; }
        if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
        if (cc == '\n' && !quote) { ++row; col = 0; continue; }
        if (cc == '\r' && !quote) { ++row; col = 0; continue; }
        
        arr[row][col] += cc;
    }
    return arr;
}

const ERA_COLORS = { "Средневековье": "#5d4037", "Возрождение": "#d84315", "барокко": "#f9a825", "классицизм": "#2e7d32", "ранний романтизм": "#00838f", "зрелый романтизм": "#00678f", "поздний романтизм": "#004a8f", "XX век": "#4527a0", "авангард": "#c62828"};
const COUNTRY_COLORS = { "Германия": "#b17719", "Австрия": "#f9a825", "франция": "#1565c0", "италия": "#d84315", "россия": "#2e7d32", "великобритания": "#9467bd", "Польша": "#8c564b", "США": "#e377c2", "чехия": "#7f7f7f", "испания": "#bcbd22", "венгрия": "#7f7f7f", "финляндия": "#7f7f7f", "норвегия": "#7f7f7f", "Другое": "#7f7f7f" };

function getHashColor(str) {
    if (!str) return "#555";
    let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`;
}

function getColor(type, val) {
    const dict = type === 'era' ? ERA_COLORS : COUNTRY_COLORS;
    if (!val) return dict["Другое"];
    const valLower = val.toLowerCase().trim();
    for (let key in dict) if (valLower.includes(key.toLowerCase())) return dict[key];
    return getHashColor(val);
}

function parseSafeYear(val) {
    if (val == null) return null;
    const num = parseInt(val.toString().replace(/[^0-9-]/g, ''));
    return isNaN(num) ? null : num;
}

const State = {
    rawItems: [], filteredItems: [], domCache: {}, activeHighlights: [],
    config: { trackHeight: 72, trackMargin: 56, basePixelsPerYear: 1, globalPixelsPerYear: 1 },
    filters: { 
        widthFactor: 0.5, 
        mainMode: 'timeline',           // 'timeline' | 'rating'
        timelineLayout: 'compact',      // 'compact' | 'linear'
        timelineGrouping: 'none',       // 'none' | 'country'
        timelineSort: 'birth',          // 'birth' | 'death'
        ratingMetric: 'bar_works',      
        ratingGrouping: 'none',         
        eras: [], countries: [], minLifespan: 0, maxLifespan: 120, minWorks: 0, maxWorks: 1400, colorMode: 'era' 
    },    
    currentFactIndex: -1, updateFactNavUI: null,
    isInitialLoad: true
};
// Глобальный контроллер анимаций и обновлений DOM
const DOMAnimator = {
    frame: null,
    tasks: new Map(),
    
    schedule(el, styles, isHidden) {
        this.tasks.set(el, { styles, isHidden });
        if (!this.frame) {
            this.frame = requestAnimationFrame(() => this.apply());
        }
    },
    
    apply() {
        this.tasks.forEach((data, el) => {
            const { styles, isHidden } = data;
            
            if (isHidden) {
                if (!el.classList.contains('hidden')) el.classList.add('hidden');
            } else {
                if (el.classList.contains('hidden')) el.classList.remove('hidden');
                
                if (styles) {
                    for (const key in styles) {
                        if (el[`_${key}`] !== styles[key]) {
                            el.style[key] = styles[key];
                            el[`_${key}`] = styles[key];
                        }
                    }
                }
            }
        });
        this.tasks.clear();
        this.frame = null;
    }
};

const Camera = {
    scale: 1, x: 0, y: 0, vx: 0, vy: 0, isDragging: false, 
    lastX: 0, lastY: 0, lastTime: 0, renderPending: false, animFrame: null,
    MIN_ZOOM: 0.08, MAX_ZOOM: 0.6, defX: 0, defY: 0, defScale: 1,
    isFlying: false,
    
    // КЭШ DOM-УЗЛОВ (DOOM-level оптимизация)
    dom: {},

    updateLimits() {
        const c = State.config;
        if (!this.dom.vp || !c.canvasHeight) return;

        const vpH = this.dom.vp.clientHeight;
        const vpW = this.dom.vp.clientWidth;
        const safeHeight = Math.max(100, vpH - 200);
        const scaleHeight = safeHeight / c.canvasHeight;
        
        let dynamicMinZoom = scaleHeight;

        if (State.filters.graphMode === 'timeline' && c.globalPixelsPerYear) {
            const contentWidth = (c.composersMaxYear - c.composersMinYear + 100) * c.globalPixelsPerYear;
            dynamicMinZoom = Math.min(scaleHeight, (vpW * 0.95) / contentWidth);
        } else if (State.filters.graphMode !== 'timeline' && c.maxBarWidth) {
            dynamicMinZoom = Math.min(scaleHeight, (vpW * 0.9) / c.maxBarWidth);
        }
        this.MIN_ZOOM = Math.max(0.005, Math.min(dynamicMinZoom, 0.8));  
    },
    
    init() {
        // ИЩЕМ ЭЛЕМЕНТЫ ОДИН РАЗ И НАВСЕГДА
        this.dom.vp = document.getElementById('viewport');
        this.dom.canvas = document.getElementById('canvas');
        this.dom.gridText = document.getElementById('grid-text-container');
        this.dom.eraText = document.getElementById('era-label-container');
        this.dom.gridLayer = document.getElementById('grid-layer');
        this.dom.btnJump = document.getElementById('btn-jump-composers');
        
        const vp = this.dom.vp;

        const pointerStart = (clientX, clientY) => {
            this.stopAnim(); 
            this.isDragging = true; this.vx = 0; this.vy = 0; 
            this.lastX = clientX; this.lastY = clientY; this.lastTime = performance.now();
            this.exitFactModeManual(); vp.style.cursor = 'grabbing';
        };

        const pointerMove = (clientX, clientY) => {
            if (!this.isDragging) return;
            const now = performance.now();
            const dt = Math.max(1, now - this.lastTime); 
            const dx = clientX - this.lastX, dy = clientY - this.lastY;
            
            if (State.filters.graphMode === 'timeline') {
                this.x += dx;
                this.vx = (dx / dt) * 16;
            } else {
                this.vx = 0; 
            }
            this.y += dy;
            this.vy = (dy / dt) * 16;
            this.lastX = clientX; this.lastY = clientY; this.lastTime = now;
            this.clamp(); this.requestUpdate();
        };

        const pointerEnd = () => {
            if (!this.isDragging) return;
            this.isDragging = false; vp.style.cursor = 'grab'; this.startInertia();
        };

        vp.addEventListener('pointerdown', e => {
            if (e.isPrimary) { vp.setPointerCapture(e.pointerId); pointerStart(e.clientX, e.clientY); }
        });
        vp.addEventListener('pointermove', e => {
            if (this.isDragging && e.isPrimary) { e.preventDefault(); pointerMove(e.clientX, e.clientY); }
        });
        vp.addEventListener('pointerup', pointerEnd);
        vp.addEventListener('pointercancel', pointerEnd);

        vp.addEventListener('wheel', e => {
            e.preventDefault(); 
            if (this.isFlying) return; 

            this.stopAnim(); this.vx = 0; this.vy = 0; this.exitFactModeManual();
            const zoomFactor = Math.exp((e.deltaY < 0 ? 1 : -1) * 0.001 * Math.abs(e.deltaY));
            let newScale = Math.max(this.MIN_ZOOM, Math.min(this.scale * zoomFactor, this.MAX_ZOOM));
            
            const rect = vp.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            
            if (State.filters.graphMode === 'timeline') {
                this.x = mx - (mx - this.x) * (newScale / this.scale);
            }
            this.y = my - (my - this.y) * (newScale / this.scale);
            this.scale = newScale;
            this.clamp(); this.requestUpdate();
        }, { passive: false });

        window.addEventListener('resize', () => {
            this.updateLimits(); this.clamp(); this.requestUpdate();
        });
    },

    startInertia() {
        this.stopAnim();
        const maxVelocity = 40, friction = 0.80; 
        this.vx = Math.max(-maxVelocity, Math.min(maxVelocity, this.vx));
        this.vy = Math.max(-maxVelocity, Math.min(maxVelocity, this.vy));
        
        const step = () => {
            if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
                const prevX = this.x, prevY = this.y;
                this.x += this.vx; this.y += this.vy;
                this.vx *= friction; this.vy *= friction;
                this.clamp();
                if (this.x === prevX) this.vx = 0;
                if (this.y === prevY) this.vy = 0;
                this.update(); this.animFrame = requestAnimationFrame(step);
            }
        };
        this.animFrame = requestAnimationFrame(step);
    },

    exitFactModeManual() {
        // Мы БОЛЬШЕ НЕ сбрасываем State.currentFactIndex = -1;
        // Благодаря этому панель навигации "запоминает" твой последний шаг!
        const card = document.getElementById('fact-card');
        if (card) card.classList.remove('visible'); 
        Renderer.highlightFact(-1); 
    },

    flyToTarget(targetX, targetY, targetScale, exactDuration = null) {
        this.stopAnim();
        this.isFlying = true; 
        
        const startX = this.x, startY = this.y, startScale = this.scale;
        this.x = targetX; this.y = targetY; this.scale = targetScale;
        this.clamp();
        const finalX = this.x, finalY = this.y, finalScale = this.scale;
        this.x = startX; this.y = startY; this.scale = startScale;

        const dist = Math.hypot(finalX - startX, finalY - startY);
        
        // Если передано точное время, используем его (для перегруппировки)
        // Иначе динамическое, зависящее от расстояния (для полета к фактам)
        const duration = exactDuration !== null ? exactDuration : 1200 + Math.min(7500, dist * 0.25);
        
        // МАГИЯ СИНХРОНИЗАЦИИ: Эта математическая формула полностью копирует
        // CSS кривую cubic-bezier(.25, 1, .5, 1). Теперь камера и блоки движутся идентично!
        const ease = t => 1 - Math.pow(1 - t, 4);
        
        let startTime = performance.now();
        
        const step = currentTime => {
            let elapsed = Math.min(currentTime - startTime, duration);
            const t = ease(elapsed / duration);
            
            this.x = startX + (finalX - startX) * t; 
            this.y = startY + (finalY - startY) * t; 
            this.scale = startScale + (finalScale - startScale) * t;
            
            this.update();
            
            if (elapsed < duration) {
                this.animFrame = requestAnimationFrame(step); 
            } else {
                this.isFlying = false; 
                this.clamp(); this.update(); this.animFrame = null;
            }
        };
        this.animFrame = requestAnimationFrame(step);
        
        return duration;
    },

    stopAnim() { 
        if (this.animFrame) { cancelAnimationFrame(this.animFrame); this.animFrame = null; }
        this.isFlying = false; 
    },

    flyToYear(year) {
        const targetScale = Math.max(0.3, this.MIN_ZOOM);
        const targetX = (this.dom.vp.clientWidth / 2) - ((year - State.config.globalMinYear) * State.config.globalPixelsPerYear * targetScale);
        
        const centerLineY = State.config.equatorY + (State.config.trackHeight / 2);
        const targetY = (this.dom.vp.clientHeight / 2) - (centerLineY * targetScale); 
        
        return this.flyToTarget(targetX, targetY, targetScale); 
    },

    focusAll(animate = true) {
        const c = State.config;
        if (!this.dom.vp) return;
        const vpW = this.dom.vp.clientWidth, vpH = this.dom.vp.clientHeight;
        const isList = State.filters.graphMode !== 'timeline';
        
        let targetX, targetY, targetScale = this.MIN_ZOOM;
        
        if (isList) {
            targetX = (vpW - (c.maxBarWidth * targetScale)) / 2; 
            targetY = (vpH - c.canvasHeight * targetScale) / 2;
        } else {
            const minCanvasX = (Math.max(-1000, c.composersMinYear - 200) - c.globalMinYear) * c.globalPixelsPerYear;
            const w = (2200 - c.globalMinYear) * c.globalPixelsPerYear - minCanvasX;
            targetX = (vpW - w * targetScale) / 2 - (minCanvasX * targetScale);
            targetY = (vpH - c.canvasHeight * targetScale) / 2;
        }
        
        this.defX = targetX; this.defY = targetY; this.defScale = targetScale;
        
        if (animate) {
            this.flyToTarget(targetX, targetY, targetScale, ANIMATION_SPEED_MS);
        } else { 
            this.stopAnim();
            this.x = targetX; this.y = targetY; this.scale = targetScale; 
            this.clamp(); this.update(); 
        }
    },

    clamp() {
        if (!this.dom.vp) return;
        const vpW = this.dom.vp.clientWidth, vpH = this.dom.vp.clientHeight, c = State.config, s = this.scale;
        
        // Создаем динамический "воздух" по краям. 
        // 50% от экрана позволяет дотянуть любой край холста ровно до середины монитора.
        const padX = vpW * 0.25;
        const padY = vpH * 0.25;
        
        if (State.filters.graphMode !== 'timeline') {
            const contentW = (c.maxBarWidth || 0) * s;
            // Мягкие границы для гистограмм
            this.x = Math.max(vpW - contentW - padX, Math.min(padX, this.x)); 
        } else {
            const minX = ((c.trueMinYear || 0) - (c.globalMinYear || 0)) * (c.globalPixelsPerYear || 1) * s;
            const maxX = ((c.trueMaxYear || 0) - (c.globalMinYear || 0)) * (c.globalPixelsPerYear || 1) * s;
            
            // Мягкие границы для таймлайна (можно скроллить за крайние даты)
            this.x = Math.max(vpW - maxX - padX, Math.min(-minX + padX, this.x));
        }
        
        const ch = (c.canvasHeight || 0) * s;
        
        // Разрешаем вытягивать самую верхнюю и самую нижнюю границу холста до середины экрана,
        // чтобы крайние композиторы никогда не прятались под UI-панелями
        this.y = Math.max(vpH - ch - padY, Math.min(padY, this.y));
    },

    requestUpdate() { 
        if (!this.renderPending) { 
            this.renderPending = true; 
            requestAnimationFrame(() => { this.update(); this.renderPending = false; }); 
        }
    },

    update() {
        if (isNaN(this.x) || isNaN(this.y) || isNaN(this.scale)) return;
        
        const newTransform = 'translate3d(' + this.x + 'px, ' + this.y + 'px, 0) scale(' + this.scale + ')';
        if (this._lastTransform !== newTransform) {
            this.dom.canvas.style.transform = newTransform;
            this._lastTransform = newTransform;
        }
        
        // ==========================================
        // JS FRUSTUM CULLING (DOOM OPTIMIZATION)
        // ==========================================
        if (this.dom.vp && Renderer.gridChunks) {
            const vpW = this.dom.vp.clientWidth;
            // Вычисляем, какие пиксели холста сейчас на экране
            const minVis = -this.x / this.scale;
            const maxVis = (vpW - this.x) / this.scale;
            
            // Даем запас в пол-экрана, чтобы чанки появлялись без "вспрыгивания" на краях
            const padding = (vpW / this.scale) * 0.5;
            const checkMin = minVis - padding;
            const checkMax = maxVis + padding;
            
            Renderer.gridChunks.forEach(c => {
                // Чанк видим, если его правый край правее левой границы обзора 
                // И левый край левее правой границы обзора
                const isVisible = (c.right >= checkMin) && (c.left <= checkMax);
                
                if (c.isVisible !== isVisible) {
                    c.isVisible = isVisible;
                    // Мгновенное удаление/возврат из дерева рендера (0 лагов!)
                    const disp = isVisible ? 'block' : 'none';
                    c.lineEl.style.display = disp;
                    c.textEl.style.display = disp;
                }
            });
        }
        // ==========================================

        const textY = (75 - this.y) / this.scale;
        const gridText = document.getElementById('grid-text-container');
        const eraText = document.getElementById('era-label-container');

        if (eraText && eraText._lastTextY !== textY) {
            eraText.style.transform = 'translate3d(0, ' + textY + 'px, 0)';
            eraText._lastTextY = textY;
        }

        // --- МАГИЧЕСКИЙ ОБХОД ЛИМИТОВ GPU ДЛЯ ФОНА И СЕТКИ ---
        const invScale = 1 / this.scale;
        const antiY = -this.y * invScale;
        
        const bgLayer = document.getElementById('bg-layer');
        if (bgLayer && bgLayer._lastAntiY !== antiY) {
            // Фон стоит на месте по Y и растягивается ровно на масштаб экрана
            bgLayer.style.transform = 'translate3d(0, ' + antiY + 'px, 0) scaleY(' + invScale + ')';
            bgLayer._lastAntiY = antiY;
        }
        
        const gridLines = document.getElementById('grid-lines-container');
        if (gridLines && gridLines._lastAntiY !== antiY) {
            gridLines.style.transform = 'translate3d(0, ' + antiY + 'px, 0) scaleY(' + invScale + ')';
            gridLines._lastAntiY = antiY;
        }
        // ------------------------------------------------------
        
        if (gridText && gridText._lastTextY !== textY) {
            gridText.style.transform = 'translate3d(0, ' + textY + 'px, 0)';
            gridText._lastTextY = textY;
        }
        if (eraText && eraText._lastTextY !== textY) {
            eraText.style.transform = 'translate3d(0, ' + textY + 'px, 0)';
            eraText._lastTextY = textY;
        }

        const ppy = (State.config.globalPixelsPerYear || 1) * this.scale;
        let lodTier = '1000';
        if (ppy >= 1.2) lodTier = '50';
        else if (ppy >= 0.6) lodTier = '100';
        else if (ppy >= 0.12) lodTier = '500';

        const gridLayer = document.getElementById('grid-layer');
        if (gridLayer && gridLayer.dataset.lod !== lodTier) {
            gridLayer.dataset.lod = lodTier;
        }

        let currentInvScale = (1 / this.scale).toFixed(4);
        if (this._lastInvScale !== currentInvScale) {
            if (gridLayer) {
                gridLayer.style.setProperty('--ui-inv-scale', currentInvScale);
                gridLayer.style.setProperty('--text-scale', currentInvScale);
            }
            if (eraText) eraText.style.setProperty('--text-scale', currentInvScale);
            this._lastInvScale = currentInvScale;
        }

        const isMoved = Math.abs(this.x - this.defX) > 10 || Math.abs(this.y - this.defY) > 10 || Math.abs(this.scale - this.defScale) > 0.05;
        if (this._lastMoved !== isMoved) {
            if (this.dom.btnJump) this.dom.btnJump.classList.toggle('camera-moved', isMoved);
            this._lastMoved = isMoved;
        }
    }
};

const getBaseGroup = (c) => {
    if (!c) return 'Другое';
    const str = c.toLowerCase().trim();
    if (str.includes('германия') || str.includes('австрия')) return 'Австрия и Германия';
    if (str.includes('франция') || str.includes('нидерланды')) return 'Франция и Нидерланды';
    return c.trim();
};

const Engine = {
    initGlobalLayout() {
        const c = State.config; if (!State.rawItems.length) return;
        c.composersMinYear = c.globalMinYear = Math.min(...State.rawItems.map(i => i.birth));
        c.composersMaxYear = Math.max(...State.rawItems.map(i => i.death));
        
        const factsMin = HISTORICAL_FACTS.length ? Math.min(...HISTORICAL_FACTS.map(f => f.year)) : c.composersMinYear;
        const factsMax = HISTORICAL_FACTS.length ? Math.max(...HISTORICAL_FACTS.map(f => f.year)) : c.composersMaxYear;
        
        c.trueMinYear = Math.min(factsMin - 100, c.composersMinYear - 100); 
        c.trueMaxYear = Math.max(factsMax + 100, c.composersMaxYear + 100, 2200);
        
        const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '600 52px "Segoe UI"';
        c.basePixelsPerYear = Math.max(1, ...State.rawItems.map(i => (ctx.measureText(i.name).width + 48) / i.lifespan));
        this.updateWidth();
    },
    updateWidth() {
        State.config.globalPixelsPerYear = State.config.basePixelsPerYear * State.filters.widthFactor;
        State.config.totalWidth = (State.config.trueMaxYear - State.config.trueMinYear) * State.config.globalPixelsPerYear;
        Camera.updateLimits(); 
        if (State.filteredItems.length) Renderer.drawAll();
    },
    applyFiltersAndSort() {
        const f = State.filters;
        const isTimeline = f.mainMode === 'timeline';

        let baseCountryCounts = {};
        let baseEraCounts = {};

        State.filteredItems = State.rawItems.reduce((acc, i) => {
            const isMatch = i.parsedEras.some(e => f.eras.includes(e)) && 
                            i.parsedCountries.some(c => f.countries.includes(c)) && 
                            i.lifespan >= f.minLifespan && i.lifespan <= f.maxLifespan &&
                            i.works >= f.minWorks && i.works <= f.maxWorks;

            if (isMatch) {
                acc.push(i);
                
                i.country.split(',').forEach(p => {
                    const bg = getBaseGroup(p);
                    baseCountryCounts[bg] = (baseCountryCounts[bg] || 0) + 1;
                });
                i.parsedEras.forEach(e => {
                    baseEraCounts[e] = (baseEraCounts[e] || 0) + 1;
                });
            }
            return acc;
        }, []);

        let groupCounts = {};
        let groupEarliestBirth = {};

        State.filteredItems.forEach(i => {
            let maxC = -1, bestCountry = 'Другое';
            i.country.split(',').forEach(p => {
                const bg = getBaseGroup(p);
                if (baseCountryCounts[bg] > maxC) { maxC = baseCountryCounts[bg]; bestCountry = bg; }
            });
            i.primaryGroup = bestCountry; 

            let maxE = -1, bestEra = 'Другое';
            i.parsedEras.forEach(e => {
                if (baseEraCounts[e] > maxE) { maxE = baseEraCounts[e]; bestEra = e; }
            });
            i.primaryEra = bestEra;

            let activeGroup = 'none';
            // Используем новую переменную timelineGrouping
            if (isTimeline && f.timelineGrouping === 'country') {
                activeGroup = i.primaryGroup;
            } else if (!isTimeline && f.ratingGrouping === 'country') {
                activeGroup = i.primaryGroup;
            } else if (!isTimeline && f.ratingGrouping === 'era') {
                activeGroup = i.primaryEra;
            }
            i.activeGroup = activeGroup;

            if (activeGroup !== 'none') {
                groupCounts[activeGroup] = (groupCounts[activeGroup] || 0) + 1;
                if (groupEarliestBirth[activeGroup] === undefined || i.birth < groupEarliestBirth[activeGroup]) {
                    groupEarliestBirth[activeGroup] = i.birth;
                }
            }
        });

        State.filteredItems.sort((a, b) => {
            const groupA = a.activeGroup;
            const groupB = b.activeGroup;
            
            if (groupA !== 'none' && groupB !== 'none' && groupA !== groupB) {
                const diff = groupCounts[groupB] - groupCounts[groupA];
                if (diff !== 0) return diff;
                
                const birthDiff = groupEarliestBirth[groupA] - groupEarliestBirth[groupB];
                if (birthDiff !== 0) return birthDiff;
                
                return groupA.localeCompare(groupB);
            }
            
            if (isTimeline) {
                return a[f.timelineSort] - b[f.timelineSort];
            } else {
                if (f.ratingMetric === 'bar_works') return b.works - a.works;
                if (f.ratingMetric === 'bar_age') return b.lifespan - a.lifespan;
                if (f.ratingMetric === 'bar_productivity') {
                    const pA = a.works / Math.max(1, a.lifespan);
                    const pB = b.works / Math.max(1, b.lifespan);
                    return pB - pA;
                }
            }
            return 0;
        });

        document.getElementById('total-count').innerText = State.filteredItems.length;
        this.calculateLayout();
    },
    calculateLayout() {
        if (!State.filteredItems.length) return Renderer.drawAll();        
        const c = State.config, f = State.filters, rowH = c.trackHeight + c.trackMargin;
        const isTimeline = f.mainMode === 'timeline';
        
        f.graphMode = isTimeline ? 'timeline' : f.ratingMetric;
        const isLinear = (!isTimeline || f.timelineLayout === 'linear');

        let maxUp = 0, maxDown = 0;
        c.maxBarWidth = 0;

        if (!isTimeline) {
            State.filteredItems.forEach(item => {
                let w = 0;
                if (f.graphMode === 'bar_works') w = item.works * c.globalPixelsPerYear;
                else if (f.graphMode === 'bar_age') w = item.lifespan * c.globalPixelsPerYear * 10;
                else if (f.graphMode === 'bar_productivity') w = (item.works / Math.max(1, item.lifespan)) * c.globalPixelsPerYear * 100;
                if (w > c.maxBarWidth) c.maxBarWidth = w;
            });
        }

        if (isLinear) {
            if (!isTimeline) {
                State.filteredItems.forEach((item, i) => item.trackIndex = i);
                maxUp = 100; 
                maxDown = State.filteredItems.length * rowH + 150;
            } else {
                const total = State.filteredItems.length, half = Math.floor(total / 2);
                State.filteredItems.forEach((item, i) => item.trackIndex = i - half);
                maxDown = half * rowH + 150; maxUp = Math.abs(half - total) * rowH + 150;
            }
        } else {
            // Разветвление на основе новой переменной timelineGrouping
            if (f.timelineGrouping === 'none') {
                let trackEnds = {}, minT = 0, maxT = 0;
                State.filteredItems.forEach(item => {
                    let d = 0, placed = false;
                    while (!placed) {
                        if (!trackEnds[d] || trackEnds[d] + 1 <= item.birth) { item.trackIndex = d; trackEnds[d] = item.death; placed = true; if (d < minT) minT = d; if (d > maxT) maxT = d; }
                        else if (d > 0 && (!trackEnds[-d] || trackEnds[-d] + 1 <= item.birth)) { item.trackIndex = -d; trackEnds[-d] = item.death; placed = true; if (-d < minT) minT = -d; }
                        if (!placed) d++;
                    }
                });
                maxUp = Math.abs(minT) * rowH + 150; maxDown = maxT * rowH + 150;
            } else if (f.timelineGrouping === 'country') {
                let trackEnds = {}, maxT = 0, baseTrack = 0, prevGroup = null;
                State.filteredItems.forEach(item => {
                    const currentGroup = item.activeGroup;
                    if (prevGroup !== null && prevGroup !== currentGroup) baseTrack = maxT + 1;
                    prevGroup = currentGroup;
                    
                    let d = baseTrack;
                    while (trackEnds[d] && trackEnds[d] + 1 > item.birth) d++;
                    item.trackIndex = d; trackEnds[d] = item.death; if (d > maxT) maxT = d;
                });
                const offset = Math.floor(maxT / 2);
                State.filteredItems.forEach(item => item.trackIndex -= offset);
                const minT = -offset;
                maxT = maxT - offset;
                maxUp = Math.abs(minT) * rowH + 150;
                maxDown = maxT * rowH + 150;
            }
        }
        
        const halfCanvas = Math.max(maxUp, maxDown);
        c.equatorY = isTimeline ? halfCanvas : 150; 
        c.canvasHeight = isTimeline ? halfCanvas * 2 : maxDown;
        
        Camera.updateLimits(); 
        Renderer.drawAll();
        
        if (State.isInitialLoad) {
            Camera.focusAll(false);      
            State.isInitialLoad = false; 
        } else {
            Camera.focusAll(true);
        }
    }
};

const Renderer = {
    layers: { bg: document.getElementById('bg-layer'), grid: document.getElementById('grid-layer'), facts: document.getElementById('facts-layer'), items: document.getElementById('items-layer') },
    tooltip: document.getElementById('tooltip'),
    initEvents() {
        this.layers.items.addEventListener('mouseover', e => { const b = e.target.closest('.composer-block'); if (b) { const i = State.filteredItems.find(x => x.id === b.dataset.id); if (i) this.showComposerTooltip(i); }});
        this.layers.items.addEventListener('mouseout', e => { if (e.target.closest('.composer-block')) this.hideTooltip(); });
        this.layers.facts.addEventListener('mouseover', e => { const m = e.target.closest('.fact-marker'); if (m) this.showFactTooltip(HISTORICAL_FACTS[m.dataset.index]); });
        this.layers.facts.addEventListener('mouseout', e => { if (e.target.closest('.fact-marker')) this.hideTooltip(); });
        
        let tipFrame;
        window.addEventListener('mousemove', e => { 
            if (this.tooltip.style.visibility === 'visible') { 
                if (tipFrame) cancelAnimationFrame(tipFrame);
                tipFrame = requestAnimationFrame(() => {
                    this.tooltip.style.left = (e.clientX + 15) + 'px'; 
                    this.tooltip.style.top = (e.clientY + 15) + 'px'; 
                });
            }
        });
    },
    drawAll() { 
        const isTimeline = State.filters.graphMode === 'timeline';
        
        const vis = isTimeline ? 'visible' : 'hidden';
        this.layers.bg.style.visibility = vis;
        this.layers.grid.style.visibility = vis;
        this.layers.facts.style.visibility = vis;
        
        if (isTimeline) {
            const c = State.config;
            // Убрали c.equatorY из хэша, чтобы сетка не перестраивалась при смещении оси Y
            const gridHash = `\({c.trueMinYear}_\){c.trueMaxYear}_\({c.globalPixelsPerYear}_\){c.canvasHeight}_${State.filters.layoutMode}`;            
            if (this._lastGridHash !== gridHash) {
                this.drawBackgroundEras(); 
                this.drawGrid(); 
                this._lastGridHash = gridHash;
            }
            
            // Вызываем всегда, чтобы факты и линия могли плавно обновить свои координаты
            this.drawFacts(); 
        }
        
        this.drawItems(); 
        this.highlightFact(State.currentFactIndex); 
    },
    drawFacts() {
        const c = State.config;
        
        let eq = document.getElementById('main-equator-line');
        if (!eq) {
            eq = document.createElement('div');
            eq.id = 'main-equator-line';
            eq.className = 'equator-line';
            this.layers.grid.appendChild(eq);
        }
        
        const equatorWidth = (CURRENT_YEAR - c.trueMinYear) * c.globalPixelsPerYear;
        const centerLineY = c.equatorY + (c.trackHeight / 2); // <- Вычисленный центр линии
        
        eq.style.width = equatorWidth + 'px';
        eq.style.left = ((c.trueMinYear - c.globalMinYear) * c.globalPixelsPerYear) + 'px';
        eq.style.top = centerLineY + 'px';
        eq.style.display = State.filters.layoutMode === 'compact' ? 'block' : 'none';

        const existingFacts = this.layers.facts.querySelectorAll('.fact-marker');
        
        if (existingFacts.length === HISTORICAL_FACTS.length) {
            existingFacts.forEach((el, i) => {
                const f = HISTORICAL_FACTS[i];
                const xPos = (f.year - c.globalMinYear) * c.globalPixelsPerYear;
                el.style.left = xPos + 'px';
                el.style.top = centerLineY + 'px'; // <- ИСПРАВЛЕНИЕ ТУТ
            });
        } else {
            this.layers.facts.innerHTML = ''; 
            const frag = document.createDocumentFragment();
            
            HISTORICAL_FACTS.forEach((f, i) => {
                const xPos = (f.year - c.globalMinYear) * c.globalPixelsPerYear;
                const el = document.createElement('div');
                el.className = 'fact-marker';
                el.dataset.index = i;
                el.style.left = xPos + 'px';
                el.style.top = centerLineY + 'px'; // <- И ИСПРАВЛЕНИЕ ТУТ
                el.innerHTML = '💡';
                frag.appendChild(el);
            });
            this.layers.facts.appendChild(frag);
        }
    },
    highlightFact(index) {
        document.querySelectorAll('.fact-marker').forEach(m => m.classList.remove('active-fact'));
        if (index !== -1) document.querySelector(`.fact-marker[data-index="${index}"]`)?.classList.add('active-fact');
    },
    drawBackgroundEras() {
        const eraStats = {}, c = State.config; 
        State.rawItems.forEach(i => { if (!eraStats[i.era]) eraStats[i.era] = { min: 9999, max: -9999 }; eraStats[i.era].min = Math.min(eraStats[i.era].min, i.birth); eraStats[i.era].max = Math.max(eraStats[i.era].max, i.death); });
        const erasArr = Object.keys(eraStats).map(e => ({ era: e, center: (eraStats[e].min + eraStats[e].max) / 2 })).sort((a, b) => a.center - b.center);
        
        const gradientMinYear = c.composersMinYear - 50; 
        const gradientMaxYear = c.composersMaxYear + 50;
        const gradientWidth = (gradientMaxYear - gradientMinYear) * c.globalPixelsPerYear;
        const gradientLeft = (gradientMinYear - c.globalMinYear) * c.globalPixelsPerYear;

        const firstColor = 'color-mix(in srgb, ' + getColor('era', erasArr[0].era) + ' 12%, transparent)';
        const lastColor = 'color-mix(in srgb, ' + getColor('era', erasArr[erasArr.length - 1].era) + ' 12%, transparent)';

        let stops = ['var(--c-bg) 0%', firstColor + ' 2%'];
        let labelHtml = ''; 
        
        erasArr.forEach(e => {
            const pct = ((e.center - gradientMinYear) / (gradientMaxYear - gradientMinYear)) * 100;
            stops.push('color-mix(in srgb, ' + getColor('era', e.era) + ' 12%, transparent) ' + pct + '%');
            const leftPos = (e.center - c.globalMinYear) * c.globalPixelsPerYear;
            labelHtml += '<' + 'div class="era-label" style="left:' + leftPos + 'px;">' + e.era + '<' + '/div>';
        });
        
        stops.push(lastColor + ' 98%', 'var(--c-bg) 100%');

        this.layers.bg.innerHTML = '<' + 'div id="era-label-container" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events: none; will-change: transform;">' + labelHtml + '<' + '/div>';
        
        // ВМЕСТО HEIGHT в пикселях используем 100vh и выставляем стартовый transform
        this.layers.bg.style.cssText = 'position:absolute; top:0; height:100vh; transform-origin:top; left:' + gradientLeft + 'px; width:' + gradientWidth + 'px; background:linear-gradient(to right, ' + stops.join(', ') + ')';
        
        if (Camera.scale) {
            const invScale = 1 / Camera.scale;
            const antiY = -Camera.y * invScale;
            this.layers.bg.style.transform = 'translate3d(0, ' + antiY + 'px, 0) scaleY(' + invScale + ')';
            this.layers.bg._lastAntiY = antiY;
        }
    },
    drawGrid() {
        if (!State.rawItems.length) return;
        const c = State.config; // УБРАНА ПЕРЕМЕННАЯ h
        
        const CHUNK_YEARS = 2000; 
        const startC = Math.floor(c.trueMinYear / CHUNK_YEARS) * CHUNK_YEARS;
        const endC = Math.ceil(c.trueMaxYear / CHUNK_YEARS) * CHUNK_YEARS;
        
        Array.from(this.layers.grid.children).forEach(child => {
            if (child.id !== 'main-equator-line') child.remove();
        });
        this.gridChunks = []; 
        
        const linesContainer = document.createElement('div');
        linesContainer.id = 'grid-lines-container'; // ДОБАВЛЕН ID ДЛЯ КАМЕРЫ
        // ИСПОЛЬЗУЕМ 100vh
        linesContainer.style.cssText = 'position:absolute; left:0; right:0; top:0; height:100vh; transform-origin:top; pointer-events:none; will-change:transform;';
        
        if (Camera.scale) {
            const invScale = 1 / Camera.scale;
            const antiY = -Camera.y * invScale;
            linesContainer.style.transform = 'translate3d(0, ' + antiY + 'px, 0) scaleY(' + invScale + ')';
            linesContainer._lastAntiY = antiY;
        }

        const textsContainer = document.createElement('div');
        textsContainer.id = 'grid-text-container';
        textsContainer.style.cssText = 'position:absolute; inset:0; pointer-events:none; z-index:200; will-change:transform;';
        
        for (let chunkY = startC; chunkY <= endC; chunkY += CHUNK_YEARS) {
            const chunkX = (chunkY - c.globalMinYear) * c.globalPixelsPerYear;
            const chunkWidth = CHUNK_YEARS * c.globalPixelsPerYear;
            
            const lineChunk = document.createElement('div');
            // ВМЕСТО h ИСПОЛЬЗУЕМ 100%
            lineChunk.style.cssText = 'position:absolute; left:' + chunkX + 'px; top:0; width:' + chunkWidth + 'px; height:100%;';
            
            const textChunk = document.createElement('div');
            textChunk.style.cssText = 'position:absolute; left:' + chunkX + 'px; top:0; width:' + chunkWidth + 'px; height:100px;';
            
            let linesHtml = '';
            let textsHtml = '';
            
            for (let y = chunkY; y < chunkY + CHUNK_YEARS; y += 50) {
                if (y > c.trueMaxYear) break;
                const tier = y % 10000 === 0 ? 10000 : y % 5000 === 0 ? 5000 : y % 1000 === 0 ? 1000 : y % 500 === 0 ? 500 : y % 100 === 0 ? 100 : 50;
                const localX = (y - chunkY) * c.globalPixelsPerYear;
                
                // ВМЕСТО h ИСПОЛЬЗУЕМ 100%
                linesHtml += '<' + 'div class="year-marker step-' + tier + '" style="left:' + localX + 'px; top:0; height:100%;"><' + '/div>';
                let label = y < 0 ? Math.abs(y) : (y === 0 ? '0' : y);
                textsHtml += '<' + 'div class="year-text-wrapper step-' + tier + '" style="position:absolute; left:' + localX + 'px; top:0;"><' + 'div class="year-text">' + label + '<' + '/div><' + '/div>';
            }
            
            lineChunk.innerHTML = linesHtml;
            textChunk.innerHTML = textsHtml;
            
            linesContainer.appendChild(lineChunk);
            textsContainer.appendChild(textChunk);
            
            this.gridChunks.push({
                lineEl: lineChunk,
                textEl: textChunk,
                left: chunkX,
                right: chunkX + chunkWidth,
                isVisible: true
            });
        }
        
        const currentYearPos = (CURRENT_YEAR - c.globalMinYear) * c.globalPixelsPerYear;
        // ВМЕСТО h ИСПОЛЬЗУЕМ 100%
        linesContainer.insertAdjacentHTML('beforeend', '<' + 'div class="current-time-line" style="left:' + currentYearPos + 'px; top:0; height:100%;"><' + '/div>');
            
        this.layers.grid.appendChild(linesContainer);
        this.layers.grid.appendChild(textsContainer);
    },
    drawItems() {
        const c = State.config;
        const activeIds = new Set();
        const frag = document.createDocumentFragment();
        
        const gm = State.filters.graphMode;
        const colorMode = State.filters.colorMode;
        const isTimeline = State.filters.mainMode === 'timeline';
        const isList = !isTimeline;
        const isLinear = isList || State.filters.timelineLayout === 'linear';
        
        const gppy = c.globalPixelsPerYear;
        const minYear = c.globalMinYear;
        const eqY = c.equatorY;
        const trackStep = c.trackHeight + c.trackMargin;
        const isBarWorks = gm === 'bar_works';
        const isBarAge = gm === 'bar_age';
        const isBarProd = gm === 'bar_productivity';
        
        if (State.isInitialLoad) {
            this.layers.items.classList.add('initial-render');
        }

        State.filteredItems.forEach((item, i) => {
            activeIds.add(item.id); 
            let el = State.domCache[item.id];
            
            if (!el) { 
                el = document.createElement('div'); 
                el.className = 'composer-block' + (item.death === CURRENT_YEAR ? ' alive' : ''); 
                el.dataset.id = item.id; 
                
                const indexEl = document.createElement('div');
                indexEl.className = 'comp-index-ext';
                el._indexNode = indexEl;
                el.appendChild(indexEl);

                const contentEl = document.createElement('div');
                contentEl.className = 'composer-content-inner';
                
                // Разорванные теги для защиты от парсера чата
                contentEl.innerHTML = '<' + 'div class="composer-name"><' + 'span class="comp-name-text">' + item.name + '<' + '/span><' + 'span class="comp-right-data"><' + '/span><' + '/div>';
                
                el._rightNode = contentEl.querySelector('.comp-right-data');
                el.appendChild(contentEl);
                
                el._colorEra = getColor('era', item.era);
                el._colorCountry = getColor('country', item.primaryGroup);
                
                State.domCache[item.id] = el; 
                frag.appendChild(el); 
            }
            
            let wPixels, xPixels, rightData = '';
            
            if (isTimeline) {
                wPixels = item.lifespan * gppy;
                xPixels = (item.birth - minYear) * gppy;
            } else if (isBarWorks) {
                wPixels = item.works * gppy;
                xPixels = 0;
                rightData = item.works + ' произв.';
            } else if (isBarAge) {
                wPixels = item.lifespan * gppy * 10;
                xPixels = 0;
                rightData = item.lifespan + ' лет';
            } else if (isBarProd) {
                const prod = item.works / Math.max(1, item.lifespan);
                wPixels = prod * gppy * 100;
                xPixels = 0;
                rightData = prod.toFixed(1) + ' пр./год';
            }
            
            const INDEX_COLUMN_WIDTH = isLinear ? 120 : 0; 
            const finalXPixels = xPixels + INDEX_COLUMN_WIDTH;

            const widthStr = Math.max(wPixels, 3) + 'px';
            const transformStr = 'translate3d(' + finalXPixels + 'px, ' + (eqY + item.trackIndex * trackStep) + 'px, 0)';
            const bgStr = colorMode === 'era' ? el._colorEra : el._colorCountry;
            
            if (i === 0) this.layers.items.classList.toggle('show-indices', isLinear);

            if (isLinear) {
                const indexText = (i + 1) + '.';
                if (el._indexText !== indexText) { 
                    el._indexNode.textContent = indexText; 
                    el._indexText = indexText; 
                }
                // ИСПРАВЛЕННЫЙ БАГ: Индекс уже внутри блока, поэтому Y-координата должна быть 0!
                el._indexNode.style.transform = 'translate3d(-130px, 0, 0)';
            }

            if (el._rightData !== rightData) {
                el._rightNode.textContent = rightData;
                el._rightData = rightData;
            }
            
            DOMAnimator.schedule(el, {
                width: widthStr,
                height: c.trackHeight + 'px', // <--- ВОТ ГЛАВНОЕ ИСПРАВЛЕНИЕ: Форсируем высоту 112px
                transform: transformStr,
                backgroundColor: bgStr
            }, false);
        });
        
        if (frag.childNodes.length > 0) {
            this.layers.items.appendChild(frag);
        }
        
        Object.keys(State.domCache).forEach(id => { 
            if (!activeIds.has(id)) { 
                DOMAnimator.schedule(State.domCache[id], null, true);
            } 
        });

        if (State.isInitialLoad) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.layers.items.classList.remove('initial-render');
                });
            });
        }
    },
    showComposerTooltip(item) {
        if (this.currentHoverId === item.id) return;
        this.currentHoverId = item.id;

        this.tooltip.innerHTML = `<div class="tooltip-title">${item.name}</div>${item.engName ? `<div style="color:#aaa; font-size:12px; margin-bottom:5px;">${item.engName}</div>` : ''}<b>Годы:</b> ${item.birth} — ${item.death === CURRENT_YEAR ? 'Наши дни' : item.death}<br><b>Прожил:</b> ${item.lifespan} лет<br><b>Эпоха:</b> ${item.era}<br><b>Страна:</b> ${item.country}<br><b>Произведений:</b> ~${item.works}`;
        this.tooltip.style.visibility = 'visible'; 
        this.tooltip.style.opacity = '1';
        
        clearTimeout(this.dimTimeout);
        this.dimTimeout = setTimeout(() => {
        this.layers.items.classList.add('hover-active');
    
        // 0. Мгновенно снимаем старые выделения через кэш
        State.activeHighlights.forEach(id => {
            if (State.domCache[id]) State.domCache[id].classList.remove('highlighted');
        });

        // 1. Быстро находим современников
        const contemporaries = State.filteredItems.filter(t => t.birth <= item.death && t.death >= item.birth);

        // 2. Запоминаем новые ID и раздаем классы напрямую через domCache
        State.activeHighlights = contemporaries.map(t => t.id);
        State.activeHighlights.forEach(id => {
            const el = State.domCache[id];
            if (el && !el.classList.contains('hidden')) {
                el.classList.add('highlighted');
            }
        });
}, 500);
    },    
    showFactTooltip(fact) {
        this.tooltip.innerHTML = `<div class="tooltip-title" style="color:#e91e63;">${fact.year < 0 ? Math.abs(fact.year) + ' год до н.э.' : fact.year + ' год'}</div><b>${fact.title}</b><br><div style="margin-top:5px; color:#ccc;">${fact.text}</div>`;
        this.tooltip.style.visibility = 'visible'; this.tooltip.style.opacity = '1';
    },
    hideTooltip() { 
        this.currentHoverId = null; 
        this.tooltip.style.visibility = 'hidden'; 
        this.tooltip.style.opacity = '0'; 
        
        clearTimeout(this.dimTimeout);
        this.layers.items.classList.remove('hover-active');
        Object.values(State.domCache).forEach(el => { 
            el.style.opacity = ''; el.style.filter = ''; el.style.zIndex = '';
        }); 
    }
};

function setupFactsNavigation() {
    const btnPrev = document.getElementById('btn-prev-fact'), 
          btnNext = document.getElementById('btn-next-fact'), 
          display = document.getElementById('fact-info-display'), 
          card = document.getElementById('fact-card'),
          btnFirst = document.getElementById('btn-first-fact'), 
          btnLast = document.getElementById('btn-last-fact');   
          
    document.getElementById('btn-jump-composers').addEventListener('click', () => activateFact(-1));
    
    State.updateFactNavUI = () => {
        const len = HISTORICAL_FACTS.length; 
        if (!len) return;
        
        if (State.currentFactIndex === -1) {
            display.innerText = 'Факт 0 из ' + len; // Возвращаем исходный формат
            btnPrev.disabled = false; 
            btnNext.disabled = true; 
            btnFirst.disabled = false; 
            btnLast.disabled = true;   
        } else {
            display.innerText = 'Факт ' + (State.currentFactIndex + 1) + ' из ' + len;
            const isOldest = State.currentFactIndex === 0;
            const isNewest = State.currentFactIndex === len - 1;
            btnPrev.disabled = isOldest; 
            btnNext.disabled = false;
            btnFirst.disabled = isOldest; 
            btnLast.disabled = isNewest;
        }
    };
    
    function activateFact(idx) {
        State.currentFactIndex = idx; 
        Renderer.hideTooltip();
        
        // 1. Мгновенно скрываем карточку и гасим ВСЕ предыдущие маркеры
        card.classList.remove('visible'); 
        Renderer.highlightFact(-1); 
        
        if (idx === -1) { 
            Camera.focusAll(true); 
        } else { 
            const f = HISTORICAL_FACTS[idx]; 
            const flightTime = Camera.flyToYear(f.year); 
            
            // Задаем опережение (например, за 400 мс до конца полета). 
            // Math.max(0, ...) спасает от отрицательных чисел, если полет был очень быстрым.
            const popupDelay = Math.max(0, flightTime - 595); 
            
            // 2. Ждем вычисленное время
            setTimeout(() => {
                if (State.currentFactIndex === idx) {
                    
                    // 3. Запускаем анимацию кругляшка И появление карточки СИНХРОННО
                    Renderer.highlightFact(idx); 
                    
                    document.getElementById('fact-card-year').innerText = f.year < 0 ? Math.abs(f.year) + ' год до н.э.' : f.year + ' год'; 
                    document.getElementById('fact-card-title').innerText = f.title; 
                    document.getElementById('fact-card-text').innerText = f.text; 
                    card.classList.add('visible'); 
                }
            }, popupDelay); // <--- Используем новую переменную popupDelay
        }
        State.updateFactNavUI();
    }
    
    btnPrev.onclick = () => activateFact(State.currentFactIndex === -1 ? HISTORICAL_FACTS.length - 1 : Math.max(0, State.currentFactIndex - 1));
    btnNext.onclick = () => { if (State.currentFactIndex !== -1) activateFact(State.currentFactIndex === HISTORICAL_FACTS.length - 1 ? -1 : State.currentFactIndex + 1); };
    
    btnFirst.onclick = () => activateFact(0); 
    btnLast.onclick = () => activateFact(-1); 
    
    document.getElementById('btn-close-fact').onclick = () => {
        card.classList.remove('visible');
        Renderer.highlightFact(-1);
    };
    
    State.updateFactNavUI();
}

function setupDualSlider(minId, maxId, stateKey) {
    const minInput = document.getElementById(minId);
    const maxInput = document.getElementById(maxId);
    
    // Формирование ключей для State.filters (minLifespan, maxWorks и т.д.)
    const stateMin = 'min' + stateKey;
    const stateMax = 'max' + stateKey;

    if (!minInput || !maxInput) return;

    const minLabel = document.getElementById(minId.replace('ctrl-', 'val-'));
    const maxLabel = document.getElementById(maxId.replace('ctrl-', 'val-'));
    const trackId = 'track-' + stateKey.toLowerCase().replace('lifespan', 'life');
    const track = document.getElementById(trackId);

    // Обработчик 'input': плавное обновление без залипаний
    const updateUI = () => {
        let val1 = parseInt(minInput.value);
        let val2 = parseInt(maxInput.value);

        // Магия здесь: мы больше не блокируем ползунки.
        // Мы просто вычисляем реальное МИН и МАКС из двух значений.
        let realMin = Math.min(val1, val2);
        let realMax = Math.max(val1, val2);

        // Обновляем текст
        if (minLabel) minLabel.innerText = realMin;
        if (maxLabel) maxLabel.innerText = realMax + (stateKey === 'Works' && realMax == 1400 ? '+' : '');

        // Закрашиваем активную часть полоски строго от меньшего к большему
        if (track) {
            const maxAttr = parseInt(minInput.max);
            const percent1 = (realMin / maxAttr) * 100;
            const percent2 = (realMax / maxAttr) * 100;
            track.style.left = percent1 + '%';
            track.style.width = (percent2 - percent1) + '%';
            track.style.backgroundColor = 'var(--c-accent)';
        }
    };

    // Обработчик 'change': запись в State и фильтрация
    const applyFilter = () => {
        let val1 = parseInt(minInput.value);
        let val2 = parseInt(maxInput.value);

        // Отправляем в фильтры правильные значения независимо от того,
        // какой именно физический ползунок сейчас слева, а какой справа
        State.filters[stateMin] = Math.min(val1, val2);
        State.filters[stateMax] = Math.max(val1, val2);
        Engine.applyFiltersAndSort();
    };

    // Привязка событий (передавать 'e' больше не нужно)
    minInput.addEventListener('input', updateUI);
    maxInput.addEventListener('input', updateUI);
    minInput.addEventListener('change', applyFilter);
    maxInput.addEventListener('change', applyFilter);
    
    // Первичная отрисовка линии при загрузке
    updateUI();
}

function setupControls() {
    const branchTimeline = document.getElementById('branch-timeline');
    const branchRating = document.getElementById('branch-rating');
    
    // Переключатель главного дерева выбора
    const updateVisibility = () => {
        if (State.filters.mainMode === 'timeline') {
            branchTimeline.style.display = 'block';
            branchRating.style.display = 'none';
        } else {
            branchTimeline.style.display = 'none';
            branchRating.style.display = 'block';
        }
    };

    // Функция-помощник для привязки кнопок-переключателей
    const bindSwitch = (id, key, needsLayout = false, isColor = false) => {
        const container = document.getElementById(id);
        if (!container) return;
        
        const buttons = container.querySelectorAll('.switch-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                State.filters[key] = btn.dataset.val;

                // --- АВТОМАТИЧЕСКОЕ ПЕРЕКЛЮЧЕНИЕ ЦВЕТА ---
                if (key === 'timelineGrouping' || key === 'ratingGrouping') {
                    if (btn.dataset.val === 'country') {
                        State.filters.colorMode = 'country';
                    } else if (btn.dataset.val === 'era') {
                        State.filters.colorMode = 'era';
                    } else if (btn.dataset.val === 'none') {
                        // Возврат на базовую расцветку (по эпохам) при выборе "Общая"
                        State.filters.colorMode = 'era';
                    }
                    
                    // Визуально переключаем кнопку в блоке "Расцветка"
                    const colorContainer = document.getElementById('ctrl-color');
                    if (colorContainer) {
                        colorContainer.querySelectorAll('.switch-btn').forEach(cb => {
                            cb.classList.toggle('active', cb.dataset.val === State.filters.colorMode);
                        });
                    }
                }
                // ------------------------------------------
                
                if (isColor) {
                    Renderer.drawItems(); 
                } else if (key === 'mainMode') {
                    updateVisibility();
                    Engine.applyFiltersAndSort();
                } else {
                    needsLayout ? Engine.calculateLayout() : Engine.applyFiltersAndSort();
                }
            });
        });
    };

    // Привязываем переключатели (Таймлайн)
    bindSwitch('ctrl-main-mode', 'mainMode');
    bindSwitch('ctrl-timeline-layout', 'timelineLayout', true);
    bindSwitch('ctrl-timeline-grouping', 'timelineGrouping', false); 
    bindSwitch('ctrl-timeline-sort', 'timelineSort', false);
    
    // Привязываем переключатели (Рейтинг)
    bindSwitch('ctrl-rating-metric', 'ratingMetric', false);
    bindSwitch('ctrl-rating-grouping', 'ratingGrouping', false);

    // Привязываем переключатель расцветки
    bindSwitch('ctrl-color', 'colorMode', false, true); 
    
    updateVisibility();

    // Обработчик ползунка масштаба
    document.getElementById('ctrl-width').addEventListener('input', e => { 
        State.filters.widthFactor = parseFloat(e.target.value); 
        Engine.updateWidth(); 
    });

    // ... остальной код функции setupControls (bindCbGroup, setupDualSlider и т.д.) остаётся без изменений!
    const bindCbGroup = (id, key) => {
        const container = document.getElementById(id);
        if (!container) return; 
        container.addEventListener('change', e => {
            if (e.target.type !== 'checkbox') return;
            const tgt = e.target;
            if (tgt.classList.contains('group-master')) {
                container.querySelectorAll(`.group-child[data-parent="${tgt.dataset.group}"]`).forEach(cb => cb.checked = tgt.checked);
            } else if (tgt.classList.contains('group-child')) {
                const master = container.querySelector(`.group-master[data-group="${tgt.dataset.parent}"]`);
                if (master) {
                    const children = container.querySelectorAll(`.group-child[data-parent="${tgt.dataset.parent}"]`);
                    master.checked = Array.from(children).every(c => c.checked);
                    master.indeterminate = !master.checked && Array.from(children).some(c => c.checked);
                }
            }
            State.filters[key] = Array.from(container.querySelectorAll('input[type="checkbox"]:checked:not(.group-master)')).map(cb => cb.value);
            Engine.applyFiltersAndSort();
        });
    };

    setupDualSlider('ctrl-min-life', 'ctrl-max-life', 'Lifespan');
    setupDualSlider('ctrl-min-works', 'ctrl-max-works', 'Works');

    bindCbGroup('ctrl-era', 'eras'); bindCbGroup('ctrl-country', 'countries');

    document.querySelectorAll('.toggle-all').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault(); 
            const c = document.getElementById(e.target.dataset.target);
            if (!c) return;
            const cbs = c.querySelectorAll('input[type="checkbox"]');
            const allChecked = Array.from(cbs).every(cb => cb.checked);
            cbs.forEach(cb => { cb.checked = !allChecked; cb.indeterminate = false; });
            State.filters[e.target.dataset.target === 'ctrl-era' ? 'eras' : 'countries'] = Array.from(c.querySelectorAll('input[type="checkbox"]:checked:not(.group-master)')).map(cb => cb.value);
            Engine.applyFiltersAndSort();
        });
    });

    document.addEventListener('click', e => {
        if (e.target.classList.contains('collapse-toggle')) {
            e.preventDefault();
            const targetDiv = document.getElementById(e.target.dataset.target);
            if (targetDiv) {
                targetDiv.classList.toggle('collapsed-group');
                e.target.innerText = targetDiv.classList.contains('collapsed-group') ? '▶' : '▼';
            }
        }
    });

    document.querySelectorAll('.top-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const panel = document.getElementById(btn.dataset.target);
            if (!panel) return;
            
            if (panel.classList.contains('active-dropdown')) {
                panel.classList.remove('active-dropdown'); btn.classList.remove('active-btn');
                return;
            }
            
            document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('active-dropdown'));
            document.querySelectorAll('.top-nav-btn').forEach(b => b.classList.remove('active-btn'));
            
            panel.classList.add('active-dropdown'); btn.classList.add('active-btn');
            const btnRect = btn.getBoundingClientRect();
            panel.style.left = Math.max(10, Math.min(btnRect.left, window.innerWidth - panel.offsetWidth - 10)) + 'px';
        });
    });

    const closeDropdowns = (e) => {
        if (!e.target.closest('.dropdown-panel') && !e.target.closest('.top-nav-btn')) {
            document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('active-dropdown'));
            document.querySelectorAll('.top-nav-btn').forEach(b => b.classList.remove('active-btn'));
        }
    };
    document.addEventListener('mousedown', closeDropdowns);
    document.addEventListener('touchstart', closeDropdowns, { passive: true });

    const searchInput = document.getElementById('ctrl-search');
    const searchResults = document.getElementById('search-results');

    if (searchInput && searchResults) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (!query) { searchResults.classList.remove('visible'); return; }

            const matches = State.filteredItems.filter(i => i.name.toLowerCase().includes(query) || (i.engName && i.engName.toLowerCase().includes(query)));
            if (matches.length === 0) {
                searchResults.innerHTML = '<div class="search-item" style="color: #888; cursor: default;">Ничего не найдено</div>';
            } else {
                searchResults.innerHTML = matches.map(m => `<div class="search-item" data-id="${m.id}">${m.name} <span style="color:#888; font-size:11px; margin-left:5px;">(${m.birth} — ${m.death === CURRENT_YEAR ? 'Наши дни' : m.death})</span></div>`).join('');
            }
            searchResults.classList.add('visible');
        });

        searchResults.addEventListener('click', (e) => {
            const itemEl = e.target.closest('.search-item');
            if (!itemEl || !itemEl.dataset.id) return; 
            
            const composer = State.filteredItems.find(c => c.id === itemEl.dataset.id);
            if (composer) {
                searchResults.classList.remove('visible'); searchInput.value = '';
                const c = State.config, vp = document.getElementById('viewport');
                const composerCenterX = (composer.birth + (composer.lifespan / 2) - c.globalMinYear) * c.globalPixelsPerYear;
                const composerCenterY = c.equatorY + composer.trackIndex * (c.trackHeight + c.trackMargin) + (c.trackHeight / 2);
                
                const targetScale = 0.5;
                const camTargetX = (vp.clientWidth / 2) - (composerCenterX * targetScale);
                const camTargetY = (vp.clientHeight / 2) - (composerCenterY * targetScale);

                // Замените старую строчку на эту
                const flightTime = Camera.flyToTarget(camTargetX, camTargetY, targetScale);

                setTimeout(() => {
                    Renderer.showComposerTooltip(composer);
                }, flightTime);
                
                Camera.flyToTarget(camTargetX, camTargetY, targetScale, 1500);
                setTimeout(() => { Renderer.showComposerTooltip(composer); }, 1500);
            }
        });

        const closeSearchDropdown = (e) => {
            if (!e.target.closest('.search-container') && !e.target.closest('.search-dropdown')) searchResults.classList.remove('visible');
        };
        document.addEventListener('mousedown', closeSearchDropdown);
        document.addEventListener('touchstart', closeSearchDropdown, { passive: true });
    }

    let factsVisible = true; 
    const factsLayer = document.getElementById('facts-layer');
    if (factsLayer) factsLayer.style.display = 'block'; 
    
    const btnToggleFacts = document.getElementById('btn-toggle-facts');
    if (btnToggleFacts) {
        btnToggleFacts.classList.add('active-btn');
        document.getElementById('facts-nav').classList.add('visible');

        btnToggleFacts.addEventListener('click', (e) => {
            factsVisible = !factsVisible;
            btnToggleFacts.classList.toggle('active-btn', factsVisible);
            if (factsLayer) factsLayer.style.display = factsVisible ? 'block' : 'none';
            
            if (!factsVisible) {
                document.getElementById('facts-nav').classList.remove('visible');
                document.getElementById('fact-card').classList.remove('visible');
                Camera.exitFactModeManual();
            } else document.getElementById('facts-nav').classList.add('visible');
        });
    }

    const btnExport = document.getElementById('btn-export-svg');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const c = State.config, w = c.totalWidth, h = c.canvasHeight;
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
            svg += `<rect width="100%" height="100%" fill="#151515"/>`;
            
            State.filteredItems.forEach(item => {
                const x = (item.birth - c.globalMinYear) * c.globalPixelsPerYear;
                const y = c.equatorY + item.trackIndex * (c.trackHeight + c.trackMargin);
                const width = item.lifespan * c.globalPixelsPerYear;
                const color = getColor(State.filters.colorMode, State.filters.colorMode === 'era' ? item.era : item.country);
                
                svg += `<g transform="translate(${x}, ${y})">`;
                svg += `<rect width="${width}" height="${c.trackHeight}" fill="${color}" stroke="#ffffff" stroke-width="1" rx="0"/>`;
                svg += `<text x="5" y="${c.trackHeight / 2 + 4}" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12px" font-weight="bold">${item.name}</text>`;
                svg += `</g>`;
            });
            svg += `</svg>`;
            
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'composers_timeline.svg'; a.click();
            URL.revokeObjectURL(url);
        });
    }
}

async function loadInitialData() {
    try {
        const factsRes = await fetch('facts.json'); if (!factsRes.ok) throw new Error('facts.json не найден');
        HISTORICAL_FACTS = await factsRes.json(); HISTORICAL_FACTS.sort((a, b) => a.year - b.year); setupFactsNavigation();

        const csvRes = await fetch('composer.csv'); 
        if (!csvRes.ok) throw new Error('composer.csv не найден');
        
        const rawData = parseCSV(await csvRes.text());
        rawData.shift();
        
        const countryCounts = {}, eraCounts = {};
        State.rawItems = [];

        rawData.forEach((r, i) => {
            if (!r[0] || (r[2] = parseSafeYear(r[2])) === null) return;
            r[3] = parseSafeYear(r[3]) || CURRENT_YEAR; if (r[3] <= r[2]) r[3] = r[2] + 1;
            
            const rawEra = r[5] ? String(r[5]).trim() : 'Другое';
            let countries = [];
            if (r[7] && String(r[7]).trim() !== '') countries.push(String(r[7]).trim()); 
            if (r[6] && String(r[6]).trim() !== '') countries.push(String(r[6]).trim()); 
            const country = countries.length > 0 ? countries.join(', ') : 'Не указана';
            
            rawEra.split(',').forEach(e => { const cleanEra = e.trim(); eraCounts[cleanEra] = (eraCounts[cleanEra] || 0) + 1; });
            country.split(',').forEach(c => { const cleanCountry = c.trim(); countryCounts[cleanCountry] = (countryCounts[cleanCountry] || 0) + 1; });
            
            const rawWorks = parseInt(r[8]) || 0;
            const parsedEras = rawEra.split(',').map(e => e.trim());
            const parsedCountries = country.split(',').map(c => c.trim());

            State.rawItems.push({ 
            id: `comp_${i}`, name: r[0], engName: r[1] || '', birth: r[2], death: r[3], 
            lifespan: r[3] - r[2], era: rawEra, country, works: rawWorks,
            parsedEras, parsedCountries // <-- Сохраняем готовые массивы
            });
        });

        let erasHTML = '';
        const getEraKey = (name) => Object.keys(eraCounts).find(k => k.toLowerCase() === name.toLowerCase());

        const renderEra = (name, isSub = false, parent = '', customLabel = null) => {
            const actualKey = getEraKey(name);
            if (!actualKey || !eraCounts[actualKey]) return ''; 
            return `<label class="checkbox-label ${isSub ? 'sub-category' : ''}"><input type="checkbox" value="${actualKey}" checked ${isSub ? `class="group-child" data-parent="${parent}"` : ''}> ${customLabel || actualKey} <span style="color:#777; font-size:11px; margin-left:auto;">${eraCounts[actualKey]}</span></label>`;
        };

        erasHTML += renderEra('XXI век') + renderEra('XX век') + renderEra('Авангард');
        const romanticsSum = ['поздний романтизм', 'зрелый романтизм', 'ранний романтизм'].map(getEraKey).reduce((s, k) => s + (k ? eraCounts[k] : 0), 0);
                             
        if (romanticsSum > 0) {
            erasHTML += `<label class="checkbox-label group-master-label"><span class="collapse-toggle" data-target="sub-romantics">▶</span><input type="checkbox" class="group-master" data-group="romantics" checked> Романтизм <span style="color:#777; font-size:11px; margin-left:auto; font-weight:normal;">${romanticsSum}</span></label><div id="sub-romantics" class="collapsed-group">`;
            erasHTML += renderEra('поздний романтизм', true, 'romantics', 'Поздний') + renderEra('зрелый романтизм', true, 'romantics', 'Зрелый') + renderEra('ранний романтизм', true, 'romantics', 'Ранний') + `</div>`;
        }

        erasHTML += renderEra('Классицизм') + renderEra('Барокко') + renderEra('Возрождение') + renderEra('Средневековье');
        
        const processedEras = new Set(['xxi век', 'xx век', 'авангард', 'поздний романтизм', 'зрелый романтизм', 'ранний романтизм', 'классицизм', 'барокко', 'возрождение', 'средневековье']);
        Object.keys(eraCounts).forEach(e => { if (!processedEras.has(e.toLowerCase())) erasHTML += renderEra(e); });

        document.getElementById('ctrl-era').innerHTML = erasHTML;
        State.filters.eras = Object.keys(eraCounts);

        const sortedCountries = Object.entries(countryCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)); 
        const groupDeAt = ['Германия', 'Австрия'], groupFrNl = ['Франция', 'Нидерланды'];
        const groupedNames = new Set([...groupDeAt, ...groupFrNl]);
        const remainingCountries = sortedCountries.filter(c => !groupedNames.has(c.name));
        const mainCountries = remainingCountries.filter(c => c.count >= 10), smallCountries = remainingCountries.filter(c => c.count < 10);
        let countriesHTML = '';

        const renderCountryGroup = (groupId, groupTitle, countryNames) => {
            const groupItems = sortedCountries.filter(c => countryNames.includes(c.name));
            if (groupItems.length === 0) return '';
            let html = `<label class="checkbox-label group-master-label"><span class="collapse-toggle" data-target="sub-${groupId}">▶</span><input type="checkbox" class="group-master" data-group="${groupId}" checked> ${groupTitle} <span style="color:#777; font-size:11px; margin-left:auto; font-weight:normal;">${groupItems.reduce((s, c) => s + c.count, 0)}</span></label><div id="sub-${groupId}" class="collapsed-group">`; 
            html += groupItems.map(c => `<label class="checkbox-label sub-category"><input type="checkbox" value="${c.name}" checked class="group-child" data-parent="${groupId}"> ${c.name} <span style="color:#777; font-size:11px; margin-left:auto;">${c.count}</span></label>`).join('') + `</div>`;
            return html;
        };

        countriesHTML += renderCountryGroup('group-de-at', 'Австрия и Германия', groupDeAt) + renderCountryGroup('group-fr-nl', 'Франция и Нидерланды', groupFrNl) + mainCountries.map(c => `<label class="checkbox-label"><input type="checkbox" value="${c.name}" checked> ${c.name} <span style="color:#777; font-size:11px; margin-left:auto;">${c.count}</span></label>`).join('');

        if (smallCountries.length > 0) {
            countriesHTML += `<label class="checkbox-label group-master-label"><span class="collapse-toggle" data-target="sub-small-countries">▶</span><input type="checkbox" class="group-master" data-group="small-countries" checked> Другие <span style="color:#777; font-size:11px; margin-left:auto; font-weight:normal;">${smallCountries.length}</span></label><div id="sub-small-countries" class="collapsed-group">`; 
            countriesHTML += smallCountries.map(c => `<label class="checkbox-label sub-category"><input type="checkbox" value="${c.name}" checked class="group-child" data-parent="small-countries"> ${c.name} <span style="color:#777; font-size:11px; margin-left:auto;">${c.count}</span></label>`).join('') + `</div>`;
        }

        document.getElementById('ctrl-country').innerHTML = countriesHTML;
        State.filters.countries = sortedCountries.map(c => c.name);

        Engine.initGlobalLayout(); 
        Engine.applyFiltersAndSort();
        
    } catch (err) { console.error(err); alert("Ошибка: " + err.message); }
}

Renderer.initEvents(); Camera.init(); setupControls(); loadInitialData();