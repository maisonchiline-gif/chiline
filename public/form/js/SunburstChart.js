import { DataProcessor } from './DataProcessor.js';

export class SunburstChart {
    constructor(containerId, stateContext) {
        this.container = d3.select(containerId);
        this.state = stateContext; // Ссылка на глобальный state из app.js
        
        this.config = {
            width: 800,
            height: 800,
            innerRadius: 100,
            // Подключаем встроенную контрастную палитру D3
            colorScale: d3.scaleOrdinal(d3.schemeTableau10)
        };
        this.config.radius = this.config.width / 2;
        this.clickTimeout = null;

        // Коллбеки
        this.onSectorClick = () => {};
        this.onSectorDoubleClick = () => {};

        this.initSvg();
    }

    initSvg() {
        this.svg = this.container.append("svg")
            .attr("viewBox", `0 0 ${this.config.width} ${this.config.height}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .append("g")
            .attr("transform", `translate(${this.config.width / 2},${this.config.height / 2})`);

        this.centerGroup = this.svg.append("g")
            .attr("class", "center-group")
            .on("click", () => this.zoomOut());

        this.centerGroup.append("circle")
            .attr("class", "center-circle")
            .attr("r", this.config.innerRadius);

        this.centerText = this.centerGroup.append("text").attr("class", "center-label").attr("y", -8);
        this.centerSubtext = this.centerGroup.append("text").attr("class", "center-sublabel").attr("y", 18);

        this.needle = this.svg.append("line")
            .attr("class", "timeline-needle")
            .attr("x1", 0).attr("y1", -this.config.innerRadius)
            .attr("x2", 0).attr("y2", -this.config.radius)
            .attr("transform", "rotate(0)");
    }

    updateConfigColors(data) {
        // Берем имена только ПЕРВОГО уровня (дети корня) для назначения главных цветов
        if (data.children) {
            this.config.colorScale.domain(data.children.map(c => c.name));
        }
    }

    update(animate = false) {
        if (!this.state.viewData) return;

        const root = d3.hierarchy(this.state.viewData)
            .sum(d => {
                if (this.state.mode === 'fixed') return (d.children && d.children.length > 0) ? 0 : 1;
                if (d.children && d.children.length > 0) return 0;
                return parseFloat(d.value) || 0;
            });

        const partition = d3.partition().size([2 * Math.PI, this.config.radius])(root);
        const descendants = partition.descendants().filter(d => d.depth > 0);
        const visibleDescendants = descendants.filter(d => d.depth <= this.state.maxDepth);

        // Расчет якорей времени
        this.state.timeAnchors = [];
        partition.each(d => {
            this.state.timeAnchors.push({ 
                time: DataProcessor.getNodeStartTime(d.data, this.state.isPlayerReady, this.state.duration, this.state.data.realValue), 
                angle: d.x0 
            });
        });
        
        if (this.state.isPlayerReady && this.state.duration > 0) {
            this.state.timeAnchors.push({ 
                time: DataProcessor.getNodeEndTime(this.state.viewData, this.state.isPlayerReady, this.state.duration, this.state.data.realValue), 
                angle: 2 * Math.PI 
            });
        }
        
        this.state.timeAnchors.sort((a, b) => a.time - b.time);
        this.state.timeAnchors = this.state.timeAnchors.filter((item, pos, ary) => !pos || item.time > ary[pos - 1].time);
        this.state.currentAnchorIndex = 0;

        const maxDepth = d3.max(descendants, d => d.depth) || 1;
        const availableSpace = this.config.radius - this.config.innerRadius;
        const q = 1 / 1.6;
        const firstLayerThickness = availableSpace * (1 - q) / (1 - Math.pow(q, maxDepth));

        const radii = [this.config.innerRadius];
        let currentR = this.config.innerRadius;
        for (let i = 1; i <= maxDepth; i++) {
            currentR += firstLayerThickness * Math.pow(q, i - 1);
            radii.push(currentR);
        }

        visibleDescendants.forEach(d => {
            d.customY0 = radii[d.depth - 1] || this.config.innerRadius;
            d.customY1 = radii[d.depth] || this.config.innerRadius;
        });

        const arc = d3.arc()
            .startAngle(d => d.x0)
            .endAngle(d => d.x1)
            .innerRadius(d => d.customY0)
            .outerRadius(d => d.customY1);

        this.renderSlices(visibleDescendants, arc, animate);
        this.updateCenterInfo();
        this.updateNeedleLength(radii, animate);
    }

    renderSlices(data, arc, animate) {
        const getGeom = d => ({ x0: d.x0, x1: d.x1, customY0: d.customY0, customY1: d.customY1 });
        const slices = this.svg.selectAll(".slice-group").data(data, d => d.data._id);

        if (animate) {
            slices.exit().transition().duration(500).style("opacity", 0).remove();
        } else {
            slices.exit().remove();
        }

        const newSlices = slices.enter().append("g").attr("class", "slice-group");

        newSlices.append("path")
            .attr("class", "slice")
            .style("fill", d => {
                const path = d.ancestors().reverse();
                const rootNode = path.length > 1 ? path[1] : path[0];
                const baseColor = d3.rgb(this.config.colorScale(rootNode.data.name));
                const depthDiff = d.depth - 1;
                const darkenFactor = Math.max(0, depthDiff) * 0.25;

                return baseColor.darker(darkenFactor);
            })
            .on("mouseover", (e, d) => this.showTooltip(e, d))
            .on("mousemove", (e) => this.moveTooltip(e))
            .on("mouseout", () => this.hideTooltip())
            .on("click", (e, d) => this.handleSliceClick(e, d))
            .each(function(d) { this._current = { x0: d.x0, x1: d.x1, customY0: d.customY0, customY1: d.customY1 }; });

        // === 1. Проверка при создании текста ===
        newSlices.append("text")
            .attr("class", "slice-label")
            .attr("dy", "0.35em")
            .text(d => {
                if (!this.state.viewData._parent) return "";
                // ДОБАВИЛИ || d.data.name
                return (d.x1 - d.x0) < 0.08 ? "" : (d.data.short || d.data.name || "");
            })
            .each(function(d) { this._currentText = getGeom(d); });

        const allSlices = newSlices.merge(slices);
        const paths = allSlices.select("path");
        
        // === 2. Проверка при обновлении текста (после зума/клика) ===
        const texts = allSlices.select("text").text(d => {
            if (!this.state.viewData._parent) return "";
            // ДОБАВИЛИ || d.data.name
            return (d.x1 - d.x0) < 0.08 ? "" : (d.data.short || d.data.name || "");
        });

        const calcTransform = geom => {
            const centroid = arc.centroid(geom);
            let angle = ((geom.x0 + geom.x1) / 2) * (180 / Math.PI) - 90;
            if (angle > 90 && angle <= 270) angle += 180;
            return `translate(${centroid[0]}, ${centroid[1]}) rotate(${angle})`;
        };

        if (animate) {
            paths.transition().duration(500).attrTween("d", function(d) {
                const target = getGeom(d);
                const i = d3.interpolate(this._current || target, target);
                this._current = target;
                return t => arc(i(t));
            });
            texts.transition().duration(500).attrTween("transform", function(d) {
                const target = getGeom(d);
                const i = d3.interpolate(this._currentText || target, target);
                this._currentText = target;
                return t => calcTransform(i(t));
            });
        } else {
            paths.attr("d", arc).each(function(d) { this._current = getGeom(d); });
            texts.attr("transform", d => calcTransform(getGeom(d))).each(function(d) { this._currentText = getGeom(d); });
        }
    }

    updateCenterInfo() {
        const canZoomOut = !!this.state.viewData._parent;
        this.centerGroup.classed("zoomable", canZoomOut);
        this.centerText.text(this.state.viewData.name);
        this.centerSubtext.text(`Тактов: ${this.state.viewData.realValue}`);
    }

    updateNeedleLength(radii, animate) {
        const visibleMaxDepth = radii.length - 1;
        const needleRadius = radii[Math.min(this.state.maxDepth, visibleMaxDepth)] || this.config.innerRadius;
        
        if (animate) {
            this.needle.transition().duration(500).attr("y2", -needleRadius);
        } else {
            this.needle.attr("y2", -needleRadius);
        }
        this.needle.raise();
    }

    updateNeedlePosition(time) {
        if (!this.state.isPlayerReady || !this.state.duration || this.state.timeAnchors.length === 0) return;

        const anchors = this.state.timeAnchors;
        const start = anchors[0].time;
        const end = anchors[anchors.length - 1].time;

        if (time < start || time > end) {
            this.needle.style("opacity", 0);
        } else {
            this.needle.style("opacity", 1);
            
            let idx = this.state.currentAnchorIndex;
            while (idx < anchors.length - 1 && time >= anchors[idx + 1].time) idx++;
            while (idx > 0 && time < anchors[idx].time) idx--;
            this.state.currentAnchorIndex = idx;

            const current = anchors[idx];
            const next = anchors[idx + 1] || current;

            const timeRange = next.time - current.time;
            let progress = timeRange > 0 ? (time - current.time) / timeRange : 0;
            const angle = current.angle + progress * (next.angle - current.angle);
            
            this.needle.attr("transform", `rotate(${angle * (180 / Math.PI)})`);
        }
    }

    handleSliceClick(event, d) {
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
            if (d.children && d.children.length > 0) {
                this.state.viewData = d.data;
                this.update(true);
                this.hideTooltip();
            }
        } else {
            this.clickTimeout = setTimeout(() => {
                this.clickTimeout = null;
                const startTime = DataProcessor.getNodeStartTime(d.data, this.state.isPlayerReady, this.state.duration, this.state.data.realValue);
                this.onSectorClick(startTime);
            }, 250);
        }
    }

    zoomOut() {
        if (this.state.viewData && this.state.viewData._parent) {
            this.state.viewData = this.state.viewData._parent;
            this.update(true);
        }
    }

    showTooltip(event, d) {
        const tooltip = document.getElementById("tooltip");
        const total = this.state.data.realValue;
        const percent = ((d.data.realValue / total) * 100).toFixed(1);
        const timeInfo = d.data.time ? `<br><b>Старт:</b> ${d.data.time}` : "";
        
        tooltip.innerHTML = `
            <div class="tooltip-title">${d.data.name}</div>
            <div><b>Уровень:</b> ${d.depth}</div>
            <div><b>Размер:</b> ${d.data.realValue} (${percent}%)${timeInfo}</div>
        `;
        tooltip.style.opacity = "1";
    }

    moveTooltip(event) {
        const tooltip = document.getElementById("tooltip");
        const padding = 15;
        let x = event.clientX + padding;
        let y = event.clientY + padding;
        
        if (x + tooltip.offsetWidth > window.innerWidth) x = event.clientX - tooltip.offsetWidth - padding;
        if (y + tooltip.offsetHeight > window.innerHeight) y = event.clientY - tooltip.offsetHeight - padding;

        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
    }

    hideTooltip() {
        document.getElementById("tooltip").style.opacity = "0";
    }
}