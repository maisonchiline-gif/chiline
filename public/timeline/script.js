
const CURRENT_YEAR = new Date().getFullYear();
let HISTORICAL_FACTS = [];

// --- УТИЛИТЫ ---

function parseCSV(str) {
    const arr = [];
    let quote = false;
    let row = 0, col = 0;
    for (let c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c+1];
        arr[row] = arr[row] || [];
        arr[row][col] = arr[row][col] || '';
        
        // Обработка экранированных кавычек
        if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
        // Открытие/закрытие кавычек
        if (cc == '"') { quote = !quote; continue; }
        // Разделитель колонок
        if (cc == ',' && !quote) { ++col; continue; }
        // Разделители строк
        if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
        if (cc == '\n' && !quote) { ++row; col = 0; continue; }
        if (cc == '\r' && !quote) { ++row; col = 0; continue; }
        
        arr[row][col] += cc;
    }
    return arr;
}

const ERA_COLORS = { "Средневековье": "#5d4037", "Возрождение": "#d84315", "барокко": "#f9a825", "классицизм": "#2e7d32", "ранний романтизм": "#00838f", "романтизм": "#1565c0", "поздний романтизм": "#6a1b9a", "XX век": "#c62828", "авангард": "#4527a0", "Другое": "#555555" };
const COUNTRY_COLORS = { "австро-немецкий": "#1f77b4", "французский": "#ff7f0e", "итальянский": "#2ca02c", "русский": "#d62728", "английский": "#9467bd", "польский": "#8c564b", "американский": "#e377c2", "чешский": "#7f7f7f", "испанский": "#bcbd22", "венгерский": "#17becf", "финский": "#0d47a1", "норвежский": "#006064", "Другое": "#666666" };

function returnToComposers() {
    State.currentFactIndex = -1;
    document.getElementById('fact-card').classList.remove('visible');
    Renderer.highlightFact(-1);
    Camera.focusAll(true);
}

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

// --- СОСТОЯНИЕ (STATE) ---
const State = {
    rawItems: [], filteredItems: [], domCache: {},
    config: { trackHeight: 28, trackMargin: 4, basePixelsPerYear: 1, globalPixelsPerYear: 1, globalMinYear: 0, trueMinYear: -60000, trueMaxYear: 2200, composersMinYear: 0, composersMaxYear: 0, canvasHeight: 0, totalWidth: 0, equatorY: 0 },
    filters: { widthFactor: 0.5, layoutMode: 'compact', eras: [], countries: [], minLifespan: 0, maxLifespan: 120, sortBy: 'birth', colorMode: 'era' },
    currentFactIndex: -1, updateFactNavUI: null 
};

