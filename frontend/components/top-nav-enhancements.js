(function () {
  'use strict';

  function focusable(container) {
    return Array.prototype.slice.call(
      container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    );
  }

  function setupKeyboardMenu(trigger, panel) {
    if (!trigger || !panel) return;

    trigger.removeAttribute('onclick');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');

    function openPanel() {
      panel.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      var items = focusable(panel);
      if (items.length) items[0].focus();
    }

    function closePanel() {
      panel.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      panel.classList.contains('open') ? closePanel() : openPanel();
    });

    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        panel.classList.contains('open') ? closePanel() : openPanel();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        openPanel();
      }
    });

    panel.addEventListener('keydown', function (e) {
      var items = focusable(panel);
      var index = items.indexOf(document.activeElement);

      if (e.key === 'Escape') {
        e.preventDefault();
        closePanel();
        trigger.focus();
        return;
      }

      if (e.key === 'ArrowDown' && items.length) {
        e.preventDefault();
        items[(index + 1 + items.length) % items.length].focus();
      }

      if (e.key === 'ArrowUp' && items.length) {
        e.preventDefault();
        items[(index - 1 + items.length) % items.length].focus();
      }
    });

    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && !trigger.contains(e.target)) {
        closePanel();
      }
    });

    // Keep backward compatibility with existing inline onclick handler.
    window.toggleProfileDropdown = function () {
      panel.classList.toggle('open');
      trigger.setAttribute('aria-expanded', panel.classList.contains('open') ? 'true' : 'false');
    };
  }

  function initEnhancements() {
    var userPages = {
      'user-dashboard.html': true,
      'charge-now.html': true,
      'prebook.html': true,
      'station-map.html': true,
      'my-bookings.html': true,
      'settings.html': true
    };
    var currentPage = window.location.pathname.split('/').pop() || '';
    var isUserPage = !!userPages[currentPage];

    var topNav = document.getElementById('top-nav');
    if (!topNav) {
      var firstFlexBlock = document.querySelector('body > .flex.min-h-screen');
      if (!firstFlexBlock) return;
      topNav = document.createElement('header');
      topNav.id = 'top-nav';
      topNav.innerHTML = '' +
        '<div class="nav-brand">' +
        '  <img src="assets/gridpulz_logo.png" alt="GridPulz" class="nav-logo">' +
        '  <span class="brand-name">GridPulz</span>' +
        '</div>' +
        '<div class="profile-wrapper">' +
        '  <div class="nav-profile" id="profileTrigger">' +
        '    <img src="assets/user.png" alt="Profile" class="avatar">' +
        '  </div>' +
        '  <div class="profile-dropdown" id="profileDropdown"></div>' +
        '</div>';
      firstFlexBlock.parentNode.insertBefore(topNav, firstFlexBlock);
    }

    topNav.classList.add('gp-nav-enhanced');

    var navBrand = topNav.querySelector('.nav-brand');
    var profileWrap = topNav.querySelector('.profile-wrapper, .profile-wrap');
    var trigger = document.getElementById('profileTrigger');
    var dropdown = document.getElementById('profileDropdown');

    if (!navBrand || !profileWrap || !trigger || !dropdown) return;

    var existingName = dropdown.querySelector('.dd-name');
    var existingEmail = dropdown.querySelector('.dd-email');
    var avatarSrc = (trigger.querySelector('img') && trigger.querySelector('img').getAttribute('src')) || 'assets/user.png';

    var center = document.createElement('div');
    center.className = 'gp-nav-center';
    var searchPlaceholder = isUserPage
      ? 'Search stations, slots, bookings, routes'
      : 'Search stations, bookings, alerts, operators';
    center.innerHTML = '' +
      '<div class="gp-search-wrap">' +
      '  <input class="gp-search-input" id="gpTopSearch" type="search" placeholder="' + searchPlaceholder + '" aria-label="Global search" />' +
      '</div>';

    var right = document.createElement('div');
    right.className = 'gp-nav-right';
    var criticalText = isUserPage
      ? 'Nearby Slot available at 6:30 PM.'
      : 'Node 04 nearing overload threshold.';
    var warningText = isUserPage
      ? 'Price will reduce after 10:00 PM.'
      : 'Scheduler moved 2 sessions to off-peak.';
    var infoText = isUserPage
      ? 'Your booking is confirmed for tomorrow.'
      : 'Data sync healthy in all regions.';

    right.innerHTML = '' +
      '<div class="gp-status-pills" aria-label="Live status indicators">' +
      '  <span class="gp-pill ok"><span class="gp-pill-dot"></span>Grid Stable</span>' +
      '</div>' +
      '<div class="gp-notify-wrap">' +
      '  <button class="gp-icon-btn" id="gpNotifyBtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Open notifications">&#128276;<span class="gp-notify-count">3</span></button>' +
      '  <div class="gp-pop" id="gpNotifyPop" role="menu">' +
      '    <p class="gp-pop-title">Notifications</p>' +
      '    <div class="gp-notify-group">' +
      '      <p class="gp-notify-label">Critical</p>' +
      '      <div class="gp-notify-item critical"><p>' + criticalText + '</p><small>2 min ago</small></div>' +
      '    </div>' +
      '    <div class="gp-notify-group">' +
      '      <p class="gp-notify-label">Warnings</p>' +
      '      <div class="gp-notify-item"><p>' + warningText + '</p><small>8 min ago</small></div>' +
      '    </div>' +
      '    <div class="gp-notify-group">' +
      '      <p class="gp-notify-label">Info</p>' +
      '      <div class="gp-notify-item"><p>' + infoText + '</p><small>14 min ago</small></div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    topNav.insertBefore(center, profileWrap);
    topNav.insertBefore(right, profileWrap);

    var searchInput = document.getElementById('gpTopSearch');
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var query = searchInput.value.trim().toLowerCase();
          if (query.includes('alert')) window.location.href = 'alerts.html';
          else if (query.includes('system')) window.location.href = 'systems.html';
          else if (query.includes('schedule')) window.location.href = 'scheduler.html';
          else if (query.includes('operator')) window.location.href = 'operator-dashboard.html';
          else if (query.includes('dashboard') || query.includes('station')) window.location.href = 'dashboard.html';
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searchInput) searchInput.focus();
      }
    });

    var roleText = isUserPage
      ? 'EV Driver'
      : (window.location.pathname.indexOf('operator-dashboard') !== -1 ? 'Operator' : 'Station Operator');
    dropdown.innerHTML = '' +
      '<div class="gp-profile-card">' +
      '  <div class="dropdown-header">' +
      '    <img src="' + avatarSrc + '" alt="Profile" class="avatar-lg">' +
      '    <div>' +
      '      <p class="dd-name">' + ((existingName && existingName.textContent) || (isUserPage ? 'EV Driver' : 'Station Operator')) + '</p>' +
      '      <p class="dd-email">' + ((existingEmail && existingEmail.textContent) || (isUserPage ? 'driver@gridpulz.app' : 'ops@gridpulz.app')) + '</p>' +
      '      <span class="gp-profile-role">' + roleText + '</span>' +
      '      <p class="gp-profile-status">' + (isUserPage ? 'Charging profile active' : 'Realtime connected') + '</p>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    setupKeyboardMenu(trigger, dropdown);

    var notifyBtn = document.getElementById('gpNotifyBtn');
    var notifyPop = document.getElementById('gpNotifyPop');
    if (notifyBtn && notifyPop) {
      notifyBtn.addEventListener('click', function () {
        var open = notifyPop.classList.toggle('open');
        notifyBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      notifyBtn.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          notifyPop.classList.remove('open');
          notifyBtn.setAttribute('aria-expanded', 'false');
        }
      });

      document.addEventListener('click', function (e) {
        if (!notifyPop.contains(e.target) && !notifyBtn.contains(e.target)) {
          notifyPop.classList.remove('open');
          notifyBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    function updateScrollState() {
      if (window.scrollY > 24) topNav.classList.add('scrolled');
      else topNav.classList.remove('scrolled');
    }

    updateScrollState();
    window.addEventListener('scroll', updateScrollState, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnhancements);
  } else {
    initEnhancements();
  }
})();
