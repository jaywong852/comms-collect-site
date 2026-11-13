import { loginAccount, logout, setupAccount } from './auth.js';

function showMsg(el, type, text) {
  if (!el) return;
  el.className = `msg show ${type}`;
  el.textContent = text || '';
}

export function mountAuth(root, options) {
  if (!root) return;
  const opts = options || {};
  const setupIntro = opts.setupIntro || '第一次用請先設定後台帳號（電郵同密碼）。之後要改活動、排序、刪除或者匯出 Word，都要登入。';
  const loginIntro = opts.loginIntro || '請用後台電郵同密碼登入，先至可以整理活動或匯出文件。';
  let configuredNow = !!opts.configured;

  root.innerHTML =
    '<div id="setup-view">' +
      '<div class="pill" aria-hidden="true">設定後台帳號</div>' +
      '<h2>設定後台帳號</h2>' +
      '<p id="setup-intro"></p>' +
      '<form id="setup-form" autocomplete="on">' +
        '<div class="field">' +
          '<label for="setup-email">電郵</label>' +
          '<input id="setup-email" name="email" type="email" required autocomplete="username" placeholder="name@example.com" />' +
        '</div>' +
        '<div class="field">' +
          '<label for="setup-password">密碼</label>' +
          '<input id="setup-password" name="new-password" type="password" minlength="8" required autocomplete="new-password" placeholder="最少 8 個字" />' +
        '</div>' +
        '<div class="field">' +
          '<label for="setup-confirm">確認密碼</label>' +
          '<input id="setup-confirm" name="confirm-password" type="password" minlength="8" required autocomplete="new-password" placeholder="再輸入一次" />' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn btn-primary" type="submit" id="setup-btn">儲存並進入</button>' +
        '</div>' +
        '<div class="msg" id="setup-msg" role="status" aria-live="polite"></div>' +
        '<button class="btn auth-switch" type="button" id="switch-to-login">已有後台帳號？登入</button>' +
      '</form>' +
    '</div>' +
    '<div id="login-view">' +
      '<div class="pill" aria-hidden="true">後台登入</div>' +
      '<h2>後台登入</h2>' +
      '<p id="login-intro"></p>' +
      '<form id="login-form" autocomplete="on">' +
        '<div class="field">' +
          '<label for="login-email">電郵</label>' +
          '<input id="login-email" name="email" type="email" required autocomplete="username" placeholder="name@example.com" />' +
        '</div>' +
        '<div class="field">' +
          '<label for="login-password">密碼</label>' +
          '<input id="login-password" name="password" type="password" required autocomplete="current-password" placeholder="請輸入密碼" />' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn btn-primary" type="submit" id="login-btn">登入</button>' +
        '</div>' +
        '<div class="msg" id="login-msg" role="status" aria-live="polite"></div>' +
        '<button class="btn auth-switch" type="button" id="switch-to-setup">未有帳號？設定後台帳號</button>' +
      '</form>' +
    '</div>';

  root.querySelector('#setup-intro').textContent = setupIntro;
  root.querySelector('#login-intro').textContent = loginIntro;

  const setupView = root.querySelector('#setup-view');
  const loginView = root.querySelector('#login-view');
  const setupForm = root.querySelector('#setup-form');
  const loginForm = root.querySelector('#login-form');
  const setupBtn = root.querySelector('#setup-btn');
  const loginBtn = root.querySelector('#login-btn');
  const setupMsg = root.querySelector('#setup-msg');
  const loginMsg = root.querySelector('#login-msg');
  const emailInput = root.querySelector('#login-email');
  const passwordInput = root.querySelector('#login-password');
  const setupEmail = root.querySelector('#setup-email');
  const newPasswordInput = root.querySelector('#setup-password');
  const confirmInput = root.querySelector('#setup-confirm');
  const switchToSetup = root.querySelector('#switch-to-setup');

  function showSetup() {
    setupView.hidden = false;
    loginView.hidden = true;
    if (setupEmail) setupEmail.focus();
  }

  function showLogin() {
    setupView.hidden = true;
    loginView.hidden = false;
    switchToSetup.hidden = configuredNow;
    if (emailInput) emailInput.focus();
  }

  if (configuredNow) showLogin();
  else showSetup();

  root.querySelector('#switch-to-login').addEventListener('click', showLogin);
  switchToSetup.addEventListener('click', () => {
    if (configuredNow) return;
    showSetup();
  });

  setupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = setupEmail.value.trim();
    const password = newPasswordInput.value;
    const confirm = confirmInput.value;
    if (!email) {
      showMsg(setupMsg, 'err', '請輸入電郵地址');
      return;
    }
    if (password.length < 8) {
      showMsg(setupMsg, 'err', '密碼最少要 8 個字元');
      return;
    }
    if (password !== confirm) {
      showMsg(setupMsg, 'err', '兩次輸入嘅密碼唔一致');
      return;
    }
    setupBtn.disabled = true;
    setupBtn.textContent = '儲存緊…';
    setupAccount(email, password)
      .then(() => {
        newPasswordInput.value = '';
        confirmInput.value = '';
        if (typeof opts.onSuccess === 'function') opts.onSuccess();
      })
      .catch((err) => {
        if (err && (err.needsLogin || err.pendingConfirm)) {
          configuredNow = true;
          newPasswordInput.value = '';
          confirmInput.value = '';
          showLogin();
          showMsg(loginMsg, err.pendingConfirm ? 'ok' : 'err', err.message);
          return;
        }
        showMsg(setupMsg, 'err', (err && err.message) || '設定失敗，請稍後再試');
      })
      .then(() => {
        setupBtn.disabled = false;
        setupBtn.textContent = '儲存並進入';
      });
  });

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email) {
      showMsg(loginMsg, 'err', '請輸入電郵地址');
      return;
    }
    loginBtn.disabled = true;
    loginBtn.textContent = '登入緊…';
    loginAccount(email, password)
      .then(() => {
        passwordInput.value = '';
        configuredNow = true;
        if (typeof opts.onSuccess === 'function') opts.onSuccess();
      })
      .catch((err) => {
        showMsg(loginMsg, 'err', (err && err.message) || '登入失敗');
      })
      .then(() => {
        loginBtn.disabled = false;
        loginBtn.textContent = '登入';
      });
  });
}

export { logout };
