/* ============================================================
   KuruBets — дневник ставок
   Часть 1: утилиты, хранилище, состояние, демо-данные, генератор линии
   ============================================================ */
'use strict';

var KuruBets = (function () {
  var STORE_KEY = 'kurubets.v2';

  var DEFAULTS = {
    bets: [],
    /* Пары команд и голы для страницы «Голы 5×5» */
    goalGames: [],
    matches: [],
    settings: {
      bank: 50000,
      dailyLimit: 3000,
      weeklyLimit: 10000,
      maxBetsPerDay: 8,
      theme: 'dark'
    },
    ui: {
      route: '/',
      range: 30,
      feedTab: 'live'
    }
  };

  var state = clone(DEFAULTS);
  var filters = { search: '', sport: '', status: '', from: '', to: '', oddsMin: '', oddsMax: '', sort: 'date-desc' };

  /* ---------------- утилиты ---------------- */

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function uid() {
    return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function qs(id) { return document.getElementById(id); }

  var money0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var money2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function money(value) { return money0.format(Math.round(Number(value) || 0)) + ' ₽'; }
  function moneyShort(value) {
    var n = Number(value) || 0;
    var abs = Math.abs(n);
    if (abs >= 1000000) return money2.format(n / 1000000) + ' млн ₽';
    if (abs >= 10000) return money0.format(Math.round(n / 1000)) + 'к ₽';
    return money0.format(Math.round(n)) + ' ₽';
  }
  function signed(value) {
    var n = Number(value) || 0;
    return (n > 0 ? '+' : '') + money0.format(Math.round(n)) + ' ₽';
  }
  function pct(value, digits) {
    var n = Number(value) || 0;
    return (n > 0 ? '+' : '') + n.toFixed(digits === undefined ? 1 : digits) + '%';
  }
  function num(value, digits) { return (Number(value) || 0).toFixed(digits === undefined ? 2 : digits); }

  /* Дата в формате ДД.ММ.ГГГГ для input[type=date] (ГГГГ-ММ-ДД) */
  function isoDate(value) {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fromIsoDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
    if (!m) return NaN;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  }

  function dayKey(value) {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  /* Дата из ISO/произвольного значения в поле input[type=date] */
  function dateInputValue(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtDateTime(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return fmtDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtRelative(value) {
    var diff = new Date(value).getTime() - Date.now();
    var abs = Math.abs(diff);
    var mins = Math.round(abs / 60000);
    var suffix = diff >= 0 ? 'через' : 'назад';
    if (mins < 60) return (mins < 1 ? 'сейчас' : suffix + ' ' + mins + ' мин');
    var hours = Math.round(mins / 60);
    if (hours < 24) return suffix + ' ' + hours + ' ч';
    return fmtDate(value);
  }

  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function mondayOf(d) {
    var x = startOfDay(d);
    var day = (x.getDay() + 6) % 7;
    return addDays(x, -day);
  }

  var TYPE_LABELS = {
    moneyline: 'Исход',
    handicap: 'Фора',
    total: 'Тотал',
    both_to_score: 'Обе забьют',
    correct_score: 'Точный счёт',
    player: 'Статистика',
    combo: 'Экспресс'
  };
  var STATUS_LABELS = { pending: 'Не рассчитана', won: 'Выигрыш', lost: 'Проигрыш', push: 'Возврат', cashout: 'Выкуп' };

  function typeLabel(t) { return TYPE_LABELS[t] || t || '—'; }
  function statusLabel(s) { return STATUS_LABELS[s] || s || '—'; }

  function profitOf(bet) {
  var stake = Number(bet.stake) || 0;
  var odds = Number(bet.odds) || 1;

  if (bet.status === 'won') {
    return stake * (odds - 1);
  }

  if (bet.status === 'lost') {
    return -stake;
  }

  if (bet.status === 'push') {
    return 0;
  }

  if (bet.status === 'cashout') {
    var payout = Number(bet.cashoutAmount) || 0;
    return payout - stake;
  }

  return null;
}

  function isSettled(bet) {
  return bet.status === 'won' ||
         bet.status === 'lost' ||
         bet.status === 'push' ||
         bet.status === 'cashout';
}
  function bankDelta(bet) {
  if (!bet || !isSettled(bet)) return 0;

  var stake = Number(bet.stake) || 0;
  var odds = Number(bet.odds) || 1;

  if (bet.freebet) {
    if (bet.status === 'won') {
      return stake * (odds - 1);
    }

    if (bet.status === 'cashout') {
      return Number(bet.cashoutAmount) || 0;
    }

    return 0;
  }

  return profitOf(bet) || 0;
}

function changeBank(delta) {
  var value = Number(state.settings.bank) || 0;
  var next = value + (Number(delta) || 0);

  // Банк не может быть отрицательным
  state.settings.bank = Math.max(
    0,
    Math.round(next * 100) / 100
  );
}
  /* ---------------- хранилище ---------------- */

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        if (Array.isArray(data.bets)) state.bets = data.bets.map(normalizeBet).filter(Boolean);
        if (Array.isArray(data.matches)) state.matches = data.matches.filter(function (m) { return m && m.id; });
        if (Array.isArray(data.goalGames)) state.goalGames = data.goalGames.map(normalizeGoalGame).filter(Boolean);
        if (data.settings) {
        Object.assign(state.settings, data.settings);

        // Если банк отсутствует или некорректный,
        // не допускаем превращения банка в 0 после F5.
        if (
          data.settings.bank === undefined ||
          data.settings.bank === null ||
          !isFinite(Number(data.settings.bank))
        ) {
          state.settings.bank = DEFAULTS.settings.bank;
        } else {
          state.settings.bank = Number(data.settings.bank);
        }
      }
        if (data.ui) Object.assign(state.ui, data.ui);
      }
    } catch (e) {
      console.warn('KuruBets: не удалось прочитать хранилище', e);
      state = clone(DEFAULTS);
    }
  }

  function normalizeGoalGame(g) {
    if (!g || typeof g !== 'object') return null;
    var a = parseInt(g.goalsA, 10);
    var b = parseInt(g.goalsB, 10);
    var teamA = String(g.teamA || '').trim().slice(0, 40);
    var teamB = String(g.teamB || '').trim().slice(0, 40);
    if (!teamA || !teamB) return null;
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || a > 30 || b > 30) return null;
    var date = g.date || new Date().toISOString();
    var status = ['pending', 'won', 'lost'].indexOf(g.status) >= 0 ? g.status : 'pending';
    return {
      id: g.id || uid(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date + 'T12:00:00' : date,
      teamA: teamA,
      teamB: teamB,
      goalsA: a,
      goalsB: b,
      league: String(g.league || '').trim().slice(0, 30),
      /* ставка на прогноз команды 1 и коэффициент — для движения банка */
      stake: Math.max(0, parseFloat(g.stake) || 0),
      odds: parseFloat(g.odds) >= 1.01 ? parseFloat(g.odds) : 1.9,
      status: status,
      createdAt: g.createdAt || new Date().toISOString()
    };
  }

  function normalizeBet(bet) {
    if (!bet || typeof bet !== 'object') return null;
    var odds = parseFloat(bet.odds);
    var stake = parseFloat(bet.stake);
    return {
      id: bet.id || uid(),
      match: String(bet.match || '').slice(0, 120),
      sport: String(bet.sport || 'Другое').slice(0, 40),
      league: String(bet.league || '').slice(0, 60),
      type: bet.type || 'moneyline',
      selection: String(bet.selection || '').slice(0, 120),
      odds: isFinite(odds) && odds >= 1.01 ? odds : 1.01,
      stake: isFinite(stake) && stake > 0 ? stake : 0,
      freebet: !!bet.freebet,
      status: [
      'pending',
      'won',
      'lost',
      'push',
      'cashout'
    ].indexOf(bet.status) >= 0
      ? bet.status
      : 'pending',

    cashoutAmount:
      isFinite(Number(bet.cashoutAmount))
        ? Math.max(0, Number(bet.cashoutAmount))
        : 0,
      date: bet.date || new Date().toISOString(),
      bookmaker: String(bet.bookmaker || '').slice(0, 40),
      comment: String(bet.comment || '').slice(0, 400),
      createdAt: bet.createdAt || new Date().toISOString()
    };
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Не удалось сохранить: хранилище переполнено или заблокировано', 'err');
    }
  }

  /* ---------------- расчёты ---------------- */

  function computeStats(bets) {
    var s = {
      count: bets.length, settled: 0, pending: 0,
      won: 0, lost: 0, push: 0,
      turnover: 0, profit: 0, exposure: 0,
      oddsSum: 0, stakeSumWeighted: 0,
      winSum: 0, loseSum: 0, stakeTotal: 0,
      maxWin: 0, maxLoss: 0,
      currentWin: 0, currentLose: 0, bestWin: 0, worstLose: 0
    };

    var chronological = bets.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

    chronological.forEach(function (bet) {
      s.stakeTotal += bet.stake;
      if (!isSettled(bet)) { s.pending++; s.exposure += bet.stake; return; }
      s.settled++;
      s.turnover += bet.stake;
      s.oddsSum += bet.odds;
      var p = profitOf(bet);
      s.profit += p;
      if (bet.status === 'won') {
        s.won++; s.winSum += p;
        if (p > s.maxWin) s.maxWin = p;
      } else if (bet.status === 'lost') {
        s.lost++; s.loseSum += Math.abs(p);
        if (Math.abs(p) > Math.abs(s.maxLoss)) s.maxLoss = p;
      } else {
        s.push++;
      }
    });

    chronological.forEach(function (bet) {
      if (bet.status === 'won') { s.currentWin++; s.currentLose = 0; }
      else if (bet.status === 'lost') { s.currentLose++; s.currentWin = 0; }
      else return;
      if (s.currentWin > s.bestWin) s.bestWin = s.currentWin;
      if (s.currentLose > s.worstLose) s.worstLose = s.currentLose;
    });

    s.roi = s.turnover > 0 ? (s.profit / s.turnover) * 100 : 0;
    s.strike = s.settled > 0 ? (s.won / s.settled) * 100 : 0;
    s.avgOdds = s.settled > 0 ? s.oddsSum / s.settled : 0;
    s.avgStake = s.count > 0 ? s.stakeTotal / s.count : 0;
    s.avgWin = s.won > 0 ? s.winSum / s.won : 0;
    s.avgLoss = s.lost > 0 ? s.loseSum / s.lost : 0;
    s.profitFactor = s.loseSum > 0 ? (s.winSum / s.loseSum) : (s.winSum > 0 ? Infinity : 0);
    s.breakeven = s.avgOdds > 1 ? (1 / s.avgOdds) * 100 : 0;
    return s;
  }

  function bankSeries(settledBets, currentBank, allSettledBets) {
    var sorted = settledBets.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var all = (allSettledBets || settledBets).slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var totalProfit = all.reduce(function (sum, b) { return sum + (profitOf(b) || 0); }, 0);
    var initialBank = (Number(currentBank) || 0) - totalProfit;
    var points = [];

    if (!sorted.length) {
      points.push({ t: Date.now(), bank: initialBank + totalProfit, profit: 0, stake: 0, label: 'старт' });
      return { points: points, start: initialBank };
    }

    /* Если показан диапазон, сначала восстанавливаем банк на его начало
       из полной истории, а не считаем выбранный диапазон отдельным банком. */
    var firstTime = new Date(sorted[0].date).getTime();
    var beforeRangeProfit = all.reduce(function (sum, b) {
      return new Date(b.date).getTime() < firstTime ? sum + (profitOf(b) || 0) : sum;
    }, 0);
    var start = initialBank + beforeRangeProfit;
    points.push({
      t: new Date(startOfDay(new Date(firstTime)).getTime() - 86400000).getTime(),
      bank: start, profit: 0, stake: 0, label: 'старт'
    });

    sorted.forEach(function (b) {
      var prev = points[points.length - 1];
      var p = profitOf(b) || 0;
      points.push({
        t: new Date(b.date).getTime(),
        bank: prev.bank + p,
        profit: p,
        stake: b.stake,
        label: b.match
      });
    });
    return { points: points, start: start };
  }

  function drawdownPct(points) {
    var peak = -Infinity;
    var maxDd = 0;
    points.forEach(function (p) {
      if (p.bank > peak) peak = p.bank;
      if (peak > 0) {
        var dd = ((peak - p.bank) / peak) * 100;
        if (dd > maxDd) maxDd = dd;
      }
    });
    return maxDd;
  }

  function groupStats(bets, keyFn, order) {
    var map = {};
    bets.forEach(function (bet) {
      var key = keyFn(bet);
      if (!key) return;
      (map[key] = map[key] || []).push(bet);
    });
    var rows = Object.keys(map).map(function (key) {
      var s = computeStats(map[key]);
      s.key = key;
      return s;
    });
    if (order === 'keys') {
      rows.sort(function (a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
    } else {
      rows.sort(function (a, b) { return b.count - a.count; });
    }
    return rows;
  }

  function oddsBucket(odds) {
    if (odds < 1.5) return '1.00–1.49';
    if (odds < 2) return '1.50–1.99';
    if (odds < 3) return '2.00–2.99';
    if (odds < 5) return '3.00–4.99';
    return '5.00+';
  }
  var ODDS_BUCKETS = ['1.00–1.49', '1.50–1.99', '2.00–2.99', '3.00–4.99', '5.00+'];
  var WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

  function inRange(bet, days) {
    if (!days) return true;
    var from = startOfDay(addDays(new Date(), -days + 1)).getTime();
    return new Date(bet.date).getTime() >= from;
  }

  function sports() {
    var set = {};
    state.bets.forEach(function (b) { if (b.sport) set[b.sport] = 1; });
    state.matches.forEach(function (m) { if (m.sport) set[m.sport] = 1; });
    return Object.keys(set).sort();
  }

  /* ---------------- генератор линии (локальный источник) ---------------- */

  var FEED_TEAMS = {
    'Футбол': ['Арсенал', 'Ливерпуль', 'Ман Сити', 'Реал', 'Барселона', 'Интер', 'Милан', 'Бавария', 'Боруссия Д', 'ПСЖ', 'Зенит', 'Краснодар', 'ЦСКА', 'Спартак', 'Марсель', 'Ювентус'],
    'Хоккей': ['СКА', 'ЦСКА', 'Ак Барс', 'Металлург', 'Динамо М', 'Локомотив', 'Тампа', 'Бостон', 'Колорадо'],
    'Баскетбол': ['ЦСКА', 'УНИКС', 'Химки', 'Лейкерс', 'Селтикс', 'Голден Стэйт', 'Реал', 'Фенербахче'],
    'Теннис': ['Синнер', 'Алькарас', 'Джокович', 'Медведев', 'Зверев', 'Рублёв', 'Свитолина', 'Рыбакина', 'Сёппек'],
    'Киберспорт': ['Team Spirit', 'Virtus.pro', 'NAVI', 'FaZe', 'G2', 'MOUZ', 'Vitality', 'Aurora'],
    'НХЛ/Хоккей': []
  };
  var FEED_LEAGUES = {
    'Футбол': ['АПЛ', 'Ла Лига', 'Серия A', 'Бундеслига', 'РПЛ', 'Лига чемпионов'],
    'Хоккей': ['КХЛ', 'НХЛ'],
    'Баскетбол': ['Единая лига', 'НБА', 'Евролига'],
    'Теннис': ['ATP 1000', 'WTA 1000', 'Australian Open'],
    'Киберспорт': ['Dota 2 · DreamLeague', 'CS2 · BLAST', 'Valorant · VCT']
  };

  function rnd(min, max) { return min + Math.random() * (max - min); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function makeOdds() {
    var h = +rnd(1.35, 3.6).toFixed(2);
    var x = +rnd(2.9, 4.4).toFixed(2);
    var a = +(7 + rnd(0, 6) - h).toFixed(2);
    if (a < 1.2) a = +rnd(1.2, 2.4).toFixed(2);
    return { h: h, x: x, a: a };
  }

  function buildFeed(force) {
    if (!force && state.matches && state.matches.length) return;
    var list = [];
    var now = Date.now();
    var sportsList = Object.keys(FEED_TEAMS).filter(function (s) { return FEED_TEAMS[s].length > 1; });

    for (var i = 0; i < 26; i++) {
      var sport = pick(sportsList);
      var teams = FEED_TEAMS[sport].slice();
      var home = pick(teams);
      var away;
      do { away = pick(teams); } while (away === home);
      var minutesUntil = i < 8 ? Math.floor(rnd(2, 118)) : Math.floor(rnd(140, 3200));
      var start = new Date(now + minutesUntil * 60000);
      var odds = makeOdds();
      list.push({
        id: 'f' + i + '_' + uid(),
        sport: sport,
        league: pick(FEED_LEAGUES[sport] || ['Товарищеский турнир']),
        home: home,
        away: away,
        start: start.toISOString(),
        live: minutesUntil < 120,
        minute: minutesUntil < 120 ? Math.max(1, Math.min(119, minutesUntil)) : null,
        odds: odds,
        total: { over: +rnd(1.7, 2.05).toFixed(2), under: +rnd(1.7, 2.05).toFixed(2), line: sport === 'Хоккей' ? 4.5 : sport === 'Баскетбол' ? 208.5 : 2.5 },
        source: 'local'
      });
    }
    list.sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
    state.matches = list;
    save();
  }

  function customMatch(data) {
    var match = {
      id: 'u' + uid(),
      sport: data.sport || 'Другое',
      league: data.league || 'Мой матч',
      home: data.home,
      away: '',
      start: (data.date ? new Date(data.date).toISOString() : new Date().toISOString()),
      live: false,
      minute: null,
      odds: { h: data.odds1 || 2, x: data.oddsX || 3.4, a: data.odds2 || 3.2 },
      total: { over: 1.9, under: 1.9, line: 2.5 },
      source: 'user'
    };
    var parts = String(data.home).split(/\s+[—–-]\s+|\s+vs\.?\s+/i);
    if (parts.length >= 2) { match.home = parts[0].trim(); match.away = parts.slice(1).join(' ').trim(); }
    state.matches.unshift(match);
    save();
    return match;
  }

  return {
    /* константы */
    TYPE_LABELS: TYPE_LABELS, STATUS_LABELS: STATUS_LABELS, ODDS_BUCKETS: ODDS_BUCKETS, WEEKDAYS: WEEKDAYS,
    /* утилиты */
    clone: clone, uid: uid, esc: esc, qs: qs, money: money, moneyShort: moneyShort, signed: signed,
    pct: pct, num: num, escMoney: money, fmtDate: fmtDate, fmtDateTime: fmtDateTime, fmtRelative: fmtRelative,
    dayKey: dayKey, startOfDay: startOfDay, addDays: addDays, mondayOf: mondayOf, dateInputValue: dateInputValue,
    typeLabel: typeLabel, statusLabel: statusLabel, profitOf: profitOf, isSettled: isSettled,
    oddsBucket: oddsBucket, inRange: inRange, sports: sports,
    /* состояние */
    get state() { return state; },
    set state(v) { state = v; },
    get filters() { return filters; },
    load: load, save: save, normalizeBet: normalizeBet, normalizeGoalGame: normalizeGoalGame,
    DEFAULTS: DEFAULTS, STORE_KEY: STORE_KEY,
    /* аналитика */
    computeStats: computeStats,
    bankSeries: bankSeries,
    bankDelta: bankDelta,
    changeBank: changeBank, 
    drawdownPct: drawdownPct,
    groupStats: groupStats,
    /* данные */
    buildFeed: buildFeed, 
    customMatch: customMatch,
  };
})();
'use strict';

/* ============================================================
   Часть 2: отрисовка обзора, графика, лимиты, последние ставки
   ============================================================ */
(function (K) {
  var chartBox, recentBox, limitsBox, quickBox;

  function el(id) { return document.getElementById(id); }

  function rangeBets() {
    var days = K.state.ui.range;
    return K.state.bets.filter(function (b) { return K.inRange(b, days); });
  }

  /* ---------- KPI ---------- */

  function renderKpi() {
    var bets = rangeBets();
    var s = K.computeStats(bets);
    var series = K.bankSeries(bets.filter(K.isSettled), K.state.settings.bank, K.state.bets.filter(K.isSettled));
    var dd = K.drawdownPct(series.points);

    var profitEl = el('kpiProfit');
    profitEl.textContent = K.signed(s.profit);
    profitEl.closest('.kpi').classList.toggle('is-pos', s.profit > 0);
    profitEl.closest('.kpi').classList.toggle('is-neg', s.profit < 0);

    el('kpiProfitFoot').textContent = s.settled ? 'по ' + s.settled + ' рассчитанным' : 'нет рассчитанных';
    el('kpiRoi').textContent = K.pct(s.roi);
    el('kpiRoi').closest('.kpi').classList.toggle('is-pos', s.roi > 0);
    el('kpiRoi').closest('.kpi').classList.toggle('is-neg', s.roi < 0);
    el('kpiStrike').textContent = (s.strike || 0).toFixed(1) + '%';
    el('kpiStrikeFoot').textContent = s.settled ? 'нужно ' + s.breakeven.toFixed(1) + '% при среднем кэфе' : '—';
    el('kpiAvgOdds').textContent = K.num(s.avgOdds);
    el('kpiTurnover').textContent = K.moneyShort(s.turnover);
    el('kpiDrawdown').textContent = dd.toFixed(1) + '%';

    var label = el('chartRangeLabel');
    if (label) label.textContent = K.state.ui.range ? 'последние ' + K.state.ui.range + ' дней' : 'всё время';
  }

  /* ---------- график ---------- */

  function renderChart() {
    chartBox = chartBox || el('chartBox');
    var empty = el('chartEmpty');
    var bets = rangeBets().filter(K.isSettled);
    var series = K.bankSeries(bets, K.state.settings.bank, K.state.bets.filter(K.isSettled));
    var points = series.points;

    if (!bets.length) {
      chartBox.innerHTML = '';
      chartBox.hidden = true;
      empty.hidden = false;
      return;
    }
    chartBox.hidden = false;
    empty.hidden = true;

    var w = Math.max(chartBox.clientWidth || 640, 320);
    var h = chartBox.clientHeight || 280;
    var pad = { l: 58, r: 14, t: 14, b: 26 };
    var iw = Math.max(w - pad.l - pad.r, 40);
    var ih = Math.max(h - pad.t - pad.b, 40);

    var banks = points.map(function (p) { return p.bank; });
    var min = Math.min.apply(null, banks);
    var max = Math.max.apply(null, banks);
    if (min === max) { min -= 1000; max += 1000; }
    var padv = (max - min) * 0.12;
    min -= padv; max += padv;

    var t0 = points[0].t;
    var t1 = points[points.length - 1].t;
    var span = Math.max(t1 - t0, 86400000);

    function X(t) { return pad.l + ((t - t0) / span) * iw; }
    function Y(v) { return pad.t + ih - ((v - min) / (max - min)) * ih; }

    var maxAbsProfit = Math.max.apply(null, points.map(function (p) { return Math.abs(p.profit || 0); })) || 1;

    var line = points.map(function (p, i) { return (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.bank).toFixed(1); }).join(' ');
    var area = line + ' L' + X(t1).toFixed(1) + ' ' + (pad.t + ih) + ' L' + pad.l + ' ' + (pad.t + ih) + ' Z';

    var gridLines = '';
    var ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var v = min + ((max - min) * i) / ticks;
      var y = Y(v);
      gridLines += '<line x1="' + pad.l + '" y1="' + y.toFixed(1) + '" x2="' + (pad.l + iw) + '" y2="' + y.toFixed(1) +
        '" stroke="var(--border-soft)" stroke-width="1"/>' +
        '<text x="' + (pad.l - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--muted)">' +
        K.moneyShort(v).replace(' ₽', '') + '</text>';
    }

    var xLabels = '';
    var labelCount = Math.min(6, points.length);
    for (var j = 0; j < labelCount; j++) {
      var p = points[Math.round((j * (points.length - 1)) / Math.max(labelCount - 1, 1))];
      xLabels += '<text x="' + X(p.t).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' +
        K.fmtDate(p.t).slice(0, 5) + '</text>';
    }

    var bars = points.map(function (p) {
      if (!p.profit) return '';
      var bw = Math.max(Math.min(iw / points.length * 0.5, 9), 2);
      var zeroY = Y(min + (max - min) * ((-min) / (max - min)) * 0 + min) ;
      var baseY = pad.t + ih;
      var bh = (Math.abs(p.profit) / maxAbsProfit) * (ih * 0.22);
      var color = p.profit > 0 ? 'var(--green)' : 'var(--red)';
      return '<rect x="' + (X(p.t) - bw / 2).toFixed(1) + '" y="' + (baseY - bh).toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + bh.toFixed(1) + '" rx="1.5" fill="' + color + '" opacity=".45"><title>' +
        K.esc(p.label) + ': ' + K.signed(p.profit) + '</title></rect>';
    }).join('');

    var dots = points.length < 60 ? points.map(function (p) {
      return '<circle cx="' + X(p.t).toFixed(1) + '" cy="' + Y(p.bank).toFixed(1) + '" r="2.6" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.6"><title>' +
        K.fmtDateTime(p.t) + ' · ' + K.money(p.bank) + '</title></circle>';
    }).join('') : '';

    var hit = points.map(function (p, idx) {
      return '<rect class="ct-hit" data-i="' + idx + '" x="' + (X(p.t) - Math.max(iw / points.length / 2, 3)).toFixed(1) +
        '" y="' + pad.t + '" width="' + Math.max(iw / points.length, 6).toFixed(1) + '" height="' + ih + '" fill="transparent"/>';
    }).join('');

    chartBox.innerHTML =
      '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="График движения банка">' +
      '<defs><linearGradient id="kbArea" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--accent)" stop-opacity=".28"/>' +
      '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>' +
      gridLines +
      '<path d="' + area + '" fill="url(#kbArea)"/>' +
      bars +
      '<path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots + xLabels + hit +
      '<line id="ctCursor" x1="0" y1="' + pad.t + '" x2="0" y2="' + (pad.t + ih) + '" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>' +
      '</svg><div class="ct-tip" id="ctTip" hidden></div>';

    var tip = el('ctTip');
    var cursor = el('ctCursor');
    var svg = chartBox.querySelector('svg');

    chartBox.querySelectorAll('.ct-hit').forEach(function (rect) {
      rect.addEventListener('mouseenter', function () {
        var p = points[+rect.dataset.i];
        var prev = points[+rect.dataset.i - 1];
        cursor.setAttribute('x1', X(p.t));
        cursor.setAttribute('x2', X(p.t));
        cursor.setAttribute('opacity', '1');
        tip.hidden = false;
        tip.style.left = (X(p.t) / w * 100) + '%';
        tip.style.top = (Y(p.bank) / h * 100) + '%';
        tip.innerHTML = '<b>' + K.fmtDateTime(p.t) + '</b>' +
          '<div class="r"><span>' + K.esc(String(p.label).slice(0, 26)) + '</span><span></span></div>' +
          '<div class="r"><span>Банк</span><span>' + K.money(p.bank) + '</span></div>' +
          '<div class="r"><span>Исход</span><span class="' + (p.profit > 0 ? 'pos' : p.profit < 0 ? 'neg' : 'zero') + '">' + K.signed(p.profit) + '</span></div>' +
          (prev ? '<div class="r"><span>Ставка</span><span>' + K.money(p.stake) + '</span></div>' : '');
      });
    });
    if (svg) svg.addEventListener('mouseleave', function () { tip.hidden = true; cursor.setAttribute('opacity', '0'); });
  }

  /* ---------- лимиты ---------- */

  function renderLimits() {
    limitsBox = limitsBox || el('limitsBox');
    if (!limitsBox) return;
    var st = K.state.settings;
    var today = K.dayKey(new Date());
    var weekStart = K.mondayOf(new Date());

    var dayStake = 0, dayCount = 0, weekStake = 0, weekCount = 0;
    K.state.bets.forEach(function (b) {
      var d = new Date(b.date);
      if (K.dayKey(d) === today) { dayStake += b.stake; dayCount++; }
      if (d >= weekStart) { weekStake += b.stake; weekCount++; }
    });

    function row(label, value, limit, unit) {
      var ratio = limit > 0 ? (value / limit) * 100 : 0;
      var cls = ratio >= 100 ? 'over' : ratio >= 75 ? 'warn' : '';
      return '<div class="limit-row">' +
        '<div class="limit-head"><span>' + label + '</span><b>' + value + ' / ' + limit + ' ' + unit +
        ' <span class="muted">(' + Math.round(ratio) + '%)</span></b></div>' +
        '<div class="bar ' + cls + '"><i style="width:' + Math.min(ratio, 100) + '%"></i></div></div>';
    }

    var blocked = (st.dailyLimit > 0 && dayStake >= st.dailyLimit) ||
      (st.maxBetsPerDay > 0 && dayCount >= st.maxBetsPerDay);

    limitsBox.innerHTML =
      row('Ставки сегодня', Math.round(dayStake), st.dailyLimit || 0, '₽') +
      row('Ставки за неделю', Math.round(weekStake), st.weeklyLimit || 0, '₽') +
      row('Количество ставок сегодня', dayCount, st.maxBetsPerDay || 0, 'шт') +
      '<p class="limit-note' + (blocked ? ' blocked' : '') + '">' +
      (blocked
        ? 'Дневной лимит выбран — новые ставки лучше не добавлять. Лимиты меняются в настройках.'
        : 'Сегодня в рамках лимитов. Дневной лимит считается по сумме ставок, а не по убытку.') +
      '</p>';
  }

  /* ---------- быстрые матчи ---------- */

  function renderQuickMatches() {
    quickBox = quickBox || el('quickMatchCard');
    if (!quickBox) return;
    var list = K.state.matches.filter(function (m) { return m.live; }).slice(0, 4);
    if (!list.length) list = K.state.matches.slice(0, 4);
    if (!list.length) {
      quickBox.innerHTML = '<p class="muted">Линия пуста.</p>';
      return;
    }
    quickBox.innerHTML = list.map(function (m) {
      return '<div class="limit-row" style="margin-bottom:10px">' +
        '<div class="limit-head"><span><b>' + K.esc(m.home) + ' — ' + K.esc(m.away) + '</b>' +
        '<span class="muted"> · ' + K.esc(m.sport) + '</span></span>' +
        '<b>' + K.num(m.odds.h) + ' / ' + (m.odds.x ? K.num(m.odds.x) + ' / ' : '') + K.num(m.odds.a) + '</b></div>' +
        '<div class="btn-row" style="gap:6px">' +
        '<button class="btn btn-sm" type="button" data-quick="' + K.esc(m.id) + '" data-side="h">П1</button>' +
        (m.odds.x ? '<button class="btn btn-sm" type="button" data-quick="' + K.esc(m.id) + '" data-side="x">X</button>' : '') +
        '<button class="btn btn-sm" type="button" data-quick="' + K.esc(m.id) + '" data-side="a">П2</button>' +
        '</div></div>';
    }).join('');

    quickBox.querySelectorAll('[data-quick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var match = K.state.matches.filter(function (m) { return m.id === btn.dataset.quick; })[0];
        if (match) {
          window.KuruApp.openBetFromMatch(match, btn.dataset.side);
        }
      });
    });
  }

  /* ---------- последние ставки ---------- */

  function renderRecent() {
    recentBox = recentBox || el('recentBox');
    var list = K.state.bets.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 7);
    if (!list.length) {
      recentBox.innerHTML = '<p class="muted">Ставок пока нет. Нажмите «+ Ставка», чтобы добавить первую.</p>';
      return;
    }
    recentBox.innerHTML = list.map(function (b) {
      var p = K.profitOf(b);
      var cls = p === null ? 'zero' : p > 0 ? 'pos' : p < 0 ? 'neg' : 'zero';
      return '<div class="limit-row" style="margin-bottom:9px;display:flex;justify-content:space-between;gap:10px;align-items:center">' +
        '<div style="min-width:0">' +
        '<b style="display:block;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + K.esc(b.match) + '</b>' +
        '<span class="muted" style="font-size:11.5px">' + K.esc(b.selection) + ' · кэф ' + K.num(b.odds) + ' · ' + K.fmtDate(b.date) + '</span>' +
        '</div>' +
        '<div style="text-align:right;flex:0 0 auto">' +
        '<b class="' + cls + '" style="font-size:13.5px">' + (p === null ? K.money(b.stake) : K.signed(p)) + '</b>' +
        '<span class="muted" style="display:block;font-size:11px">' + K.statusLabel(b.status) + '</span>' +
        '</div></div>';
    }).join('');
  }

  function renderOverview() {
    renderKpi();
    renderChart();
    renderLimits();
    renderQuickMatches();
    renderRecent();
  }

  K.renderOverview = renderOverview;
  K.renderLimits = renderLimits;
  K.rangeBets = rangeBets;
  K.renderChart = renderChart;
})(KuruBets);

