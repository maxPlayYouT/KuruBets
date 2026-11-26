/* ============================================================
   KuruBets — облачная синхронизация через Supabase
   ============================================================ */
'use strict';

(function () {
  var SUPABASE_URL = 'https://ruxyomwlpaoqxkybxypb.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Qs20HWBRJsLXJFiZh_M0Dw_F2l4qhIU';

  var supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  var K = window.KuruBets;
  var originalSave = K.save;

  var currentUser = null;
  var syncing = false;
  var saveTimer = null;
  var realtimeChannel = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function localState() {
    return clone(K.state);
  }

  function el(id) {
    return document.getElementById(id);
  }

  function message(text, kind) {
    var node = el('cloudAuthMessage');

    if (!node) {
      return;
    }

    node.textContent = text || '';
    node.className = 'cloud-auth-message' + (kind ? ' ' + kind : '');
  }

  function setBusy(busy) {
    [
      'cloudLogin',
      'cloudSignup',
      'cloudOffline'
    ].forEach(function (id) {
      var node = el(id);

      if (node) {
        node.disabled = busy;
      }
    });
  }

  function showAuth() {
    var box = el('cloudAuth');

    if (box) {
      box.hidden = false;
    }
  }

  function hideAuth() {
    var box = el('cloudAuth');

    if (box) {
      box.hidden = true;
    }
  }

  async function uploadState() {
    if (!currentUser || syncing) {
      return;
    }

    syncing = true;

    try {
      var payload = {
        user_id: currentUser.id,
        data: localState(),
        updated_at: new Date().toISOString()
      };

      var result = await supabase
        .from('app_state')
        .upsert(payload, {
          onConflict: 'user_id'
        });

      if (result.error) {
        throw result.error;
      }
    } catch (error) {
      console.error('KuruBets cloud save:', error);
      message(
        'Не удалось сохранить данные в облако: ' +
        error.message,
        'error'
      );
    } finally {
      syncing = false;
    }
  }

  function scheduleUpload() {
    if (!currentUser) {
      return;
    }

    clearTimeout(saveTimer);

    saveTimer = setTimeout(function () {
      uploadState();
    }, 250);
  }

  /*
     Каждый обычный K.save() теперь:
     1. сохраняет локально;
     2. отправляет состояние в Supabase.
  */
  K.save = function () {
    originalSave();
    scheduleUpload();
  };

  async function loadStateFromCloud() {
    var result = await supabase
      .from('app_state')
      .select('data, updated_at')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    /*
       Если облако уже содержит данные —
       загружаем их на устройство.
    */
    if (result.data && result.data.data) {
      var cloudState = result.data.data;

      if (Array.isArray(cloudState.bets)) {
        cloudState.bets = cloudState.bets
          .map(K.normalizeBet)
          .filter(Boolean);
      }

      if (Array.isArray(cloudState.goalGames)) {
        cloudState.goalGames = cloudState.goalGames
          .map(K.normalizeGoalGame)
          .filter(Boolean);
      }

      K.state = cloudState;

      try {
        localStorage.setItem(
          K.STORE_KEY,
          JSON.stringify(cloudState)
        );
      } catch (error) {}

      window.KuruApp.rerender();

      return true;
    }

    /*
       Если облако пустое, первый раз отправляем
       текущие данные устройства.
    */
    await uploadState();

    return false;
  }

  function subscribeRealtime() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabase
      .channel('kurubets-state-' + currentUser.id)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_state',
          filter: 'user_id=eq.' + currentUser.id
        },
        function (payload) {
          if (
            syncing ||
            !payload.new ||
            !payload.new.data
          ) {
            return;
          }

          var incoming = payload.new.data;

          if (Array.isArray(incoming.bets)) {
            incoming.bets = incoming.bets
              .map(K.normalizeBet)
              .filter(Boolean);
          }

          if (Array.isArray(incoming.goalGames)) {
            incoming.goalGames = incoming.goalGames
              .map(K.normalizeGoalGame)
              .filter(Boolean);
          }

          K.state = incoming;

          try {
            localStorage.setItem(
              K.STORE_KEY,
              JSON.stringify(incoming)
            );
          } catch (error) {}

          window.KuruApp.rerender();
        }
      )
      .subscribe();
  }

  async function afterLogin(session) {
    currentUser = session.user;

    setBusy(true);
    message('Подключаем облако…');

    try {
      var hadCloudState =
        await loadStateFromCloud();

      subscribeRealtime();

      hideAuth();

      if (
        window.KuruApp &&
        window.KuruApp.toast
      ) {
        window.KuruApp.toast(
          hadCloudState
            ? 'Облако подключено'
            : 'Данные сохранены в облако',
          'ok'
        );
      }
    } catch (error) {
      console.error(
        'KuruBets cloud init:',
        error
      );

      message(
        'Ошибка подключения к облаку: ' +
        error.message,
        'error'
      );
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    var email = el('cloudEmail').value.trim();
    var password = el('cloudPassword').value;

    if (!email || !password) {
      message(
        'Укажите email и пароль.',
        'error'
      );
      return;
    }

    setBusy(true);
    message('Входим…');

    try {
      var result =
        await supabase.auth.signInWithPassword({
          email: email,
          password: password
        });

      if (result.error) {
        message(
          'Не удалось войти: ' +
          result.error.message,
          'error'
        );

        setBusy(false);
        return;
      }

      await afterLogin(result.data.session);
    } catch (error) {
      message(
        'Ошибка входа: ' + error.message,
        'error'
      );

      setBusy(false);
    }
  }

  async function signup() {
    var email = el('cloudEmail').value.trim();
    var password = el('cloudPassword').value;

    if (!email || !password) {
      message(
        'Укажите email и пароль.',
        'error'
      );
      return;
    }

    if (password.length < 6) {
      message(
        'Пароль должен быть не короче 6 символов.',
        'error'
      );
      return;
    }

    setBusy(true);
    message('Создаём аккаунт…');

    try {
      var result =
        await supabase.auth.signUp({
          email: email,
          password: password,
          options: {
            emailRedirectTo:
              'https://maxplayyout.github.io/KuruBets/'
          }
        });

      if (result.error) {
        message(
          'Не удалось создать аккаунт: ' +
          result.error.message,
          'error'
        );

        setBusy(false);
        return;
      }

      if (result.data.session) {
        await afterLogin(
          result.data.session
        );
        return;
      }

      message(
        'Аккаунт создан. Проверьте почту и подтвердите email. После этого вернитесь в KuruBets.',
        'ok'
      );

      setBusy(false);
    } catch (error) {
      message(
        'Ошибка регистрации: ' +
        error.message,
        'error'
      );

      setBusy(false);
    }
  }

  function offline() {
    hideAuth();

    if (
      window.KuruApp &&
      window.KuruApp.toast
    ) {
      window.KuruApp.toast(
        'Работаем локально. Для синхронизации войдите в аккаунт.'
      );
    }
  }

  function createAuthUi() {
    if (el('cloudAuth')) {
      return;
    }

    var box =
      document.createElement('div');

    box.id = 'cloudAuth';
    box.className = 'cloud-auth';

    box.innerHTML =
      '<div class="cloud-auth-card">' +

        '<div class="cloud-auth-logo">' +
          '<span class="logo"></span>' +
          '<b>KuruBets</b>' +
        '</div>' +

        '<h2>Синхронизация KuruBets</h2>' +

        '<p>' +
          'Войди в аккаунт, и ставки, банк и матчи будут доступны на ПК и телефоне.' +
        '</p>' +

        '<label>' +
          '<span>Email</span>' +
          '<input ' +
            'id="cloudEmail" ' +
            'type="email" ' +
            'autocomplete="email" ' +
            'placeholder="you@example.com">' +
        '</label>' +

        '<label>' +
          '<span>Пароль</span>' +
          '<input ' +
            'id="cloudPassword" ' +
            'type="password" ' +
            'autocomplete="current-password" ' +
            'placeholder="Минимум 6 символов">' +
        '</label>' +

        '<div class="cloud-auth-actions">' +

          '<button ' +
            'class="btn btn-primary" ' +
            'id="cloudLogin" ' +
            'type="button">' +
            'Войти' +
          '</button>' +

          '<button ' +
            'class="btn" ' +
            'id="cloudSignup" ' +
            'type="button">' +
            'Создать аккаунт' +
          '</button>' +

        '</div>' +

        '<button ' +
          'class="cloud-auth-offline" ' +
          'id="cloudOffline" ' +
          'type="button">' +
          'Продолжить без синхронизации' +
        '</button>' +

        '<div ' +
          'id="cloudAuthMessage" ' +
          'class="cloud-auth-message">' +
        '</div>' +

      '</div>';

    document.body.appendChild(box);

    el('cloudLogin').addEventListener(
      'click',
      login
    );

    el('cloudSignup').addEventListener(
      'click',
      signup
    );

    el('cloudOffline').addEventListener(
      'click',
      offline
    );

    el('cloudPassword').addEventListener(
      'keydown',
      function (event) {
        if (event.key === 'Enter') {
          login();
        }
      }
    );
  }

  async function init() {
    createAuthUi();
    showAuth();

    supabase.auth.onAuthStateChange(
      function (event, session) {

        if (
          event === 'SIGNED_IN' &&
          session &&
          !currentUser
        ) {
          setTimeout(function () {
            afterLogin(session);
          }, 0);
        }

        if (event === 'SIGNED_OUT') {
          currentUser = null;

          if (realtimeChannel) {
            supabase.removeChannel(
              realtimeChannel
            );
          }

          realtimeChannel = null;

          showAuth();
        }
      }
    );

    var result =
      await supabase.auth.getSession();

    if (result.error) {
      message(
        'Не удалось проверить сессию: ' +
        result.error.message,
        'error'
      );
      return;
    }

    if (result.data.session) {
      await afterLogin(
        result.data.session
      );
    } else {
      setBusy(false);

      message(
        'Войдите или создайте аккаунт.'
      );
    }
  }

  window.KuruCloud = {
    client: supabase,

    upload: uploadState,

    logout: async function () {
      await supabase.auth.signOut();
    }
  };

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init
    );
  } else {
    init();
  }

})();
