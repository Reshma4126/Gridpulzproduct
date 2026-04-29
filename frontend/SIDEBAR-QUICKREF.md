<!-- GridPulz Sidebar - Quick Reference Card -->

# 🔌 GridPulz Sidebar Navigation - Quick Reference

## Files Created

| File | Purpose |
|------|---------|
| `components/sidebar.css` | Complete styling & animations |
| `components/sidebar.js` | Vanilla JS for interactions |
| `components/sidebar-component.html` | Reusable HTML snippets |
| `sidebar-demo.html` | Live demo (all 4 variants) |
| `SIDEBAR-INTEGRATION.md` | Full implementation guide |

---

## 30-Second Setup

```html
<!-- 1. Link CSS -->
<link rel="stylesheet" href="components/sidebar.css">

<!-- 2. Add sidebar HTML (copy from sidebar-component.html) -->
<aside class="gp-sidebar" id="main-sidebar">
  <!-- ... -->
</aside>

<!-- 3. Link JS -->
<script src="components/sidebar.js"></script>
```

That's it! JavaScript auto-initializes on page load.

---

## Design Specifications

| Property | Value |
|----------|-------|
| **Theme** | Dark mode |
| **Primary Accent** | #CCFF00 (neon lime green) |
| **Background** | #0A0A0F (near-black) |
| **Surface** | #131313 |
| **Font** | Michroma (monospace) |
| **Collapsed Width** | 68px |
| **Expanded Width** | 220px |
| **Transition Duration** | 0.25s cubic-bezier |
| **Border Radius** | 3-6px |
| **Icon Size** | 16px |

---

## Behavior

### Desktop (> 1024px)
- **Default**: Collapsed (68px)
- **Hover**: Expands (220px)
- **Interaction**: Smooth hover animation
- **Content**: May shift or be overlaid

### Mobile/Tablet (≤ 1024px)
- **Default**: Hidden (off-screen)
- **Tap**: Toggles open/close
- **Interaction**: Overlay mode
- **Content**: Behind sidebar when expanded

---

## Color Palette

```
Primary:      #CCFF00  (Neon Green - accent)
Background:   #0A0A0F  (Near Black)
Surface:      #131313  (Dark surface)
Text:         #FFFFFF  (White)
Text Muted:   #888888  (Gray)
Alert:        #FF4444  (Red)
Border:       #2a2a2a  (Dark gray)
```

---

## Two Variants

### VARIANT A: User Dashboard
```
Main
├─ Dashboard (active)
├─ Charge Now
├─ Prebook
└─ Station Map

Config
├─ My Bookings
└─ Settings

Logout (pinned bottom)
```

### VARIANT B: Operator Dashboard
```
Control
├─ Dashboard (active)
├─ Operator
├─ Scheduler
└─ Alerts (with badge)

Infrastructure
├─ Systems
└─ Analytics

Logout (pinned bottom)
```

---

## JavaScript API

### Auto-init (no code needed)
```javascript
// Runs automatically on page load
GridPulzSidebar.init();
```

### Manual control
```javascript
GridPulzSidebar.expand();              // Expand sidebar
GridPulzSidebar.collapse();            // Collapse sidebar
GridPulzSidebar.toggle();              // Toggle state
GridPulzSidebar.setActive('dashboard'); // Set active item
GridPulzSidebar.showAlertBadge(true);  // Show badge
GridPulzSidebar.isExpanded();          // Check state
GridPulzSidebar.isMobile();            // Check device type
```

### Custom events
```javascript
// Listen for sidebar events
document.addEventListener('gridpulz-sidebar-expand', () => {
  console.log('Sidebar expanded');
});

document.addEventListener('gridpulz-logout', () => {
  // Handle logout
  window.location.href = 'login.html';
});
```

---

## Integration Checklist

