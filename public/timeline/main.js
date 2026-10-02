/**
 * ==========================================
 * ШАГ 6: UI КОНТРОЛЛЕР И ИНТЕГРАЦИЯ (main.js)
 * ==========================================
 */

import { store } from './data.js';
import { layoutEngine, LAYOUT_CONSTANTS } from './layout.js';
import { spatialIndex } from './spatial.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';

const appState = {
    mainMode: 'timeline',
    timelineLayout: 'compact',
    timelineGrouping: 'none',
    timelineSort: 'birth',
    ratingMetric: 'bar_works',
    ratingGrouping: 'none',
    colorMode: 'era',
    
    minLifespan: 0,
    maxLifespan: 120,
    minWorks: 0,
    maxWorks: 1400,
    
    minYear: -1000,
    maxYear: new Date().getFullYear(),
    allowedEras: new Set(),
    allowedCountries: new Set(),
    
    currentFactIndex: -1,
    factsMode: false
};

let camera, renderer;

const idToState = {
    'ctrl-main-mode': 'mainMode',
    'ctrl-timeline-layout': 'timelineLayout',
    'ctrl-timeline-grouping': 'timelineGrouping',
    'ctrl-timeline-sort': 'timelineSort',
    'ctrl-rating-metric': 'ratingMetric',
    'ctrl-rating-grouping': 'ratingGrouping',
    'ctrl-color': 'colorMode'
};

const popupUI = {
    container: null,
    title: null,
    dates: null,
    era: null,
    country: null,
    worksCount: null,
    worksPerYear: null,
    activeSoaIdx: null
};

function setHomeActive() {
    const btn = document.getElementById('btn-jump-composers');
    if (btn) btn.classList.add('active-btn');
}

function initComposerPopup() {
    const p = document.createElement('div');
    p.style.position = 'absolute';
    p.style.left = '0px';
    p.style.top = '0px';
    p.style.display = 'none';
    
    p.style.backgroundColor = 'rgba(21, 21, 21, 0.95)';
    p.style.border = '1px solid rgba(255, 255, 255, 0.3)';
    p.style.boxShadow = '4px 4px 0 rgba(0, 0, 0, 0.5)';
    
    p.style.borderRadius = '8px';
    p.style.padding = '12px';
    p.style.color = '#eee';
    p.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    p.style.fontSize = '13px';
    p.style.pointerEvents = 'none'; 
    p.style.zIndex = '1000';
    p.style.minWidth = '220px';
    p.style.willChange = 'transform';
    p.style.transformOrigin = 'top left';

    const title = document.createElement('h3');
    title.style.margin = '0 0 10px 0';
    title.style.fontSize = '16px';
    title.style.borderBottom = '1px solid rgba(255, 255, 255, 0.15)';
    title.style.paddingBottom = '6px';
    title.style.color = '#fff';
    p.appendChild(title);

    function createRow() {
        const row = document.createElement('div');
        row.style.marginBottom = '4px';
        p.appendChild(row);
        return row;
    }

    popupUI.container = p;
    popupUI.title = title;
    popupUI.dates = createRow();
    popupUI.era = createRow();
    popupUI.country = createRow();
    popupUI.worksCount = createRow();
    popupUI.worksPerYear = createRow();

    document.body.appendChild(p);
    window.syncPopupPosition = syncPopupPosition;
}

function openComposerPopup(soaIdx) {
    const comp = store.getRawItemBySoaIdx(soaIdx);
    if (!comp) return;

    let age = comp.lifespan;
    if (age <= 0) age = 1; 

    const wPerYear = (comp.works / age).toFixed(1);

    popupUI.title.textContent = comp.name + (comp.engName ? ' (' + comp.engName + ')' : '');
    popupUI.dates.textContent = 'Годы жизни: ' + comp.birth + ' - ' + comp.death + ' (' + age + ' лет)';
    popupUI.era.textContent = 'Эпоха: ' + comp.era;
    popupUI.country.textContent = 'Страна: ' + comp.country;
    popupUI.worksCount.textContent = 'Произведений: ' + comp.works;
    popupUI.worksPerYear.textContent = 'В среднем в год: ' + wPerYear;

    popupUI.activeSoaIdx = soaIdx;
    popupUI.container.style.display = 'block';
    
    syncPopupPosition();
}

function closeComposerPopup() {
    popupUI.activeSoaIdx = null;
    popupUI.container.style.display = 'none';
}

function syncPopupPosition() {
    if (popupUI.activeSoaIdx === null || !camera) return;

    const layoutX = store.layoutX[popupUI.activeSoaIdx];
    const layoutY = store.layoutY[popupUI.activeSoaIdx];
    const layoutW = store.layoutW[popupUI.activeSoaIdx];

    const pos = camera.worldToScreen(layoutX + layoutW, layoutY);
    let screenX = pos.x + 15; 
    const screenY = pos.y;

    const popupWidth = 220; 
    if (screenX + popupWidth > window.innerWidth) {
        const leftPos = camera.worldToScreen(layoutX, layoutY);
        screenX = leftPos.x - popupWidth - 15;
    }

    const finalX = Math.round(screenX);
    const finalY = Math.round(screenY);

    const transformStr = 'translate(' + finalX + 'px, ' + finalY + 'px)';
    
    if (popupUI.container.style.transform !== transformStr) {
        popupUI.container.style.transform = transformStr;
    }
}

