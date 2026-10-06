let currentBets = [];

const scanBtn = document.getElementById('scanBtn');
const importBtn = document.getElementById('importBtn');
const statusBox = document.getElementById('status');
const listBox = document.getElementById('list');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(text, type = '') {
  statusBox.textContent = text;
  statusBox.className = type;
}

function renderBets(bets) {
  if (!bets.length) {
    listBox.innerHTML = `
      <div class="empty">
        Ставок не найдено
      </div>
    `;

    importBtn.disabled = true;
    return;
  }

  importBtn.disabled = false;

  listBox.innerHTML = bets.map((bet, index) => `
    <div class="bet">

      <div class="match">
        ${index + 1}. ${escapeHtml(bet.match)}
      </div>

      <div class="line">
        <span>Время</span>
        <b>${escapeHtml(bet.time)}</b>
      </div>

      <div class="line">
        <span>Выбор</span>
        <b>${escapeHtml(bet.selection)}</b>
      </div>

      <div class="line">
        <span>Рынок</span>
        <b>${escapeHtml(bet.market || '—')}</b>
      </div>

      <div class="line">
        <span>Кэф</span>
        <b>${bet.odds ?? '—'}</b>
      </div>

      <div class="line">
        <span>Ставка</span>
        <b>${bet.stake ?? '—'} ₽</b>
      </div>

      <div class="line">
        <span>Выплата</span>
        <b>${bet.payout ?? '—'} ₽</b>
      </div>

    </div>
  `).join('');
}

async function getBetBoomTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const tab = tabs[0];

  if (!tab || !tab.id) {
    throw new Error('Не удалось определить вкладку');
  }

  if (!tab.url || !tab.url.includes('betboom.ru')) {
    throw new Error(
      'Сначала открой BetBoom и историю ставок'
    );
  }

  return tab;
}

scanBtn.addEventListener('click', async () => {
  try {
    scanBtn.disabled = true;
    importBtn.disabled = true;

    setStatus('Проверяем BetBoom...');

    const tab = await getBetBoomTab();

    await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      files: ['content.js']
    });

    const result =
      await chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        func: () => {
          if (
            typeof window.__KuruBetsScan !==
            'function'
          ) {
            return [];
          }

          return window.__KuruBetsScan();
        }
      });

    currentBets =
      result?.[0]?.result || [];

    renderBets(currentBets);

    setStatus(
      `Найдено ставок: ${currentBets.length}`,
      'ok'
    );

  } catch (error) {
    console.error(error);

    setStatus(
      error.message || 'Ошибка',
      'error'
    );

  } finally {
    scanBtn.disabled = false;
  }
});

async function waitForTab(tabId) {
  const tab = await chrome.tabs.get(tabId);

  if (tab.status === 'complete') {
    return;
  }

  await new Promise(resolve => {
    const listener = (updatedId, info) => {
      if (
        updatedId === tabId &&
        info.status === 'complete'
      ) {
        chrome.tabs.onUpdated.removeListener(
          listener
        );

        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

importBtn.addEventListener('click', async () => {
  if (!currentBets.length) {
    return;
  }

  try {
    importBtn.disabled = true;

    setStatus(
      'Открываем KuruBets...'
    );

    const targetUrl =
      'https://maxplayyout.github.io/KuruBets/';

    const tabs = await chrome.tabs.query({
      url: 'https://maxplayyout.github.io/KuruBets/*'
    });

    let tab = tabs[0];

    if (!tab) {
      tab = await chrome.tabs.create({
        url: targetUrl,
        active: true
      });
    } else {
      await chrome.tabs.update(tab.id, {
        active: true
      });
    }

    await waitForTab(tab.id);

    setStatus(
      'Добавляем ставки...'
    );

    const result =
    await chrome.scripting.executeScript({
        target: {
        tabId: tab.id
        },

        world: 'MAIN',

        func: bets => {
        if (
            !window.KuruBets ||
            typeof window.KuruBets
            .importExternalBets !==
            'function'
        ) {
            throw new Error(
            'KuruBets ещё не загрузился. Обнови страницу.'
            );
        }

        return window.KuruBets
            .importExternalBets(bets);
        },

        args: [currentBets]
    });

    const info =
      result?.[0]?.result || {};

    setStatus(
      `Добавлено: ${info.added || 0}. Дубликатов: ${info.skipped || 0}`,
      'ok'
    );

  } catch (error) {
    console.error(error);

    setStatus(
      error.message || 'Ошибка импорта',
      'error'
    );

    importBtn.disabled = false;
  }
});