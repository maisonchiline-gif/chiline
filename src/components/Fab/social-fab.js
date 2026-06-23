// =========================================
// ВСТАВЛЯЙ СВОИ ССЫЛКИ СЮДА:
// =========================================
const socialLinks = {
  instagram: "https://www.instagram.com/chiline_monsieur",
  telegram:  "https://t.me/chiline",
  boosty:    "https://boosty.to/maison_chiline",
  youtube:   "https://www.youtube.com/@CHILINE_ru",
  ozon:      "https://www.ozon.ru/seller/chiline/"
};
// =========================================


const fabTemplate = `
  <style>
    .social-fab-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none; 
    }

    .social-fab-menu {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 15px;
      opacity: 0;
      transform: translateY(20px) scale(0.9);
      transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      pointer-events: none;
    }

    .social-fab-item {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: #e5e2d9;
      color: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
      transition: transform 0.2s ease, background-color 0.2s ease;
      pointer-events: auto;
    }

    .social-fab-item:hover {
      transform: scale(1.1);
      background-color: #fff;
    }

    .social-fab-item svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }

    .social-fab-toggle {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background-color: #e5e2d9;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
      opacity: 0.5;
      transition: opacity 0.3s ease, transform 0.3s ease, background-color 0.3s ease;
      pointer-events: auto;
    }

    .social-fab-toggle svg {
      width: 24px;
      height: 24px;
      fill: #000;
      transition: transform 0.3s ease;
    }

    .social-fab-toggle:hover {
      opacity: 0.8;
    }
    
    .social-fab-container.active .social-fab-toggle {
      opacity: 1;
      transform: scale(1.05);
      background-color: #fff;
    }

    .social-fab-container.active .social-fab-toggle svg {
      transform: rotate(90deg); 
    }

    .social-fab-container.active .social-fab-menu {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* Анимация лесенкой для 5 элементов */
    .social-fab-menu a:nth-child(1) { transition-delay: 0.20s; }
    .social-fab-menu a:nth-child(2) { transition-delay: 0.15s; }
    .social-fab-menu a:nth-child(3) { transition-delay: 0.10s; }
    .social-fab-menu a:nth-child(4) { transition-delay: 0.05s; }
    .social-fab-menu a:nth-child(5) { transition-delay: 0.00s; }
  </style>

  <div class="social-fab-container" id="socialFab">
    <div class="social-fab-menu">

    <!-- Boosty -->
      <a href="${socialLinks.boosty}" class="social-fab-item" aria-label="Boosty" title="Boosty" target="_blank">
        <svg viewBox="0 0 60 16" style="width: 28px; height: auto;">
          <text x="50%" y="13" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="800" font-size="14" fill="currentColor" letter-spacing="-0.5">boosty</text>
        </svg>
      </a>

      <!-- Ozon -->
      <a href="${socialLinks.ozon}" class="social-fab-item" aria-label="Ozon" title="Ozon" target="_blank">
        <svg viewBox="0 0 50 16" style="width: 26px; height: auto;">
          <path d="M6 2C2.7 2 0 4.7 0 8s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 9c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z M14 2h9v3l-5.5 6H23v3h-9v-3l5.5-6H14V2z M31 2c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 9c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z M39 2h2.5l4.5 7V2h2.5v12h-2.5l-4.5-7v7H39V2z" />
        </svg>
      </a>
      
      <!-- Instagram -->
      <a href="${socialLinks.instagram}" class="social-fab-item" aria-label="Instagram" title="Instagram" target="_blank">
        <svg viewBox="0 0 24 24">
          <path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85s.01-3.58.07-4.85C2.38 3.85 3.9 2.31 7.15 2.16 8.42 2.1 8.8 2.09 12 2.09zm0-2.09c-3.26 0-3.67.01-4.95.07C2.71.25.25 2.71.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.18 4.34 2.64 6.8 6.98 6.98 1.28.06 1.69.07 4.95.07s3.67-.01 4.95-.07c4.34-.18 6.8-2.64 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.18-4.34-2.64-6.8-6.98-6.98-1.28-.06-1.69-.07-4.95-.07zm0 5.84A6.16 6.16 0 1018.16 12 6.16 6.16 0 0012 5.84zm0 10.23A4.07 4.07 0 1116.07 12 4.07 4.07 0 0112 16.07zm5.8-11.45a1.44 1.44 0 10-2.88 0 1.44 1.44 0 002.88 0z"/>
        </svg>
      </a>

      <!-- Telegram -->
      <a href="${socialLinks.telegram}" class="social-fab-item" aria-label="Telegram" title="Telegram" target="_blank">
        <svg viewBox="0 0 24 24">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      </a>

      <!-- YouTube -->
      <a href="${socialLinks.youtube}" class="social-fab-item" aria-label="YouTube" title="YouTube" target="_blank">
        <svg viewBox="0 0 24 24">
          <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z"/>
        </svg>
      </a>

    </div>

    <button class="social-fab-toggle" id="socialFabToggle" aria-label="Toggle social menu">
      <svg viewBox="0 0 24 24">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
      </svg>
    </button>
  </div>
`;

document.body.insertAdjacentHTML('beforeend', fabTemplate);

const fabContainer = document.getElementById('socialFab');
const fabToggle = document.getElementById('socialFabToggle');

// Авто-открытие на ПК
if (window.innerWidth > 768) {
  fabContainer.classList.add('active');
}

fabToggle.addEventListener('click', (e) => {
  e.stopPropagation(); 
  fabContainer.classList.toggle('active');
});

document.addEventListener('click', (e) => {
  if (fabContainer.classList.contains('active') && !fabContainer.contains(e.target)) {
    fabContainer.classList.remove('active');
  }
});