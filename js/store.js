/* ==========================================================================
   KuruBets — хранилище: localStorage, CRUD, справочники
   ========================================================================== */
window.KB = window.KB || {};

(function (KB) {
    'use strict';

    var KEY = 'kurbets.v1';

    var SPORTS = ['Футбол', 'Хоккей', 'Теннис', 'Баскетбол', 'Киберспорт', 'Другое'];

    var OUTCOMES = ['Победа', 'Поражение', 'Ничья', 'Проход', 'Вылет'];

    var STATUSES = [
        { id: 'calc', label: 'Не рассчитан' },
        { id: 'won', label: 'Выиграна' },
        { id: 'lost', label: 'Проиграна' },
        { id: 'push', label: 'Возврат' }
    ];

    var DEFAULT_SETTINGS = {
        currency: '₽',
        startBank: 100000,
        defaultStake: 1000,
        defaultSport: 'Футбол',
        defaultBookmaker: '',
        warnDuplicate: true,
        warnBigStake: true,
        roiMode: 'flat'
    };

    function emptyData() {
        return {
            version: 1,
            bets: [],
            settings: Object.assign({}, DEFAULT_SETTINGS),
            sports: SPORTS.slice(),
            bookmakers: [],
            createdAt: new Date().toISOString()
        };
    }

    /** Приводит произвольный объект к валидной форме данных. */
    function normalize(raw) {
        var base = emptyData();
        if (!raw || typeof raw !== 'object') {
            return base;
        }
        base.bets = Array.isArray(raw.bets) ? raw.bets.map(normalizeBet).filter(Boolean) : [];
        base.settings = Object.assign(base.settings, raw.settings && typeof raw.settings === 'object' ? raw.settings : {});
        base.sports = Array.isArray(raw.sports) && raw.sports.length ? raw.sports : base.sports;
        base.bookmakers = Array.isArray(raw.bookmakers) ? raw.bookmakers : [];
        base.createdAt = raw.createdAt || base.createdAt;
        return base;
    }

    function num(value, fallback) {
        var n = Number(value);
        return isNaN(n) ? (fallback == null ? 0 : fallback) : n;
    }

    function normalizeBet(b) {
        if (!b || typeof b !== 'object') {
            return null;
        }
        var bet = {
            id: b.id || KB.U.uid('b'),
            date: b.date || new Date().toISOString(),
            sport: b.sport || 'Футбол',
            event: String(b.event || '').trim(),
            selection: String(b.selection || '').trim(),
            betType: String(b.betType || '').trim(),
            coef: Math.max(1, num(b.coef, 1)),
            stake: Math.max(0, num(b.stake, 0)),
            bookmaker: String(b.bookmaker || '').trim(),
            status: (STATUSES.map(function (s) { return s.id; }).indexOf(b.status) >= 0) ? b.status : 'calc',
            outcome: OUTCOMES.indexOf(b.outcome) >= 0 ? b.outcome : '',
            note: String(b.note || '').trim(),
            createdAt: b.createdAt || new Date().toISOString()
        };
        if (!bet.event || !bet.selection) {
            return null;
        }
        return bet;
    }

    /* ------------------------------------------------------------- загрузка */

    function load() {
        try {
            var raw = localStorage.getItem(KEY);
            if (!raw) {
                return emptyData();
            }
            return normalize(JSON.parse(raw));
        } catch (e) {
            console.warn('KuruBets: не удалось прочитать данные —', e);
            return emptyData();
        }
    }

    function persist() {
        try {
            localStorage.setItem(KEY, JSON.stringify(state.data));
            return true;
        } catch (e) {
            console.warn('KuruBets: не удалось сохранить данные —', e);
            KB.U.toast('Хранилище браузера переполнено, изменения не сохранены', 'error', 5000);
            return false;
        }
    }

    var state = {
        data: load(),

        /* --------------------------------------------------------- ставки */

        bets: function () {
            return this.data.bets;
        },

        betById: function (id) {
            return this.data.bets.filter(function (b) { return b.id === id; })[0] || null;
        },

        addBet: function (input) {
            var bet = normalizeBet(input);
            if (!bet) {
                return null;
            }
            bet.createdAt = new Date().toISOString();
            this.data.bets.push(bet);
            persist();
            return bet;
        },

        updateBet: function (id, input) {
            var index = -1;
            this.data.bets.forEach(function (b, i) {
                if (b.id === id) { index = i; }
            });
            if (index < 0) {
                return null;
            }
            var merged = Object.assign({}, this.data.bets[index], input, { id: id });
            var bet = normalizeBet(merged);
            if (!bet) {
                return null;
            }
            bet.createdAt = this.data.bets[index].createdAt;
            this.data.bets[index] = bet;
            persist();
            return bet;
        },

        removeBet: function (id) {
            var removed = null;
            this.data.bets = this.data.bets.filter(function (b) {
                var drop = b.id === id;
                if (drop) { removed = b; }
                return !drop;
            });
            persist();
            return removed;
        },

        restoreBet: function (bet) {
            var restored = normalizeBet(bet);
            if (restored) {
                this.data.bets.push(restored);
                persist();
            }
        },

        /** Дубликаты: та же дата (до минут), событие, тип и коэффициент. */
        findDuplicates: function (input, ignoreId) {
            var aDate = KB.U.fmt.toDateTimeInput(input.date).slice(0, 16);
            var aEvent = String(input.event || '').trim().toLowerCase();
            var aType = String(input.betType || '').trim().toLowerCase();
            var aCoef = Math.round(num(input.coef, 0) * 100);

            return this.data.bets.filter(function (b) {
                if (b.id === ignoreId) {
                    return false;
                }
                return KB.U.fmt.toDateTimeInput(b.date).slice(0, 16) === aDate
                    && String(b.event).trim().toLowerCase() === aEvent
                    && String(b.betType).trim().toLowerCase() === aType
                    && Math.round(b.coef * 100) === aCoef;
            });
        },

        /* ------------------------------------------------------ настройки */

        settings: function () {
            return this.data.settings;
        },

        setSettings: function (patch) {
            this.data.settings = Object.assign({}, this.data.settings, patch || {});
            persist();
            return this.data.settings;
        },

        /* ---------------------------------------------------- справочники */

        sports: function () {
            var fromBets = this.data.bets.map(function (b) { return b.sport; });
            var merged = this.data.sports.concat(fromBets);
            return merged.filter(function (v, i, arr) { return v && arr.indexOf(v) === i; });
        },

        bookmakers: function () {
            var fromBets = this.data.bets.map(function (b) { return b.bookmaker; });
            var merged = this.data.bookmakers.concat(fromBets);
            return merged.filter(function (v, i, arr) { return v && arr.indexOf(v) === i; });
        },

        addBookmaker: function (name) {
            var clean = String(name || '').trim();
            if (clean && this.data.bookmakers.indexOf(clean) < 0) {
                this.data.bookmakers.push(clean);
                persist();
            }
        },

        /* -------------------------------------------------------- импорт */

        /** Полная замена данных. Возвращает количество ставок или -1 при ошибке. */
        replaceAll: function (raw) {
            var normalized = normalize(typeof raw === 'string' ? JSON.parse(raw) : raw);
            if (!normalized) {
                return -1;
            }
            this.data = normalized;
            persist();
            return this.data.bets.length;
        },

        /** Добавление ставок к существующим, новые id чтобы не перезаписывать. */
        mergeBets: function (bets) {
            var self = this;
            var added = 0;
            (bets || []).forEach(function (b) {
                var bet = normalizeBet(b);
                if (!bet) {
                    return;
                }
                if (self.betById(bet.id)) {
                    bet.id = KB.U.uid('b');
                }
                self.data.bets.push(bet);
                added++;
            });
            persist();
            return added;
        },

        reset: function () {
            this.data = emptyData();
            persist();
        }
    };

    KB.Store = state;
    KB.STATUSES = STATUSES;
    KB.STATUS_LABEL = function (id) {
        var found = STATUSES.filter(function (s) { return s.id === id; })[0];
        return found ? found.label : id;
    };
    KB.SPORTS = SPORTS;
    KB.OUTCOMES = OUTCOMES;
})(window.KB);