async function bootstrap() {
    const canvas = document.getElementById('main-canvas');
    camera = new Camera(canvas, function() { if (renderer) renderer.requestRender(); });
    renderer = new Renderer(canvas, camera);

    try {
        const [csvRes, factsRes] = await Promise.all([
            fetch('composer.csv'),
            fetch('facts.json')
        ]);
        
        await store.load(await csvRes.text(), await factsRes.text());
        
        let minL = Infinity, maxL = -Infinity;
        let minW = Infinity, maxW = -Infinity;

        store.rawItems.forEach(item => {
            if (item.lifespan < minL) minL = item.lifespan;
            if (item.lifespan > maxL) maxL = item.lifespan;
            if (item.works < minW) minW = item.works;
            if (item.works > maxW) maxW = item.works;
        });

        if (minL === Infinity) { minL = 0; maxL = 120; minW = 0; maxW = 1000; }

        appState.minLifespan = minL;
        appState.maxLifespan = maxL;
        appState.minWorks = minW;
        appState.maxWorks = maxW;

        const setSliderAttr = (minId, maxId, minVal, maxVal) => {
            const minInput = document.getElementById(minId);
            const maxInput = document.getElementById(maxId);
            
            minInput.step = 1;
            maxInput.step = 1;

            minInput.min = minVal; minInput.max = maxVal; minInput.value = minVal;
            maxInput.min = minVal; maxInput.max = maxVal; maxInput.value = maxVal;
        };

        setSliderAttr('ctrl-min-life', 'ctrl-max-life', minL, maxL);
        setSliderAttr('ctrl-min-works', 'ctrl-max-works', minW, maxW);

        store.rawItems.forEach(function(item) {
            item.parsedEras.forEach(function(e) { appState.allowedEras.add(e); });
            item.parsedCountries.forEach(function(c) { appState.allowedCountries.add(c); });
        });

    } catch (e) {
        console.error("Ошибка загрузки данных:", e);
        return;
    }
    
    initComposerPopup(); 
    buildDynamicCheckboxes();
    initWidthSlider(); 
    bindEvents();
    updateCore();
    zoomToFit('instant');
}

function initWidthSlider() {
    const widthSlider = document.getElementById('ctrl-width');
    
    if (widthSlider) {
        const basePixelsPerYear = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
        widthSlider.value = '0';

        widthSlider.addEventListener('input', function(e) {
            const step = parseInt(e.target.value); 
            const factor = 1 + (step * 0.15);
            const newPPY = Math.max(1, basePixelsPerYear * factor);
            const oldPPY = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
            
            if (oldPPY !== newPPY) {
                camera.flight = null;
                camera.vx = 0;
                
                if (appState.mainMode === 'timeline' && store.filteredCount > 0) {
                    let minYear = Infinity;
                    let maxYear = -Infinity;
                    
                    for (let i = 0; i < store.filteredCount; i++) {
                        const inst = store.filteredItems[i];
                        const item = store.getRawItemBySoaIdx(inst.soaIdx);
                        if (item.birth < minYear) minYear = item.birth;
                        if (item.death > maxYear) maxYear = item.death;
                    }

                    if (minYear !== Infinity && maxYear !== -Infinity) {
                        const composerCenterYear = (minYear + maxYear) / 2;
                        const rect = renderer.canvas.getBoundingClientRect();
                        const screenCenterX = rect.width / 2;
                        
                        LAYOUT_CONSTANTS.PIXELS_PER_YEAR = newPPY;
                        
                        const newWorldCenterX = composerCenterYear * newPPY;
                        camera.x = screenCenterX - newWorldCenterX * camera.scale;
                    } else {
                        LAYOUT_CONSTANTS.PIXELS_PER_YEAR = newPPY;
                    }
                } else {
                    LAYOUT_CONSTANTS.PIXELS_PER_YEAR = newPPY;
                }
            }
            
            updateCore();
        });
    }
}

