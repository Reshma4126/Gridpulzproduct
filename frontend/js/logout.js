(function () {
  async function handleLogout() {
    try {
      if (window.supabaseClient && window.supabaseClient.auth) {
        await window.supabaseClient.auth.signOut();
      }
    } catch (error) {
      console.warn('Sign out failed, continuing local logout:', error);
    } finally {
      localStorage.removeItem('gridpulz_operator_email');
      sessionStorage.removeItem('isAuthenticated');
      sessionStorage.removeItem('userRole');
      sessionStorage.removeItem('userEmail');
      window.location.href = 'login.html';
    }
  }

  window.handleLogout = handleLogout;
})();
