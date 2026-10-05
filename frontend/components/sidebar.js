/**
 * GridPulz Sidebar Navigation - JavaScript Module
 * Handles hover/tap toggle, active states, navigation
 * 
 * Usage:
 *   1. Link this file: <script src="components/sidebar.js"></script>
 *   2. In your page: GridPulzSidebar.init();
 *   3. Optional: GridPulzSidebar.setActive('dashboard');
 */

const GridPulzSidebar = (() => {
  'use strict';

  // Configuration
  const config = {
    sidebarSelector: '#main-sidebar',
    navItemSelector: '.gp-sidebar__nav-item:not(.logout)',
    logoutSelector: '.gp-sidebar__nav-item.logout',
    expandedClass: 'expanded',
    activeClass: 'active',
    expandTimeout: 0.25, // seconds
  };

  // State
  let sidebar = null;
  let isExpanded = false;
  let isMobile = false;

  /**
   * Initialize sidebar interactions
   */
  function init() {
    sidebar = document.querySelector(config.sidebarSelector);
    
    if (!sidebar) {
      console.warn('GridPulzSidebar: Sidebar element not found');
      return false;
    }

    detectMobile();
    attachEventListeners();
    setActiveItemFromUrl();
    
    return true;
  }

  /**
   * Detect if device is mobile/tablet
   */
  function detectMobile() {
    isMobile = window.matchMedia('(max-width: 768px)').matches;
    // Sidebar starts collapsed on all screen sizes—JS hover handles desktop/tablet expand
  }

  /**
   * Attach all event listeners
   */
  function attachEventListeners() {
    if (isMobile) {
      attachMobileListeners();
    } else {
      attachDesktopListeners();
    }

    attachNavItemListeners();
    attachLogoutListener();
    
    // Re-detect on resize
    window.addEventListener('resize', () => {
      detectMobile();
    });
  }

  /**
   * Desktop + Tablet: Hover to expand/collapse
   */
  function attachDesktopListeners() {
    // All non-mobile: hover expand/collapse
    sidebar.addEventListener('mouseenter', expand);
    sidebar.addEventListener('mouseleave', collapse);
  }

  /**
   * Mobile: Tap to toggle open/close
   */
  function attachMobileListeners() {
    // Inject backdrop if not present
    if (!document.getElementById('gp-sidebar-backdrop')) {
      const backdrop = document.createElement('div');
      backdrop.id = 'gp-sidebar-backdrop';
      backdrop.className = 'gp-sidebar-backdrop';
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', () => collapse());
    }

    sidebar.addEventListener('click', (e) => {
      if (!isExpanded) {
        expand();
        e.stopPropagation();
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && isExpanded && isMobile) {
        collapse();
      }
    });
  }

  /**
   * Nav item click handlers
   */
  function attachNavItemListeners() {
    const navItems = sidebar.querySelectorAll(config.navItemSelector);
    
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Update active state
        setActive(item);

        // Navigate to page
        const page = item.dataset.page;
        if (page) {
          navigateToPage(page);
        }

        // Collapse on mobile after selection
        if (isMobile) {
          collapse();
        }
      });
    });
  }

  /**
   * Logout button handler
   */
  function attachLogoutListener() {
    const logoutBtn = sidebar.querySelector(config.logoutSelector);
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
    }
  }

  /**
   * Expand sidebar
   */
  function expand() {
    if (isExpanded) return;
    sidebar.classList.add(config.expandedClass);
    isExpanded = true;
    if (isMobile) document.body.classList.add('sidebar-open');
    dispatchEvent('gridpulz-sidebar-expand');
  }

  /**
   * Collapse sidebar
   */
  function collapse() {
    if (!isExpanded) return;
    sidebar.classList.remove(config.expandedClass);
    isExpanded = false;
    if (isMobile) document.body.classList.remove('sidebar-open');
    dispatchEvent('gridpulz-sidebar-collapse');
  }

  /**
   * Toggle expand/collapse
   */
  function toggle() {
    if (isExpanded) {
      collapse();
    } else {
      expand();
    }
  }

  /**
   * Set active nav item
   */
  function setActive(item) {
    const navItems = sidebar.querySelectorAll(config.navItemSelector);
    
    navItems.forEach(i => {
      if (i === item) {
        i.classList.add(config.activeClass);
      } else {
        i.classList.remove(config.activeClass);
      }
    });
  }

  /**
   * Set active item by page name
   */
  function setActiveByName(pageName) {
    const item = sidebar.querySelector(`[data-page="${pageName}"]`);
    if (item) {
      setActive(item);
    }
  }

  /**
   * Set active item from current URL
   */
  function setActiveItemFromUrl() {
    const pathname = window.location.pathname;
    const filename = pathname.split('/').pop().replace('.html', '');
    // Handle common aliases
    const aliasMap = {
      'charge-now': 'charge-now',
      'user-dashboard': 'user-dashboard',
      'operator-dashboard': 'operator-dashboard',
    };
    const pageName = aliasMap[filename] || filename;
    if (pageName) setActiveByName(pageName);
  }

  /**
   * Navigate to page
   */
  function navigateToPage(page) {
    // Check if page exists in data-page attributes to avoid broken links
    const fullUrl = `${page}.html`;
    window.location.href = fullUrl;
  }

  /**
   * Handle logout
   */
  function handleLogout() {
    console.log('Logout initiated');
    
    // Dispatch event for app to handle
    dispatchEvent('gridpulz-logout');

    // Default behavior: redirect to login
    // (You can override this by listening to 'gridpulz-logout' event)
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 100);
  }

  /**
   * Show alert badge on Alerts menu item
   */
  function showAlertBadge(show = true) {
    const badge = document.getElementById('alerts-badge');
    if (badge) {
      badge.style.display = show ? 'block' : 'none';
    }
  }

  /**
   * Get sidebar element
   */
  function getSidebar() {
    return sidebar;
  }

  /**
   * Get current expanded state
   */
  function isCurrentlyExpanded() {
    return isExpanded;
  }

  /**
   * Get current mobile state
   */
  function isMobileDevice() {
    return isMobile;
  }

  /**
   * Dispatch custom event
   */
  function dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(eventName, { detail });
    document.dispatchEvent(event);
  }

  /**
   * Cleanup (useful for SPAs)
   */
  function destroy() {
    if (sidebar) {
      sidebar.removeEventListener('mouseenter', expand);
      sidebar.removeEventListener('mouseleave', collapse);
      sidebar.removeEventListener('click', toggle);
    }
    sidebar = null;
  }

  /**
   * Public API
   */
  return {
    init,
    expand,
    collapse,
    toggle,
    setActive: setActiveByName,
    setActiveByName,
    showAlertBadge,
    getSidebar,
    isExpanded: isCurrentlyExpanded,
    isMobile: isMobileDevice,
    handleLogout,
    destroy,
  };
})();

// Auto-init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    GridPulzSidebar.init();
    _bindContentMargin();
  });
} else {
  GridPulzSidebar.init();
  _bindContentMargin();
}

/**
 * Sync main-content left margin with sidebar state (legacy support)
 * In overlay mode margin never changes, but kept for backward compat
 */
function _bindContentMargin() {
  // Overlay model: content margin never changes. No-op.
}

// Event listeners for custom events (example usage)
// document.addEventListener('gridpulz-sidebar-expand', () => {
//   console.log('Sidebar expanded');
// });

// document.addEventListener('gridpulz-logout', () => {
//   console.log('Logout event - implement your logic here');
// });
