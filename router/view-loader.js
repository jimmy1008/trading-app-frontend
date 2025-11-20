export async function loadView(name) {
  try {
    const response = await fetch('./pages/' + name + '.html');
    if (!response.ok) throw new Error('無法載入頁面');

    const html = await response.text();
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = html;
  } catch (error) {
    console.error('[view-loader]', error);
  }
}

