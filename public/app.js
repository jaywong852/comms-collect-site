(function () {
  const form = document.getElementById('submit-form');
  const btn = document.getElementById('submit-btn');
  const msg = document.getElementById('form-msg');

  function showMsg(type, text) {
    msg.className = 'msg show ' + type;
    msg.textContent = text;
  }

  function clearMsg() {
    msg.className = 'msg';
    msg.textContent = '';
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearMsg();

    const data = Object.fromEntries(new FormData(form).entries());
    if (!String(data.name || '').trim()) {
      showMsg('err', '請填寫活動名稱先～');
      form.name.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = '提交緊…';

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !json.ok) {
        throw new Error(json.error || '提交失敗，請稍後再試');
      }
      form.reset();
      showMsg('ok', '收到！你嘅通訊稿已成功提交，多謝 🎉');
      window.scrollTo({ top: msg.offsetTop - 80, behavior: 'smooth' });
    } catch (err) {
      showMsg('err', err.message || '提交失敗，請稍後再試');
    } finally {
      btn.disabled = false;
      btn.textContent = '提交通訊稿';
    }
  });
})();
