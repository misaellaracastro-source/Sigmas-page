const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
const hamburger = document.querySelector('.topbar-hamburger');

function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

hamburger.addEventListener('click', () => {
    if (window.innerWidth > 860) return; // sidebar always visible on desktop
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

overlay.addEventListener('click', closeSidebar);

    // Close sidebar on nav item click (mobile)
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function () {
        if (this.classList.contains('logout')) return;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');
        if (window.innerWidth <= 860) closeSidebar();
    });
});

    // Close on resize back to desktop
window.addEventListener('resize', () => {
    if (window.innerWidth > 860) closeSidebar();
});