function updateCore() {
    const config = {
        mode: appState.mainMode,
        compact: appState.timelineLayout === 'compact',
        groupBy: appState.mainMode === 'timeline' ? appState.timelineGrouping : appState.ratingGrouping,
        sortBy: appState.mainMode === 'timeline' ? appState.timelineSort : appState.ratingMetric.replace('bar_', ''),
        minYear: appState.minYear,
        maxYear: appState.maxYear,
        minLifespan: appState.minLifespan,
        maxLifespan: appState.maxLifespan,
        minWorks: appState.minWorks,
        maxWorks: appState.maxWorks,
        allowedEras: appState.allowedEras,
        allowedCountries: appState.allowedCountries,
        colorMode: appState.colorMode 
    };

    layoutEngine.updateLayout(config);
    spatialIndex.build();
    
    const uniqueComposers = new Set();
    for (let i = 0; i < store.filteredCount; i++) uniqueComposers.add(store.filteredItems[i].rawIdx);
    document.getElementById('total-count').textContent = uniqueComposers.size;

    if (renderer) {
        renderer.currentMode = appState.mainMode;
        renderer.ratingMetric = appState.ratingMetric;
    }

    let minY = -200;
    let maxY = 200;

    if (store.filteredCount > 0) {
        minY = Infinity;
        maxY = -Infinity;
        for (let i = 0; i < store.filteredCount; i++) {
            const soa = store.filteredItems[i].soaIdx; 
            const y = store.layoutY[soa];
            const h = store.layoutH[soa];
            if (y < minY) minY = y;
            if (y + h > maxY) maxY = y + h;
        }
    }

    const ppy = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
    const currentYear = new Date().getFullYear();
    const earliestFactYear = store.facts.length > 0 ? store.facts[store.facts.length - 1].year : -60000;

    let minX, maxX;
    if (appState.mainMode === 'timeline') {
        minX = earliestFactYear * ppy;
        maxX = currentYear * ppy;
    } else {
        minX = -350;
        maxX = LAYOUT_CONSTANTS.RATING_MAX_WIDTH + 200;
    }

    camera.setWorldBounds(minX, maxX, minY, maxY);
    renderer.requestRender();
}

