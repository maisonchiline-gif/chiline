/**
 * ==========================================
 * ШАГ 3: CAMERA & INPUT (Математика и Физика)
 * ==========================================
 */

export class Camera {
    constructor(canvas, onRenderRequested) {
        this.canvas = canvas;
        this.requestRender = onRenderRequested;

        this.x = 0;
        this.y = 0;
        
        this.scale = 1;
        this.targetScale = 1; 
        this.zoomFocus = { x: 0, y: 0 };

        this.vx = 0;
        this.vy = 0;
        this.friction = 0.008;
        this.velocityThreshold = 0.01;

        this.minScale = 0.02;
        this.maxScale = 5.0;

        this.worldBounds = {
            minX: -60000 * 20,
            maxX: 2026 * 20,
            minY: -500,
            maxY: 500
        };

        this.isDragging = false;
        this.isPointerDown = false;
        this.lastDragTime = 0;
        this.lastPointer = { x: 0, y: 0 };
        
        // Массив для точного вычисления инерции (сглаживание микро-рывков)
        this.velocityHistory = [];
        this.pointers = new Map();

        this.flight = null;

        this._bindEvents();
    }

    setWorldBounds(minX, maxX, minY, maxY) {
        this.worldBounds.minX = minX;
        this.worldBounds.maxX = maxX;
        this.worldBounds.minY = minY;
        this.worldBounds.maxY = maxY;
        this.clamp();
    }

    clamp() {
        const rect = this.canvas.getBoundingClientRect();
        const W = rect.width;
        const H = rect.height;
        if (!W || !H) return;

        const isPortrait = H > W;
        const padRatioX = isPortrait ? 0.10 : 0.20;
        const padRatioY = 0.25; // Строго 25% от экрана

        this.x = this._clampAxis(this.x, this.worldBounds.minX, this.worldBounds.maxX, this.scale, W, padRatioX);
        this.y = this._clampAxis(this.y, this.worldBounds.minY, this.worldBounds.maxY, this.scale, H, padRatioY);
    }

    _clampAxis(val, worldMin, worldMax, scale, screenSize, padRatio) {
        const pad = screenSize * padRatio;
        const minOffset = (screenSize - pad) - worldMax * scale;
        const maxOffset = pad - worldMin * scale;

        // ИСПРАВЛЕНИЕ ГРАНИЦ:
        // Если контент меньше свободного места, мы больше НЕ центрируем его жестко.
        // Мы позволяем ему свободно плавать между верхним (25%) и нижним (25%) ограничителем.
        if (minOffset > maxOffset) {
            return Math.max(maxOffset, Math.min(val, minOffset));
        }
        
        // Стандартное ограничение, если контент больше экрана
        return Math.max(minOffset, Math.min(val, maxOffset));
    }

    screenToWorld(sx, sy) {
        return {
            x: (sx - this.x) / this.scale,
            y: (sy - this.y) / this.scale
        };
    }

    worldToScreen(wx, wy) {
        return {
            x: wx * this.scale + this.x,
            y: wy * this.scale + this.y
        };
    }

    flyTo(targetX, targetY, targetScale, flightMode) {
        const rect = this.canvas.getBoundingClientRect();
        const screenCenterX = rect.width / 2;
        const screenCenterY = rect.height / 2;

        const endScale = clampVal(targetScale, this.minScale, this.maxScale);
        let endX = screenCenterX - targetX * endScale;
        let endY = screenCenterY - targetY * endScale;

        const isPortrait = rect.height > rect.width;
        const padRatioX = isPortrait ? 0.10 : 0.20;
        const padRatioY = 0.25; // Строго 25% в полетах

        endX = this._clampAxis(endX, this.worldBounds.minX, this.worldBounds.maxX, endScale, rect.width, padRatioX);
        endY = this._clampAxis(endY, this.worldBounds.minY, this.worldBounds.maxY, endScale, rect.height, padRatioY);

        const dx = endX - this.x;
        const dy = endY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const scaleDiff = Math.abs(endScale - this.scale) * 1000;
        
        let cinematicDuration;
        
        if (flightMode === 'epic') {
            cinematicDuration = 1500 + Math.min((distance + scaleDiff) * 0.24, 6000);
        } else {
            cinematicDuration = 1000 + Math.min((distance + scaleDiff) * 0.08, 2000);
        }

        this.flight = {
            startX: this.x, 
            startY: this.y, 
            startScale: this.scale,
            endX: endX, 
            endY: endY, 
            endScale: endScale,
            startTime: performance.now(),
            duration: cinematicDuration
        };
        
        this.targetScale = endScale; 
        this.vx = 0; 
        this.vy = 0;
        this.requestRender();
    }

