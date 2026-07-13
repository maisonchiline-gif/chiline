export class Exporter {
    // 1. Добавили параметр config сюда
    static getSVGString(chartElement, config) {
        const svgNode = chartElement.select("svg").node();
        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(svgNode);
        
        if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        // === ИСПРАВЛЕНИЕ ===
        // Явно добавляем размеры, чтобы Canvas не смещал центр в левый верхний угол
        source = source.replace(/^<svg/, `<svg width="${config.width}" height="${config.height}" `);

        // Проверяем, включен ли сейчас черно-белый режим
        const isBW = document.body.classList.contains('theme-bw');

        // Генерируем стили в зависимости от текущей темы
        let style = "";
        if (isBW) {
            style = `<style>
                /* Черно-белые стили, перебивающие инлайн-цвета D3 */
                .center-circle { fill: #ffffff !important; stroke: #000000 !important; stroke-width: 1.5px !important; }
                .center-label { font-size: 16px; font-weight: bold; fill: #000000 !important; text-anchor: middle; font-family: sans-serif; }
                .center-sublabel { font-size: 12px; fill: #555555 !important; text-anchor: middle; font-family: sans-serif; }
                .slice { fill: #ffffff !important; stroke: #000000 !important; stroke-width: 1px !important; }
                .slice-label { font-size: 11px; fill: #000000 !important; text-anchor: middle; font-weight: 600; font-family: sans-serif; text-shadow: none !important; }
                .timeline-needle { display: none; }
            </style>`;
        } else {
            style = `<style>
                /* Стандартные темные цветные стили */
                .center-circle { fill: #1e1e1e; }
                .center-label { font-size: 16px; font-weight: bold; fill: #ffffff; text-anchor: middle; font-family: sans-serif; }
                .center-sublabel { font-size: 12px; fill: #8e8e93; text-anchor: middle; font-family: sans-serif; }
                .slice { stroke: #1e1e1e; stroke-width: 1.5px; }
                .slice-label { font-size: 11px; fill: #ffffff; text-anchor: middle; font-weight: 500; font-family: sans-serif; text-shadow: 0px 0px 4px rgba(0,0,0,0.9); }
                .timeline-needle { display: none; }
            </style>`;
        }

        return source.replace('>', '>' + style);
    }

    static exportMedia(chartElement, config, type) {
        // 2. Передаем config в вызов getSVGString
        const source = this.getSVGString(chartElement, config);
        const blob = new Blob([source], {type: "image/svg+xml;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        // Узнаем тему, чтобы дать файлу правильное имя
        const isBW = document.body.classList.contains('theme-bw');
        const filePrefix = isBW ? "music-structure-bw" : "music-structure";

        if (type === 'svg') {
            link.href = url;
            link.download = `${filePrefix}.svg`;
            link.click();
        } else {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const scale = 2; // Увеличиваем разрешение для четкости (Retina)
                canvas.width = config.width * scale;
                canvas.height = config.height * scale;
                const ctx = canvas.getContext("2d");
                
                // Заливаем фон картинки белым, если включен режим контура
                ctx.fillStyle = isBW ? "#ffffff" : "#1e1e1e";
                
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.scale(scale, scale);
                ctx.drawImage(img, 0, 0);
                
                URL.revokeObjectURL(url);
                link.href = canvas.toDataURL("image/png");
                link.download = `${filePrefix}.png`;
                link.click();
            };
            img.src = url;
        }
    }
}