// --- КАМЕРА ---
const Camera = {
    scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0, initX: 0, initY: 0, renderPending: false, animFrame: null,
    MIN_ZOOM: 0.05, MAX_ZOOM: 5.0,  
    init() {
        const vp = document.getElementById('viewport');
        vp.addEventListener('mousedown', e => { this.stopAnim(); this.isDragging = true; this.startX = e.clientX; this.startY = e.clientY; this.initX = this.x; this.initY = this.y; this.exitFactModeManual(); });
        window.addEventListener('mousemove', e => { if (this.isDragging) { this.x = this.initX + (e.clientX - this.startX); this.y = this.initY + (e.clientY - this.startY); this.clamp(); this.requestUpdate(); }});
        window.addEventListener('mouseup', () => this.isDragging = false);
        window.addEventListener('mouseleave', () => this.isDragging = false);
        vp.addEventListener('wheel', e => {
            e.preventDefault(); this.stopAnim(); this.exitFactModeManual();
            const zoomFactor = Math.exp((e.deltaY < 0 ? 1 : -1) * 0.001 * Math.abs(e.deltaY));
            let newScale = Math.max(this.MIN_ZOOM, Math.min(this.scale * zoomFactor, this.MAX_ZOOM));
            const rect = vp.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            this.x = mx - (mx - this.x) * (newScale / this.scale);
            this.y = my - (my - this.y) * (newScale / this.scale);
            this.scale = newScale;
            this.clamp(); this.requestUpdate();
        }, { passive: false });
    },
    exitFactModeManual() {
        if (State.currentFactIndex !== -1) { State.currentFactIndex = -1; document.getElementById('fact-card').classList.remove('visible'); Renderer.highlightFact(-1); if (State.updateFactNavUI) State.updateFactNavUI(); }
    },
    flyToTarget(targetX, targetY, targetScale, duration = 1200) {
        this.stopAnim();
        const startX = this.x, startY = this.y, startScale = this.scale, startTime = performance.now();
        const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const step = currentTime => {
            let elapsed = Math.min(currentTime - startTime, duration);
            const t = ease(elapsed / duration);
            this.x = startX + (targetX - startX) * t; this.y = startY + (targetY - startY) * t; this.scale = startScale + (targetScale - startScale) * t;
            this.clamp(); this.update();
            if (elapsed < duration) this.animFrame = requestAnimationFrame(step); else this.animFrame = null;
        };
        this.animFrame = requestAnimationFrame(step);
    },
    stopAnim() { if (this.animFrame) { cancelAnimationFrame(this.animFrame); this.animFrame = null; } },
    flyToYear(year) {
        const vp = document.getElementById('viewport');
        const targetX = (vp.clientWidth / 2) - ((year - State.config.globalMinYear) * State.config.globalPixelsPerYear * Math.max(1.2, this.MIN_ZOOM));
        const targetY = (vp.clientHeight / 2) - (State.config.equatorY * Math.max(1.2, this.MIN_ZOOM)); 
        this.flyToTarget(targetX, targetY, Math.max(1.2, this.MIN_ZOOM), 1500); 
    },
    focusAll(animate = true) {
        const c = State.config, vpW = document.getElementById('viewport').clientWidth, vpH = document.getElementById('viewport').clientHeight;
        const minCanvasX = (Math.max(-1000, c.composersMinYear - 200) - c.globalMinYear) * c.globalPixelsPerYear;
        const w = (2200 - c.globalMinYear) * c.globalPixelsPerYear - minCanvasX;
        let targetScale = Math.max(this.MIN_ZOOM, Math.min((vpW * 0.9) / w, (vpH * 0.8) / c.canvasHeight) || 1);
        const targetX = (vpW - w * targetScale) / 2 - (minCanvasX * targetScale), targetY = (vpH - c.canvasHeight * targetScale) / 2;
        if (animate) this.flyToTarget(targetX, targetY, targetScale, 1500);
        else { this.x = targetX; this.y = targetY; this.scale = targetScale; this.clamp(); this.update(); }
    },
    clamp() {
        const vp = document.getElementById('viewport'); if (!vp) return;
        const vpW = vp.clientWidth, vpH = vp.clientHeight, c = State.config, s = this.scale;
        const minX = (c.trueMinYear - c.globalMinYear) * c.globalPixelsPerYear * s;
        const maxX = (c.trueMaxYear - c.globalMinYear) * c.globalPixelsPerYear * s;
        if (maxX - minX < vpW) this.x = (vpW - (maxX + minX)) / 2;
        else this.x = Math.max(vpW - maxX - (vpW * 0.4), Math.min(-minX + (vpW * 0.4), this.x));
        const ch = c.canvasHeight * s;
        if (ch < vpH) this.y = (vpH - ch) / 2;
        else this.y = Math.max(vpH - ch, Math.min(0, this.y));
    },
    requestUpdate() { if (!this.renderPending) { this.renderPending = true; requestAnimationFrame(() => { this.update(); this.renderPending = false; }); }},
    update() {
        document.getElementById('canvas').style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
        const vp = document.getElementById('viewport');
        vp.style.setProperty('--inv-scale', 1 / this.scale);
        vp.style.setProperty('--text-y', `${(30 - this.y) / this.scale}px`);
        const ppy = State.config.globalPixelsPerYear * this.scale;
        vp.setAttribute('data-zoom', ppy > 1.5 ? 50 : ppy > 0.8 ? 100 : ppy > 0.15 ? 500 : ppy > 0.06 ? 1000 : ppy > 0.012 ? 5000 : 10000);
    }
};