    update(currentTime, dt) {
        let needsRender = false;

        // Плавный зум
        if (Math.abs(this.scale - this.targetScale) > 0.0001) {
            const lerpFactor = 1 - Math.exp(-dt * 0.015); 
            const prevScale = this.scale;
            
            this.scale += (this.targetScale - this.scale) * lerpFactor;
            
            if (Math.abs(this.scale - this.targetScale) < 0.0001) {
                this.scale = this.targetScale;
            }
            
            const ratio = this.scale / prevScale;
            this.x = this.zoomFocus.x - (this.zoomFocus.x - this.x) * ratio;
            this.y = this.zoomFocus.y - (this.zoomFocus.y - this.y) * ratio;
            
            this.clamp();
            needsRender = true;
        }

        // Полет
        if (this.flight) {
            const elapsed = currentTime - this.flight.startTime;
            const tNorm = Math.min(elapsed / this.flight.duration, 1);
            
            const tau = tNorm < 0.5 
                ? 16 * Math.pow(tNorm, 5) 
                : 1 - Math.pow(-2 * tNorm + 2, 5) / 2;

            this.x = this.flight.startX + (this.flight.endX - this.flight.startX) * tau;
            this.y = this.flight.startY + (this.flight.endY - this.flight.startY) * tau;
            this.scale = this.flight.startScale + (this.flight.endScale - this.flight.startScale) * tau;
            
            this.targetScale = this.scale; 
            this.clamp();
            needsRender = true;
            if (tNorm === 1) this.flight = null;
            return needsRender;
        }

        // Кинематика (инерция)
        if (!this.isDragging && (Math.abs(this.vx) > 0 || Math.abs(this.vy) > 0)) {
            const expTerm = Math.exp(-this.friction * dt);
            const posFactor = (1 - expTerm) / this.friction;
            
            const prevX = this.x;
            const prevY = this.y;

            this.x += this.vx * posFactor;
            this.y += this.vy * posFactor;
            this.clamp();

            if (this.x === prevX) this.vx = 0;
            if (this.y === prevY) this.vy = 0;

            this.vx *= expTerm;
            this.vy *= expTerm;

            const speedSq = this.vx * this.vx + this.vy * this.vy;
            if (speedSq < this.velocityThreshold * this.velocityThreshold) {
                this.vx = 0;
                this.vy = 0;
            } else {
                needsRender = true;
            }
        }

        return needsRender;
    }

    _bindEvents() {
        const cvs = this.canvas;
        
        cvs.addEventListener('pointerdown', this._onPointerDown.bind(this));
        cvs.addEventListener('pointermove', this._onPointerMove.bind(this));
        window.addEventListener('pointerup', this._onPointerUp.bind(this));
        window.addEventListener('pointercancel', this._onPointerUp.bind(this));
        
        cvs.addEventListener('wheel', this._onWheel.bind(this), { passive: false });

        cvs.addEventListener('touchstart', this._onTouch.bind(this), { passive: false });
        cvs.addEventListener('touchmove', this._onTouch.bind(this), { passive: false });
        cvs.addEventListener('touchend', this._onTouch.bind(this), { passive: false });
    }

    _getEventPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    _onPointerDown(e) {
        if (e.pointerType === 'touch') return;
        this.canvas.setPointerCapture(e.pointerId);
        
        const pos = this._getEventPos(e);
        this.isPointerDown = true;
        this.isDragging = false;
        
        this.flight = null;
        this.targetScale = this.scale; 
        
        this.vx = 0; 
        this.vy = 0;
        this.velocityHistory = []; // Сброс истории скоростей перед новым рывком
        
        this.lastPointer = pos;
        this.lastDragTime = performance.now();
    }

    _onPointerMove(e) {
        if (e.pointerType === 'touch') return;
        
        const pos = this._getEventPos(e);
        this.zoomFocus.x = pos.x;
        this.zoomFocus.y = pos.y;

        if (!this.isPointerDown) return;

        const dx = pos.x - this.lastPointer.x;
        const dy = pos.y - this.lastPointer.y;

        if (!this.isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
            this.isDragging = true;
        }

        if (this.isDragging) {
            const now = performance.now();
            const dt = now - this.lastDragTime;

            this.x += dx;
            this.y += dy;
            this.clamp();

            if (dt > 0) {
                // ИСПРАВЛЕНИЕ ИНЕРЦИИ: Записываем движения в кольцевой буфер
                this.velocityHistory.push({ dx, dy, dt });
                if (this.velocityHistory.length > 5) {
                    this.velocityHistory.shift();
                }

                // Вычисляем скорость как среднее за последние кадры
                let sumDx = 0, sumDy = 0, sumDt = 0;
                for (const v of this.velocityHistory) {
                    sumDx += v.dx;
                    sumDy += v.dy;
                    sumDt += v.dt;
                }
                
                this.vx = sumDx / sumDt;
                this.vy = sumDy / sumDt;
            }

            this.lastPointer = pos;
            this.lastDragTime = now;
            this.requestRender();
        }
    }

    _onPointerUp(e) {
        if (!this.isPointerDown || e.pointerType === 'touch') return;
        this.isPointerDown = false;
        
        if (this.isDragging) {
            setTimeout(() => { this.isDragging = false; }, 50);
        }
        
        if (performance.now() - this.lastDragTime > 50) {
            this.vx = 0;
            this.vy = 0;
        } else {
            this.requestRender();
        }
    }

