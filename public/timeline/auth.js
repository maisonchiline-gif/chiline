// auth.js - Единый модуль авторизации, проверки API и управления правами доступа

const API_BASE_URL = 'https://api.yourdomain.com/v1'; // Замените на URL вашего сервера

// Гарантируем, что глобальный объект состояния существует
window.appState = window.appState || {};

// Инициализируем раздел пользователя в глобальном состоянии
window.appState.user = {
    isAuthenticated: false,
    token: localStorage.getItem('auth_token') || null,
    isPremium: false,
    data: null
};

/**
 * Проверка валидности токена и получение профиля при загрузке страницы
 */
async function checkApiAuth() {
    const token = window.appState.user.token;

    if (!token) {
        clearAuthState();
        return false;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Ошибка проверки токена: ${response.status}`);
        }

        const userData = await response.json();
        
        window.appState.user.isAuthenticated = true;
        window.appState.user.data = userData;
        window.appState.user.isPremium = Boolean(userData.isPremium || userData.role === 'premium');

        syncUIWithPermissions();
        return true;

    } catch (error) {
        console.warn('Авторизация не пройдена:', error.message);
        clearAuthState();
        return false;
    }
}

/**
 * Обработка входа по email и паролю
 */
async function handleLogin(email, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || 'Неверный email или пароль');
        }

        const { token, user } = await response.json();

        // Сохраняем сессию
        localStorage.setItem('auth_token', token);
        window.appState.user.token = token;
        window.appState.user.isAuthenticated = true;
        window.appState.user.data = user;
        window.appState.user.isPremium = Boolean(user?.isPremium || user?.role === 'premium');

        syncUIWithPermissions();
        return { success: true };

    } catch (error) {
        console.error('Ошибка входа:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Выход из аккаунта
 */
function handleLogout() {
    clearAuthState();
}

/**
 * Сброс состояния авторизации и локального хранилища
 */
function clearAuthState() {
    localStorage.removeItem('auth_token');
    window.appState.user.token = null;
    window.appState.user.isAuthenticated = false;
    window.appState.user.isPremium = false;
    window.appState.user.data = null;
    
    syncUIWithPermissions();
}

/**
 * Синхронизация интерфейса с правами пользователя
 * Ищет элементы с data-requires-premium="true" и включает/отключает их
 */
function syncUIWithPermissions() {
    const isPremium = window.appState.user.isPremium;
    const premiumControls = document.querySelectorAll('[data-requires-premium="true"]');

    premiumControls.forEach(el => {
        if (isPremium) {
            // Включаем элемент
            el.removeAttribute('disabled');
            el.classList.remove('disabled', 'is-disabled');
            
            // Если у элемента есть обертка (например, для тултипа) — восстанавливаем её интерактивность
            if (el.parentElement && el.parentElement.classList.contains('tooltip-wrapper')) {
                el.parentElement.style.pointerEvents = 'auto';
            }
        } else {
            // Отключаем элемент
            el.setAttribute('disabled', 'disabled');
            el.classList.add('disabled', 'is-disabled');
        }
    });

    // Пример обновления текста кнопки/бейджа профиля в шапке
    const userStatusBadge = document.getElementById('user-status-badge');
    if (userStatusBadge) {
        if (!window.appState.user.isAuthenticated) {
            userStatusBadge.textContent = 'Войти';
        } else {
            userStatusBadge.textContent = isPremium ? 'PRO' : 'FREE';
        }
    }
}

/**
 * Первичная инициализация (запускается при загрузке страницы)
 */
async function initAuth() {
    // 1. Проверяем сохраненный токен
    await checkApiAuth();

    // 2. Настраиваем слушатели для формы логина (замените ID на свои, если они другие)
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const errorContainer = document.getElementById('login-error');
            
            if (errorContainer) errorContainer.style.display = 'none';

            const result = await handleLogin(email, password);
            
            if (result.success) {
                // Очищаем форму и закрываем модалку
                loginForm.reset();
                const loginModal = document.getElementById('login-modal');
                if (loginModal) loginModal.style.display = 'none';
            } else {
                // Показываем ошибку
                if (errorContainer) {
                    errorContainer.textContent = result.error;
                    errorContainer.style.display = 'block';
                } else {
                    alert(result.error);
                }
            }
        });
    }

    // 3. Настраиваем кнопку выхода
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    }
}

// Запускаем скрипт после того, как DOM полностью загрузится
document.addEventListener('DOMContentLoaded', initAuth);

// Если в проекте используются ES-модули, раскомментируйте строку ниже:
// export { initAuth, checkApiAuth, handleLogin, handleLogout, syncUIWithPermissions };