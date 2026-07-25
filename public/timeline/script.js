
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

const ERA_COLORS = { "Средневековье": "#5d4037", "Возрождение": "#d84315", "барокко": "#f9a825", "классицизм": "#2e7d32", "ранний романтизм": "#00838f", "зрелый романтизм": "#1565c0", "поздний романтизм": "#2b1ea5", "XX век": "#4527a0", "авангард": "#c62828"};
const COUNTRY_COLORS = { "Германия": "#b17719", "Австрия": "#f9a825", "франция": "#1565c0", "италия": "#d84315", "россия": "#2e7d32", "великобритания": "#9467bd", "Польша": "#8c564b", "США": "#e377c2", "чехия": "#7f7f7f", "испания": "#bcbd22", "венгрия": "#7f7f7f", "финляндия": "#7f7f7f", "норвегия": "#7f7f7f", "Другое": "#7f7f7f" };

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
    filters: { widthFactor: 0.5, layoutMode: 'compact', eras: [], countries: [], minLifespan: 0, maxLifespan: 120, minWorks: 0, maxWorks: 1400, sortBy: 'birth', colorMode: 'era' },    currentFactIndex: -1, updateFactNavUI: null 
};

// --- КАМЕРА ---
const Camera = {
    scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0, initX: 0, initY: 0, renderPending: false, animFrame: null,
    MIN_ZOOM: 0.05, MAX_ZOOM: 5.0, defX: 0, defY: 0, defScale: 1,
    init() {
        const vp = document.getElementById('viewport');
        vp.addEventListener('mousedown', e => { this.stopAnim(); this.isDragging = true; this.startX = e.clientX; this.startY = e.clientY; this.initX = this.x; this.initY = this.y; this.exitFactModeManual(); });
        window.addEventListener('mousemove', e => { if (this.isDragging) { this.x = this.initX + (e.clientX - this.startX); this.y = this.initY + (e.clientY - this.startY); this.clamp(); this.requestUpdate(); }});
        window.addEventListener('mouseup', () => this.isDragging = false);
        window.addEventListener('mouseleave', () => this.isDragging = false);
        
        // --- ДОБАВИТЬ ДЛЯ МОБИЛЬНЫХ УСТРОЙСТВ (Инерция) ---
let velX = 0, velY = 0, lastTime = 0, lastX = 0, lastY = 0;

vp.addEventListener('touchstart', e => {
    this.stopAnim();
    this.isDragging = true;
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
    this.initX = this.x;
    this.initY = this.y;
    velX = 0; velY = 0;
    lastX = this.startX; lastY = this.startY; 
    lastTime = performance.now();
    this.exitFactModeManual();
}, { passive: false });

vp.addEventListener('touchmove', e => {
    if (!this.isDragging) return;
    e.preventDefault(); // Блокируем стандартный скролл страницы
    const cx = e.touches[0].clientX;
    const cy = e.touches[0].clientY;
    this.x = this.initX + (cx - this.startX);
    this.y = this.initY + (cy - this.startY);

    // Расчет скорости для инерции
    const now = performance.now();
    const dt = now - lastTime;
    if (dt > 0) {
        velX = (cx - lastX) / dt;
        velY = (cy - lastY) / dt;
    }
    lastX = cx; lastY = cy; lastTime = now;

    this.clamp();
    this.requestUpdate();
}, { passive: false });

vp.addEventListener('touchend', () => {
    this.isDragging = false;
    
    // 1) ЖЕСТКИЙ ЛИМИТ СКОРОСТИ (защита от случайных сильных рывков)
    const maxVel = 1.0; // Максимальная сила броска (чем меньше, тем тяжелее холст)
    velX = Math.max(-maxVel, Math.min(maxVel, velX));
    velY = Math.max(-maxVel, Math.min(maxVel, velY));

    // 2) УСИЛЕННОЕ ТОРМОЖЕНИЕ
    const friction = 0.80; // Было 0.95. При 0.80 холст останавливается мягко, но быстро
    
    const step = () => {
        // Порог полной остановки немного увеличен, чтобы избежать "микро-дрожания" в конце
        if (Math.abs(velX) > 0.1 || Math.abs(velY) > 0.1) {
            this.x += velX * 16; // 16ms — примерный шаг кадра при 60 FPS
            this.y += velY * 16;
            velX *= friction;
            velY *= friction;
            this.clamp();
            this.requestUpdate();
            this.animFrame = requestAnimationFrame(step);
        }
    };
    this.animFrame = requestAnimationFrame(step);
});
        
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
        
        // Запоминаем дефолтную позицию
        this.defX = targetX; this.defY = targetY; this.defScale = targetScale;
        
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
        vp.style.setProperty('--text-y', `${(75 - this.y) / this.scale}px`);
        const ppy = State.config.globalPixelsPerYear * this.scale;
        vp.setAttribute('data-zoom', ppy > 1.5 ? 50 : ppy > 0.8 ? 100 : ppy > 0.15 ? 500 : ppy > 0.06 ? 1000 : ppy > 0.012 ? 5000 : 10000);
        
        // Включаем акцентный цвет кнопки, если камера сместилась
        const isMoved = Math.abs(this.x - this.defX) > 10 || Math.abs(this.y - this.defY) > 10 || Math.abs(this.scale - this.defScale) > 0.05;
        const btnJump = document.getElementById('btn-jump-composers');
        if (btnJump) btnJump.classList.toggle('camera-moved', isMoved);
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
            i.lifespan >= f.minLifespan && i.lifespan <= f.maxLifespan &&
            i.works >= f.minWorks && i.works <= f.maxWorks // <-- НОВАЯ СТРОКА
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
        // === НАСТРОЙКИ ПЛАВНОСТИ ГРАДИЕНТА (в процентах от ширины всего графа) ===
        // 0 — абсолютно резкая граница. Чем больше цифра, тем длиннее и плавнее шлейф.
        const FADE_START = 0.1; // Насколько плавно появляется цвет перед первым композитором
        const FADE_END = 0.0;   // Насколько плавно цвет уходит во тьму после последнего
        // =========================================================================

        const eraStats = {}, c = State.config, h = Math.max(c.canvasHeight, 300);
        State.rawItems.forEach(i => { if (!eraStats[i.era]) eraStats[i.era] = { min: 9999, max: -9999 }; eraStats[i.era].min = Math.min(eraStats[i.era].min, i.birth); eraStats[i.era].max = Math.max(eraStats[i.era].max, i.death); });
        const erasArr = Object.keys(eraStats).map(e => ({ era: e, center: (eraStats[e].min + eraStats[e].max) / 2 })).sort((a, b) => a.center - b.center);
        
        // Вычисляем проценты для первого и последнего композитора
        const minPct = ((c.composersMinYear - c.trueMinYear) / (c.trueMaxYear - c.trueMinYear)) * 100;
        const maxPct = ((c.composersMaxYear - c.trueMinYear) / (c.trueMaxYear - c.trueMinYear)) * 100;

        // Определяем цвета самых крайних эпох
        const firstColor = `color-mix(in srgb, ${getColor('era', erasArr[0].era)} 12%, transparent)`;
        const lastColor = `color-mix(in srgb, ${getColor('era', erasArr[erasArr.length - 1].era)} 12%, transparent)`;

        // Формируем градиент слева (от черного к первому цвету)
        let stops = [
            `var(--c-bg) 0%`, 
            `var(--c-bg) ${Math.max(0, minPct - FADE_START)}%`, 
            `${firstColor} ${minPct}%`
        ];
        
        let html = '';
        erasArr.forEach(e => {
            const pct = ((e.center - c.trueMinYear) / (c.trueMaxYear - c.trueMinYear)) * 100;
            stops.push(`color-mix(in srgb, ${getColor('era', e.era)} 12%, transparent) ${pct}%`);
            html += `<div class="era-background" style="width:0; left:${(e.center - c.globalMinYear) * c.globalPixelsPerYear}px; top:0; height:${h}px;"><div class="era-label">${e.era}</div></div>`;
        });
        
        // Формируем градиент справа (от последнего цвета уходим в черный)
        stops.push(
            `${lastColor} ${maxPct}%`,
            `var(--c-bg) ${Math.min(100, maxPct + FADE_END)}%`, 
            `var(--c-bg) 100%`
        );

        this.layers.bg.innerHTML = html;
        this.layers.bg.style.cssText = `position:absolute; top:0; height:${h}px; left:${(c.trueMinYear - c.globalMinYear) * c.globalPixelsPerYear}px; width:${c.totalWidth}px; background:linear-gradient(to right, ${stops.join(', ')})`;
    },
    drawGrid() {
        if (!State.rawItems.length) return;
        
        // Берем максимальную высоту, чтобы линия не обрывалась, если композиторов мало
        const c = State.config, STEP = 50, h = Math.max(c.canvasHeight, 300);
        const startC = Math.floor(c.trueMinYear / STEP) * STEP, endC = Math.ceil(c.trueMaxYear / STEP) * STEP;
        let htmlStr = '';
        
        // 1. Отрисовка базовой сетки веков/годов
        for (let y = startC; y <= endC; y += STEP) {
            const tier = y % 10000 === 0 ? 10000 : y % 5000 === 0 ? 5000 : y % 1000 === 0 ? 1000 : y % 500 === 0 ? 500 : y % 100 === 0 ? 100 : 50;
            htmlStr += `<div class="year-marker step-${tier}" style="left:${(y - c.globalMinYear) * c.globalPixelsPerYear}px; top:0; height:${h}px;"><div class="year-text" style="top:var(--text-y, 30px);">${y < 0 ? Math.abs(y) : (y === 0 ? '0' : y)}</div></div>`;
        }
        
        // 2. Линия экватора (для компактного вида)
        // Рассчитываем ширину линии от начала времен до текущего года
        const equatorWidth = (CURRENT_YEAR - c.trueMinYear) * c.globalPixelsPerYear;
        
        htmlStr += `<div class="equator-line" style="width:${equatorWidth}px; left:${(c.trueMinYear - c.globalMinYear) * c.globalPixelsPerYear}px; top:${c.equatorY}px; display:${State.filters.layoutMode === 'compact' ? 'block' : 'none'};"></div>`;
        
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
        this.tooltip.innerHTML = `<div class="tooltip-title">${item.name}</div>${item.engName ? `<div style="color:#aaa; font-size:12px; margin-bottom:5px;">${item.engName}</div>` : ''}<b>Годы:</b> ${item.birth} — ${item.death === CURRENT_YEAR ? 'Наши дни' : item.death}<br><b>Прожил:</b> ${item.lifespan} лет<br><b>Эпоха:</b> ${item.era}<br><b>Страна:</b> ${item.country}<br><b>Произведений:</b> ~${item.works}`; // <-- ИЗМЕНЕННАЯ СТРОКА
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
    document.getElementById('btn-close-fact').addEventListener('click', () => {
    document.getElementById('fact-card').classList.remove('visible');
});
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
        if (!container) return; // Защита от ошибок, если элемент не найден
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

    document.querySelectorAll('.toggle-all').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault(); 
            const c = document.getElementById(e.target.dataset.target);
            if (!c) return;
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
    
    // --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: Закраска через градиент (надежно и без багов) ---
    const updateSliderUI = (minId, maxId, trackId, e) => {
        const minEl = document.getElementById(minId);
        const maxEl = document.getElementById(maxId);
        const track = document.getElementById(trackId);
        
        if (!minEl || !maxEl || !track) return;

        const min = parseFloat(minEl.min), max = parseFloat(minEl.max);
        const minVal = parseFloat(minEl.value), maxVal = parseFloat(maxEl.value);
        
        const percentMin = ((minVal - min) / (max - min)) * 100;
        const percentMax = ((maxVal - min) / (max - min)) * 100;
        
        // Рисуем красную линию прямо фоном трека (от percentMin до percentMax)
        track.style.background = `linear-gradient(to right, 
            color-mix(in srgb, var(--c-txt) 20%, transparent) ${percentMin}%, 
            var(--c-accent) ${percentMin}%, 
            var(--c-accent) ${percentMax}%, 
            color-mix(in srgb, var(--c-txt) 20%, transparent) ${percentMax}%)`;

        if (e) {
            const isMin = e.target.id === minId;
            e.target.style.zIndex = 5;
            document.getElementById(isMin ? maxId : minId).style.zIndex = 4;
        }
    };

    // --- ОБРАБОТКА ПОЛЗУНКОВ ВОЗРАСТА ---
    const updateLife = e => { 
        let min = parseInt(document.getElementById('ctrl-min-life').value);
        let max = parseInt(document.getElementById('ctrl-max-life').value); 
        if (e && e.target.id === 'ctrl-min-life' && min > max) document.getElementById('ctrl-min-life').value = min = max; 
        if (e && e.target.id === 'ctrl-max-life' && max < min) document.getElementById('ctrl-max-life').value = max = min; 
        
        document.getElementById('val-min-life').innerText = min; 
        document.getElementById('val-max-life').innerText = max; 
        
        updateSliderUI('ctrl-min-life', 'ctrl-max-life', 'track-life', e);
        
        State.filters.minLifespan = min; 
        State.filters.maxLifespan = max; 
        Engine.applyFiltersAndSort(); 
    };
    
    document.getElementById('ctrl-min-life').addEventListener('input', updateLife); 
    document.getElementById('ctrl-max-life').addEventListener('input', updateLife);

    // --- ОБРАБОТКА ПОЛЗУНКОВ ПРОИЗВЕДЕНИЙ ---
    const updateWorks = e => { 
        let min = parseInt(document.getElementById('ctrl-min-works').value);
        let max = parseInt(document.getElementById('ctrl-max-works').value); 
        if (e && e.target.id === 'ctrl-min-works' && min > max) document.getElementById('ctrl-min-works').value = min = max; 
        if (e && e.target.id === 'ctrl-max-works' && max < min) document.getElementById('ctrl-max-works').value = max = min; 
        
        document.getElementById('val-min-works').innerText = min; 
        document.getElementById('val-max-works').innerText = max >= 1400 ? '1400+' : max; 
        
        updateSliderUI('ctrl-min-works', 'ctrl-max-works', 'track-works', e);
        
        State.filters.minWorks = min; 
        State.filters.maxWorks = max; 
        Engine.applyFiltersAndSort(); 
    };

    document.getElementById('ctrl-min-works').addEventListener('input', updateWorks); 
    document.getElementById('ctrl-max-works').addEventListener('input', updateWorks);

    // Отрисовка линий при старте
    updateSliderUI('ctrl-min-life', 'ctrl-max-life', 'track-life', null);
    updateSliderUI('ctrl-min-works', 'ctrl-max-works', 'track-works', null);

    // --- ИНИЦИАЛИЗАЦИЯ (Вызываем при старте для отрисовки графики) ---
    updateSliderUI('ctrl-min-life', 'ctrl-max-life', 'fill-life', null);
    updateSliderUI('ctrl-min-works', 'ctrl-max-works', 'fill-works', null);
    // --- ЛОГИКА СВОРАЧИВАНИЯ/РАЗВОРАЧИВАНИЯ ПОДКАТЕГОРИЙ ---
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

    // --- ЛОГИКА ВЕРХНЕГО МЕНЮ И ВЫПАДАЮЩИХ ПАНЕЛЕЙ ---
    document.querySelectorAll('.top-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = btn.dataset.target;
            const panel = document.getElementById(targetId);
            if (!panel) return;
            
            // Если кликнули по уже открытой вкладке — закрываем её
            if (panel.classList.contains('active-dropdown')) {
                panel.classList.remove('active-dropdown');
                btn.classList.remove('active-btn');
                return;
            }
            
            // Иначе — закрываем все остальные и открываем нужную
            document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('active-dropdown'));
            document.querySelectorAll('.top-nav-btn').forEach(b => b.classList.remove('active-btn'));
            
            panel.classList.add('active-dropdown');
            btn.classList.add('active-btn');
            
            // Выравниваем панель под нажатой кнопкой
            const btnRect = btn.getBoundingClientRect();
            panel.style.left = Math.max(10, Math.min(btnRect.left, window.innerWidth - panel.offsetWidth - 10)) + 'px';
        });
    });

    // Закрытие выпадающего меню при клике в пустое место
    const closeDropdowns = (e) => {
        if (!e.target.closest('.dropdown-panel') && !e.target.closest('.top-nav-btn')) {
            document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('active-dropdown'));
            document.querySelectorAll('.top-nav-btn').forEach(b => b.classList.remove('active-btn'));
        }
    };
    
    document.addEventListener('mousedown', closeDropdowns);
    document.addEventListener('touchstart', closeDropdowns, { passive: true });
    // --- ПОИСК ПО КОМПОЗИТОРАМ (С ВЫПАДАЮЩИМ СПИСКОМ) ---
    const searchInput = document.getElementById('ctrl-search');
    const searchResults = document.getElementById('search-results');

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            searchResults.classList.remove('visible');
            return;
        }

        // Ищем только среди тех, кто сейчас отображен на экране
        const matches = State.filteredItems.filter(i => 
            i.name.toLowerCase().includes(query) || 
            (i.engName && i.engName.toLowerCase().includes(query))
        );

        if (matches.length === 0) {
            searchResults.innerHTML = '<div class="search-item" style="color: #888; cursor: default;">Ничего не найдено</div>';
        } else {
            searchResults.innerHTML = matches.map(m => 
                `<div class="search-item" data-id="${m.id}">${m.name} <span style="color:#888; font-size:11px; margin-left:5px;">(${m.birth} — ${m.death === CURRENT_YEAR ? 'Наши дни' : m.death})</span></div>`
            ).join('');
        }
        searchResults.classList.add('visible');
    });

    // Клик по композитору в списке
    searchResults.addEventListener('click', (e) => {
        const itemEl = e.target.closest('.search-item');
        if (!itemEl || !itemEl.dataset.id) return; // Если кликнули на пустую область или сообщение "не найдено"
        
        const composer = State.filteredItems.find(c => c.id === itemEl.dataset.id);
        if (composer) {
            // 1. Прячем список и очищаем строку поиска
            searchResults.classList.remove('visible');
            searchInput.value = '';
            
            // 2. Вычисляем координаты центра блока композитора
            const c = State.config;
            const vp = document.getElementById('viewport');
            
            const composerCenterX = (composer.birth + (composer.lifespan / 2) - c.globalMinYear) * c.globalPixelsPerYear;
            const composerCenterY = c.equatorY + composer.trackIndex * (c.trackHeight + c.trackMargin) + (c.trackHeight / 2);
            
            // 3. Вычисляем масштаб и целевую позицию камеры (targetScale регулирует силу приближения)
            const targetScale = 2.0; 
            const camTargetX = (vp.clientWidth / 2) - (composerCenterX * targetScale);
            const camTargetY = (vp.clientHeight / 2) - (composerCenterY * targetScale);
            
            // 4. Летим к композитору (за 1.5 секунды)
            Camera.flyToTarget(camTargetX, camTargetY, targetScale, 1500);

            // 5. Показываем информацию (тултип) как при наведении курсора, когда камера долетит
            setTimeout(() => {
                Renderer.showComposerTooltip(composer);
            }, 1500);
        }
    });

    
    // Закрытие списка при клике вне его области
    const closeSearchDropdown = (e) => {
        // ДОБАВЛЕНО: проверяем, что клик был не по строке поиска И не по самому списку результатов
        if (!e.target.closest('.search-container') && !e.target.closest('.search-dropdown')) {
            searchResults.classList.remove('visible');
        }
    };
    document.addEventListener('mousedown', closeSearchDropdown);
    document.addEventListener('touchstart', closeSearchDropdown, { passive: true });

    
    // --- ПРЯТАТЬ/ПОКАЗЫВАТЬ ФАКТЫ (Изначально выключено) ---
    let factsVisible = false; 
    document.getElementById('facts-layer').style.display = 'none';
    
    document.getElementById('btn-toggle-facts').addEventListener('click', (e) => {
        factsVisible = !factsVisible;
        e.target.classList.toggle('active-btn', factsVisible);
        document.getElementById('facts-layer').style.display = factsVisible ? 'block' : 'none';
        
        if (!factsVisible) {
            document.getElementById('facts-nav').classList.remove('visible');
            document.getElementById('fact-card').classList.remove('visible');
            Camera.exitFactModeManual();
        } else {
            document.getElementById('facts-nav').classList.add('visible');
        }
    });

    // --- 3) ЭКСПОРТ В SVG ---
    document.getElementById('btn-export-svg').addEventListener('click', () => {
        const c = State.config;
        const w = c.totalWidth;
        const h = c.canvasHeight;
        
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        
        // Темный фон (берет цвет из CSS переменной)
        svg += `<rect width="100%" height="100%" fill="#151515"/>`;
        
        // Отрисовка всех активных композиторов
        State.filteredItems.forEach(item => {
            const x = (item.birth - c.globalMinYear) * c.globalPixelsPerYear;
            const y = c.equatorY + item.trackIndex * (c.trackHeight + c.trackMargin);
            const width = item.lifespan * c.globalPixelsPerYear;
            const height = c.trackHeight;
            const color = getColor(State.filters.colorMode, State.filters.colorMode === 'era' ? item.era : item.country);
            
            svg += `<g transform="translate(${x}, ${y})">`;
            // Блок композитора
            svg += `<rect width="${width}" height="${height}" fill="${color}" stroke="#ffffff" stroke-width="1" rx="0"/>`;
            // Текст имени
            svg += `<text x="5" y="${height / 2 + 4}" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12px" font-weight="bold">${item.name}</text>`;
            svg += `</g>`;
        });
        
        svg += `</svg>`;
        
        // Создание и скачивание файла
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'composers_timeline.svg';
        a.click();
        URL.revokeObjectURL(url);
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
            let countries = [];
            if (r[7] && String(r[7]).trim() !== '') countries.push(String(r[7]).trim()); 
            if (r[6] && String(r[6]).trim() !== '') countries.push(String(r[6]).trim()); 
            const country = countries.length > 0 ? countries.join(', ') : 'Не указана';
            
            rawEra.split(',').forEach(e => {
                const cleanEra = e.trim();
                eraCounts[cleanEra] = (eraCounts[cleanEra] || 0) + 1;
            });
            
            country.split(',').forEach(c => {
                const cleanCountry = c.trim();
                countryCounts[cleanCountry] = (countryCounts[cleanCountry] || 0) + 1;
            });
            
            // Читаем колонку произведений и округляем в большую сторону с шагом 50
            const rawWorks = parseInt(r[8]) || 0;
            const worksRounded = Math.ceil(rawWorks / 50) * 50;
            
            State.rawItems.push({ 
                id: `comp_${i}`, 
                name: r[0], 
                engName: r[1] || '', 
                birth: r[2], 
                death: r[3], 
                lifespan: r[3] - r[2], 
                era: rawEra, 
                country,
                works: worksRounded // <-- СОХРАНЯЕМ ОКРУГЛЕННОЕ ЗНАЧЕНИЕ
            });
        });

        // =====================================
        // 1. СБОРКА ЭПОХ (Строгий порядок + Группировка)
        // =====================================
        let erasHTML = '';
        
        // Функция-помощник: ищет точное название эпохи в данных независимо от регистра (больших/маленьких букв)
        const getEraKey = (name) => Object.keys(eraCounts).find(k => k.toLowerCase() === name.toLowerCase());

        // Обновленная функция отрисовки, поддерживающая кастомные названия (customLabel)
        const renderEra = (name, isSub = false, parent = '', customLabel = null) => {
            const actualKey = getEraKey(name);
            if (!actualKey || !eraCounts[actualKey]) return ''; 
            const count = eraCounts[actualKey];
            const label = customLabel || actualKey; // Если передано кастомное имя, используем его
            
            return `<label class="checkbox-label ${isSub ? 'sub-category' : ''}">
                <input type="checkbox" value="${actualKey}" checked ${isSub ? `class="group-child" data-parent="${parent}"` : ''}> 
                ${label} <span style="color:#777; font-size:11px; margin-left:auto;">${count}</span>
            </label>`;
        };

        // 1. Самые современные (от новых к старым)
        erasHTML += renderEra('XXI век');
        erasHTML += renderEra('XX век');
        erasHTML += renderEra('Авангард');

        // 2. Группа "Романтизм" (собираем Поздний, Зрелый и Ранний)
        const lateRom = getEraKey('поздний романтизм');
        const midRom = getEraKey('зрелый романтизм');
        const earlyRom = getEraKey('ранний романтизм');
        
        const romanticsSum = (lateRom ? eraCounts[lateRom] : 0) + 
                             (midRom ? eraCounts[midRom] : 0) + 
                             (earlyRom ? eraCounts[earlyRom] : 0);
                             
        if (romanticsSum > 0) {
            erasHTML += `<label class="checkbox-label group-master-label">
                <span class="collapse-toggle" data-target="sub-romantics">▶</span>
                <input type="checkbox" class="group-master" data-group="romantics" checked> 
                Романтизм <span style="color:#777; font-size:11px; margin-left:auto; font-weight:normal;">${romanticsSum}</span>
            </label>
            <div id="sub-romantics" class="collapsed-group">`;
            
            // Вложенные элементы строго от позднего к раннему
            erasHTML += renderEra('поздний романтизм', true, 'romantics', 'Поздний');
            erasHTML += renderEra('зрелый романтизм', true, 'romantics', 'Зрелый'); // Меняем отображаемое имя
            erasHTML += renderEra('ранний романтизм', true, 'romantics', 'Ранний');
            
            erasHTML += `</div>`;
        }

        // 3. Более ранние эпохи в строгом обратном порядке
        erasHTML += renderEra('Классицизм');
        erasHTML += renderEra('Барокко');
        erasHTML += renderEra('Возрождение');
        erasHTML += renderEra('Средневековье');
        
        // 4. Запасной вариант для любых других эпох (если ты добавишь новые в файл csv)
        const processedEras = new Set(['xxi век', 'xx век', 'авангард', 'поздний романтизм', 'зрелый романтизм', 'ранний романтизм', 'классицизм', 'барокко', 'возрождение', 'средневековье']);
        Object.keys(eraCounts).forEach(e => {
            if (!processedEras.has(e.toLowerCase())) {
                erasHTML += renderEra(e); // Они добавятся в самый конец списка
            }
        });

        document.getElementById('ctrl-era').innerHTML = erasHTML;
        State.filters.eras = Object.keys(eraCounts);

        // =====================================
        // 2. СБОРКА СТРАН (Группировка)
        // =====================================
        const sortedCountries = Object.entries(countryCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)); 

        // Определяем наши новые группы
        const groupDeAt = ['Германия', 'Австрия'];
        const groupFrNl = ['Франция', 'Нидерланды'];
        const groupedNames = new Set([...groupDeAt, ...groupFrNl]);

        // Фильтруем страны, которые не вошли в новые группы
        const remainingCountries = sortedCountries.filter(c => !groupedNames.has(c.name));
        
        // ВАЖНО: Теперь отсекаем по 10 композиторам
        const mainCountries = remainingCountries.filter(c => c.count >= 10);
        const smallCountries = remainingCountries.filter(c => c.count < 10);

        let countriesHTML = '';

        // Универсальная функция для создания выпадающих групп (теперь изначально закрытых)
        const renderCountryGroup = (groupId, groupTitle, countryNames) => {
            const groupItems = sortedCountries.filter(c => countryNames.includes(c.name));
            if (groupItems.length === 0) return '';
            const totalCount = groupItems.reduce((sum, c) => sum + c.count, 0);
            
            let html = `<label class="checkbox-label group-master-label">
                <span class="collapse-toggle" data-target="sub-${groupId}">▶</span>
                <input type="checkbox" class="group-master" data-group="${groupId}" checked> 
                ${groupTitle} <span style="color:#777; font-size:11px; margin-left:auto; font-weight:normal;">${totalCount}</span>
            </label>
            <div id="sub-${groupId}" class="collapsed-group">`; // Добавлен класс collapsed-group
            
            html += groupItems.map(c => 
                `<label class="checkbox-label sub-category"><input type="checkbox" value="${c.name}" checked class="group-child" data-parent="${groupId}"> ${c.name} <span style="color:#777; font-size:11px; margin-left:auto;">${c.count}</span></label>`
            ).join('');
            html += `</div>`;
            return html;
        };

        // Добавляем созданные группы в меню
        countriesHTML += renderCountryGroup('group-de-at', 'Австрия и Германия', groupDeAt);
        countriesHTML += renderCountryGroup('group-fr-nl', 'Франция и Нидерланды', groupFrNl);

        // Добавляем остальные крупные страны (без группировки)
        countriesHTML += mainCountries.map(c => 
            `<label class="checkbox-label"><input type="checkbox" value="${c.name}" checked> ${c.name} <span style="color:#777; font-size:11px; margin-left:auto;">${c.count}</span></label>`
        ).join('');

        // Группируем мелкие страны (< 10) в "Другие" (тоже изначально закрытую)
        if (smallCountries.length > 0) {
            countriesHTML += `<label class="checkbox-label group-master-label">
                <span class="collapse-toggle" data-target="sub-small-countries">▶</span>
                <input type="checkbox" class="group-master" data-group="small-countries" checked> 
                Другие <span style="color:#777; font-size:11px; margin-left:auto; font-weight:normal;">${smallCountries.length}</span>
            </label>
            <div id="sub-small-countries" class="collapsed-group">`; // Добавлен класс collapsed-group
            countriesHTML += smallCountries.map(c => 
                `<label class="checkbox-label sub-category"><input type="checkbox" value="${c.name}" checked class="group-child" data-parent="small-countries"> ${c.name} <span style="color:#777; font-size:11px; margin-left:auto;">${c.count}</span></label>`
            ).join('');
            countriesHTML += `</div>`;
        }

        document.getElementById('ctrl-country').innerHTML = countriesHTML;
        State.filters.countries = sortedCountries.map(c => c.name);

        Engine.initGlobalLayout(); Engine.applyFiltersAndSort(); setTimeout(() => Camera.focusAll(false), 100);
    } catch (err) { console.error(err); alert("Ошибка: " + err.message); }
}

Renderer.initEvents(); Camera.init(); setupControls(); loadInitialData();