// --- ЛОГИКА (ENGINE) ---
const Engine = {
    initGlobalLayout() {
        const c = State.config; if (!State.rawItems.length) return;
        c.composersMinYear = c.globalMinYear = Math.min(...State.rawItems.map(i => i.birth));
        c.composersMaxYear = Math.max(...State.rawItems.map(i => i.death));
        c.trueMinYear = Math.min(-60000, c.composersMinYear); c.trueMaxYear = Math.max(2200, c.composersMaxYear);
        const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '600 13px "Segoe UI"';
        c.basePixelsPerYear = Math.max(1, ...State.rawItems.map(i => (ctx.measureText(i.name).width + 12) / i.lifespan));
        this.updateWidth();
    },
    updateWidth() {
        State.config.globalPixelsPerYear = State.config.basePixelsPerYear * State.filters.widthFactor;
        State.config.totalWidth = (State.config.trueMaxYear - State.config.trueMinYear) * State.config.globalPixelsPerYear;
        if (State.filteredItems.length) Renderer.drawAll();
    },
    applyFiltersAndSort() {
        const f = State.filters;
        State.filteredItems = State.rawItems.filter(i => 
            i.era.split(',').some(e => f.eras.includes(e.trim())) && 
            i.country.split(',').some(c => f.countries.includes(c.trim())) && 
            i.lifespan >= f.minLifespan && i.lifespan <= f.maxLifespan
        );
        State.filteredItems.sort((a, b) => f.sortBy === 'country' ? (a.country.localeCompare(b.country) || a.birth - b.birth) : a[f.sortBy] - b[f.sortBy]);
        document.getElementById('total-count').innerText = State.filteredItems.length;
        this.calculateLayout();
    },
    calculateLayout() {
        if (!State.filteredItems.length) return Renderer.drawAll();
        const c = State.config, mode = State.filters.layoutMode, sortBy = State.filters.sortBy, rowH = c.trackHeight + c.trackMargin;
        let maxUp = 0, maxDown = 0;

        if (mode === 'linear') {
            const total = State.filteredItems.length, half = Math.floor(total / 2);
            State.filteredItems.forEach((item, i) => item.trackIndex = half - i);
            maxDown = half * rowH + 150; maxUp = Math.abs(half - total) * rowH + 150;
        } else {
            if (sortBy === 'birth' || sortBy === 'death') {
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
            } else {
                let trackEnds = {}, maxT = 0, baseTrack = 0, prevGroup = null;
                State.filteredItems.forEach(item => {
                    if (prevGroup !== null && prevGroup !== item.country) baseTrack = maxT + 1;
                    prevGroup = item.country;
                    let d = baseTrack;
                    while (trackEnds[d] && trackEnds[d] + 1 > item.birth) d++;
                    item.trackIndex = d; trackEnds[d] = item.death; if (d > maxT) maxT = d;
                });
                maxUp = 150; maxDown = maxT * rowH + 150;
            }
        }
        const halfCanvas = Math.max(maxUp, maxDown);
        c.equatorY = halfCanvas; c.canvasHeight = halfCanvas * 2;
        Renderer.drawAll();
    }
};

