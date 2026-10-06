(() => {
  'use strict';

  function clean(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function linesOf(node) {
    return String(node.innerText || '')
      .split(/\r?\n+/)
      .map(clean)
      .filter(Boolean);
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

  function parseDateTime(text) {
    const now = new Date();

    const match = String(text || '').match(
      /(Сегодня|Вчера|\d{1,2}\.\d{1,2}\.\d{2,4})\s*(?:в\s*)?(\d{1,2}):(\d{2})/i
    );

    if (!match) {
      return new Date().toISOString();
    }

    const dateText = match[1];
    const hour = Number(match[2]);
    const minute = Number(match[3]);

    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0
    );

    if (dateText.toLowerCase() === 'вчера') {
      date.setDate(date.getDate() - 1);
    } else if (!/^сегодня$/i.test(dateText)) {
      const parts = dateText.split('.').map(Number);

      let year = parts[2];

      if (year < 100) {
        year += 2000;
      }

      date.setFullYear(year);
      date.setMonth(parts[1] - 1);
      date.setDate(parts[0]);
    }

    return date.toISOString();
  }

  function normalizeSelection(value) {
    let text = clean(value);

    let match = text.match(/^Тотал:\s*Больше\s*\(([\d.,]+)\)/i);

    if (match) {
      return 'ТБ ' + match[1].replace(',', '.');
    }

    match = text.match(/^Тотал:\s*Меньше\s*\(([\d.,]+)\)/i);

    if (match) {
      return 'ТМ ' + match[1].replace(',', '.');
    }

    return text;
  }

  function detectType(selection) {
    const text = clean(selection);

    if (/^Тотал:/i.test(text)) {
      return 'total';
    }

    if (/^Фора/i.test(text)) {
      return 'handicap';
    }

    if (/^Обе забьют/i.test(text)) {
      return 'both_to_score';
    }

    if (/^Точный счёт/i.test(text)) {
      return 'correct_score';
    }

    if (/^(П1|П2|X)\b/i.test(text)) {
      return 'moneyline';
    }

    return 'moneyline';
  }

  function findBetCard(marker) {
    let node = marker;

    for (let depth = 0; node && depth < 10; depth += 1) {
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
    const lines = linesOf(card);

    const timeMatch = text.match(
      /(Сегодня|Вчера|\d{1,2}\.\d{1,2}\.\d{2,4})\s*(?:в\s*)?\d{1,2}:\d{2}/i
    );

    const time = timeMatch ? timeMatch[0] : '';

    const date = parseDateTime(time);

    const moneyValues = text.match(/\d[\d\s\u00a0]*₽/g) || [];

    const stake = moneyValues[0]
      ? money(moneyValues[0])
      : null;

    const payout = moneyValues[1]
      ? money(moneyValues[1])
      : null;

    const oddsMatches = text.match(
      /(?<!\d)\d+[.,]\d{2}(?!\d)/g
    ) || [];

    const odds = oddsMatches.length
      ? Number(
          oddsMatches[oddsMatches.length - 1]
            .replace(',', '.')
        )
      : null;

    const selectionIndex = lines.findIndex(line =>
      /^(Тотал:|Фора|П1\b|П2\b|X\b|Обе забьют|Точный счёт)/i.test(line)
    );

    const rawSelection =
      selectionIndex >= 0
        ? lines[selectionIndex]
        : '';

    const selection = normalizeSelection(rawSelection);

    const market =
      selectionIndex >= 0 && lines[selectionIndex + 1]
        ? lines[selectionIndex + 1]
        : '';

    let match = '';

    const possibleTeams = [...card.querySelectorAll('span, div')]
      .map(node => {
        const parts = String(node.innerText || '')
          .split(/\r?\n+/)
          .map(clean)
          .filter(Boolean);

        return {
          node,
          parts
        };
      })
      .filter(item =>
        item.parts.length === 2 &&
        item.parts[0].length >= 2 &&
        item.parts[1].length >= 2 &&
        !item.parts.some(part =>
          /₽|Ординар|Сегодня|Вчера|Тотал|Угловые|Коэффициент/i.test(part)
        )
      )
      .sort(
        (a, b) =>
          a.node.getBoundingClientRect().height -
          b.node.getBoundingClientRect().height
      );

    if (possibleTeams.length) {
      match = possibleTeams[0].parts.join(' — ');
    }

    return {
      match: match || 'Не удалось определить матч',
      selection: selection || 'Не удалось определить выбор',
      market,
      odds,
      stake,
      payout,
      time,
      date,
      sport: 'Футбол',
      bookmaker: 'BetBoom',
      type: detectType(rawSelection),
      status: 'pending'
    };
  }

  function scanBets() {
    const result = [];
    const seen = new Set();

    const markers = [...document.querySelectorAll('span, div')]
      .filter(
        node => clean(node.textContent) === 'Ординар'
      );

    for (const marker of markers) {
      const card = findBetCard(marker);

      if (!card || seen.has(card)) {
        continue;
      }

      seen.add(card);

      try {
        result.push(parseBet(card));
      } catch (error) {
        console.error(
          '[KuruBets] Ошибка разбора ставки:',
          error
        );
      }
    }

    return result;
  }

  window.__KuruBetsScan = scanBets;

  console.log(
    '[KuruBets] BetBoom scanner готов'
  );
})();