function buildDynamicCheckboxes() {
    const eraContainer = document.getElementById('ctrl-era');
    const countryContainer = document.getElementById('ctrl-country');
    
    eraContainer.innerHTML = '';
    countryContainer.innerHTML = '';

    const eraCounts = {};
    const countryCounts = {};
    
    store.rawItems.forEach(function(item) {
        item.parsedEras.forEach(function(e) { eraCounts[e] = (eraCounts[e] || 0) + 1; });
        item.parsedCountries.forEach(function(c) { countryCounts[c] = (countryCounts[c] || 0) + 1; });
    });

    function getEraKey(name) {
        const keys = Object.keys(eraCounts);
        for (let i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === name.toLowerCase()) return keys[i];
        }
        return null;
    }

    function getCountryKey(name) {
        const keys = Object.keys(countryCounts);
        for (let i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === name.toLowerCase()) return keys[i];
        }
        return null;
    }

    function createCheckboxNode(opts) {
        const lbl = document.createElement('label');
        lbl.className = 'checkbox-label';
        if (opts.isChild) lbl.className += ' sub-category';
        if (opts.isMaster) lbl.className += ' group-master-label';
        
        if (opts.isMaster) {
            const toggle = document.createElement('span');
            toggle.className = 'collapse-toggle';
            toggle.textContent = '▶';
            
            toggle.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const targetDiv = document.getElementById('sub-' + opts.groupId);
                if (targetDiv) {
                    targetDiv.classList.toggle('collapsed-group');
                    toggle.textContent = targetDiv.classList.contains('collapsed-group') ? '▶' : '▼';
                }
            });
            
            lbl.appendChild(toggle);
        }

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = true;

        if (opts.isMaster) {
            chk.className = 'group-master';
            chk.setAttribute('data-group', opts.groupId);
        } else {
            chk.setAttribute('data-filter', opts.filterType);
            chk.value = opts.value;
            if (opts.isChild) {
                chk.className = 'group-child';
                chk.setAttribute('data-parent', opts.groupId);
            }
        }
        
        lbl.appendChild(chk);
        lbl.appendChild(document.createTextNode(' ' + opts.text + ' '));
        
        const cnt = document.createElement('span');
        cnt.style.color = '#777';
        cnt.style.fontSize = '11px';
        cnt.style.marginLeft = 'auto';
        if (opts.isMaster) cnt.style.fontWeight = 'normal';
        cnt.textContent = String(opts.count);
        lbl.appendChild(cnt);
        
        return lbl;
    }

    const processedEras = new Set();
    
    function addEra(name, isChild, parentId, customLabel) {
        const key = getEraKey(name);
        if (!key || !eraCounts[key]) return null;
        processedEras.add(key.toLowerCase());
        
        return createCheckboxNode({
            filterType: 'era',
            value: key,
            text: customLabel || key,
            count: eraCounts[key],
            isChild: isChild || false,
            isMaster: false,
            groupId: parentId || ''
        });
    }

    const singleEras = ['XXI век'];
    singleEras.forEach(function(e) {
        const node = addEra(e);
        if (node) eraContainer.appendChild(node);
    });

    const xxKeys = ['XX век', 'авангард'].map(getEraKey);
    let xxSum = 0;
    xxKeys.forEach(function(k) { if (k && eraCounts[k]) xxSum += eraCounts[k]; });

    if (xxSum > 0) {
        const masterOpts = { isMaster: true, groupId: 'xx-avangard', text: 'XX век и Авангард', count: xxSum };
        eraContainer.appendChild(createCheckboxNode(masterOpts));
        
        const subDiv = document.createElement('div');
        subDiv.id = 'sub-xx-avangard';
        subDiv.className = 'collapsed-group';
        
        const e1 = addEra('XX век', true, 'xx-avangard');
        if (e1) subDiv.appendChild(e1);
        const e2 = addEra('авангард', true, 'xx-avangard');
        if (e2) subDiv.appendChild(e2);
        
        eraContainer.appendChild(subDiv);
    }

    const romanticsKeys = ['поздний романтизм', 'зрелый романтизм', 'ранний романтизм'].map(getEraKey);
    let romanticsSum = 0;
    romanticsKeys.forEach(function(k) { if (k && eraCounts[k]) romanticsSum += eraCounts[k]; });

    if (romanticsSum > 0) {
        const masterOpts = { isMaster: true, groupId: 'romantics', text: 'Романтизм', count: romanticsSum };
        eraContainer.appendChild(createCheckboxNode(masterOpts));
        
        const subDiv = document.createElement('div');
        subDiv.id = 'sub-romantics';
        subDiv.className = 'collapsed-group';
        
        const e1 = addEra('поздний романтизм', true, 'romantics', 'Поздний');
        if (e1) subDiv.appendChild(e1);
        const e2 = addEra('зрелый романтизм', true, 'romantics', 'Зрелый');
        if (e2) subDiv.appendChild(e2);
        const e3 = addEra('ранний романтизм', true, 'romantics', 'Ранний');
        if (e3) subDiv.appendChild(e3);
        
        eraContainer.appendChild(subDiv);
    }

    const moreEras = ['Классицизм', 'Барокко', 'Возрождение', 'Средневековье'];
    moreEras.forEach(function(e) {
        const node = addEra(e);
        if (node) eraContainer.appendChild(node);
    });

    Object.keys(eraCounts).sort().forEach(function(key) {
        if (!processedEras.has(key.toLowerCase())) {
            const node = addEra(key);
            if (node) eraContainer.appendChild(node);
        }
    });

    const sortedCountries = Object.keys(countryCounts).map(function(c) {
        return { name: c, count: countryCounts[c] };
    }).sort(function(a, b) {
        return b.count - a.count || a.name.localeCompare(b.name);
    });

    const groupDeAt = ['Германия', 'Австрия'];
    const groupFrNl = ['Франция', 'Нидерланды'];
    const processedCountryKeys = new Set();

    function addCountryGroup(groupId, groupTitle, namesList) {
        const groupItems = [];
        namesList.forEach(function(name) {
            const key = getCountryKey(name);
            if (key && countryCounts[key]) {
                groupItems.push({ key: key, name: key, count: countryCounts[key] });
                processedCountryKeys.add(key.toLowerCase());
            }
        });

        if (groupItems.length === 0) return;
        
        let sum = 0;
        groupItems.forEach(function(c) { sum += c.count; });
        
        const masterOpts = { isMaster: true, groupId: groupId, text: groupTitle, count: sum };
        countryContainer.appendChild(createCheckboxNode(masterOpts));
        
        const subDiv = document.createElement('div');
        subDiv.id = 'sub-' + groupId;
        subDiv.className = 'collapsed-group sub-group-container';
        
        groupItems.forEach(function(c) {
            const formattedName = c.name.charAt(0).toUpperCase() + c.name.slice(1);
            const node = createCheckboxNode({
                filterType: 'country',
                value: c.key,
                text: formattedName,
                count: c.count,
                isChild: true,
                groupId: groupId
            });
            subDiv.appendChild(node);
        });
        
        countryContainer.appendChild(subDiv);
    }

    addCountryGroup('group-fr-nl', 'Франция и Нидерланды', groupFrNl);
    addCountryGroup('group-de-at', 'Австрия и Германия', groupDeAt);

    const remainingCountries = sortedCountries.filter(function(c) {
        return !processedCountryKeys.has(c.name.toLowerCase());
    });

    const mainCountries = [];
    const smallCountries = [];
    remainingCountries.forEach(function(c) {
        if (c.count >= 10) mainCountries.push(c);
        else smallCountries.push(c);
    });

    mainCountries.forEach(function(c) {
        processedCountryKeys.add(c.name.toLowerCase());
        const formattedName = c.name.charAt(0).toUpperCase() + c.name.slice(1);
        const node = createCheckboxNode({
            filterType: 'country',
            value: c.name,
            text: formattedName,
            count: c.count,
            isChild: false
        });
        countryContainer.appendChild(node);
    });

    if (smallCountries.length > 0) {
        const smallNames = smallCountries.map(function(c) { return c.name; });
        addCountryGroup('small-countries', 'Другие', smallNames);
    }
}