'use strict';

/* ============================================================
   Часть 3: таблица ставок, фильтры, форма ставки
   ============================================================ */
(function (K) {
  function el(id) { return document.getElementById(id); }

  function applyFilters(bets) {
    var f = K.filters;
    var search = f.search.trim().toLowerCase();
    return bets.filter(function (b) {
      if (search) {
        var hay = (b.match + ' ' + b.selection + ' ' + b.sport + ' ' + b.bookmaker + ' ' + b.comment).toLowerCase();
        if (hay.indexOf(search) < 0) return false;
      }
      if (f.sport && b.sport !== f.sport) return false;
      if (f.status && b.status !== f.status) return false;
      if (f.oddsMin && b.odds < parseFloat(f.oddsMin)) return false;
      if (f.oddsMax && b.odds > parseFloat(f.oddsMax)) return false;
      var t = new Date(b.date).getTime();
      if (f.from && t < new Date(f.from + 'T00:00:00').getTime()) return false;
      if (f.to && t > new Date(f.to + 'T23:59:59').getTime()) return false;
      return true;
    });
  }

  function sortBets(bets) {
  var mode = K.filters.sort;

  return bets.slice().sort(function (a, b) {

    if (mode === 'date-asc') {
      var dateA = new Date(a.date).getTime();
      var dateB = new Date(b.date).getTime();

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      // Если дата события одинаковая —
      // старые созданные записи идут раньше
      return new Date(a.createdAt || a.date).getTime() -
             new Date(b.createdAt || b.date).getTime();
    }

    if (mode === 'stake-desc') {
      return b.stake - a.stake;
    }

    if (mode === 'odds-desc') {
      return b.odds - a.odds;
    }

    if (mode === 'profit-desc') {
      return (K.profitOf(b) || -1e12) -
             (K.profitOf(a) || -1e12);
    }

    // Сначала новые:
    // сначала дата события,
    // а если она одинаковая — время создания записи.
    var dateA = new Date(a.date).getTime();
    var dateB = new Date(b.date).getTime();

    if (dateA !== dateB) {
      return dateB - dateA;
    }

    return new Date(b.createdAt || b.date).getTime() -
           new Date(a.createdAt || a.date).getTime();
  });
}

  function renderBets() {
    var body = el('betsBody');
    var empty = el('betsEmpty');
    if (!body) return;

    var list = sortBets(applyFilters(K.state.bets));
    var stats = K.computeStats(list);

    el('betsCount').textContent = list.length + ' ставок · оборот ' + K.money(stats.turnover) +
      ' · прибыль ' + K.signed(stats.profit);

    if (!list.length) {
      body.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    body.innerHTML = list.map(function (b) {
      var p = K.profitOf(b);
      var cls = p === null ? 'zero' : p > 0 ? 'pos' : p < 0 ? 'neg' : 'zero';
      var badge = 'badge-' + b.status;
      return '<tr data-id="' + b.id + '">' +
        '<td class="nowrap">' +
           K.fmtDate(b.date) +
           '<span class="sub">' + new Date(b.date).toLocaleTimeString('ru-RU', {
             hour: '2-digit',
             minute: '2-digit'
           }) + '</span>' +
         '</td>' +
        '<td><span class="strong">' + K.esc(b.match) + '</span>' +
        '<span class="sub">' + K.esc(b.sport) + (b.bookmaker ? ' · ' + K.esc(b.bookmaker) : '') + '</span></td>' +
        '<td>' + K.esc(b.selection) + '<span class="sub">' + K.typeLabel(b.type) + '</span></td>' +
        '<td class="num strong">' + K.num(b.odds) + '</td>' +
        '<td class="num">' + K.money(b.stake) + '</td>' +
        '<td class="num strong ' + cls + '">' + (p === null ? '—' : K.signed(p)) + '</td>' +
        '<td><span class="badge ' + badge + '">' +
        K.statusLabel(b.status) +
        '</span></td>' +

        '<td class="quick-status-cell">' +
          '<div class="quick-status">' +

            '<button class="quick-status-btn quick-win" ' +
              'data-quick-status="won" ' +
              'data-id="' + b.id + '" ' +
              'title="Выигрыш">W</button>' +

            '<button class="quick-status-btn quick-loss" ' +
              'data-quick-status="lost" ' +
              'data-id="' + b.id + '" ' +
              'title="Проигрыш">L</button>' +

            '<button class="quick-status-btn quick-push" ' +
              'data-quick-status="push" ' +
              'data-id="' + b.id + '" ' +
              'title="Возврат">V</button>' +

            '<button class="quick-status-btn quick-cashout" ' +
              'data-quick-status="cashout" ' +
              'data-id="' + b.id + '" ' +
              'title="Выкуп">C</button>' +

            '<button class="quick-status-btn quick-pending" ' +
              'data-quick-status="pending" ' +
              'data-id="' + b.id + '" ' +
              'title="В игре">?</button>' +

          '</div>' +
        '</td>' +

        '<td><div class="row-actions">' +
        '<td><div class="row-actions">' +
        '<button class="mini-btn" data-again="' + b.id + '" title="Повторить ставку" aria-label="Повторить">↻</button>' +
        '<button class="mini-btn" data-edit="' + b.id + '" title="Редактировать" aria-label="Редактировать">✎</button>' +
        '<button class="mini-btn danger" data-del="' + b.id + '" title="Удалить" aria-label="Удалить">✕</button>' +
        '</div></td></tr>';
    }).join('');

    body.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openBetModal(btn.dataset.edit); });
    });
    body.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { removeBet(btn.dataset.del); });
    });
    body.querySelectorAll('[data-again]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var bet = find(btn.dataset.again);
        if (!bet) return;
        openBetModal(null, {
          match: bet.match, sport: bet.sport, type: bet.type, selection: bet.selection,
          odds: bet.odds, stake: bet.stake, bookmaker: bet.bookmaker
        });
      });
    });
    bindQuickStatus(body);
    bindSettle(body);
  }

  function bindQuickStatus(body) {
  body.querySelectorAll('[data-quick-status]').forEach(function (btn) {
    btn.addEventListener('click', function () {

      var id = btn.getAttribute('data-id');
      var next = btn.getAttribute('data-quick-status');
      var bet = find(id);

      if (!bet) return;

      var cashoutAmount = Number(bet.cashoutAmount) || 0;

      // Для выкупа спрашиваем фактическую сумму выплаты
      if (next === 'cashout') {
        var entered = prompt(
          'Сколько вернули при выкупе? ₽',
          cashoutAmount || bet.stake
        );

        if (entered === null) {
          return;
        }

        entered = parseFloat(
          String(entered).replace(',', '.')
        );

        if (!isFinite(entered) || entered < 0) {
          return K.toast(
            'Введите корректную сумму выкупа',
            'err'
          );
        }

        cashoutAmount = entered;
      }

      var oldBankDelta = K.bankDelta(bet);

      bet.status = next;
      bet.cashoutAmount =
        next === 'cashout'
          ? cashoutAmount
          : 0;

      var newBankDelta = K.bankDelta(bet);

      // Корректируем банк только на разницу
      K.changeBank(
        newBankDelta - oldBankDelta
      );

      K.save();
      window.KuruApp.rerender();

      var labels = {
        won: 'Выигрыш',
        lost: 'Проигрыш',
        push: 'Возврат',
        cashout: 'Выкуп',
        pending: 'В игре'
      };

      K.toast(
        'Статус: ' + labels[next],
        'ok'
      );
    });
  });
}

  function bindSettle(body) {
    body.querySelectorAll('tr').forEach(function (tr) {
      var bet = find(tr.dataset.id);
      if (!bet || !K.isSettled(bet)) return;
      var badge = tr.querySelector('.badge');
      if (!badge) return;
      badge.style.cursor = 'pointer';
      badge.title = 'Нажмите, чтобы изменить результат';
      badge.addEventListener('click', function () {
        var next = prompt('Новый результат: won (выигрыш), lost (проигрыш), push (возврат), pending (не рассчитана)', bet.status);
        if (next === null) return;
        next = next.trim().toLowerCase();
        if (['won', 'lost', 'push', 'pending'].indexOf(next) < 0) {
          window.KuruApp.toast('Неизвестный статус: ' + next, 'err');
          return;
        }
        var oldBankDelta = K.bankDelta(bet);

        bet.status = next;

        var newBankDelta = K.bankDelta(bet);

        // Меняем банк только на разницу
        K.changeBank(newBankDelta - oldBankDelta);

        K.save();
        window.KuruApp.rerender();

        window.KuruApp.toast('Результат обновлён', 'ok');
      });
    });
  }

  function find(id) {
    return K.state.bets.filter(function (b) { return b.id === id; })[0];
  }

  function removeBet(id) {
    var bet = find(id);
    if (!bet) return;
    if (!window.confirm(
    'Удалить ставку «' + bet.match +
    '»? Действие необратимо — сначала сделайте экспорт, если нужны данные.'
  )) return;

  // Убираем из банка результат этой ставки
  K.changeBank(-K.bankDelta(bet));

  K.state.bets = K.state.bets.filter(function (b) {
    return b.id !== id;
  });

  K.save();
  window.KuruApp.rerender();
  window.KuruApp.toast('Ставка удалена');
  }

  /* ---------- форма ---------- */

  function splitBetTeams(value) {
    var text = String(value || '').trim();
    if (!text) return { teamA: '', teamB: '' };

    var parts = text.split(/\s+[—–-]\s+|\s+vs\.?\s+/i);
    if (parts.length >= 2) {
      return { teamA: parts[0].trim(), teamB: parts.slice(1).join(' — ').trim() };
    }

    return { teamA: text, teamB: '' };
  }

  function fillBetLeagueList() {
    var list = el('betLeagueList');
    if (!list) return;

    var leagues = {};
    K.state.bets.forEach(function (bet) {
      if (bet.league) leagues[bet.league] = true;
    });

    if (Array.isArray(K.state.goalGames)) {
      K.state.goalGames.forEach(function (game) {
        if (game.league) leagues[game.league] = true;
      });
    }

    list.innerHTML = Object.keys(leagues)
      .sort(function (a, b) { return a.localeCompare(b, 'ru'); })
      .map(function (league) { return '<option value="' + K.esc(league) + '"></option>'; })
      .join('');
  }

  function fillBetTeamList() {
    var list = el('betTeamList');
    if (!list) return;

    var teams = {};
    K.state.bets.forEach(function (bet) {
      var parts = splitBetTeams(bet.match);
      if (parts.teamA) teams[parts.teamA] = true;
      if (parts.teamB) teams[parts.teamB] = true;
    });

    list.innerHTML = Object.keys(teams)
      .sort(function (a, b) { return a.localeCompare(b, 'ru'); })
      .map(function (team) { return '<option value="' + K.esc(team) + '"></option>'; })
      .join('');
  }

  function fillSportSelect(current) {
    var select = el('inSport');
    if (!select) return;

    var sports = ['Футбол', 'Хоккей', 'Баскетбол', 'Теннис', 'Киберспорт', 'Другое'];
    K.sports().forEach(function (sport) {
      if (sports.indexOf(sport) === -1) sports.push(sport);
    });
    if (current && sports.indexOf(current) === -1) sports.push(current);

    select.innerHTML = sports.map(function (sport) {
      return '<option value="' + K.esc(sport) + '">' + K.esc(sport) + '</option>';
    }).join('');
    select.value = current || 'Футбол';
  }

  function openBetModal(id, preset) {
    var modal = el('betModal');
    var form = el('betForm');
    form.reset();
    el('betModalTitle').textContent = id ? 'Редактирование ставки' : 'Новая ставка';
    el('betId').value = id || '';

    var bet = id ? find(id) : null;
    var data = bet || preset || {};

    var teams = splitBetTeams(data.match);

    el('inMatch').value = data.match || '';
    el('inTeamA').value = teams.teamA;
    el('inTeamB').value = teams.teamB;

    fillSportSelect(data.sport || 'Футбол');

    el('inType').value = data.type || 'moneyline';
    el('inLeague').value = data.league || '';
    el('inSelection').value = data.selection || '';
    el('inOdds').value = data.odds || '';
    el('inStake').value = data.stake || '';
    el('inFreebet').checked = !!data.freebet;
    el('inDate').value = K.dayKey(data.date || new Date());
    el('inBookmaker').value = data.bookmaker || '';
    el('inStatus').value = data.status || 'pending';
    el('inComment').value = data.comment || '';
    el('bankHint').textContent = 'банк ' + K.money(K.state.settings.bank) +
      ' · 1% = ' + K.money(K.state.settings.bank * 0.01);

    modal.classList.add('open');
    setTimeout(function () {
      el('inTeamA').focus();
    }, 30);

    fillBetTeamList();
    fillBetLeagueList();
  }

  function saveBet(event) {
    event.preventDefault();

    var id = el('betId').value;
    var teamA = el('inTeamA').value.trim();
    var teamB = el('inTeamB').value.trim();

    if (!teamA || !teamB) return window.KuruApp.toast('Укажите обе команды', 'err');
    if (teamA.toLowerCase() === teamB.toLowerCase()) return window.KuruApp.toast('Команды должны различаться', 'err');

    var match = teamA + ' — ' + teamB;
    el('inMatch').value = match;

    var payload = {
      id: id || K.uid(),
      match: match,
      sport: el('inSport').value.trim() || 'Другое',
      league: el('inLeague').value.trim(),
      type: el('inType').value,
      selection: el('inSelection').value.trim(),
      odds: parseFloat(el('inOdds').value),
      stake: parseFloat(el('inStake').value),
      freebet: el('inFreebet').checked,
      status: el('inStatus').value,
      date: new Date(el('inDate').value + 'T' + (id ? '12:00' : new Date().toTimeString().slice(0, 5)) + ':00').toISOString(),
      bookmaker: el('inBookmaker').value.trim(),
      comment: el('inComment').value.trim(),
      createdAt: new Date().toISOString()
    };

    if (!payload.selection) return window.KuruApp.toast('Укажите рынок', 'err');
    if (!(payload.odds >= 1.01)) return window.KuruApp.toast('Коэффициент должен быть не меньше 1.01', 'err');
    if (!(payload.stake > 0)) return window.KuruApp.toast('Сумма ставки должна быть больше нуля', 'err');

    var bet = K.normalizeBet(payload);

    if (id) {
      var oldBet = K.state.bets.filter(function (b) { return b.id === id; })[0];

      if (oldBet) {
        var oldBankDelta = K.bankDelta(oldBet);
        var newBankDelta = K.bankDelta(bet);
        K.changeBank(newBankDelta - oldBankDelta);
        bet.createdAt = oldBet.createdAt || bet.createdAt;
      }

      K.state.bets = K.state.bets.map(function (b) { return b.id === id ? bet : b; });
      window.KuruApp.toast('Ставка обновлена', 'ok');
    } else {
      var inPlay = K.state.bets
  .filter(function (b) {
    return b.status === 'pending';
  })
  .reduce(function (sum, b) {
    return sum + (b.freebet ? 0 : (Number(b.stake) || 0));
  }, 0);

var availableBank = Math.max(
  0,
  (Number(K.state.settings.bank) || 0) - inPlay
);

if (!id && bet.status === 'pending' && bet.stake > availableBank) {
  return window.KuruApp.toast(
    'Недостаточно свободного банка. Доступно: ' +
    K.money(availableBank),
    'err'
  );
}
      K.state.bets.push(bet);
      K.changeBank(K.bankDelta(bet));

      var dayStake = K.state.bets
        .filter(function (b) { return K.dayKey(b.date) === K.dayKey(bet.date); })
        .reduce(function (sum, b) { return sum + b.stake; }, 0);

      if (K.state.settings.dailyLimit > 0 && dayStake > K.state.settings.dailyLimit) {
        window.KuruApp.toast('Внимание: дневной лимит превышен на ' + K.money(dayStake - K.state.settings.dailyLimit), 'err');
      } else {
        window.KuruApp.toast('Ставка добавлена', 'ok');
      }
    }

    K.save();
    el('betModal').classList.remove('open');
    window.KuruApp.rerender();
  }

  function bind() {
    el('betForm').addEventListener('submit', saveBet);
    el('quickStakes').querySelectorAll('[data-pct]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pct = parseFloat(btn.dataset.pct) / 100;
        el('inStake').value = Math.round(K.state.settings.bank * pct);
      });
    });

    el('fltSearch').addEventListener('input', function (e) { K.filters.search = e.target.value; renderBets(); });
    el('fltSport').addEventListener('change', function (e) { K.filters.sport = e.target.value; renderBets(); });
    el('fltStatus').addEventListener('change', function (e) { K.filters.status = e.target.value; renderBets(); });
    el('fltFrom').addEventListener('change', function (e) { K.filters.from = e.target.value; renderBets(); });
    el('fltTo').addEventListener('change', function (e) { K.filters.to = e.target.value; renderBets(); });
    el('fltOddsMin').addEventListener('input', function (e) { K.filters.oddsMin = e.target.value; renderBets(); });
    el('fltOddsMax').addEventListener('input', function (e) { K.filters.oddsMax = e.target.value; renderBets(); });
    el('fltSort').addEventListener('change', function (e) { K.filters.sort = e.target.value; renderBets(); });
    el('fltReset').addEventListener('click', function () {
      K.filters = { search: '', sport: '', status: '', from: '', to: '', oddsMin: '', oddsMax: '', sort: 'date-desc' };
      ['fltSearch', 'fltSport', 'fltStatus', 'fltFrom', 'fltTo', 'fltOddsMin', 'fltOddsMax'].forEach(function (id) { el(id).value = ''; });
      el('fltSort').value = 'date-desc';
      renderBets();
      window.KuruApp.toast('Фильтры сброшены');
    });
  }

  function renderFilterSports() {
    var select = el('fltSport');
    if (!select) return;
    var current = select.value;
    select.innerHTML = '<option value="">Все</option>' + K.sports().map(function (s) {
      return '<option value="' + K.esc(s) + '">' + K.esc(s) + '</option>';
    }).join('');
    select.value = current;
  }

  K.renderBets = renderBets;
  K.openBetModal = openBetModal;
  K.bindBetUi = bind;
  K.renderFilterSports = renderFilterSports;
})(KuruBets);

