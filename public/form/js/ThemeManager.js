class ThemeManager {
    constructor() {
        this.injectStyles();
        this.injectUI();
    }

    // Внедряем новые правила CSS для светлой/белой темы прямо из скрипта
    injectStyles() {
        if (document.getElementById('theme-manager-styles')) return;

        const style = document.createElement('style');
        style.id = 'theme-manager-styles';
        style.textContent = `
            /* 1. Делаем весь интерфейс светлым */
            body.theme-bw {
                --bg-color: #f4f4f5;
                --panel-bg: #ffffff;
                --text-color: #000000;
                --border-color: #cccccc;
                --text-muted: #555555;
            }
            body.theme-bw h1 { color: #000000; }
            body.theme-bw .container { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05); }
            body.theme-bw .custom-player, 
            body.theme-bw .soundcloud-wrapper {
                background: #ffffff;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }

            /* 2. Делаем сам график чисто белым с черными линиями */
            body.theme-bw .slice {
                fill: #ffffff !important;
                stroke: #000000 !important;
                stroke-width: 1px !important;
            }
            body.theme-bw .slice:hover {
                fill: #f0f0f0 !important; /* Легкое затенение при наведении */
            }
            body.theme-bw .slice-label {
                fill: #000000 !important;
                text-shadow: none !important;
                font-weight: 600;
            }
            body.theme-bw .center-circle {
                fill: #ffffff !important;
                stroke: #000000 !important;
                stroke-width: 1.5px !important;
            }
            body.theme-bw .center-label, 
            body.theme-bw .center-sublabel {
                fill: #000000 !important;
            }
            body.theme-bw .timeline-needle {
                stroke: #000000 !important;
                filter: none !important;
            }
            body.theme-bw .tooltip {
                background: rgba(255, 255, 255, 0.95);
                color: #000000;
                border: 1px solid #000000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
        `;
        document.head.appendChild(style);
    }

    injectUI() {
        // Ищем вторую панель управления (с ползунками)
        const controlsRows = document.querySelectorAll('.controls-row');
        if (controlsRows.length < 2) return;
        
        const targetRow = controlsRows[1];

        // Создаем кнопки
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'mode-toggle';
        toggleContainer.innerHTML = `
            <button id="btnColor" class="mode-btn active">Цвет</button>
            <button id="btnBW" class="mode-btn">Ч/Б Контур</button>
        `;
        
        // Вставляем перед кнопками экспорта
        targetRow.insertBefore(toggleContainer, targetRow.lastElementChild);

        const btnColor = toggleContainer.querySelector('#btnColor');
        const btnBW = toggleContainer.querySelector('#btnBW');

        // Логика нажатия: теперь мы не фильтр накладываем, а вешаем класс на весь body
        btnBW.addEventListener('click', () => {
            btnBW.classList.add('active');
            btnColor.classList.remove('active');
            document.body.classList.add('theme-bw');
        });

        btnColor.addEventListener('click', () => {
            btnColor.classList.add('active');
            btnBW.classList.remove('active');
            document.body.classList.remove('theme-bw');
        });
    }
}

// Запускаем плагин
document.addEventListener('DOMContentLoaded', () => {
    new ThemeManager();
});