// --- ОТРИСОВКА (RENDERER) ---
const Renderer = {
    layers: { bg: document.getElementById('bg-layer'), grid: document.getElementById('grid-layer'), facts: document.getElementById('facts-layer'), items: document.getElementById('items-layer') },
    tooltip: document.getElementById('tooltip'),
    initEvents() {
        this.layers.items.addEventListener('mouseover', e => { const b = e.target.closest('.composer-block'); if (b) { const i = State.filteredItems.find(x => x.id === b.dataset.id); if (i) this.showComposerTooltip(i); }});
        this.layers.items.addEventListener('mouseout', e => { if (e.target.closest('.composer-block')) this.hideTooltip(); });
        this.layers.facts.addEventListener('mouseover', e => { const m = e.target.closest('.fact-marker'); if (m) this.showFactTooltip(HISTORICAL_FACTS[m.dataset.index]); });
        this.layers.facts.addEventListener('mouseout', e => { if (e.target.closest('.fact-marker')) this.hideTooltip(); });
        window.addEventListener('mousemove', e => { if (this.tooltip.style.visibility === 'visible') { this.tooltip.style.left = (e.clientX + 15) + 'px'; this.tooltip.style.top = (e.clientY + 15) + 'px'; }});
    },
    drawAll() { this.drawBackgroundEras(); this.drawGrid(); this.drawFacts(); this.drawItems(); this.highlightFact(State.currentFactIndex); },
    drawFacts() {
        const c = State.config;
        this.layers.facts.innerHTML = HISTORICAL_FACTS.map((f, i) => `<div class="fact-marker" data-index="${i}" style="left:${(f.year - c.globalMinYear) * c.globalPixelsPerYear}px; top:${c.equatorY}px;">💡</div>`).join('');
    },
    highlightFact(index) {
        document.querySelectorAll('.fact-marker').forEach(m => m.classList.remove('active-fact'));
        if (index !== -1) document.querySelector(`.fact-marker[data-index="${index}"]`)?.classList.add('active-fact');
    },
    drawBackgroundEras() {
        const eraStats = {}, c = State.config, h = Math.max(c.canvasHeight, 1000);
        State.rawItems.forEach(i => { if (!eraStats[i.era]) eraStats[i.era] = { min: 9999, max: -9999 }; eraStats[i.era].min = Math.min(eraStats[i.era].min, i.birth); eraStats[i.era].max = Math.max(eraStats[i.era].max, i.death); });
        const erasArr = Object.keys(eraStats).map(e => ({ era: e, center: (eraStats[e].min + eraStats[e].max) / 2 })).sort((a, b) => a.center - b.center);
        let html = '', stops = [];
        erasArr.forEach(e => {
            const pct = ((e.center - c.trueMinYear) / (c.trueMaxYear - c.trueMinYear)) * 100;
            stops.push(`color-mix(in srgb, ${getColor('era', e.era)} 12%, transparent) ${pct}%`);
            html += `<div class="era-background" style="width:0; left:${(e.center - c.globalMinYear) * c.globalPixelsPerYear}px; top:0; height:${h}px;"><div class="era-label">${e.era}</div></div>`;
        });
        this.layers.bg.innerHTML = html;
        this.layers.bg.style.cssText = `position:absolute; top:0; height:${h}px; left:${(c.trueMinYear - c.globalMinYear) * c.globalPixelsPerYear}px; width:${c.totalWidth}px; ${stops.length > 1 ? `background:linear-gradient(to right, ${stops.join(', ')})` : ''}`;
    },
    drawGrid() {
        if (!State.rawItems.length) return;
        
        // Берем максимальную высоту, чтобы линия не обрывалась, если композиторов мало
        const c = State.config, STEP = 50, h = Math.max(c.canvasHeight, 1000);
        const startC = Math.floor(c.trueMinYear / STEP) * STEP, endC = Math.ceil(c.trueMaxYear / STEP) * STEP;
        let htmlStr = '';
        
        // 1. Отрисовка базовой сетки веков/годов
        for (let y = startC; y <= endC; y += STEP) {
            const tier = y % 10000 === 0 ? 10000 : y % 5000 === 0 ? 5000 : y % 1000 === 0 ? 1000 : y % 500 === 0 ? 500 : y % 100 === 0 ? 100 : 50;
            htmlStr += `<div class="year-marker step-${tier}" style="left:${(y - c.globalMinYear) * c.globalPixelsPerYear}px; top:0; height:${h}px;"><div class="year-text" style="top:var(--text-y, 30px);">${y < 0 ? Math.abs(y) : (y === 0 ? '0' : y)}</div></div>`;
        }
        
        // 2. Линия экватора (для компактного вида)
        htmlStr += `<div class="equator-line" style="width:${c.totalWidth}px; left:${(c.trueMinYear - c.globalMinYear) * c.globalPixelsPerYear}px; top:${c.equatorY}px; display:${State.filters.layoutMode === 'compact' ? 'block' : 'none'};"></div>`;
        
        // 3. КРАСНАЯ ЛИНИЯ НАШЕГО ВРЕМЕНИ
        const currentYearPos = (CURRENT_YEAR - c.globalMinYear) * c.globalPixelsPerYear;
        htmlStr += `
            <div class="current-time-line" style="left:${currentYearPos}px; top:0; height:${h}px;">
            </div>`;
            
        this.layers.grid.innerHTML = htmlStr;
    },
    drawItems() {
        const c = State.config, activeIds = new Set(), frag = document.createDocumentFragment();
        State.filteredItems.forEach(item => {
            activeIds.add(item.id); let el = State.domCache[item.id];
            if (!el) { 
                el = document.createElement('div'); 
                // Добавляем класс 'alive' для тех, чей год смерти равен текущему
                el.className = 'composer-block' + (item.death === CURRENT_YEAR ? ' alive' : ''); 
                el.dataset.id = item.id; 
                el.innerHTML = `<div class="composer-name">${item.name}</div>`; 
                State.domCache[item.id] = el; 
                frag.appendChild(el); 
            }
            el.classList.remove('hidden'); 
            el.style.width = `${item.lifespan * c.globalPixelsPerYear}px`; 
            el.style.left = `${(item.birth - c.globalMinYear) * c.globalPixelsPerYear}px`; 
            el.style.top = `${c.equatorY + item.trackIndex * (c.trackHeight + c.trackMargin)}px`; 
            el.style.backgroundColor = getColor(State.filters.colorMode, State.filters.colorMode === 'era' ? item.era : item.country);
        });
        this.layers.items.appendChild(frag);
        Object.keys(State.domCache).forEach(id => { if (!activeIds.has(id)) State.domCache[id].classList.add('hidden'); });
    },
    showComposerTooltip(item) {
        this.tooltip.innerHTML = `<div class="tooltip-title">${item.name}</div>${item.engName ? `<div style="color:#aaa; font-size:12px; margin-bottom:5px;">${item.engName}</div>` : ''}<b>Годы:</b> ${item.birth} — ${item.death === CURRENT_YEAR ? 'Наши дни' : item.death}<br><b>Прожил:</b> ${item.lifespan} лет<br><b>Эпоха:</b> ${item.era}<br><b>Страна:</b> ${item.country}`;
        this.tooltip.style.visibility = 'visible'; this.tooltip.style.opacity = '1';
        Object.values(State.domCache).forEach(el => { if (!el.classList.contains('hidden')) { const t = State.filteredItems.find(i => i.id === el.dataset.id); if (t && !(t.birth <= item.death && t.death >= item.birth)) el.classList.add('dimmed'); }});
    },
    showFactTooltip(fact) {
        this.tooltip.innerHTML = `<div class="tooltip-title" style="color:#e91e63;">${fact.year < 0 ? Math.abs(fact.year) + ' год до н.э.' : fact.year + ' год'}</div><b>${fact.title}</b><br><div style="margin-top:5px; color:#ccc;">${fact.text}</div>`;
        this.tooltip.style.visibility = 'visible'; this.tooltip.style.opacity = '1';
    },
    hideTooltip() { this.tooltip.style.visibility = 'hidden'; this.tooltip.style.opacity = '0'; Object.values(State.domCache).forEach(el => el.classList.remove('dimmed')); }
};