function setupDualSlider(minId, maxId, trackId, stateKeyMin, stateKeyMax) {
    const minInput = document.getElementById(minId);
    const maxInput = document.getElementById(maxId);
    const minLabel = document.getElementById(minId.replace('ctrl-', 'val-'));
    const maxLabel = document.getElementById(maxId.replace('ctrl-', 'val-'));
    const track = document.getElementById(trackId);

    function updateUI() {
        const val1 = parseInt(minInput.value);
        const val2 = parseInt(maxInput.value);
        const realMin = Math.min(val1, val2);
        const realMax = Math.max(val1, val2);

        if (minLabel) minLabel.textContent = realMin;
        if (maxLabel) maxLabel.textContent = realMax; 

        if (track) {
            const maxAttr = parseInt(minInput.max);
            const minAttr = parseInt(minInput.min);
            const range = maxAttr - minAttr;
            
            const p1 = ((realMin - minAttr) / range) * 100;
            const p2 = ((realMax - minAttr) / range) * 100;
            
            track.style.left = p1 + '%';
            track.style.width = (p2 - p1) + '%';
            track.style.backgroundColor = 'var(--c-accent)';
        }
    }

    function applyFilter() {
        const val1 = parseInt(minInput.value);
        const val2 = parseInt(maxInput.value);
        appState[stateKeyMin] = Math.min(val1, val2);
        appState[stateKeyMax] = Math.max(val1, val2);
        updateCore();
    }

    minInput.addEventListener('input', updateUI);
    maxInput.addEventListener('input', updateUI);
    minInput.addEventListener('change', applyFilter);
    maxInput.addEventListener('change', applyFilter);
    updateUI();
}