'use strict';

/* ============================================================
   Часть 5: аналитика, настройки, импорт/экспорт, роутер, инициализация
   ============================================================ */
(function (K) {
  function el(id) { return document.getElementById(id); }

  /* ---------- таблицы аналитики ---------- */

  function statsRow(row, label) {
    var cls = row.profit > 0 ? 'pos' : row.profit < 0 ? 'neg' : 'zero';
    return '<tr><td class="strong">' + K.esc(label) + '</td>' +
      '<td class="num">' + row.count + '</td>' +
      '<td class="num">' + row.strike.toFixed(1) + '%</td>' +
      '<td class="num">' + K.money(row.turnover) + '</td>' +
      '<td class="num strong ' + cls + '">' + K.signed(row.profit) + '</td>' +
      '<td class="num ' + cls + '">' + K.pct(row.roi) + '</td></tr>';
  }

  var EMPTY_COLS = '<tr><td colspan="6" class="empty">Нет рассчитанных ставок за выбранный период</td></tr>';

  function renderAnalytics() {
    var bets = K.rangeBets ? K.rangeBets() : K.state.bets;
    var settled = bets.filter(K.isSettled);

    var bySport = K.groupStats(settled, function (b) { return b.sport; });
    var byType = K.groupStats(settled, function (b) { return K.typeLabel(b.type); });
    var byOdds = K.groupStats(settled, function (b) { return K.oddsBucket(b.odds); }, K.ODDS_BUCKETS);
    var byWeek = K.groupStats(settled, function (b) {
      return K.WEEKDAYS[(new Date(b.date).getDay() + 6) % 7];
    }, K.WEEKDAYS);

    function fill(id, rows, labelFn) {
      var body = el(id);
      if (!body) return;
      body.innerHTML = rows.length
        ? rows.map(function (r) { return statsRow(r, labelFn ? labelFn(r) : r.key); }).join('')
        : EMPTY_COLS;
    }

    fill('bySportBody', bySport);
    fill('byTypeBody', byType);
    fill('byOddsBody', byOdds);
    fill('byWeekdayBody', byWeek);

    var note = el('analyticsNote');
    if (note) note.textContent = 'всего ставок: ' + bets.length + ' · рассчитано: ' + settled.length;

    var s = K.computeStats(bets);
    var streakBox = el('streakBox');
    if (streakBox) {
      streakBox.innerHTML =
        stat(K.num(s.avgOdds), 'средний коэффициент') +
        stat(s.breakeven.toFixed(1) + '%', 'безубыточный % захода') +
        stat(s.strike.toFixed(1) + '%', 'фактический % захода') +
        stat(s.bestWin, 'лучшая серия выигрышей') +
        stat(s.worstLose, 'худшая серия проигрышей') +
        stat(s.currentWin + ' / ' + s.currentLose, 'текущая серия В / П') +
        stat(K.signed(s.maxWin), 'крупнейший выигрыш') +
        stat(K.signed(s.maxLoss), 'крупнейший проигрыш') +
        stat(K.money(s.avgWin), 'средний выигрыш') +
        stat(K.money(s.avgLoss), 'средний проигрыш') +
        stat(K.money(s.exposure), 'в игре (не рассчитано)') +
        stat(K.money(s.avgStake), 'средняя ставка');
    }

    var today = K.dayKey(new Date());
    var todayBets = K.state.bets.filter(function (b) { return K.dayKey(b.date) === today; });
    var weekStart = K.mondayOf(new Date());
    var weekBets = K.state.bets.filter(function (b) { return new Date(b.date) >= weekStart; });
    var disc = el('disciplineBox');
    if (disc) {
      disc.innerHTML =
        stat(todayBets.length + ' / ' + (K.state.settings.maxBetsPerDay || '—'), 'ставок сегодня') +
        stat(K.money(todayBets.reduce(function (a, b) { return a + b.stake; }, 0)), 'объём сегодня') +
        stat(K.money(weekBets.reduce(function (a, b) { return a + b.stake; }, 0)), 'объём за неделю') +
        stat(K.money(K.state.settings.dailyLimit), 'лимит на день') +
        stat(K.money(K.state.settings.weeklyLimit), 'лимит на неделю') +
        stat(K.money(K.state.settings.bank), 'текущий банк');
    }
  }

  function stat(value, label) {
    return '<div class="stat"><b>' + value + '</b><span>' + label + '</span></div>';
  }

  /* ---------- данные ---------- */

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }

  function exportJson() {
    download('kurubets-' + K.dayKey(new Date()) + '.json', JSON.stringify(K.state, null, 2));
    window.KuruApp.toast('Экспорт JSON готов', 'ok');
  }

  function exportCsv() {
    var head = ['Дата', 'Матч', 'Вид спорта', 'Тип', 'Рынок', 'Коэффициент', 'Ставка', 'Статус', 'Прибыль', 'Букмекер', 'Комментарий'];
    var rows = K.state.bets.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); }).map(function (b) {
      var p = K.profitOf(b);
      return [
        K.fmtDateTime(b.date), b.match, b.sport, K.typeLabel(b.type), b.selection,
        K.num(b.odds), Math.round(b.stake), K.statusLabel(b.status),
        p === null ? '' : Math.round(p), b.bookmaker || '', (b.comment || '').replace(/[\r\n]+/g, ' ')
      ].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(';');
    });
    download('kurubets-' + K.dayKey(new Date()) + '.csv', '\ufeff' + [head.join(';')].concat(rows).join('\r\n'), 'text/csv;charset=utf-8');
    window.KuruApp.toast('Экспорт CSV готов', 'ok');
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object') throw new Error('структура не распознана');
        if (Array.isArray(data.bets)) {
          K.state.bets = data.bets.map(K.normalizeBet).filter(Boolean);
        }
        if (Array.isArray(data.matches)) K.state.matches = data.matches.filter(function (m) { return m && m.id; });
        if (Array.isArray(data.goalGames)) {
          K.state.goalGames = data.goalGames.map(K.normalizeGoalGame).filter(Boolean);
        }
        if (data.settings) Object.assign(K.state.settings, data.settings);
        K.save();
        window.KuruApp.rerender();
        window.KuruApp.toast('Импортировано ставок: ' + K.state.bets.length, 'ok');
      } catch (e) {
        window.KuruApp.toast('Не удалось прочитать файл: ' + e.message, 'err');
      }
    };
    reader.onerror = function () { window.KuruApp.toast('Ошибка чтения файла', 'err'); };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!window.confirm('Удалить ВСЕ ставки, матчи и настройки? Это нельзя отменить.')) return;
    localStorage.removeItem(K.STORE_KEY);
    K.state = K.clone(K.DEFAULTS);
    K.state.bets = [];
    K.state.matches = [];
    K.state.goalGames = [];
    K.save();
    window.KuruApp.rerender();
    window.KuruApp.toast('Все данные удалены');
  }

  function bindSettings() {
    var modal = el('settingsModal');

    function fill() {
      el('setBank').value = K.state.settings.bank;
      el('setDaily').value = K.state.settings.dailyLimit;
      el('setWeekly').value = K.state.settings.weeklyLimit;
      el('setMaxBets').value = K.state.settings.maxBetsPerDay;
      var used = 0;
      try { used = (localStorage.getItem(K.STORE_KEY) || '').length; } catch (e) { used = 0; }
      el('storageInfo').textContent = 'Ставок: ' + K.state.bets.length + ' · матчей голов: ' + K.state.goalGames.length +
        ' · размер записи в localStorage: ' + (used / 1024).toFixed(1) + ' КБ';
    }

    el('settingsBtn').addEventListener('click', function () { fill(); modal.classList.add('open'); });

    ['setBank', 'setDaily', 'setWeekly', 'setMaxBets'].forEach(function (id) {
      el(id).addEventListener('change', function () {
        var map = { setBank: 'bank', setDaily: 'dailyLimit', setWeekly: 'weeklyLimit', setMaxBets: 'maxBetsPerDay' };
        K.state.settings[map[id]] = Math.max(0, Math.round(parseFloat(el(id).value) || 0));
        K.save();
        window.KuruApp.rerender();
        window.KuruApp.toast('Настройки сохранены', 'ok');
      });
    });

    el('exportJson').addEventListener('click', exportJson);
    el('exportCsv').addEventListener('click', exportCsv);
    el('importJson').addEventListener('click', function () { el('importFile').click(); });
    el('importFile').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });
    el('clearAll').addEventListener('click', clearAll);
  }

  /* ---------- приложение ---------- */

  var routes = ['/', '/bets', '/analytics', '/goals'];
  var scrollMem = {};

  function activeRoute() {
    var hash = (location.hash || '#/').replace(/^#/, '');
    return routes.indexOf(hash) >= 0 ? hash : '/';
  }

  function navigate() {
    var route = activeRoute();
    K.state.ui.route = route;

    document.querySelectorAll('.page').forEach(function (page) {
      page.classList.toggle('active', page.dataset.page === route);
    });
    document.querySelectorAll('.main-nav a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.route === route);
    });
    document.title = ({
      '/': 'KuruBets — обзор', '/bets': 'KuruBets — мои ставки',
      '/analytics': 'KuruBets — аналитика', '/goals': 'KuruBets — голы 5×5'
    })[route];

    closeMenu();
    renderRouteData(route);
    window.scrollTo(0, scrollMem[route] || 0);
  }

  function updateTopBank() {
    var bank = Number(K.state.settings.bank) || 0;
    var pendingBets = K.state.bets.filter(function (bet) {return bet.status === 'pending' && !bet.freebet;});
    var inPlay = pendingBets.reduce(function (sum, bet) { return sum + (Number(bet.stake) || 0); }, 0);
    var potentialProfit = pendingBets.reduce(function (sum, bet) {
      var stake = Number(bet.stake) || 0;
      var odds = Number(bet.odds) || 1;
      return sum + stake * Math.max(0, odds - 1);
    }, 0);

    var topBank = el('topBank');
    var topInPlay = el('topInPlay');
    var topPotentialBank = el('topPotentialBank');

    if (topBank) topBank.textContent = K.money(Math.max(0, bank - inPlay));
    if (topInPlay) topInPlay.textContent = K.money(inPlay);
    if (topPotentialBank) topPotentialBank.textContent = K.money(bank + potentialProfit);
  }