// --- НАВИГАЦИЯ ПО ФАКТАМ ---
function setupFactsNavigation() {
    const btnPrev = document.getElementById('btn-prev-fact'), 
          btnNext = document.getElementById('btn-next-fact'), 
          display = document.getElementById('fact-info-display'), 
          card = document.getElementById('fact-card');
          
    document.getElementById('btn-jump-composers').addEventListener('click', () => activateFact(-1));
    
    State.updateFactNavUI = () => {
        const len = HISTORICAL_FACTS.length; 
        if (!len) return;
        
        // Проверяем, в каком мы сейчас режиме
        if (State.currentFactIndex === -1) {
            // МЫ В РЕЖИМЕ КОМПОЗИТОРОВ
            display.innerText = `Факт 0 из ${len}`;
            btnPrev.disabled = false; 
            btnNext.disabled = true; // Блокируем кнопку "В будущее"
        } else {
            // МЫ В РЕЖИМЕ ПРОСМОТРА ФАКТОВ
            display.innerText = `Факт ${len - State.currentFactIndex} из ${len}`;
            btnPrev.disabled = State.currentFactIndex === 0; // Блокируем, если это самый первый исторический факт
            btnNext.disabled = false;
        }
    };
    
    function activateFact(idx) {
        State.currentFactIndex = idx; 
        Renderer.hideTooltip();
        
        if (idx === -1) { 
            Camera.focusAll(true); 
            Renderer.highlightFact(-1); 
            card.classList.remove('visible'); 
        } else { 
            const f = HISTORICAL_FACTS[idx]; 
            Camera.flyToYear(f.year); 
            Renderer.highlightFact(idx); 
            document.getElementById('fact-card-year').innerText = f.year < 0 ? Math.abs(f.year) + ' год до н.э.' : f.year + ' год'; 
            document.getElementById('fact-card-title').innerText = f.title; 
            document.getElementById('fact-card-text').innerText = f.text; 
            card.classList.add('visible'); 
        }
        State.updateFactNavUI();
    }
    
    btnPrev.addEventListener('click', () => activateFact(State.currentFactIndex === -1 ? HISTORICAL_FACTS.length - 1 : Math.max(0, State.currentFactIndex - 1)));
    btnNext.addEventListener('click', () => { if (State.currentFactIndex !== -1) activateFact(State.currentFactIndex === HISTORICAL_FACTS.length - 1 ? -1 : State.currentFactIndex + 1); });
    
    State.updateFactNavUI();
}

