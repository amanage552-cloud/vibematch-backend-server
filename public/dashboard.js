// Minimal interactivity for the dashboard: placeholder handlers
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.brand, .glow-hover').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
    });
  });
});
