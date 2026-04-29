# GridPulz Sidebar Navigation - Implementation Guide

## Quick Start

### Step 1: Link CSS
Add this to the `<head>` of every page that needs the sidebar:
```html
<link rel="stylesheet" href="components/sidebar.css">
```

### Step 2: Add Sidebar HTML
Copy the appropriate sidebar variant HTML into your page BEFORE the main content container.

**For user dashboard pages** (dashboard.html, charge-now.html, prebook.html, etc.):
- Use VARIANT A from `sidebar-component.html`
- Menu items: Dashboard, Charge Now, Prebook, Station Map, My Bookings, Settings

**For operator pages** (operator-dashboard.html, alerts.html, systems.html, etc.):
- Use VARIANT B from `sidebar-component.html`
- Menu items: Dashboard, Operator, Scheduler, Alerts, Systems, Analytics

### Step 3: Add JavaScript
Copy the script block from `sidebar-component.html` to your page (or create `sidebar.js`).

### Step 4: Layout Adjustment
Adjust your main content container to account for the sidebar (it starts at 68px width):
```html
<body>
  <!-- Sidebar -->
  <aside class="gp-sidebar" id="main-sidebar">
    <!-- ... -->
  </aside>
  
  <!-- Main content shifted right -->
  <main style="margin-left: 68px;">
    <!-- Your page content -->
  </main>
</body>
```

The sidebar overlays on mobile, so no margin adjustment needed for responsive.

---

## Integration Examples

### Example 1: User Dashboard (dashboard.html)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Dashboard - GridPulz</title>
  <link rel="stylesheet" href="components/sidebar.css">
  <!-- other stylesheets -->
</head>
<body>
  <!-- Sidebar -->
  <aside class="gp-sidebar" id="main-sidebar">
    <!-- Copy from sidebar-component.html VARIANT A -->
  </aside>

  <!-- Main content -->
  <main style="margin-left: 68px; transition: margin 0.25s;">
    <h1>Dashboard</h1>
    <!-- Your dashboard content -->
  </main>

  <script>
    // Initialize sidebar
    function initGridPulzSidebar() {
      const sidebar = document.getElementById('main-sidebar');
      
      sidebar.addEventListener('mouseenter', () => {
        sidebar.classList.add('expanded');
        document.querySelector('main').style.marginLeft = '220px';
      });

      sidebar.addEventListener('mouseleave', () => {
        sidebar.classList.remove('expanded');
        document.querySelector('main').style.marginLeft = '68px';
      });

      // Mobile tap toggle
      sidebar.addEventListener('click', (e) => {
        if (e.target === sidebar || e.target.closest('.gp-sidebar__nav') === sidebar.querySelector('.gp-sidebar__nav')) {
          sidebar.classList.toggle('expanded');
        }
      });

      // Nav item clicks
      const navItems = sidebar.querySelectorAll('.gp-sidebar__nav-item:not(.logout)');
      navItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          navItems.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          // Navigate to page
          const page = item.dataset.page;
          if (page) window.location.href = `${page}.html`;
        });
      });

      // Set active item on page load
      const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
      const activeItem = sidebar.querySelector(`[data-page="${currentPage}"]`);
      if (activeItem) activeItem.classList.add('active');
    }

    document.addEventListener('DOMContentLoaded', initGridPulzSidebar);
  </script>
</body>
</html>
```

### Example 2: Operator Dashboard (operator-dashboard.html)

```html
<!DOCTYPE html>
<html>
<head>
  <title>Operator - GridPulz</title>
  <link rel="stylesheet" href="components/sidebar.css">
</head>
<body>
  <!-- Sidebar VARIANT B -->
  <aside class="gp-sidebar" id="main-sidebar">
    <!-- Copy from sidebar-component.html VARIANT B -->
  </aside>

  <main style="margin-left: 68px;">
    <h1>Operator Control Center</h1>
    <!-- Your operator content -->
  </main>

  <script src="components/sidebar-init.js"></script>
  <script>
    // On page load, show alert badge if there are unread alerts
    document.addEventListener('DOMContentLoaded', () => {
      initGridPulzSidebar();
      
      // Example: Check for unread alerts
      const unreadCount = 3; // fetch this from your API
      if (unreadCount > 0) {
        showAlertBadge(unreadCount);
      }
    });
  </script>
