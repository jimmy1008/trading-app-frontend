import { loadView } from '../router/view-loader.js';
import { initUserBasics } from './modules/user.js';
import { initProfileModal } from './modules/profile.js';
import { initExchangeControls, refreshBalances } from './modules/exchanges.js';

window.__appRouter = { loadView };
window.__appServices = window.__appServices || {};
window.__appServices.refreshBalances = refreshBalances;

document.addEventListener('DOMContentLoaded', () => {
  const user = initUserBasics();
  if (!user) return;
  initProfileModal();
  initExchangeControls();
});
