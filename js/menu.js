// js/menu.js

document.addEventListener('DOMContentLoaded', () => {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const navPanel = document.getElementById('navPanel');
    const overlay = document.getElementById('overlay');
    const body = document.body;
    const navLinks = document.querySelectorAll('.nav-link');

    function toggleMenu() {
        body.classList.toggle('menu-open');
        const isExpanded = hamburgerBtn.getAttribute('aria-expanded') === 'true' || false;
        hamburgerBtn.setAttribute('aria-expanded', !isExpanded);
        navPanel.setAttribute('aria-hidden', String(isExpanded));
    }

    if (hamburgerBtn && navPanel && overlay && body) {
        hamburgerBtn.addEventListener('click', toggleMenu);
        overlay.addEventListener('click', () => {
            if (body.classList.contains('menu-open')) {
                toggleMenu();
            }
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // If the menu is open, and a link is clicked,
            // we can assume the user intends to navigate or act.
            // The browser will handle navigation for full page links.
            // Closing the menu here is good practice for visual feedback and ARIA state.
            if (body.classList.contains('menu-open')) {
                toggleMenu();
            }
            // No need to preventDefault() as we want the default link behavior (navigation)
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && body.classList.contains('menu-open')) {
            toggleMenu();
        }
    });
});