- [ ] Copy `sidebar.css` to `frontend/components/`
- [ ] Copy `sidebar.js` to `frontend/components/`
- [ ] Add CSS link to page `<head>`
- [ ] Copy sidebar HTML to page
- [ ] Link sidebar.js before closing `</body>`
- [ ] Test hover on desktop
- [ ] Test tap on mobile
- [ ] Verify navigation links work
- [ ] Update logout handler
- [ ] Check active state highlights

---

## Common Tasks

### Show Alert Badge
```javascript
// Show red dot on Alerts menu
GridPulzSidebar.showAlertBadge(true);

// Hide it
GridPulzSidebar.showAlertBadge(false);
```

### Set Active Item
```javascript
// Highlight a menu item
GridPulzSidebar.setActive('dashboard');
GridPulzSidebar.setActive('alerts');
GridPulzSidebar.setActive('settings');
```

### Handle Logout
```javascript
function handleLogout() {
  // Your logout logic
  supabaseClient.auth.signOut().then(() => {
    window.location.href = 'login.html';
  });
}
```

### Change Colors
Edit `sidebar.css`:
```css
:root {
  --gp-accent: #CCFF00;        /* Neon green */
  --gp-bg: #0A0A0F;            /* Background */
  --gp-surface: #131313;       /* Surfaces */
  --gp-alert: #FF4444;         /* Alerts */
}
```

---

## Responsive Breakpoints

```
Desktop:    > 1024px   → Hover expand
Tablet:     768px–1024px → Tap toggle
Mobile:     < 768px    → Tap toggle (overlays)
```

---

## Browser Support

✅ Chrome 90+
✅ Firefox 88+
✅ Safari 14+
✅ Edge 90+
✅ Mobile browsers (iOS, Android)

---

## Performance

- **CSS size**: ~8KB (minified)
- **JS size**: ~4KB (minified)
- **Transitions**: GPU accelerated
- **No dependencies**: Pure vanilla

---

## Demo

View all variants live:
```
Open: frontend/sidebar-demo.html in browser
```

Shows:
- Variant A (User) - Collapsed & Expanded
- Variant B (Operator) - Collapsed & Expanded
- Mock dashboard content
- Integration examples

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Sidebar not showing | Check CSS link path |
| Hover not working | Verify JS is loaded (DevTools console) |
| Colors wrong | Clear browser cache |
| Icons missing | Check SVG viewBox attributes |
| Mobile tap not working | Test on actual device (not emulation) |
| Active state not updating | Verify `data-page` attributes match URLs |

---

## CSS Classes Reference

```
.gp-sidebar                    ← Main container
.gp-sidebar.expanded           ← Expanded state
.gp-sidebar__logo-zone         ← Logo area
.gp-sidebar__logo-mark         ← Icon box
.gp-sidebar__brand             ← "GridPulz" text
.gp-sidebar__nav               ← Nav container
.gp-sidebar__sec-label         ← Section heading
.gp-sidebar__nav-item          ← Menu button
.gp-sidebar__nav-item.active   ← Active item
.gp-sidebar__nav-item.logout   ← Logout button
.gp-sidebar__nav-icon          ← Icon element
.gp-sidebar__nav-label         ← Menu label text
.gp-sidebar__badge             ← Alert badge dot
.gp-sidebar__separator         ← Divider line
.gp-sidebar__logout-zone       ← Logout section
```

---

## Next Steps

1. **View the demo**: `sidebar-demo.html`
2. **Read full guide**: `SIDEBAR-INTEGRATION.md`
3. **Copy HTML**: From `sidebar-component.html`
4. **Integrate JS**: Use `sidebar.js`
5. **Customize**: Update colors, links, logout handler
6. **Test**: Desktop hover + mobile tap
7. **Deploy**: Push to production

---

## Support

For issues or customization:
1. Check `SIDEBAR-INTEGRATION.md` for detailed guide
2. Review demo page `sidebar-demo.html`
3. Open DevTools to inspect elements
4. Verify file paths and CSS imports

---

**Version**: 1.0 | **Date**: April 2026 | **Stack**: Vanilla HTML/CSS/JS