function bindEvents() {
    renderer.canvas.addEventListener('wheel', setHomeActive, { passive: true });
    renderer.canvas.addEventListener('pointermove', function() {
        if (camera && camera.isDragging) setHomeActive();
    }, { passive: true });
    renderer.canvas.addEventListener('touchmove', setHomeActive, { passive: true });

    setupDualSlider('ctrl-min-life', 'ctrl-max-life', 'track-life', 'minLifespan', 'maxLifespan');
    setupDualSlider('ctrl-min-works', 'ctrl-max-works', 'track-works', 'minWorks', 'maxWorks');

    document.addEventListener('click', function(e) {
        const toggleBtn = e.target.closest('[data-target]');
        if (toggleBtn && !toggleBtn.classList.contains('toggle-all') && !toggleBtn.classList.contains('collapse-toggle')) {
            e.stopPropagation();
            const targetId = toggleBtn.getAttribute('data-target');
            
            document.querySelectorAll('.dropdown-panel').forEach(function(p) {
                if (p.id !== targetId) p.classList.remove('active-dropdown');
            });
            
            document.querySelectorAll('.top-nav-btn[data-target]').forEach(function(b) {
                if (b !== toggleBtn) b.classList.remove('active-btn');
            });

            const panel = document.getElementById(targetId);
            panel.classList.toggle('active-dropdown');
            
            if (panel.classList.contains('active-dropdown')) {
                toggleBtn.classList.add('active-btn');
            } else {
                toggleBtn.classList.remove('active-btn');
            }
            
            return;
        }

        // ИСПРАВЛЕНИЕ: Отменяем закрытие панелей фильтров при клике на холст. 
        // Закрываем только список поиска, если кликнули мимо него.
        if (!e.target.closest('.search-container') && !e.target.closest('.search-dropdown')) {
            const searchResults = document.getElementById('search-results');
            if (searchResults) searchResults.classList.remove('visible');
        }
    });

    document.getElementById('btn-jump-composers').addEventListener('click', function() {
        if (appState.factsMode) toggleFactsMode(); 
        zoomToFit(false);
    });

    document.body.addEventListener('change', function(e) {
        const tgt = e.target;
        if (tgt.type !== 'checkbox') return;

        let needsUpdate = false;

        if (tgt.classList.contains('group-master')) {
            const groupId = tgt.getAttribute('data-group');
            const container = tgt.closest('.checkbox-container');
            const children = container.querySelectorAll('.group-child[data-parent="' + groupId + '"]');
            
            children.forEach(function(cb) {
                cb.checked = tgt.checked;
                const type = cb.getAttribute('data-filter');
                const val = cb.value;
                const set = type === 'era' ? appState.allowedEras : appState.allowedCountries;
                if (cb.checked) set.add(val);
                else set.delete(val);
            });
            needsUpdate = true;

        } else if (tgt.classList.contains('group-child')) {
            const parentId = tgt.getAttribute('data-parent');
            const container = tgt.closest('.checkbox-container');
            const master = container.querySelector('.group-master[data-group="' + parentId + '"]');
            
            if (master) {
                const children = container.querySelectorAll('.group-child[data-parent="' + parentId + '"]');
                let allChecked = true;
                let someChecked = false;
                children.forEach(function(c) {
                    if (c.checked) someChecked = true;
                    else allChecked = false;
                });
                master.checked = allChecked;
                master.indeterminate = !allChecked && someChecked;
            }

            const type = tgt.getAttribute('data-filter');
            const val = tgt.value;
            const set = type === 'era' ? appState.allowedEras : appState.allowedCountries;
            if (tgt.checked) set.add(val);
            else set.delete(val);
            
            needsUpdate = true;

        } else if (tgt.getAttribute('data-filter')) {
            const type = tgt.getAttribute('data-filter');
            const val = tgt.value;
            const set = type === 'era' ? appState.allowedEras : appState.allowedCountries;
            if (tgt.checked) set.add(val);
            else set.delete(val);
            
            needsUpdate = true;
        }

        if (needsUpdate) updateCore();
    });

    document.querySelectorAll('.toggle-all').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            const container = document.getElementById(targetId);
            if (!container) return;
            
            const childCheckboxes = container.querySelectorAll('input[type="checkbox"][data-filter]');
            let allChecked = true;
            childCheckboxes.forEach(function(cb) { if (!cb.checked) allChecked = false; });
            
            const set = targetId === 'ctrl-era' ? appState.allowedEras : appState.allowedCountries;
            
            childCheckboxes.forEach(function(cb) {
                cb.checked = !allChecked;
                if (!allChecked) set.add(cb.value);
                else set.delete(cb.value);
            });

            const masters = container.querySelectorAll('.group-master');
            masters.forEach(function(m) {
                m.checked = !allChecked;
                m.indeterminate = false;
            });

            updateCore();
        });
    });

    document.body.addEventListener('click', function(e) {
        if (e.target.matches('.switch-btn')) {
            const btn = e.target;
            const container = btn.closest('.toggle-switch');
            if (!container) return;
            
            container.querySelectorAll('.switch-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');

            const stateKey = idToState[container.id];
            if (stateKey) {
                const prevMode = appState.mainMode; 

                appState[stateKey] = btn.getAttribute('data-val');

                if (stateKey === 'mainMode') {
                    const isTimeline = appState.mainMode === 'timeline';
                    document.getElementById('branch-timeline').style.display = isTimeline ? 'block' : 'none';
                    document.getElementById('branch-rating').style.display = !isTimeline ? 'block' : 'none';
                    
                    // --- ИСПРАВЛЕНИЕ 1: Прячем ползунок масштаба в Рейтинге ---
                    const widthCtrl = document.getElementById('ctrl-width');
                    if (widthCtrl) {
                        widthCtrl.closest('.filter-group').style.display = isTimeline ? 'block' : 'none';
                    }
                    
                    const btnFacts = document.getElementById('btn-toggle-facts');
                    if (!isTimeline) {
                        btnFacts.style.display = 'none'; 
                        if (appState.factsMode) toggleFactsMode(); 
                    } else {
                        btnFacts.style.display = 'flex'; 
                    }
                }
                if (stateKey === 'timelineGrouping' || stateKey === 'ratingGrouping') {
                    const val = btn.getAttribute('data-val');
                    appState.colorMode = (val === 'country') ? 'country' : 'era';
                    
                    const colorContainer = document.getElementById('ctrl-color');
                    if (colorContainer) {
                        colorContainer.querySelectorAll('.switch-btn').forEach(function(cb) {
                            if (cb.getAttribute('data-val') === appState.colorMode) cb.classList.add('active');
                            else cb.classList.remove('active');
                        });
                    }
                }

                updateCore();
                if (stateKey === 'mainMode' && prevMode !== appState.mainMode) {
                    zoomToFit('instant'); 
                }
            }
        }
        
        if (e.target.id === 'btn-export-svg') generateAndDownloadSVG();
    });

    const searchInput = document.getElementById('ctrl-search');
    const searchResults = document.getElementById('search-results');
    let searchSelectedIndex = -1; 

    searchInput.addEventListener('input', function(e) {
        searchSelectedIndex = -1; 
        
        const q = e.target.value.toLowerCase().trim();
        
        while (searchResults.firstChild) {
            searchResults.removeChild(searchResults.firstChild);
        }
        
        if (q.length < 2) {
            searchResults.classList.remove('visible');
            if (renderer) renderer._setActiveComposer(null);
            closeComposerPopup();
            return;
        }

        const matches = store.rawItems.filter(function(c) {
            return c.name.toLowerCase().includes(q) || c.engName.toLowerCase().includes(q);
        }).slice(0, 10);

        if (matches.length > 0) {
            matches.forEach(function(match) {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.textContent = match.name + ' (' + match.birth + ' - ' + match.death + ')';
                
                div.addEventListener('click', function() {
                    searchInput.value = match.name;
                    searchResults.classList.remove('visible');
                    
                    if (appState.factsMode) toggleFactsMode(); 
                    
                    let targetSoaIdx = -1;
                    for (let i = 0; i < store.filteredCount; i++) {
                        const inst = store.filteredItems[i];
                        const item = store.getRawItemBySoaIdx(inst.soaIdx);
                        if (item.rawIdx === match.rawIdx) {
                            targetSoaIdx = inst.soaIdx;
                            break;
                        }
                    }

                    if (targetSoaIdx !== -1) {
                        if (renderer) renderer._setActiveComposer(targetSoaIdx);
                        openComposerPopup(targetSoaIdx);
                        
                        const targetX = store.layoutX[targetSoaIdx];
                        const targetY = store.layoutY[targetSoaIdx];
                        const offset = appState.mainMode === 'timeline' ? 200 : 0;
                        
                        camera.flyTo(targetX + offset, targetY, 0.5); // Быстрый полет к композитору
                        setHomeActive();
                    }
                });
                searchResults.appendChild(div);
            });
            searchResults.classList.add('visible');
        }
    });

    searchInput.addEventListener('keydown', function(e) {
        const items = searchResults.querySelectorAll('.search-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault(); 
            searchSelectedIndex++;
            if (searchSelectedIndex >= items.length) searchSelectedIndex = 0;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            searchSelectedIndex--;
            if (searchSelectedIndex < 0) searchSelectedIndex = items.length - 1;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (searchSelectedIndex >= 0 && searchSelectedIndex < items.length) {
                items[searchSelectedIndex].click(); 
            }
            return;
        } else {
            return; 
        }

        items.forEach(function(item, idx) {
            if (idx === searchSelectedIndex) {
                item.classList.add('selected-item');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected-item');
            }
        });
    });

    renderer.canvas.addEventListener('click', function(e) {
        if (camera.isDragging) return; 
        
        setTimeout(function() {
            const rect = renderer.canvas.getBoundingClientRect();
            const world = camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            
            if (appState.factsMode) {
                const fact = renderer._hitTestFact(world.x, world.y, camera.scale);
                if (fact) {
                    const idx = store.facts.indexOf(fact);
                    navigateFacts(null, idx);
                    closeComposerPopup(); 
                    return;
                }
            }
            
            if (renderer.activeSoaIdx !== null) {
                openComposerPopup(renderer.activeSoaIdx);
            } else {
                closeComposerPopup();
            }
        }, 0);
    });

    document.getElementById('btn-toggle-facts').addEventListener('click', toggleFactsMode);
    document.getElementById('btn-close-fact').addEventListener('click', hideFactCard);
    
    document.getElementById('btn-prev-fact').addEventListener('click', function() { navigateFacts(1); });   
    document.getElementById('btn-next-fact').addEventListener('click', function() { navigateFacts(-1); });  
    
    document.getElementById('btn-first-fact').addEventListener('click', function() { navigateFacts(null, store.facts.length - 1); }); 
    document.getElementById('btn-last-fact').addEventListener('click', function() { navigateFacts(null, 0); }); 
}