    _onWheel(e) {
        e.preventDefault();
        
        this.flight = null;
        this.vx = 0;
        this.vy = 0;

        const pos = this._getEventPos(e);
        this.zoomFocus.x = pos.x;
        this.zoomFocus.y = pos.y;

        const zoomIntensity = e.ctrlKey ? 0.005 : 0.0015; 
        const delta = -e.deltaY;
        const scaleFactor = Math.exp(delta * zoomIntensity);
        
        this.targetScale = clampVal(this.targetScale * scaleFactor, this.minScale, this.maxScale);
        this.requestRender();
    }

    _onTouch(e) {
        if (e.type === 'touchmove' || (e.touches && e.touches.length > 1)) {
            if (e.cancelable) e.preventDefault();
        }

        if (e.type === 'touchstart' || e.type === 'touchmove') {
            this.flight = null;
        }

        if (e.type === 'touchstart') {
            this.vx = 0; 
            this.vy = 0;
            this.targetScale = this.scale;
            this.velocityHistory = []; // Сброс истории для пальца

            if (e.touches.length === 1) {
                this.isPointerDown = true;
                this.isDragging = false;
                this.lastPointer = this._getEventPos(e.touches[0]);
                this.lastDragTime = performance.now();
            } else if (e.touches.length === 2) {
                this.isPointerDown = false;
                this.isDragging = false;
                this.initialPinchDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                this.initialScale = this.scale;
                
                const rect = this.canvas.getBoundingClientRect();
                this.lastPinchCenter = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
                };
            }
        }

        if (e.type === 'touchmove') {
            if (e.touches.length === 1 && this.isPointerDown) {
                const pos = this._getEventPos(e.touches[0]);
                const dx = pos.x - this.lastPointer.x;
                const dy = pos.y - this.lastPointer.y;
                
                if (!this.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                    this.isDragging = true;
                }

                if (this.isDragging) {
                    const now = performance.now();
                    const dt = now - this.lastDragTime;
                    
                    this.x += dx; 
                    this.y += dy;
                    this.clamp();
                    
                    if (dt > 0) {
                        // Сглаживаем скорость пальца
                        this.velocityHistory.push({ dx, dy, dt });
                        if (this.velocityHistory.length > 5) {
                            this.velocityHistory.shift();
                        }
                        let sumDx = 0, sumDy = 0, sumDt = 0;
                        for (const v of this.velocityHistory) {
                            sumDx += v.dx;
                            sumDy += v.dy;
                            sumDt += v.dt;
                        }
                        this.vx = sumDx / sumDt; 
                        this.vy = sumDy / sumDt;
                    }

                    this.lastPointer = pos;
                    this.lastDragTime = now;
                    this.requestRender();
                }
            } else if (e.touches.length === 2) {
                this.isPointerDown = false;
                this.isDragging = false;
                const centerClientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const centerClientY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                
                const rect = this.canvas.getBoundingClientRect();
                const centerX = centerClientX - rect.left;
                const centerY = centerClientY - rect.top;

                if (this.lastPinchCenter) {
                    this.x += centerX - this.lastPinchCenter.x;
                    this.y += centerY - this.lastPinchCenter.y;
                }

                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );

                const scaleFactor = currentDistance / this.initialPinchDistance;
                const newScale = clampVal(this.initialScale * scaleFactor, this.minScale, this.maxScale);
                const stepFactor = newScale / this.scale;
                
                this.x = centerX - (centerX - this.x) * stepFactor;
                this.y = centerY - (centerY - this.y) * stepFactor;
                
                this.scale = newScale;
                this.targetScale = newScale; 
                
                this.clamp();

                this.lastPinchCenter = { x: centerX, y: centerY };
                this.requestRender();
            }
        }

        if (e.type === 'touchend' || e.type === 'touchcancel') {
            this.lastPinchCenter = null;
            if (e.touches.length === 0) {
                this.isPointerDown = false;
                
                if (this.isDragging) {
                    setTimeout(() => { this.isDragging = false; }, 50);
                }
                
                if (performance.now() - this.lastDragTime > 50) {
                    this.vx = 0; 
                    this.vy = 0;
                } else {
                    this.requestRender();
                }
            } else if (e.touches.length === 1) {
                this.isPointerDown = true;
                this.isDragging = false;
                this.lastPointer = this._getEventPos(e.touches[0]);
                this.lastDragTime = performance.now();
            }
        }
    }

    _zoomToPoint(mX, mY, scaleFactor) {
        const oldScale = this.scale;
        this.scale = clampVal(this.scale * scaleFactor, this.minScale, this.maxScale);
        this.targetScale = this.scale; 
        
        const ratio = this.scale / oldScale;
        this.x = mX - (mX - this.x) * ratio;
        this.y = mY - (mY - this.y) * ratio;
        this.clamp();

        this.requestRender();
    }
}

function clampVal(val, min, max) {
    return Math.min(Math.max(val, min), max);
}