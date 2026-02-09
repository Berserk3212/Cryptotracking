document.addEventListener('DOMContentLoaded', () => {
  const btnLogout = document.getElementById('btnLogout');
  if (!btnLogout) return;

  btnLogout.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Ошибка выхода:", error);
      alert("Ошибка при выходе");
    } else {
      console.log("Выход успешен");
      localStorage.removeItem('rememberMe');
      localStorage.removeItem('userEmail');
      location.href = 'login.html';
    }
  });
});