// --- УПРАВЛЕНИЕ И МЕНЮ ---
function setupControls() {
    const bindSelect = (id, key, needsLayout = false) => document.getElementById(id).addEventListener('change', e => { State.filters[key] = e.target.value; needsLayout ? Engine.calculateLayout() : Engine.applyFiltersAndSort(); });
    const layoutSel = document.getElementById('ctrl-layout'), sortSel = document.getElementById('ctrl-sort'), optLin = layoutSel.querySelector('option[value="linear"]'), optLife = sortSel.querySelector('option[value="lifespan"]');
    
    const updateLocks = () => { optLife.disabled = (layoutSel.value === 'linear'); optLin.disabled = (sortSel.value === 'lifespan'); };
    updateLocks();
    layoutSel.addEventListener('change', e => { State.filters.layoutMode = e.target.value; updateLocks(); Engine.calculateLayout(); });
    sortSel.addEventListener('change', e => { State.filters.sortBy = e.target.value; updateLocks(); Engine.applyFiltersAndSort(); });
    bindSelect('ctrl-color', 'colorMode');
    const bindCbGroup = (id, key) => {
            const container = document.getElementById(id);
            container.addEventListener('change', e => {
                if (e.target.type !== 'checkbox') return;
                
                const tgt = e.target;
                
                // ЛОГИКА: Если кликнули на Мастер-чекбокс (Категорию)
                if (tgt.classList.contains('group-master')) {
                    container.querySelectorAll(`.group-child[data-parent="${tgt.dataset.group}"]`).forEach(cb => cb.checked = tgt.checked);
                } 
                // ЛОГИКА: Если кликнули на Подкатегорию
                else if (tgt.classList.contains('group-child')) {
                    const master = container.querySelector(`.group-master[data-group="${tgt.dataset.parent}"]`);
                    if (master) {
                        const children = container.querySelectorAll(`.group-child[data-parent="${tgt.dataset.parent}"]`);
                        master.checked = Array.from(children).every(c => c.checked);
                        master.indeterminate = !master.checked && Array.from(children).some(c => c.checked);
                    }
                }
                
                // Считываем значения только реальных чекбоксов (исключая мастер-группы)
                State.filters[key] = Array.from(container.querySelectorAll('input[type="checkbox"]:checked:not(.group-master)')).map(cb => cb.value);
                Engine.applyFiltersAndSort();
            });
        };

        bindCbGroup('ctrl-era', 'eras'); 
        bindCbGroup('ctrl-country', 'countries');
    bindCbGroup('ctrl-era', 'eras'); bindCbGroup('ctrl-country', 'countries');

    document.querySelectorAll('.toggle-all').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault(); 
                const c = document.getElementById(e.target.dataset.target);
                const cbs = c.querySelectorAll('input[type="checkbox"]');
                const allChecked = Array.from(cbs).every(cb => cb.checked);
                
                cbs.forEach(cb => {
                    cb.checked = !allChecked;
                    cb.indeterminate = false; // Сбрасываем промежуточное состояние
                });
                
                State.filters[e.target.dataset.target === 'ctrl-era' ? 'eras' : 'countries'] = Array.from(c.querySelectorAll('input[type="checkbox"]:checked:not(.group-master)')).map(cb => cb.value);
                Engine.applyFiltersAndSort();
            });
        });

    document.getElementById('ctrl-width').addEventListener('input', e => { State.filters.widthFactor = parseFloat(e.target.value); Engine.updateWidth(); });
    const updateLife = e => { let min = parseInt(document.getElementById('ctrl-min-life').value), max = parseInt(document.getElementById('ctrl-max-life').value); if (e.target.id === 'ctrl-min-life' && min > max) document.getElementById('ctrl-min-life').value = min = max; if (e.target.id === 'ctrl-max-life' && max < min) document.getElementById('ctrl-max-life').value = max = min; document.getElementById('val-min-life').innerText = min; document.getElementById('val-max-life').innerText = max; State.filters.minLifespan = min; State.filters.maxLifespan = max; Engine.applyFiltersAndSort(); };
    document.getElementById('ctrl-min-life').addEventListener('input', updateLife); document.getElementById('ctrl-max-life').addEventListener('input', updateLife);
    document.getElementById('btn-show-menu').addEventListener('click', () => { document.getElementById('ui-layer').classList.remove('ui-hidden'); document.getElementById('btn-show-menu').style.display = 'none'; });
    // Открытие меню (эта логика у тебя уже есть)
        document.getElementById('btn-show-menu').addEventListener('click', () => { 
            document.getElementById('ui-layer').classList.remove('ui-hidden'); 
            document.getElementById('btn-show-menu').style.display = 'none'; 
        });

        // ЗАКРЫТИЕ МЕНЮ (НОВАЯ ЛОГИКА)
        document.getElementById('btn-close-menu').addEventListener('click', () => {
            document.getElementById('ui-layer').classList.add('ui-hidden');
            document.getElementById('btn-show-menu').style.display = 'block';
        });
    // Логика сворачивания/разворачивания подкатегорий
        document.getElementById('ui-layer').addEventListener('click', e => {
            if (e.target.classList.contains('collapse-toggle')) {
                e.preventDefault(); // Блокируем клик, чтобы не переключался чекбокс
                const targetDiv = document.getElementById(e.target.dataset.target);
                if (targetDiv) {
                    targetDiv.classList.toggle('collapsed-group');
                    e.target.innerText = targetDiv.classList.contains('collapsed-group') ? '▶' : '▼';
                }
            }
        });
}