</body>
</html>
```

---

## Customization

### Change Active Item Programmatically
```javascript
function setActiveSidebarItem(pageName) {
  const sidebar = document.getElementById('main-sidebar');
  const items = sidebar.querySelectorAll('.gp-sidebar__nav-item:not(.logout)');
  items.forEach(item => {
    if (item.dataset.page === pageName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// Usage:
setActiveSidebarItem('dashboard');
```

### Show/Hide Alert Badge
```javascript
function showAlertBadge(show = true) {
  const badge = document.getElementById('alerts-badge');
  if (badge) {
    badge.style.display = show ? 'block' : 'none';
  }
}

// Usage:
showAlertBadge(true); // Show badge
showAlertBadge(false); // Hide badge
```

### Custom Logout Handler
```javascript
function handleLogout() {
  // Clear session
  localStorage.removeItem('session');
  
  // Sign out from Supabase
  window.supabaseClient.auth.signOut().then(() => {
    window.location.href = 'login.html';
  });
}
```

### Adjust Colors
Edit `components/sidebar.css` root variables:
```css
:root {
  --gp-accent: #CCFF00;        /* Neon green - change here */
  --gp-bg: #0A0A0F;            /* Dark background */
  --gp-surface: #131313;       /* Card/panel surface */
  --gp-alert: #FF4444;         /* Red for alerts */
}
```

### Change Width
```css
.gp-sidebar {
  width: 68px; /* Collapsed width - adjust if needed */
}

.gp-sidebar.expanded {
  width: 220px; /* Expanded width - adjust if needed */
}
```

### Disable Hover Expand (Mobile Only)
For mobile-only collapsible (no hover), update CSS:
```css
@media (hover: none) and (pointer: coarse) {
  .gp-sidebar {
    width: 68px;
  }
  
  .gp-sidebar:not(.expanded) {
    width: 68px;
  }
}
```

---

## Menu Items Reference

### User Dashboard (VARIANT A)
| Icon | Label | Page | Section |
|------|-------|------|---------|
| 🏠 | Dashboard | dashboard.html | Main |
| ⚡ | Charge Now | charge-now.html | Main |
| 📅 | Prebook | prebook.html | Main |
| 📍 | Station Map | station-map.html | Main |
| 📋 | My Bookings | my-bookings.html | Config |
| ⚙️ | Settings | settings.html | Config |
| 🚪 | Logout | - | Bottom |

### Operator Dashboard (VARIANT B)
| Icon | Label | Page | Section |
|------|-------|------|---------|
| 📊 | Dashboard | dashboard.html | Control |
| ✅ | Operator | operator-dashboard.html | Control |
| 🕐 | Scheduler | scheduler.html | Control |
| 🔔 | Alerts | alerts.html | Control |
| 🖥️ | Systems | systems.html | Infrastructure |
| 📈 | Analytics | analytics.html | Infrastructure |
| 🚪 | Logout | - | Bottom |

---

## Responsive Behavior

### Desktop (> 1024px)
- Sidebar fixed left side, 68px wide (collapsed)
- On hover: expands to 220px, overlays content slightly
- Content margin: 68px (or adjust to 0 if sidebar overlays)

### Tablet/Mobile (≤ 1024px)
- Sidebar initially hidden (off-screen, -220px from left)
- Click/tap sidebar area to toggle open/closed
- When expanded: overlays full width, 220px
- Backdrop shadow added on expand
- Content below sidebar (no margin needed)

---

## Accessibility Features

✅ Semantic HTML (`<button>`, `<nav>`, `<aside>`)
✅ Proper ARIA labels (add if needed)
✅ Keyboard navigation ready (buttons are focusable)
✅ High contrast neon green on dark background
✅ Icons + text labels for clarity

---

## Testing Checklist

- [ ] CSS file linked correctly
- [ ] HTML structure copied properly
- [ ] JavaScript initialization runs on page load
- [ ] Hover expands sidebar on desktop
- [ ] Tap toggles sidebar on mobile
- [ ] Active item highlights correctly
- [ ] Navigation links work (data-page attributes)
- [ ] Logout button functional
- [ ] Alert badge shows/hides correctly
- [ ] Responsive breakpoint works (1024px)
- [ ] Icons render (SVGs load)
- [ ] Font applies (Michroma loads from Google)
- [ ] Colors match design (#CCFF00, #0A0A0F)
- [ ] Scanline effect visible (subtle)
- [ ] No console errors

---

## Browser Support

✅ Chrome/Edge (90+)
✅ Firefox (88+)
✅ Safari (14+)
✅ Mobile Safari (iOS 14+)
✅ Chrome Mobile (Android)

---

## File Structure

```
frontend/
├── components/
│   ├── sidebar.css              ← Main stylesheet
│   ├── sidebar-component.html   ← Reusable HTML snippets
│   └── sidebar-init.js          ← Optional: shared JS logic
├── sidebar-demo.html            ← Demo page (all 4 variants)
├── dashboard.html               ← Update with Variant A sidebar
├── operator-dashboard.html      ← Update with Variant B sidebar
├── alerts.html                  ← Update with Variant B sidebar
└── ... (other pages)
```

---

## Troubleshooting

**Sidebar not appearing?**
- Check CSS link is correct
- Verify HTML structure matches
- Open DevTools → inspect `.gp-sidebar` element

**Hover not working?**
- Check JavaScript is loaded
- Verify `mouseenter` / `mouseleave` listeners attached
- Test on desktop only (mobile uses tap)

**Colors wrong?**
- Check `:root` variables in sidebar.css
- Verify no conflicting CSS overrides
- Clear browser cache

**Icons missing?**
- Verify SVG paths are correct
- Check viewBox attributes
- Test SVG renders directly in browser

**Mobile tap not working?**
- Ensure JavaScript click handler attached
- Test with actual touch device (not desktop emulation)
- Verify `e.stopPropagation()` calls prevent bubbling

---

## Support & Next Steps

1. **View the demo**: Open `sidebar-demo.html` in browser to see all variants
2. **Copy & adapt**: Use `sidebar-component.html` snippets for your pages
3. **Customize colors**: Edit `:root` variables in `sidebar.css`
4. **Integrate auth**: Hook logout button to your actual logout flow
5. **Add animations**: Extend with custom transitions as needed

---

## Version Info

- **Component**: GridPulz Collapsible Sidebar v1.0
- **Date**: April 2026
- **Compatibility**: All modern browsers
- **Stack**: Vanilla HTML/CSS/JS (no frameworks)
- **Theme**: Dark mode with #CCFF00 neon accent
- **Responsive**: Mobile, tablet, desktop
