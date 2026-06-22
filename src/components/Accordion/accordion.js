export function initAccordion() {
  document.addEventListener('click', e => {
    const trigger = e.target.closest('.trigger');
    if (!trigger) return;
    
    const currentRow = trigger.parentNode;
    
    // Закрываем все остальные открытые строки
    [...currentRow.parentNode.children].forEach(row => {
      if (row !== currentRow) row.classList.remove('is-open');
    });
    
    // Переключаем текущую строку
    currentRow.classList.toggle('is-open');
  });
}