// --- ЗАГРУЗКА И СТАРТ ---
async function loadInitialData() {
    try {
        const factsRes = await fetch('facts.json'); if (!factsRes.ok) throw new Error('facts.json не найден');
        HISTORICAL_FACTS = await factsRes.json(); HISTORICAL_FACTS.sort((a, b) => a.year - b.year); setupFactsNavigation();

        const csvRes = await fetch('composer.csv'); 
        if (!csvRes.ok) throw new Error('composer.csv не найден');
        
        const csvText = await csvRes.text();
        const rawData = parseCSV(csvText);
        
        // Удаляем первую строку с заголовками столбцов
        rawData.shift();
        
        const countryCounts = {};
        const eraCounts = {};
        State.rawItems = [];

        rawData.forEach((r, i) => {
            if (!r[0] || (r[2] = parseSafeYear(r[2])) === null) return;
            r[3] = parseSafeYear(r[3]) || CURRENT_YEAR; if (r[3] <= r[2]) r[3] = r[2] + 1;
            
            const rawEra = r[5] ? String(r[5]).trim() : 'Другое';
            const country = r[6] ? String(r[6]).trim() : 'Не указана';
            
            rawEra.split(',').forEach(e => {
                const cleanEra = e.trim();
                eraCounts[cleanEra] = (eraCounts[cleanEra] || 0) + 1;
            });
            
            country.split(',').forEach(c => {
                const cleanCountry = c.trim();
                countryCounts[cleanCountry] = (countryCounts[cleanCountry] || 0) + 1;
            });
            
            State.rawItems.push({ id: `comp_${i}`, name: r[0], engName: r[1] || '', birth: r[2], death: r[3], lifespan: r[3] - r[2], era: rawEra, country });
        });

        // =====================================
        // 1. СБОРКА ЭПОХ (Хронология + Романтизм)
        // =====================================
        let erasHTML = '';
        const renderEra = (name, isSub = false, parent = '') => {
            if (!eraCounts[name]) return ''; 
            return `<label class="checkbox-label ${isSub ? 'sub-category' : ''}">
                <input type="checkbox" value="${name}" checked ${isSub ? `class="group-child" data-parent="${parent}"` : ''}> 
                ${name} <span style="color:#777; font-size:11px; margin-left:auto;">${eraCounts[name]}</span>
            </label>`;
        };

        erasHTML += renderEra('XX век');
        erasHTML += renderEra('авангард');

        const romanticsSum = (eraCounts['ранний романтизм'] || 0) + (eraCounts['романтизм'] || 0) + (eraCounts['поздний романтизм'] || 0);
        if (romanticsSum > 0) {
            erasHTML += `<label class="checkbox-label group-master-label">
                <span class="collapse-toggle" data-target="sub-romantics">▼</span>
                <input type="checkbox" class="group-master" data-group="romantics" checked> 
                Романтизм <span style="color:#777; font-size:11px; margin-left:auto; font-weight:normal;">${romanticsSum}</span>
            </label>
            <div id="sub-romantics">`;
            erasHTML += renderEra('поздний романтизм', true, 'romantics');
            erasHTML += renderEra('романтизм', true, 'romantics');
            erasHTML += renderEra('ранний романтизм', true, 'romantics');
            erasHTML += `</div>`;
        }

        erasHTML += renderEra('классицизм');
        erasHTML += renderEra('барокко');
        erasHTML += renderEra('Возрождение');
        erasHTML += renderEra('Средневековье');
        
        const processedEras = new Set(['XX век', 'авангард', 'поздний романтизм', 'романтизм', 'ранний романтизм', 'классицизм', 'барокко', 'Возрождение', 'Средневековье']);
        Object.keys(eraCounts).forEach(e => {
            if (!processedEras.has(e)) erasHTML += renderEra(e);
        });

        document.getElementById('ctrl-era').innerHTML = erasHTML;
        State.filters.eras = Object.keys(eraCounts);

        // =====================================
        // 2. СБОРКА СТРАН (Группа "Другие")
        // =====================================
        const sortedCountries = Object.entries(countryCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)); 
        
        const mainCountries = sortedCountries.filter(c => c.count > 1);
        const singleCountries = sortedCountries.filter(c => c.count === 1);

        let countriesHTML = mainCountries.map(c => 
            `<label class="checkbox-label"><input type="checkbox" value="${c.name}" checked> ${c.name} <span style="color:#777; font-size:11px; margin-left:auto;">${c.count}</span></label>`
        ).join('');

        if (singleCountries.length > 0) {
            countriesHTML += `<label class="checkbox-label group-master-label">
                <span class="collapse-toggle" data-target="sub-single-countries">▼</span>
                <input type="checkbox" class="group-master" data-group="single-countries" checked> 
                Другие (по одному) <span style="color:#777; font-size:11px; margin-left:auto; font-weight:normal;">${singleCountries.length}</span>
            </label>
            <div id="sub-single-countries">`;
            countriesHTML += singleCountries.map(c => 
                `<label class="checkbox-label sub-category"><input type="checkbox" value="${c.name}" checked class="group-child" data-parent="single-countries"> ${c.name} <span style="color:#777; font-size:11px; margin-left:auto;">${c.count}</span></label>`
            ).join('');
            countriesHTML += `</div>`;
        }

        document.getElementById('ctrl-country').innerHTML = countriesHTML;
        State.filters.countries = sortedCountries.map(c => c.name);

        document.getElementById('ui-layer').classList.remove('ui-hidden'); document.getElementById('btn-show-menu').style.display = 'none'; document.getElementById('facts-nav').classList.add('visible');
        Engine.initGlobalLayout(); Engine.applyFiltersAndSort(); setTimeout(() => Camera.focusAll(false), 100);
    } catch (err) { console.error(err); alert("Ошибка: " + err.message); }
}

Renderer.initEvents(); Camera.init(); setupControls(); loadInitialData();
