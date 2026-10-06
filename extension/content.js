(() => {
  'use strict';

  const PANEL_ID = 'kurubets-bb-panel';

  if (window.top !== window) return;
  if (document.getElementById(PANEL_ID)) return;

  function clean(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function money(value) {
    if (!value) return null;

    const n = Number(
      value
        .replace(/₽/g, '')
        .replace(/\s/g, '')
        .replace(',', '.')
    );

    return Number.isFinite(n) ? n : null;
  }

  function getLines(node) {
    return String(node.innerText || '')
      .split('\n')
      .map(clean)
      .filter(Boolean);
  }

  function findBetCard(marker) {
    let node = marker;

    for (let i = 0; node && i < 10; i++) {
      const text = clean(node.innerText);

      if (
        text.includes('Ординар') &&
        text.includes('₽') &&
        /\b\d{1,2}:\d{2}\b/.test(text) &&
        text.length > 100 &&
        text.length < 3000
      ) {
        return node;
      }

      node = node.parentElement;
    }

    return null;
  }

  function parseBet(card) {
    const text = clean(card.innerText);
    const lines = getLines(card);

    const timeMatch = text.match(
      /(Сегодня|Вчера|\d{1,2}\.\d{1,2}\.\d{2,4})\s*(?:в\s*)?\d{1,2}:\d{2}/i
    );

    const time = timeMatch ? timeMatch[0] : '';

    const moneyValues = text.match(/\d[\d\s\u00a0]*₽/g) || [];

    const stake = moneyValues[0]
      ? money(moneyValues[0])
      : null;

    const payout = moneyValues[1]
      ? money(moneyValues[1])
      : null;

    const oddsMatch = text.match(
      /(?<!\d)\d+[.,]\d{2}(?!\d)/g
    );

    const odds = oddsMatch && oddsMatch.length
      ? Number(oddsMatch[oddsMatch.length - 1].replace(',', '.'))
      : null;

    const selectionIndex = lines.findIndex(line =>
      /^(Тотал:|Фора|П1\b|П2\b|X\b|Обе забьют|Точный счёт)/i.test(line)
    );

    const selection =
      selectionIndex >= 0
        ? lines[selectionIndex]
        : '';

    const market =
      selectionIndex >= 0 && lines[selectionIndex + 1]
        ? lines[selectionIndex + 1]
        : '';

    let match = '';

    if (selectionIndex >= 0) {
      const candidates = lines
        .slice(selectionIndex + 2)
        .filter(line =>
          !line.includes('₽') &&
          !/^→$/.test(line) &&
          !/^\d+[.,]\d{2}$/.test(line)
        );

      if (candidates.length) {
        match = candidates[0];
      }
    }

    if (!match) {
      const possibleTeam = [...card.querySelectorAll('span, div')]
        .find(node => {
          const parts = String(node.innerText || '')
            .split('\n')
            .map(clean)
            .filter(Boolean);

          return (
            parts.length === 2 &&
            parts[0].length >= 2 &&
            parts[1].length >= 2 &&
            !parts.some(x =>
              /₽|Ординар|Сегодня|Вчера|Тотал|Угловые/i.test(x)
            )
          );
        });

      if (possibleTeam) {
        match = getLines(possibleTeam).join(' — ');
      }
    }

    return {
      match: match || 'Не удалось определить матч',
      selection: selection || 'Не удалось определить выбор',
      market,
      odds,
      stake,
      payout,
      time,
      sport: 'Футбол',
      bookmaker: 'BetBoom',
      status: 'pending'
    };
  }

  function scanBets() {
    const result = [];
    const seen = new Set();

    const markers = [...document.querySelectorAll('span, div')]
      .filter(node => clean(node.textContent) === 'Ординар');

    for (const marker of markers) {
      const card = findBetCard(marker);

      if (!card || seen.has(card)) continue;

      seen.add(card);

      try {
        result.push(parseBet(card));
      } catch (error) {
        console.error('[KuruBets] Ошибка:', error);
      }
    }

    return result;
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function render(bets) {
    const list = document.getElementById('kurubets-bb-list');
    const count = document.getElementById('kurubets-bb-count');

    count.textContent = `Найдено ставок: ${bets.length}`;

    if (!bets.length) {
      list.innerHTML = `
        <div class="kb-empty">
          Ставки не найдены.
          Открой вкладку «Нерассчитанные» или «Рассчитанные».
        </div>
      `;
      return;
    }

    list.innerHTML = bets.map((bet, i) => `
      <div class="kb-bet">
        <div class="kb-title">
          ${i + 1}. ${esc(bet.match)}
        </div>

        <div><span>Время:</span> ${esc(bet.time)}</div>
        <div><span>Выбор:</span> ${esc(bet.selection)}</div>
        <div><span>Рынок:</span> ${esc(bet.market || '—')}</div>
        <div><span>Кэф:</span> ${bet.odds ?? '—'}</div>
        <div><span>Ставка:</span> ${bet.stake ?? '—'} ₽</div>
        <div><span>Выплата:</span> ${bet.payout ?? '—'} ₽</div>
      </div>
    `).join('');
  }

  const style = document.createElement('style');

  style.textContent = `
    #${PANEL_ID} {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 390px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 32px);
      z-index: 2147483647;

      background: #111827;
      color: #f1f5f9;

      border: 1px solid #374151;
      border-radius: 14px;

      box-shadow: 0 20px 70px rgba(0,0,0,.45);

      font-family: Arial, sans-serif;
      font-size: 13px;

      overflow: hidden;
    }

    #${PANEL_ID} .kb-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;

      padding: 12px;

      border-bottom: 1px solid #293548;
    }

    #${PANEL_ID} button {
      border: 1px solid #3b4759;
      border-radius: 8px;
      background: #1b2533;
      color: #fff;
      padding: 7px 10px;
      cursor: pointer;
    }

    #${PANEL_ID} button:hover {
      background: #26344a;
    }

    #${PANEL_ID} .kb-list {
      padding: 10px;
      overflow-y: auto;
      max-height: calc(100vh - 100px);
    }

    #${PANEL_ID} .kb-bet {
      padding: 10px;
      margin-bottom: 8px;

      border: 1px solid #293548;
      border-radius: 10px;

      background: #172131;
    }

    #${PANEL_ID} .kb-bet:last-child {
      margin-bottom: 0;
    }

    #${PANEL_ID} .kb-title {
      font-weight: 700;
      margin-bottom: 7px;
    }

    #${PANEL_ID} .kb-bet div {
      padding: 2px 0;
    }

    #${PANEL_ID} .kb-bet span {
      color: #9ca3af;
    }

    #${PANEL_ID} .kb-empty {
      padding: 18px;
      text-align: center;
      color: #9ca3af;
    }
  `;

  document.head.appendChild(style);

  const panel = document.createElement('section');

  panel.id = PANEL_ID;

  panel.innerHTML = `
    <div class="kb-head">
      <div>
        <strong>KuruBets — BetBoom</strong>
        <div
          id="kurubets-bb-count"
          style="color:#9ca3af;margin-top:3px"
        >
          Нажми «Проверить»
        </div>
      </div>

      <div style="display:flex;gap:6px">
        <button id="kurubets-bb-scan">
          Проверить
        </button>

        <button id="kurubets-bb-close">
          ✕
        </button>
      </div>
    </div>

    <div class="kb-list" id="kurubets-bb-list">
      <div class="kb-empty">
        Тестовый режим.<br>
        Пока только читаем ставки.
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  document
    .getElementById('kurubets-bb-scan')
    .addEventListener('click', () => {
      const bets = scanBets();

      console.log(
        '[KuruBets] Найденные ставки:',
        bets
      );

      render(bets);
    });

  document
    .getElementById('kurubets-bb-close')
    .addEventListener('click', () => {
      panel.remove();
    });

  console.log('[KuruBets] BetBoom importer loaded');
})();