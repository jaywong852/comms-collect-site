(function (global) {
  function request(url, options) {
    var opts = Object.assign(
      {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      },
      options || {}
    );
    return fetch(url, opts).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (json) {
          return { res: res, json: json };
        });
    });
  }

  function fetchStatus() {
    return request('/api/admin/status').then(function (result) {
      var json = result.json || {};
      return {
        ok: !!json.ok,
        configured: !!json.configured,
        isAdmin: !!json.isAdmin,
      };
    });
  }

  function login(password) {
    return request('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: password }),
    });
  }

  function setup(password, confirm) {
    return request('/api/admin/setup', {
      method: 'POST',
      body: JSON.stringify({ password: password, confirm: confirm }),
    });
  }

  function logout() {
    return request('/api/admin/logout', {
      method: 'POST',
      body: '{}',
    });
  }

  function showMsg(el, type, text) {
    if (!el) return;
    el.className = 'msg show ' + type;
    el.textContent = text || '';
  }

  function defaultCopy() {
    return {
      setupIntro: '第一次用請先設定密碼。之後要改活動、排序、刪除或者匯出 Word，都要登入。',
      loginIntro: '請輸入後台密碼，先至可以整理活動或匯出文件。',
    };
  }

  function mount(root, options) {
    if (!root) return;
    var opts = options || {};
    var copy = defaultCopy();
    var setupIntro = opts.setupIntro || copy.setupIntro;
    var loginIntro = opts.loginIntro || copy.loginIntro;
    var configured = !!opts.configured;

    root.innerHTML =
      '<div id="setup-view"' + (configured ? ' hidden' : '') + '>' +
        '<div class="pill" aria-hidden="true">設定後台密碼</div>' +
        '<h2>設定後台密碼</h2>' +
        '<p>' + setupIntro + '</p>' +
        '<form id="setup-form" autocomplete="on">' +
          '<div class="field">' +
            '<label for="setup-password">新密碼</label>' +
            '<input id="setup-password" name="new-password" type="password" minlength="8" required autocomplete="new-password" placeholder="最少 8 個字元" />' +
          '</div>' +
          '<div class="field">' +
            '<label for="setup-confirm">確認密碼</label>' +
            '<input id="setup-confirm" name="confirm-password" type="password" minlength="8" required autocomplete="new-password" placeholder="再輸入一次" />' +
          '</div>' +
          '<div class="actions">' +
            '<button class="btn btn-primary" type="submit" id="setup-btn">儲存並進入</button>' +
          '</div>' +
          '<div class="msg" id="setup-msg" role="status" aria-live="polite"></div>' +
        '</form>' +
      '</div>' +
      '<div id="login-view"' + (configured ? '' : ' hidden') + '>' +
        '<div class="pill" aria-hidden="true">後台登入</div>' +
        '<h2>後台登入</h2>' +
        '<p>' + loginIntro + '</p>' +
        '<form id="login-form" autocomplete="on">' +
          '<div class="field">' +
            '<label for="login-password">後台密碼</label>' +
            '<input id="login-password" name="password" type="password" required autocomplete="current-password" placeholder="請輸入後台密碼" />' +
          '</div>' +
          '<div class="actions">' +
            '<button class="btn btn-primary" type="submit" id="login-btn">登入</button>' +
          '</div>' +
          '<div class="msg" id="login-msg" role="status" aria-live="polite"></div>' +
        '</form>' +
      '</div>';

    var setupView = root.querySelector('#setup-view');
    var loginView = root.querySelector('#login-view');
    var setupForm = root.querySelector('#setup-form');
    var loginForm = root.querySelector('#login-form');
    var setupBtn = root.querySelector('#setup-btn');
    var loginBtn = root.querySelector('#login-btn');
    var setupMsg = root.querySelector('#setup-msg');
    var loginMsg = root.querySelector('#login-msg');
    var passwordInput = root.querySelector('#login-password');
    var newPasswordInput = root.querySelector('#setup-password');
    var confirmInput = root.querySelector('#setup-confirm');

    function showSetup() {
      setupView.hidden = false;
      loginView.hidden = true;
      if (newPasswordInput) newPasswordInput.focus();
    }

    function showLogin() {
      setupView.hidden = true;
      loginView.hidden = false;
      if (passwordInput) passwordInput.focus();
    }

    if (configured) showLogin();
    else showSetup();

    setupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var password = newPasswordInput.value;
      var confirm = confirmInput.value;
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
      setup(password, confirm)
        .then(function (result) {
          if (!result.res.ok || !result.json.ok) {
            showMsg(setupMsg, 'err', result.json.error || '設定失敗，請稍後再試');
            return;
          }
          newPasswordInput.value = '';
          confirmInput.value = '';
          if (typeof opts.onSuccess === 'function') opts.onSuccess();
        })
        .catch(function () {
          showMsg(setupMsg, 'err', '網絡錯誤，請稍後再試');
        })
        .then(function () {
          setupBtn.disabled = false;
          setupBtn.textContent = '儲存並進入';
        });
    });

    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var password = passwordInput.value;
      loginBtn.disabled = true;
      loginBtn.textContent = '登入緊…';
      login(password)
        .then(function (result) {
          if (result.json && result.json.needsSetup) {
            showSetup();
            showMsg(setupMsg, 'err', result.json.error || '請先設定後台密碼');
            return;
          }
          if (!result.res.ok || !result.json.ok) {
            showMsg(loginMsg, 'err', result.json.error || '登入失敗');
            return;
          }
          passwordInput.value = '';
          if (typeof opts.onSuccess === 'function') opts.onSuccess();
        })
        .catch(function () {
          showMsg(loginMsg, 'err', '網絡錯誤，請稍後再試');
        })
        .then(function () {
          loginBtn.disabled = false;
          loginBtn.textContent = '登入';
        });
    });
  }

  global.CommsAuth = {
    request: request,
    fetchStatus: fetchStatus,
    login: login,
    setup: setup,
    logout: logout,
    mount: mount,
  };
})(window);
