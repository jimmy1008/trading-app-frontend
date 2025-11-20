const AUTH_KEY = "authUser";
const TOKEN_KEY = "token";
const DEFAULT_UID = "100001";

function readAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "{}");
  } catch {
    return {};
  }
}

export function getAuthUser() {
  return readAuthUser();
}

export function saveAuthUser(data) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(data));
}

export function ensureAuthenticated() {
  const token = localStorage.getItem(TOKEN_KEY);
  const data = readAuthUser();
  if (!token || !data.username || !data.email) {
    window.location.href = "login.html";
    return null;
  }
  if (data.uid !== DEFAULT_UID) {
    data.uid = DEFAULT_UID;
    saveAuthUser(data);
  }
  return data;
}

function renderUserBasics(user) {
  const name = user?.username || "user";
  const uid = user?.uid || DEFAULT_UID;
  const avatarSrc = user?.picture;

  const nameEl = document.getElementById("user-name");
  if (nameEl) nameEl.textContent = name;
  const uidEl = document.getElementById("user-uid");
  if (uidEl) uidEl.textContent = `UID : ${uid}`;

  const avatar = document.getElementById("user-avatar");
  if (avatar && avatarSrc) avatar.src = avatarSrc;

  const profileNick = document.getElementById("profile-nick");
  if (profileNick) profileNick.textContent = name;
  const profileUid = document.getElementById("profile-uid");
  if (profileUid) profileUid.textContent = uid;
  const profileAvatar = document.getElementById("profile-avatar");
  if (profileAvatar && avatarSrc) profileAvatar.src = avatarSrc;
}

function setupAvatarUpload() {
  const input = document.getElementById("avatar-input");
  if (!input) return;
  input.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const data = readAuthUser();
      data.picture = ev.target?.result;
      saveAuthUser(data);
      renderUserBasics(data);
    };
    reader.readAsDataURL(file);
  });
}

export function refreshUserDisplay() {
  renderUserBasics(readAuthUser());
}

export function initUserBasics() {
  const user = ensureAuthenticated();
  if (!user) return null;
  renderUserBasics(user);
  setupAvatarUpload();
  return user;
}


export function logout() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = "login.html";
}


