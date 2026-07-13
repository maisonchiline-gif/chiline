import { DataProcessor } from './DataProcessor.js';
import { AudioService } from './AudioService.js';
import { SunburstChart } from './SunburstChart.js';
import { Exporter } from './Exporter.js';

class AppController {
    constructor() {
        // Глобальное состояние
        this.state = {
            data: null,
            viewData: null,
            mode: 'fixed',
            maxDepth: 5,
            timeAnchors: [],
            currentAnchorIndex: 0,
            isPlaying: false,
            isPlayerReady: false,
            duration: 0
        };

        // Инициализация модулей
        this.audioService = new AudioService('soundcloudPlayer');
        this.chart = new SunburstChart('#chart', this.state);
        
        // Кэшируем DOM элементы управления
        this.ui = {
            playBtn: document.getElementById("playPauseBtn"),
            iconPlay: document.getElementById("iconPlay"),
            iconPause: document.getElementById("iconPause"),
            seekSlider: document.getElementById("seekSlider"),
            currentDisp: document.getElementById("currentTimeDisp"),
            durationDisp: document.getElementById("durationDisp"),
            depthSlider: document.getElementById("depthSlider"),
            depthValue: document.getElementById("depthValue")
        };

        this.bindEvents();
        this.setupAudioCallbacks();
        this.audioService.init();
    }

    setupAudioCallbacks() {
        this.audioService.onReady = (duration) => {
            this.state.isPlayerReady = true;
            this.state.duration = duration;
            this.ui.seekSlider.max = duration;
            this.ui.durationDisp.innerText = this.formatTime(duration);
            if (this.state.viewData) this.chart.update(false);
        };

        this.audioService.onPlay = () => this.togglePlayUI(true);
        this.audioService.onPause = () => this.togglePlayUI(false);

        this.audioService.onProgress = (timeSec) => {
            if (this.state.isPlaying) {
                this.ui.seekSlider.value = timeSec;
                this.ui.currentDisp.innerText = this.formatTime(timeSec);
            }
            this.chart.updateNeedlePosition(timeSec);
        };

        this.audioService.onSeek = (timeSec) => {
            this.chart.updateNeedlePosition(timeSec);
        };
    }

    bindEvents() {
        // Управление плеером
        this.ui.playBtn.addEventListener('click', () => this.audioService.toggle());
        
        this.ui.seekSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.audioService.seekTo(val);
            this.ui.currentDisp.innerText = this.formatTime(val);
            this.state.currentAnchorIndex = 0;
            this.chart.updateNeedlePosition(val);
        });

        // Управление графиком
        this.chart.onSectorClick = (time) => {
            if (this.state.isPlayerReady) {
                this.audioService.seekTo(time);
                this.audioService.play();
            }
        };

        // UI переключатели
        document.getElementById("btnReal").addEventListener('click', (e) => this.setMode('real', e.target));
        document.getElementById("btnFixed").addEventListener('click', (e) => this.setMode('fixed', e.target));
        
        this.ui.depthSlider.addEventListener('input', (e) => {
            this.state.maxDepth = parseInt(e.target.value, 10);
            this.ui.depthValue.innerText = this.state.maxDepth;
            this.chart.update(false);
        });

        // Экспорт
        document.getElementById("btnExportSVG").addEventListener('click', () => {
            Exporter.exportMedia(this.chart.container, this.chart.config, 'svg');
        });
        document.getElementById("btnExportPNG").addEventListener('click', () => {
            Exporter.exportMedia(this.chart.container, this.chart.config, 'png');
        });
    }

    async loadData(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            if (!data || !data.name) throw new Error("Некорректная структура данных");

            this.state.data = data;
            this.chart.updateConfigColors(data);
            
            DataProcessor.precalculateData(this.state.data);
            this.state.viewData = this.state.data;
            this.chart.update(false);
            
        } catch (error) {
            console.error("Ошибка загрузки данных:", error);
            this.chart.centerText.text("Ошибка");
            this.chart.centerSubtext.text("Проверьте JSON");
        }
    }

    setMode(mode, targetBtn) {
        this.state.mode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        targetBtn.classList.add('active');
        this.chart.update(true);
    }

    togglePlayUI(isPlaying) {
        this.state.isPlaying = isPlaying;
        this.ui.iconPlay.style.display = isPlaying ? 'none' : 'block';
        this.ui.iconPause.style.display = isPlaying ? 'block' : 'none';
        this.ui.playBtn.classList.toggle('playing', isPlaying);
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    const app = new AppController();
    app.loadData('./form-structure.json'); // Убрали папку 'data/'
});