function renderRouteData(route) {
  if (route === '/') {
    K.renderOverview();
  }

  if (route === '/bets') {
    K.renderFilterSports();
    K.renderBets();
  }

  if (route === '/analytics') {
    renderAnalytics();
  }

  if (route === '/goals') {
    K.renderGoalsUi();
  }

  // Верхняя панель обновляется на любой странице
  updateTopBank();
}


  function rerender() {
  var route = activeRoute();

  renderRouteData(route);

  document.querySelectorAll('.page').forEach(function (page) {
    page.classList.toggle(
      'active',
      page.dataset.page === route
    );
  });
}

  var toastTimer;
  function toast(text, kind) {
    var box = el('toast');
    box.textContent = text;
    box.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.className = 'toast'; }, 2800);
  }

  function openMenu() { el('mainNav').classList.add('open'); el('scrim').classList.add('show'); }
  function closeMenu() { el('mainNav').classList.remove('open'); el('scrim').classList.remove('show'); }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', K.state.settings.theme || 'dark');
  }

  function bindChrome() {
    el('menuBtn').addEventListener('click', openMenu);
    el('scrim').addEventListener('click', closeMenu);

    el('themeBtn').addEventListener('click', function () {
      K.state.settings.theme = (K.state.settings.theme === 'dark') ? 'light' : 'dark';
      K.save();
      applyTheme();
      toast('Тема: ' + (K.state.settings.theme === 'dark' ? 'тёмная' : 'светлая'));
    });

   [ 'addBetBtn', 'addBetBtn2' ].forEach(function (id) {
     var node = el(id);
   
     if (node) {
       node.addEventListener('click', function () {
         K.openBetModal(null);
       });
     }
   });
   
   var expressBtn = el('addExpressBtn');
   
   if (expressBtn) {
     expressBtn.addEventListener('click', function () {
   
       K.openBetModal(null, {
         type: 'combo',
         selection: '',
         odds: '',
         stake: ''
       });
   
       var type = el('inType');
   
       if (type) {
         type.value = 'combo';
       }
   
       var title = el('betModalTitle');
   
       if (title) {
         title.textContent = 'Новый экспресс';
       }
   
       var selection = el('inSelection');
   
       if (selection) {
         selection.placeholder =
           'Например: П1 + ТБ 2.5 + Обе забьют';
       }
     });
   }

    document.querySelectorAll('[data-close-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.closest('.modal').classList.remove('open');
      });
    });
    document.querySelectorAll('.modal').forEach(function (modal) {
      modal.addEventListener('mousedown', function (e) {
        if (e.target === modal) modal.classList.remove('open');
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.open').forEach(function (m) { m.classList.remove('open'); });
        closeMenu();
      }
    });

    el('rangeChips').querySelectorAll('[data-days]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        K.state.ui.range = parseInt(chip.dataset.days, 10);
        K.save();
        el('rangeChips').querySelectorAll('[data-days]').forEach(function (c) {
          c.classList.toggle('active', c === chip);
        });
        K.renderOverview();
        renderAnalytics();
        if (K.renderGoalsUi) K.renderGoalsUi();
      });
    });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (activeRoute() === '/') K.renderChart();
      }, 220);
    });

    window.addEventListener('beforeunload', function () {
      scrollMem[activeRoute()] = window.scrollY;
    });
  }

  function boot() {
    K.load();
    applyTheme();
    K.buildFeed(false);

      el('rangeChips').querySelectorAll('[data-days]').forEach(function (c) {
        c.classList.toggle('active', parseInt(c.dataset.days, 10) === K.state.ui.range);
      });

      bindChrome();
      K.bindBetUi();
      if (K.bindGoalsUi) K.bindGoalsUi();
      bindSettings();

    if (!location.hash) location.hash = '#/';
    window.addEventListener('hashchange', navigate);
    navigate();

    if (!K.state.bets.length) {
      toast('Данных нет — добавьте ставку');
    }
  }

  window.KuruApp = {
    boot: boot, navigate: navigate, rerender: rerender, toast: toast,
    openBetFromMatch: function (match, side) {
      var label = { h: 'П1 (' + match.home + ')', x: 'X', a: 'П2 (' + match.away + ')', over: 'ТБ ' + match.total.line, under: 'ТМ ' + match.total.line };
      var odds = side === 'over' ? match.total.over : side === 'under' ? match.total.under : match.odds[side];
      K.openBetModal(null, {
        match: match.home + ' — ' + match.away,
        sport: match.sport,
        type: side === 'over' || side === 'under' ? 'total' : 'moneyline',
        selection: label[side] || 'П1',
        odds: odds,
        stake: 500
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(KuruBets);

/* ============================================================
   Часть 6: «Голы 5×5» — среднее голов по командам и прогноз пары
   ============================================================ */
(function (K) {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function esc(s) { return K.esc ? K.esc(s) : String(s); }

  /* ГГГГ-ММ-ДД из Date: input[type=date] не принимает ISO со временем */
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function isoDay(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  var MAX_GOALS = 4;  /* счёт в матрице 0..4, 4 = «5 и больше» */
  var MIN_GAMES = 2;  /* среднее показываем только начиная со 2-й игры */

  /* ---------- среднее голов: единый источник — K.state.goalGames ---------- */

  function games() {
    return Array.isArray(K.state.goalGames) ? K.state.goalGames : [];
  }

  function writeGames(list) {
    K.state.goalGames = list;
    K.save();
  }

  /* Русская форма числа слов: 1 матч, 2–4 матча, 5+ матчей */
  function matchWord(n) {
    var k = Math.abs(n) % 100, t = k % 10;
    if (k >= 11 && k <= 14) return 'матчей';
    if (t === 1) return 'матч';
    if (t >= 2 && t <= 4) return 'матча';
    return 'матчей';
  }

  /* 1 гол, 2–4 гола, 5+ голов */
  function goalWord(n) {
    var k = Math.abs(n) % 100, t = k % 10;
    if (k >= 11 && k <= 14) return 'голов';
    if (t === 1) return 'гол';
    if (t >= 2 && t <= 4) return 'гола';
    return 'голов';
  }

  var pick = { a: '', b: '' };

  /* ---------- средние величины ---------- */

  function avg(list, fn) {
    if (!list.length) return null;
    var sum = 0;
    list.forEach(function (m) { sum += fn(m); });
    return sum / list.length;
  }

  /* Форматируем среднее: «1.50», а без матчей — прочерк */
  function fmtAvg(v) { return v === null ? '—' : v.toFixed(2); }

  /* ---------- агрегаты по всем командам ---------- */

  function teamStats(list) {
    var byTeam = {};

    function touch(name) {
      if (!byTeam[name]) {
        byTeam[name] = { name: name, all: [], scored: 0, missed: 0 };
      }
      return byTeam[name];
    }

    list.forEach(function (g) {
      var a = touch(g.teamA);
      var b = touch(g.teamB);

      /* Одна игра = два наблюдения: для команды это (забито, пропущено, дом/выезд) */
      var ga = { scored: g.goalsA, missed: g.goalsB, home: true };
      var gb = { scored: g.goalsB, missed: g.goalsA, home: false };

      a.all.push(ga);
      b.all.push(gb);

      a.scored += g.goalsA; a.missed += g.goalsB;
      b.scored += g.goalsB; b.missed += g.goalsA;
    });

    Object.keys(byTeam).forEach(function (name) {
      var t = byTeam[name];
      t.avgScored = avg(t.all, function (m) { return m.scored; });
      t.avgMissed = avg(t.all, function (m) { return m.missed; });
      /* Домашняя атака/оборона: берём только игры дома, гостевые — отдельно */
      t.homeGames = t.all.filter(function (m) { return m.home; });
      t.awayGames = t.all.filter(function (m) { return !m.home; });
      t.avgScoredHome = avg(t.homeGames, function (m) { return m.scored; });
      t.avgMissedHome = avg(t.homeGames, function (m) { return m.missed; });
      t.avgScoredAway = avg(t.awayGames, function (m) { return m.scored; });
      t.avgMissedAway = avg(t.awayGames, function (m) { return m.missed; });
    });

    return byTeam;
  }

  /* Среднее голов: последние n матчей команды (по умолчанию 5 — отсюда и «5×5») */
  function recentAvg(list, teamName, field, n) {
    var key = String(teamName).toLowerCase();
    var sorted = list.slice().sort(function (x, y) {
      return String(x.date).localeCompare(String(y.date));
    });
    var vals = [];

    for (var i = sorted.length - 1; i >= 0 && vals.length < n; i--) {
      var g = sorted[i];
      var isA = String(g.teamA).toLowerCase() === key;
      var isB = String(g.teamB).toLowerCase() === key;
      if (!isA && !isB) continue;
      vals.push(field === 'scored' ? (isA ? g.goalsA : g.goalsB) : (isA ? g.goalsB : g.goalsA));
    }

    if (!vals.length) return null;
    var sum = 0;
    vals.forEach(function (v) { sum += v; });
    return sum / vals.length;
  }

  /* Ожидаемые мячи: атака команды с поправкой на оборону соперника.
     lambda = (свои средние + средние пропускаемости соперника) / 2. */
  function expectedGoals(att, def) {
    if (att === null || def === null) return null;
    /* Атака своей команды + оборона соперника, усреднённо */
    return Math.max(0.05, (att + def) / 2);
  }

  /* Распределение Пуассона: P(X = k) для k = 0..MAX_GOALS, остаток в MAX_GOALS */
  function poisson(lambda) {
    var p = [], fact = 1;
    for (var k = 0; k <= MAX_GOALS; k++) {
      if (k > 0) fact *= k;
      p.push(Math.exp(-lambda) * Math.pow(lambda, k) / fact);
    }
    var rest = 0;
    for (var j = 0; j < MAX_GOALS; j++) rest += p[j];
    p[MAX_GOALS] = Math.max(p[MAX_GOALS], 1 - rest);
    return p;
  }

  /* Матрица счетов: pa — вероятности мячей хозяина, pb — гостя */
  function scoreMatrix(pa, pb) {
    var rows = [];
    for (var i = 0; i <= MAX_GOALS; i++) {
      var row = [];
      for (var j = 0; j <= MAX_GOALS; j++) row.push(pa[i] * pb[j]);
      rows.push(row);
    }
    return rows;
  }

  /* Поворот матрицы: строки ↔ столбцы (смена хозяина и гостя местами) */
  function transpose(m) {
    return m[0].map(function (_, c) { return m.map(function (row) { return row[c]; }); });
  }

  /* 2.5 → «2.5», 3 → «3» */
  function fmtLine(v) { return (Math.round(v * 10) / 10).toString(); }

  function sumWhere(m, test) {
    var v = 0;
    for (var i = 0; i < m.length; i++) {
      for (var j = 0; j < m[i].length; j++) if (test(i, j)) v += m[i][j];
    }
    return v;
  }

  function pct(v) { return (v * 100).toFixed(1) + '%'; }

  /* Обратная котировка букмекера: 1 / вероятность */
  function odd(p) { return p > 0 ? (1 / p).toFixed(2) : '—'; }

  function market(label, p) {
    return '<div class="fc-market"><span class="fc-market-label">' + label + '</span>' +
      '<span class="fc-market-value">' + pct(p) + '</span>' +
      '<span class="muted tiny">коэф. ' + odd(p) + '</span></div>';
  }

  /* ---------- блок «нужно ещё матчей» ---------- */

  function needMore(a, b) {
    function one(name, count) {
      if (count >= MIN_GAMES) return '';
      var left = MIN_GAMES - count;
      return '<p class="hint">' + esc(name) + ': сыграно ' + count + ' ' + matchWord(count) +
        '. Чтобы получить точное среднее голов и прогноз, добавьте ещё ' + left + ' ' + matchWord(left) +
        ' — сейчас цифра по этой команде не показывается.</p>';
    }
    return one(a.name, a.all.length) + one(b.name, b.all.length);
  }

  function renderAverages(byTeam) {
    var tbody = el('goalTeamsBody');
    if (!tbody) return;

    var names = Object.keys(byTeam).sort(function (a, b) {
      return byTeam[b].all.length - byTeam[a].all.length || a.localeCompare(b, 'ru');
    });

    if (!names.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">Добавьте первый матч — здесь появится среднее голов по командам.</td></tr>';
      return;
    }

    tbody.innerHTML = names.map(function (name) {
      var t = byTeam[name];
      var ready = t.all.length >= MIN_GAMES;
      var tip = ' title="Сыграно матчей: ' + t.all.length + '. Среднее начнём показывать со ' + MIN_GAMES + '."';

      function cell(v) {
        return ready ? '<td class="num strong">' + fmtAvg(v) + '</td>'
                     : '<td class="num muted"' + tip + '>—</td>';
      }

      var forecast = ready
        ? '<td class="num strong">' + fmtAvg(expectedGoals(
            t.avgScoredHome !== null ? t.avgScoredHome : t.avgScored,
            t.avgMissedAway !== null ? t.avgMissedAway : t.avgMissed)) + '</td>'
        : '<td class="num muted"' + tip + '>—</td>';

      return '<tr>' +
        '<td class="strong">' + esc(name) + '</td>' +
        '<td class="num">' + t.all.length + '</td>' +
        '<td class="num">' + t.scored + '</td>' +
        cell(t.avgScored) +
        '<td class="num">' + t.missed + '</td>' +
        cell(t.avgMissed) +
        '<td class="num">' + t.homeGames.length + ' / ' + t.awayGames.length + '</td>' +
        forecast +
        '</tr>';
    }).join('');
  }

  /* ---------- рендер блока прогноза ---------- */

  function renderForecast(byTeam, selA, selB) {
    var box = el('pfBody');
    var matrixHead = el('pfMatrixHead');
    var matrixBody = el('pfMatrixBody');
    if (!box) return;

    /* Список личных встреч: состояние свёртки переживает перерендер */
    var h2hCollapsed = {};

    function bindH2hToggle(box) {
      var btn = box.querySelector('[data-h2h-more]');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var card = btn.closest('.h2h');
        if (!card) return;
        var nowCollapsed = !card.classList.contains('is-collapsed');
        card.classList.toggle('is-collapsed', nowCollapsed);
        h2hCollapsed[card.dataset.h2hKey] = nowCollapsed;
        var total = parseInt(card.dataset.h2hCount, 10) || 0;
        btn.textContent = nowCollapsed ? 'Показать все (' + total + ')' : 'Свернуть';
      });
    }





    function clearMatrix() {
      if (matrixHead) matrixHead.innerHTML = '';
      if (matrixBody) matrixBody.innerHTML = '';
    }

    if (!selA || !selB) {
      box.innerHTML = '<p class="muted">Выберите обе команды — покажу ожидаемые голы, исход и счёт 5×5.</p>';
      clearMatrix(); return;
    }
    if (selA === selB) {
      box.innerHTML = '<p class="notice warn">Это одна и та же команда — выберите двух разных соперников.</p>';
      clearMatrix(); return;
    }

    var a = byTeam[selA];
    var b = byTeam[selB];
    if (!a || !b) {
      box.innerHTML = '<p class="muted">Нет данных по выбранным командам.</p>';
      clearMatrix(); return;
    }
    if (a.all.length < MIN_GAMES || b.all.length < MIN_GAMES) {
      box.innerHTML = needMore(a, b);
      clearMatrix(); return;
    }

    /* Хозяин — команда A, гость — команда B */
    var lambdaA = expectedGoals(a.avgScoredHome !== null ? a.avgScoredHome : a.avgScored,
                                b.avgMissedAway !== null ? b.avgMissedAway : b.avgMissed);
    var lambdaB = expectedGoals(b.avgScoredAway !== null ? b.avgScoredAway : b.avgScored,
                                a.avgMissedHome !== null ? a.avgMissedHome : a.avgMissed);

    var pa = poisson(lambdaA);
    var pb = poisson(lambdaB);
    var m = scoreMatrix(pa, pb);

    var pWinA = sumWhere(m, function (i, j) { return i > j; });
    var pDraw = sumWhere(m, function (i, j) { return i === j; });
    var pWinB = sumWhere(m, function (i, j) { return i < j; });

    /* Тотал считаем по выбранной линии из формы прогноза */
    var lineEl = el('pfLine');
    var line = lineEl ? parseFloat(lineEl.value) || 2.5 : 2.5;
    var pOver = sumWhere(m, function (i, j) { return i + j > line; });
    var pUnder = 1 - pOver;
    var pBtts = sumWhere(m, function (i, j) { return i > 0 && j > 0; });

    /* Дом/выезд: если галка снята, команды меняются сторонами */
    var homeFirst = true;
    var homeChk = el('pfHome');
    if (homeChk) homeFirst = !!homeChk.checked;

    var nameA = homeFirst ? selA : selB;
    var nameB = homeFirst ? selB : selA;

    var labelEl = el('pfHomeLabel');
    if (labelEl) {
      labelEl.textContent = homeFirst ? nameA + ' играет дома' : nameB + ' играет дома';
    }

    var la = homeFirst ? lambdaA : lambdaB;
    var lb = homeFirst ? lambdaB : lambdaA;
    var pH = homeFirst ? pWinA : pWinB;
    var pA = homeFirst ? pWinB : pWinA;
    var matrix = homeFirst ? m : transpose(m);

    var best = pH >= pDraw && pH >= pA ? 'П1' : (pA >= pDraw ? 'П2' : 'Ничья');

    /* История личных встреч: баланс сверху + список всех игр (сворачивается) */
    function meetings() {
      var ka = selA.toLowerCase(), kb = selB.toLowerCase();
      var list = [];
      games().forEach(function (g) {
        var tA = String(g.teamA).toLowerCase();
        var tB = String(g.teamB).toLowerCase();
        if ((tA === ka && tB === kb) || (tA === kb && tB === ka)) list.push(g);
      });
      if (!list.length) return '';

      list.sort(function (x, y) {
        return String(y.date).localeCompare(String(x.date)) || String(y.createdAt).localeCompare(String(x.createdAt));
      });

      var w = 0, d = 0, l = 0;
      var gf = 0, ga = 0;
      list.forEach(function (g) {
        var aHome = String(g.teamA).toLowerCase() === ka;
        var mine = aHome ? g.goalsA : g.goalsB;
        var theirs = aHome ? g.goalsB : g.goalsA;
        gf += mine; ga += theirs;
        if (mine > theirs) w++; else if (mine < theirs) l++; else d++;
      });

      /* По умолчанию список свёрнут; если пару уже разворачивали — остаётся открытой */
      var h2hKey = selA.toLowerCase() + '|' + selB.toLowerCase();
      var collapsed = h2hCollapsed[h2hKey] === undefined ? true : !!h2hCollapsed[h2hKey];
      var collapsedCls = collapsed ? ' is-collapsed' : '';
      var html = '<div class="h2h' + collapsedCls + '" data-h2h-key="' + esc(h2hKey) + '" data-h2h-count="' + list.length + '"><div class="h2h-title">Head to head</div>' +
        '<div class="h2h-head">' +
        '<span class="h2h-team"><b>' + esc(selA) + '</b></span>' +
        '<span class="h2h-stat"><strong>' + w + '</strong><small>побед</small></span>' +
        '<span class="h2h-stat"><strong>' + d + '</strong><small>ничьих</small></span>' +
        '<span class="h2h-stat"><strong>' + l + '</strong><small>поражений</small></span>' +
        '<span class="h2h-stat"><strong>' + gf + ':' + ga + '</strong><small>мячи</small></span>' +
        '<span class="h2h-team h2h-team-right"><b>' + esc(selB) + '</b></span>' +
        '</div>';

      html += '<div class="h2h-rows">';
      list.forEach(function (g) {
        var aHome = String(g.teamA).toLowerCase() === ka;
        var mine = aHome ? g.goalsA : g.goalsB;
        var theirs = aHome ? g.goalsB : g.goalsA;
        var winCls = mine > theirs ? 'h2h-win' : (mine < theirs ? 'h2h-loss' : '');
        html += '<div class="h2h-row ' + winCls + '">' +
          '<span class="h2h-date muted">' + esc(K.fmtDate(g.date)) + '</span>' +
          '<span class="h2h-teams">' + esc(g.teamA) + ' — ' + esc(g.teamB) + '</span>' +
          '<span class="h2h-league muted">' + (g.league ? esc(g.league) : '') + '</span>' +
          '<span class="h2h-score"><b class="' + (mine > theirs ? 'pos' : mine < theirs ? 'neg' : '') + '">' +
          mine + ':' + theirs + '</b></span>' +
          '<span class="h2h-verdict muted">' + (mine > theirs ? 'В' : mine < theirs ? 'П' : 'Н') + '</span>' +
          '</div>';
      });
      html += '</div>';

      if (list.length > 5) {
        html += '<button class="h2h-more" type="button" data-h2h-more>' +
          (collapsed ? 'Показать все (' + list.length + ')' : 'Свернуть') + '</button>';
      }
      html += '</div>';
      return html;
    }

    var html = '<div class="fc-head"><strong>' + esc(nameA) + '</strong><span class="muted"> дома </span>' +
      '<strong>' + esc(nameB) + '</strong>' +
      '<span class="muted"> · ожидаемые голы ' + la.toFixed(2) + ' : ' + lb.toFixed(2) + '</span></div>';

    /* Прогноз на матч: кто, по мнению модели, победит (или ничья) */
    var tip = pH >= pDraw && pH >= pA ? 'Победа ' + nameA : (pA >= pDraw ? 'Победа ' + nameB : 'Ничья');
    var tipLine = '<div class="pf-tip"><span class="muted">Прогноз на матч: </span><b>' + esc(tip) + '</b></div>';

    html += tipLine;


    html += meetings();





    html += '<div class="fc-markets">' +
      market('П1', pH) + market('Ничья', pDraw) + market('П2', pA) +
      market('ТБ ' + fmtLine(line), pOver) + market('ТМ ' + fmtLine(line), pUnder) +
      market('Обе забьют', pBtts) + '</div>';

    html += '<p class="hint">Самый вероятный исход — <strong>' + best + '</strong> по среднему голов за ' +
      a.all.length + ' и ' + b.all.length + ' матчей. Это арифметика забитых, а не знание формы команд: ' +
      'чем меньше матчей, тем сильнее цифра может разойтись с реальностью.</p>';

    box.innerHTML = html;

    if (matrixHead) {
      var th = '<tr><th class="muted">мячи 1&nbsp;:&nbsp;2</th>';
      for (var c = 0; c <= MAX_GOALS; c++) th += '<th class="num">' + (c === MAX_GOALS ? '4+' : c) + '</th>';
      matrixHead.innerHTML = th + '</tr>';
    }

    if (matrixBody) {
      var rows = '';
      for (var r = 0; r <= MAX_GOALS; r++) {
        rows += '<tr><th class="num">' + (r === MAX_GOALS ? '4+' : r) + '</th>';
        for (var q = 0; q <= MAX_GOALS; q++) {
          var p = matrix[r][q];
          var shade = Math.min(1, p / 0.16);
          rows += '<td class="num' + (r === MAX_GOALS || q === MAX_GOALS ? ' muted' : '') + '"' +
            ' style="background:rgba(255,122,69,' + (0.04 + shade * 0.45).toFixed(3) + ')"' +
            ' title="' + (r === MAX_GOALS ? '4+' : r) + ':' + (q === MAX_GOALS ? '4+' : q) + ' — ' + pct(p) + '">' +
            (p * 100).toFixed(1) + '</td>';
        }
        rows += '</tr>';
      }
      matrixBody.innerHTML = rows;
    }

    bindH2hToggle(box);
  }

  /* ---------- рендер списка матчей ---------- */

  function renderGames() {
    var tbody = el('goalGamesBody');
    var empty = el('goalGamesEmpty');
    var count = el('goalCount');
    if (!tbody) return;

    var list = games().slice().sort(function (x, y) {
      return String(x.date).localeCompare(String(y.date)) || String(x.createdAt).localeCompare(String(y.createdAt));
    });

    /* Фильтр по лиге */
    var leagueSel = el('g5LeagueFilter');
    if (leagueSel) {
      var leagues = [];
      var seen = {};
      games().forEach(function (g) {
        var l = g.league ? g.league.trim() : '';
        if (!seen[l]) { seen[l] = 1; leagues.push(l); }
      });
      leagues.sort();
      var cur = leagueSel.value || '';
      leagueSel.innerHTML = '<option value="">Все лиги</option>' +
        leagues.map(function (l) {
          return '<option value="' + K.esc(l) + '">' + esc(l || 'Без лиги') + '</option>';
        }).join('');
      leagueSel.value = leagues.indexOf(cur) >= 0 ? cur : '';
      if (leagueSel.value) list = list.filter(function (g) { return (g.league || '') === leagueSel.value; });
    }

    var byTeam = teamStats(games());

    if (count) count.innerHTML = list.length + ' ' + matchWord(list.length) +
      '<span class="muted"> · среднее голов — со 2-й игры по команде</span>';

    if (empty) empty.hidden = list.length > 0;

    tbody.innerHTML = list.length ? list.map(function (g) {
      var ta = byTeam[g.teamA], tb = byTeam[g.teamB];
      function shown(t, home) {
        if (!t || t.all.length < MIN_GAMES) return '—';
        return fmtAvg(home ? t.avgScoredHome : t.avgScoredAway);
      }
      return '<tr>' +
        '<td class="muted">' + esc(K.fmtDate(g.date)) + '</td>' +
        '<td class="muted">' + (g.league ? esc(g.league) : '—') + '</td>' +
        '<td class="strong">' + esc(g.teamA) + '</td>' +
        '<td class="num strong">' + g.goalsA + '</td>' +
        '<td>' + esc(g.teamB) + '</td>' +
        '<td class="num strong">' + g.goalsB + '</td>' +
        '<td class="num muted">' + shown(ta, true) + '</td>' +
        '<td class="num muted">' + shown(tb, false) + '</td>' +
        '<td class="num"><button class="icon-btn" type="button" data-edit-game="' + K.esc(g.id) + 
        '" title="Редактировать">✎</button></td>' +
        '<td class="num"><button class="icon-btn" type="button" data-del-game="' + K.esc(g.id) +
        '" title="Удалить матч">✕</button></td>' +
        '</tr>';
    }).join('') : '';

    tbody.querySelectorAll('[data-edit-game]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var id = btn.getAttribute('data-edit-game');

    var game = games().filter(function (g) {
      return String(g.id) === String(id);
    })[0];

    if (!game) return;

    var form = el('goalForm');

    if (!form) return;

    form.setAttribute('data-edit-game', game.id);

    el('gfDate').value = String(game.date || '').slice(0, 10);
    el('gfTeamA').value = game.teamA || '';
    el('gfGoalsA').value = game.goalsA;
    el('gfGoalsB').value = game.goalsB;
    el('gfTeamB').value = game.teamB || '';

    if (el('gfLeague')) {
      el('gfLeague').value = game.league || '';
    }

    var submitBtn = form.querySelector('button[type="submit"]');

    if (submitBtn) {
      submitBtn.textContent = 'Сохранить изменения';
    }

    form.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    K.toast('Матч загружен для редактирования');
  });
});

    tbody.querySelectorAll('[data-del-game]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-del-game');
        writeGames(games().filter(function (g) { return String(g.id) !== id; }));
        renderAll();
        K.toast('Матч удалён');
      });
    });
  }

  /* ---------- селекты команд ---------- */

  function syncSelectors(byTeam) {
    var selA = el('pfTeamA');
    var selB = el('pfTeamB');
    if (!selA || !selB) return;

    var names = Object.keys(byTeam).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
    var options = '<option value="">— команда —</option>' +
      names.map(function (n) { return '<option value="' + K.esc(n) + '">' + esc(n) + '</option>'; }).join('');

    if (names.indexOf(pick.a) < 0) pick.a = names[0] || '';
    /* Не даём двум селектам показать одну команду */
    if (names.indexOf(pick.b) < 0) {
      pick.b = names.filter(function (n) { return n !== pick.a; })[0] || '';
    }
    if (pick.b === pick.a) pick.b = '';

    selA.innerHTML = options; selA.value = pick.a;
    selB.innerHTML = options; selB.value = pick.b;
  }

  /* ---------- подсказки названий команд ---------- */

  function syncDatalist(byTeam) {
    var dl = el('goalTeamList');
    if (dl) {
      dl.innerHTML = Object.keys(byTeam).map(function (n) {
        return '<option value="' + K.esc(n) + '"></option>';
      }).join('');
    }
  }

  /* ---------- матрица фактических счетов ---------- */

  var GRID_MAX = MAX_GOALS;   /* строки и столбцы 0..4, «4+» = 4 и больше голов */

  /* Общая сетка: rows — список пар [свои голы, голы соперника]. */
  function gridCells(pairs) {
    var cells = [];
    for (var i = 0; i <= GRID_MAX; i++) cells.push([0, 0, 0, 0, 0]);
    pairs.forEach(function (p) {
      cells[Math.min(p[0], GRID_MAX)][Math.min(p[1], GRID_MAX)]++;
    });
    return { games: pairs.length, cells: cells };
  }

  /* Одна команда против всех соперников: свои голы × пропущенные. */
  function teamGrid(list, name) {
    var key = String(name).toLowerCase();
    var pairs = [];
    list.forEach(function (g) {
      var isA = String(g.teamA).toLowerCase() === key;
      var isB = String(g.teamB).toLowerCase() === key;
      if (!isA && !isB) return;
      pairs.push(isA ? [g.goalsA, g.goalsB] : [g.goalsB, g.goalsA]);
    });
    return gridCells(pairs);
  }

  /* Личные встречи пары: голы команды 1 × голы команды 2. */
  function pairGrid(list, homeName, awayName) {
    var h = String(homeName).toLowerCase();
    var a = String(awayName).toLowerCase();
    var pairs = [];
    list.forEach(function (g) {
      var tA = String(g.teamA).toLowerCase();
      var tB = String(g.teamB).toLowerCase();
      if (tA === h && tB === a) pairs.push([g.goalsA, g.goalsB]);
      else if (tA === a && tB === h) pairs.push([g.goalsB, g.goalsA]);
    });
    return gridCells(pairs);
  }

  function gridLabel(n) { return n === GRID_MAX ? '4+' : String(n); }

  /* Разметка одной матрицы: самая частая ячейка задаёт тон подсветки. */
  function gridTable(grid) {
    if (!grid.games) return '<tr><td class="muted" colspan="' + (GRID_MAX + 2) + '">Нет сыгранных матчей.</td></tr>';

    var maxCell = 0;
    for (var y = 0; y <= GRID_MAX; y++) {
      for (var x = 0; x <= GRID_MAX; x++) if (grid.cells[y][x] > maxCell) maxCell = grid.cells[y][x];
    }

    var html = '';
    for (var r = 0; r <= GRID_MAX; r++) {
      html += '<tr><th class="num">' + gridLabel(r) + '</th>';
      for (var q = 0; q <= GRID_MAX; q++) {
        var n = grid.cells[r][q];
        var share = n / grid.games;
        var shade = maxCell ? n / maxCell : 0;
        html += '<td class="num' + (r === GRID_MAX || q === GRID_MAX ? ' muted' : '') + '"' +
          ' style="background:rgba(255,122,69,' + (0.04 + shade * 0.45).toFixed(3) + ')"' +
          ' title="' + gridLabel(r) + ':' + gridLabel(q) + ' — ' + n + ' из ' + grid.games +
          ' (' + (share * 100).toFixed(0) + '%)">' + (share * 100).toFixed(0) + '</td>';
      }
      html += '</tr>';
    }
    return html;
  }

  /* Один блок 5×5 для выбранной пары: если команды уже играли между собой —
     счёт их личных встреч, иначе — две матрицы по каждой команде отдельно. */
  function renderGrids(selA, selB) {
    var wrap = el('g5Card');
    var head = el('g5Head');
    var body = el('g5Body');
    var note = el('g5Note');
    if (!head || !body) return;

    if (!selA || !selB || selA === selB) {
      if (wrap) wrap.hidden = true;
      head.innerHTML = '';
      body.innerHTML = '';
      if (note) note.textContent = '';
      return;
    }
    if (wrap) wrap.hidden = false;

    var list = games();
    var pair = pairGrid(list, selA, selB);
    var mode = pair.games ? 'pair' : 'team';

    var th = '<tr><th class="muted">' + (mode === 'pair'
      ? 'гол 1&nbsp;:&nbsp;гол 2'
      : 'забито&nbsp;:&nbsp;пропущено') + '</th>';
    for (var c = 0; c <= GRID_MAX; c++) th += '<th class="num">' + gridLabel(c) + '</th>';
    head.innerHTML = th + '</tr>';

    if (mode === 'pair') {
      body.innerHTML = gridTable(pair);
      if (note) note.textContent = 'Личные встречи — ' + pair.games + ' ' + matchWord(pair.games) +
        ', ячейка показывает долю таких счётов.';
    } else {
      var gA = teamGrid(list, selA);
      var gB = teamGrid(list, selB);
      var rows = '<tr><td class="strong" colspan="' + (GRID_MAX + 2) + '">' + esc(selA) +
        ' — ' + gA.games + ' ' + matchWord(gA.games) + ' против всех</td></tr>';
      rows += gridTable(gA);
      rows += '<tr><td class="strong" colspan="' + (GRID_MAX + 2) + '">' + esc(selB) +
        ' — ' + gB.games + ' ' + matchWord(gB.games) + ' против всех</td></tr>';
      rows += gridTable(gB);
      body.innerHTML = rows;
      if (note) note.textContent = 'Личных встреч нет — показаны обе команды отдельно.';
    }
  }

  /* ---------- общий рендер ---------- */

  function renderAll() {
    var byTeam = teamStats(games());
    syncDatalist(byTeam);
    syncSelectors(byTeam);
    renderAverages(byTeam);
    renderForecast(byTeam, pick.a, pick.b);
    renderGrids(pick.a, pick.b);
    renderGames();

    var note = el('goalsNote');
    if (note) {
      note.textContent = games().length
        ? 'матчей: ' + games().length + ' · команд: ' + Object.keys(byTeam).length
        : '';
    }
    var notice = el('goalsNotice');
    if (notice) {
      var low = Object.keys(byTeam).filter(function (n) { return byTeam[n].all.length < MIN_GAMES; });
      if (games().length && low.length) {
        notice.hidden = false;
        notice.innerHTML = 'По командам <strong>' + low.map(esc).join(', ') +
          '</strong> меньше ' + MIN_GAMES + ' матчей — среднее голов по ним ещё не считаем.';
      } else {
        notice.hidden = true;
        notice.innerHTML = '';
      }
    }
  }

  K.renderGoalsUi = renderAll;
  K.renderGoals = renderAll;

  /* ---------- форма добавления ---------- */

  function bindForm() {
    var form = el('goalForm');
    if (!form) { K.bindGoalsUi = function () {}; return; }

    var dateInput = el('gfDate');
    if (dateInput && !dateInput.value) dateInput.value = isoDay(new Date());

    form.addEventListener('submit', function (ev) {
    ev.preventDefault();

    var teamA = el('gfTeamA').value.trim();
    var teamB = el('gfTeamB').value.trim();
    var goalsA = parseInt(el('gfGoalsA').value, 10);
    var goalsB = parseInt(el('gfGoalsB').value, 10);
    var date = el('gfDate').value || isoDay(new Date());

    if (!teamA || !teamB) {
      K.toast('Укажите обе команды', 'err');
      return;
    }

    if (teamA.toLowerCase() === teamB.toLowerCase()) {
      K.toast('Команды должны различаться', 'err');
      return;
    }

    if (
      isNaN(goalsA) ||
      isNaN(goalsB) ||
      goalsA < 0 ||
      goalsB < 0 ||
      goalsA > 30 ||
      goalsB > 30
    ) {
      K.toast('Голы — целые числа от 0 до 30', 'err');
      return;
    }

    var game = K.normalizeGoalGame({
      date: date.length === 10 ? date + 'T12:00:00' : date,
      teamA: teamA,
      teamB: teamB,
      goalsA: goalsA,
      goalsB: goalsB,
      league: el('gfLeague') ? el('gfLeague').value.trim() : ''
    });

    if (!game) {
      K.toast('Матч не добавлен — проверьте данные', 'err');
      return;
    }

    /* ---------- РЕДАКТИРОВАНИЕ ---------- */

    var editId = form.getAttribute('data-edit-game');

    if (editId) {

      var updated = games().map(function (g) {
        if (String(g.id) !== String(editId)) {
          return g;
        }

        return Object.assign({}, game, {
          id: g.id,
          createdAt: g.createdAt
        });
      });

      writeGames(updated);

      form.removeAttribute('data-edit-game');

      var submitBtn = form.querySelector('button[type="submit"]');

      if (submitBtn) {
        submitBtn.textContent = 'Добавить матч';
      }

      renderAll();

      el('gfGoalsA').value = '';
      el('gfGoalsB').value = '';
      el('gfTeamB').focus();

      K.toast('Матч обновлён');

      return;
    }

    /* ---------- СОЗДАНИЕ НОВОГО МАТЧА ---------- */

    writeGames(games().concat([game]));

    renderAll();

    el('gfGoalsA').value = '';
    el('gfGoalsB').value = '';
    el('gfTeamB').focus();

    K.toast('Матч добавлен');
  });

    var demo = el('goalDemoBtn');
    if (demo) demo.addEventListener('click', function () {
      if (games().length) {
        if (!window.confirm('Очистить текущие ' + games().length + ' матчей и загрузить 6 примеров?')) return;
        writeGames([]);
        pick.a = pick.b = '';
      }
      var base = new Date();
      base.setDate(base.getDate() - 30);
      var added = [];
      [
        ['Барсы', 'Дружина', 3, 1, 'Лига 1'], ['Молния', 'Барсы', 0, 2, 'Лига 1'], ['Дружина', 'Молния', 2, 2, 'Лига 1'],
        ['Барсы', 'Молния', 1, 0, 'Лига 2'], ['Дружина', 'Барсы', 1, 1, 'Лига 2'], ['Молния', 'Дружина', 0, 3, 'Лига 2']
      ].forEach(function (r, i) {
        var d = new Date(base.getTime() + i * 3 * 864e5);
        added.push(K.normalizeGoalGame({
          date: isoDay(d),
          teamA: r[0], teamB: r[1], goalsA: r[2], goalsB: r[3], league: r[4]
        }));
      });
      writeGames(games().concat(added.filter(Boolean)));
      renderAll();
      K.toast('Загружено 6 примеров матчей');
    });

    /* Список лиг для datalist формы */
    function syncLeagueDl() {
      var dl = el('leagueList');
      if (!dl) return;
      var seen = {};
      var names = [];
      games().forEach(function (g) {
        var l = g.league ? g.league.trim() : '';
        if (l && !seen[l]) { seen[l] = 1; names.push(l); }
      });
      names.sort();
      dl.innerHTML = names.map(function (n) {
        return '<option value="' + K.esc(n) + '"></option>';
      }).join('');
    }


    var wipe = el('goalWipeBtn');
    if (wipe) wipe.addEventListener('click', function () {
      if (!games().length) { K.toast('Удалять нечего'); return; }
      if (!window.confirm('Удалить все ' + games().length + ' матчей?')) return;
      writeGames([]);
      pick.a = pick.b = '';
      renderAll();
      K.toast('История матчей удалена');
    });

    [['pfTeamA', 'a'], ['pfTeamB', 'b']].forEach(function (pair) {
      var sel = el(pair[0]);
      if (!sel) return;
      sel.addEventListener('change', function () {
        pick[pair[1]] = sel.value;
        var byTeam = teamStats(games());
        renderForecast(byTeam, pick.a, pick.b);
        renderGrids(pick.a, pick.b);
      });
    });

    /* Линия тотала и галка «команда 1 дома» тоже пересчитывают прогноз */
    ['pfLine', 'pfHome'].forEach(function (id) {
      var node = el(id);
      if (!node) return;
      node.addEventListener('change', function () {
        renderForecast(teamStats(games()), pick.a, pick.b);
      });
    });

    /* Фильтр таблицы матчей по лиге */
    var leagueSel = el('g5LeagueFilter');
    if (leagueSel) leagueSel.addEventListener('change', renderAll);
  }

  K.bindGoalsUi = bindForm;

      
})(KuruBets);