function toggleFactsMode() {
    appState.factsMode = !appState.factsMode;
    renderer.showFacts = appState.factsMode;
    
    const btnFacts = document.getElementById('btn-toggle-facts');
    const nav = document.getElementById('facts-nav'); // Получаем панель фактов
    
    if (appState.factsMode) {
        btnFacts.classList.add('active-btn');
        nav.classList.add('visible'); // ИСПРАВЛЕНИЕ: Возвращаем панель на экран!
        
        // Автоматически закрываем панели настроек при переходе в режим Фактов
        document.querySelectorAll('.dropdown-panel').forEach(function(p) { p.classList.remove('active-dropdown'); });
        document.querySelectorAll('.top-nav-btn[data-target]').forEach(function(b) { b.classList.remove('active-btn'); });

        if (appState.currentFactIndex === -1) {
            navigateFacts(null, 0);
        } else {
            activateFact(appState.currentFactIndex);
        }
    } else {
        btnFacts.classList.remove('active-btn');
        nav.classList.remove('visible'); // Прячем панель фактов
        hideFactCard();
        store.facts.forEach(function(f) { f.highlight = false; });
        renderer.requestRender();
    }
}

function navigateFacts(dir, exactIndex = null) {
    let newIndex = exactIndex !== null ? exactIndex : appState.currentFactIndex + dir;
    
    if (newIndex >= store.facts.length) newIndex = store.facts.length - 1;
    if (newIndex < 0) newIndex = 0;

    activateFact(newIndex);
}

let factTimeout = null;

function activateFact(index) {
    const fact = store.facts[index];
    if (!fact) return;

    appState.currentFactIndex = index;

    const btnFirst = document.getElementById('btn-first-fact'); 
    const btnPrev = document.getElementById('btn-prev-fact');   
    const btnNext = document.getElementById('btn-next-fact');   
    const btnLast = document.getElementById('btn-last-fact');   

    if (index === 0) {
        btnNext.disabled = true;
        btnLast.disabled = true;
    } else {
        btnNext.disabled = false;
        btnLast.disabled = false;
    }

    if (index === store.facts.length - 1) {
        btnPrev.disabled = true;
        btnFirst.disabled = true;
    } else {
        btnPrev.disabled = false;
        btnFirst.disabled = false;
    }

    const displayNum = store.facts.length - index;
    document.getElementById('fact-info-display').textContent = displayNum + ' / ' + store.facts.length;

    store.facts.forEach(function(f) { f.highlight = false; });
    renderer.requestRender();

    const card = document.getElementById('fact-card');
    card.style.transition = 'opacity 0.2s ease, transform 0.2s ease'; 
    card.classList.remove('visible');

    if (factTimeout) clearTimeout(factTimeout);

    // Вызываем полет
    const ppy = LAYOUT_CONSTANTS.PIXELS_PER_YEAR;
    camera.flyTo(fact.year * ppy, 0, 0.8, 'epic');
    setHomeActive();
    
    // === ИСПРАВЛЕНИЕ 2: Запускаем анимацию за 400мс до конца подлёта камеры ===
    const flightDuration = camera.flight ? camera.flight.duration : 0; 
    const earlyTriggerTime = Math.max(0, flightDuration - 800); 
    
    factTimeout = setTimeout(function() {
        // Камера почти прилетела -> зажигаем точку
        store.facts.forEach(function(f, i) { f.highlight = (i === index); });
        renderer.requestRender();

        const yearSuffix = fact.year < 0 ? ' до н.э.' : ' г.';
        document.getElementById('fact-card-year').textContent = Math.abs(fact.year) + yearSuffix;
        document.getElementById('fact-card-title').textContent = fact.title;
        document.getElementById('fact-card-text').textContent = fact.text;
        
        card.style.transition = 'opacity 0.15s ease-out, transform 0.15s ease-out';
        card.classList.add('visible');
    }, earlyTriggerTime);
}

