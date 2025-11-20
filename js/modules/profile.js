import { getAuthUser, saveAuthUser, refreshUserDisplay, logout } from './user.js';
import { onExchangeUpdate } from './exchanges.js';
import { showModal, hideModal } from '../components/modal.js';

export function initProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;

  const openTargets = [
    document.getElementById('user-avatar'),
    document.getElementById('user-name'),
    document.getElementById('user-uid'),
    document.getElementById('avatar-box')
  ];
  openTargets.forEach(el => el?.addEventListener('click', () => showModal(modal)));
  document.getElementById('profile-close')?.addEventListener('click', () => hideModal(modal));
  modal.addEventListener('click', e => {
    if (e.target === modal) hideModal(modal);
  });

  const avatarBox = document.getElementById('profile-avatar-box');
  const avatarInput = document.getElementById('avatar-input');
  avatarBox?.addEventListener('click', () => avatarInput?.click());

  const nicknameInput = document.getElementById('profile-name-input');
  const nicknameDisplay = document.getElementById('profile-nick');
  const editBtn = document.getElementById('profile-edit');
  let editing = false;

  function toggleNicknameInput(show) {
    if (!nicknameInput || !nicknameDisplay || !editBtn) return;
    if (show) {
      nicknameInput.value = getAuthUser().username || '';
      nicknameInput.classList.remove('hidden');
      nicknameDisplay.classList.add('hidden');
      nicknameInput.focus();
      editBtn.textContent = '儲存';
      editing = true;
    } else {
      nicknameInput.classList.add('hidden');
      nicknameDisplay.classList.remove('hidden');
      editBtn.textContent = '編輯暱稱';
      editing = false;
    }
  }

  function saveNickname() {
    if (!nicknameInput) return;
    const value = nicknameInput.value.trim();
    if (!value) return;
    const data = getAuthUser();
    data.username = value;
    saveAuthUser(data);
    refreshUserDisplay();
    toggleNicknameInput(false);
  }

  editBtn?.addEventListener('click', () => {
    if (!editing) {
      toggleNicknameInput(true);
    } else {
      saveNickname();
    }
  });

  nicknameInput?.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      saveNickname();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      toggleNicknameInput(false);
    }
  });
  nicknameInput?.addEventListener('blur', () => {
    if (editing) saveNickname();
  });

  document.getElementById('profile-logout')?.addEventListener('click', () => {
    if (confirm('確定要登出嗎？')) {
      logout();
    }
  });

  function bindAccount(buttonId, statusId, accountId, label, url) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.addEventListener('click', () => {
      const statusEl = document.getElementById(statusId);
      const accountEl = document.getElementById(accountId);
      statusEl?.classList.remove('hidden');
      if (accountEl) accountEl.textContent = label;
      if (url) window.open(url, '_blank');
    });
  }

  bindAccount('profile-tg', 'profile-tg-status', 'profile-tg-account', 'telegram_user', 'https://t.me');
  bindAccount('profile-google', 'profile-google-status', 'profile-google-account', 'google@example.com', 'https://accounts.google.com');

  const exList = document.getElementById('profile-exchanges');
  onExchangeUpdate(data => {
    if (!exList) return;
    const ids = Object.keys(data);
    if (!ids.length) {
      exList.innerHTML = '<div class="text-sm text-gray-400">尚未連接交易所</div>';
      return;
    }
    exList.innerHTML = '';
    ids.forEach(id => {
      const snapshot = data[id] || {};
      const exchangeInfo = snapshot.meta || { name: id };
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 text-sm';
      const logo = exchangeInfo.logo || `./assets/img/${id}.png`;
      row.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="w-5 h-5 rounded-full overflow-hidden bg-white/60 border border-gray-200 flex items-center justify-center">
            <img src="${logo}" alt="${exchangeInfo.name}" class="w-4 h-4 object-cover" />
          </div>
          <span>${exchangeInfo.name}</span>
        </div>
        <span class="w-2.5 h-2.5 rounded-full bg-green-500"></span>`;
      exList.appendChild(row);
    });
  });
}