/* ============================================================
   Импорт внешних ставок — BetBoom
   ============================================================ */

(function (K) {

  function minuteKey(date) {
    const d = new Date(date);

    if (Number.isNaN(d.getTime())) {
      return '';
    }

    return (
      d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0')
    );
  }

  function betKey(bet) {
    return [
      String(bet.bookmaker || '').toLowerCase(),
      String(bet.match || '').trim().toLowerCase(),
      String(bet.selection || '').trim().toLowerCase(),
      Number(bet.odds || 0).toFixed(2),
      Number(bet.stake || 0).toFixed(2),
      minuteKey(bet.date)
    ].join('|');
  }

  function normalizeImportedBet(source) {
    return K.normalizeBet({
      match: source.match,
      sport: source.sport || 'Футбол',
      league: '',
      type: source.type || 'moneyline',
      selection: source.selection,
      odds: source.odds,
      stake: source.stake,
      freebet: false,
      status: source.status || 'pending',
      cashoutAmount: 0,
      date: source.date || new Date().toISOString(),
      bookmaker: source.bookmaker || 'BetBoom',
      comment: source.market
        ? 'Рынок: ' + source.market
        : 'Импортировано из BetBoom',
      createdAt: new Date().toISOString()
    });
  }

  K.importExternalBets = function (items) {
    if (!Array.isArray(items)) {
      return {
        added: 0,
        skipped: 0
      };
    }

    const existing = new Set(
      K.state.bets.map(betKey)
    );

    let added = 0;
    let skipped = 0;

    items.forEach(source => {
      if (!source || !source.match) {
        return;
      }

      const bet =
        normalizeImportedBet(source);

      const key = betKey(bet);

      if (existing.has(key)) {
        skipped += 1;
        return;
      }

      existing.add(key);

      K.state.bets.push(bet);

      added += 1;
    });

    if (added) {

      K.state.bets.sort(
        (a, b) =>
          new Date(b.date) -
          new Date(a.date)
      );

      K.save();

      if (
        window.KuruApp &&
        typeof window.KuruApp.rerender ===
          'function'
      ) {
        window.KuruApp.rerender();
      }
    }

    return {
      added,
      skipped,
      total: items.length
    };
  };

})(window.KuruBets);