function hideFactCard() {
    const card = document.getElementById('fact-card');
    card.style.transition = 'opacity 0.2s ease, transform 0.2s ease'; 
    card.classList.remove('visible');
}

function zoomToFit(mode) {
    if (store.filteredCount === 0) return;
    
    const btnHome = document.getElementById('btn-jump-composers');
    if (btnHome) btnHome.classList.remove('active-btn');
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    for (let i = 0; i < store.filteredCount; i++) {
        const soa = store.filteredItems[i].soaIdx;
        
        const x = store.layoutX[soa];
        const y = store.layoutY[soa];
        const w = store.layoutW[soa];
        const h = store.layoutH[soa];
        
        if (x < minX) minX = x;
        if (x + w > maxX) maxX = x + w;
        if (y < minY) minY = y;
        if (y + h > maxY) maxY = y + h;
    }

    const worldWidth = maxX - minX;
    const worldHeight = maxY - minY;
    
    const rect = renderer.canvas.getBoundingClientRect();
    const isPortrait = rect.height > rect.width;
    
    const padRatioX = isPortrait ? 0.10 : 0.20;
    const padRatioY = 0.20; 
    
    const availableWidth = rect.width * (1 - padRatioX * 2);
    const availableHeight = rect.height * (1 - padRatioY * 2);
    
    let targetScale = 1.0;
    
    if (worldWidth > 0 && worldHeight > 0) {
        const scaleX = availableWidth / worldWidth;
        const scaleY = availableHeight / worldHeight;
        targetScale = Math.min(scaleX, scaleY, 1.0);
    }
    
    targetScale = Math.max(camera.minScale, Math.min(targetScale, camera.maxScale));
    
    const targetX = minX + worldWidth / 2;
    const targetY = minY + worldHeight / 2;

    if (mode === 'startup') {
        const startScale = Math.max(camera.minScale, targetScale * 0.8);
        
        camera.scale = startScale;
        camera.x = (rect.width / 2) - (targetX * startScale);
        camera.y = (rect.height / 2) - (targetY * startScale);
        
        camera.flyTo(targetX, targetY, targetScale);
        
    } else if (mode === 'instant') {
        camera.flyTo(targetX, targetY, targetScale);
        if (camera.flight) {
            camera.x = camera.flight.endX;
            camera.y = camera.flight.endY;
            camera.scale = camera.flight.endScale;
            camera.flight = null;
            camera.clamp();
            if (renderer) renderer.requestRender();
        }
    } else {
        camera.flyTo(targetX, targetY, targetScale);
    }
}

function generateAndDownloadSVG() {
    if (store.filteredCount === 0) {
        alert("Нет данных для экспорта");
        return;
    }
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("style", "background-color: #151515;");

    for (let i = 0; i < store.filteredCount; i++) {
        const inst = store.filteredItems[i];
        const soa = inst.soaIdx;
        const item = store.getRawItemBySoaIdx(soa); 
        
        const x = store.layoutX[soa];
        const y = store.layoutY[soa];
        const w = store.layoutW[soa];
        const h = store.layoutH[soa];
        
        if (x < minX) minX = x;
        if (x + w > maxX) maxX = x + w;
        if (y < minY) minY = y;
        if (y + h > maxY) maxY = y + h;

        const g = document.createElementNS(svgNS, "g");
        g.setAttribute("transform", "translate(" + x + ", " + y + ")");
        
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("width", w);
        rect.setAttribute("height", h);
        rect.setAttribute("rx", "6");
        rect.setAttribute("fill", store.instanceColor[soa]);
        
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", "10");
        text.setAttribute("y", (h / 2 + 7));
        text.setAttribute("fill", "#ffffff");
        text.setAttribute("font-family", "system-ui, sans-serif");
        text.setAttribute("font-size", "20");
        text.setAttribute("font-weight", "600");
        text.textContent = item.name; 
        
        g.appendChild(rect);
        g.appendChild(text);
        svg.appendChild(g);
    }

    const worldWidth = maxX - minX + 100;
    const worldHeight = maxY - minY + 100;
    svg.setAttribute("viewBox", (minX - 50) + " " + (minY - 50) + " " + worldWidth + " " + worldHeight);

    const serializer = new XMLSerializer();
    const xmlHeader = String.fromCharCode(60) + '?xml version="1.0" encoding="UTF-8" standalone="no"?' + String.fromCharCode(62) + '\n';
    const svgString = xmlHeader + serializer.serializeToString(svg);

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'composers_chronology.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', bootstrap);