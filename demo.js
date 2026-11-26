/* ==========================================================================
   KuruBets — демо-данные: реалистичная история ставок (~100 шт., 3 месяца)
   Стратегия: флэт 1000 ₽, мат. ожидание слегка отрицательное, +2 серии
   ========================================================================== */
window.KB = window.KB || {};

(function (KB) {
    'use strict';

    var STAKE = 1000;

    var EVENTS = {
        'Футбол': [
            ['Зенит — Краснодар', 'П1', 'Тотал больше 2.5'],
            ['Спартак — ЦСКА', 'П1', 'Обе забьют: да'],
            ['Локомотив — Ростов', 'X2', 'Тотал меньше 2.5'],
            ['Динамо М — Ахмат', 'П1', 'Фора 1 (-1)'],
            ['Крылья Советов — Сочи', 'X', 'Обе забьют: нет'],
            ['Реал — Барселона', '1X', 'Тотал больше 2.5'],
            ['Манчестер Сити — Арсенал', 'П2', 'Фора 2 (+1)'],
            ['Ливерпуль — Челси', '1X', 'Обе забьют: да'],
            ['Интер — Милан', 'П1', 'Тотал больше 2.5'],
            ['Ювентус — Наполи', 'X', 'Тотал меньше 2.5'],
            ['Бавария — Дортмунд', 'П1', 'Фора 1 (-1.5)'],
            ['ПСЖ — Марсель', 'П1', 'Тотал больше 3.5'],
            ['Атлетико — Севилья', '1X', 'Тотал меньше 2.5'],
            ['Порту — Бенфика', 'X2', 'Обе забьют: да'],
            ['Байер — РБ Лейпциг', 'П1', 'Тотал больше 3.5'],
            ['Аякс — Фейеноорд', 'П1', 'Обе забьют: да'],
            ['Заря — Александрия', '1X', 'Тотал меньше 2.5'],
            ['Болонья — Рома', 'П2', 'Фора 2 (0)']
        ],
        'Хоккей': [
            ['СКА — ЦСКА', 'П1', 'Тотал больше 4.5'],
            ['Металлург — Автомобилист', 'П2', 'Тотал меньше 4.5'],
            ['Ак Барс — Трактор', '1X', 'Тотал больше 4.5'],
            ['Динамо Мн — Йокерит', 'П1', 'Фора 1 (-1)'],
            ['Локомотив — Северсталь', 'П1', 'Тотал меньше 5.5'],
            ['Адмирал — Амур', 'X2', 'Тотал больше 4.5'],
            ['Спартак — Торпедо', 'П2', 'Обе забьют: нет']
        ],
        'Теннис': [
            ['Джокович Н. — Алькараз К.', 'П2', 'Тотал по геймам больше 22.5'],
            ['Синер Я. — Медведев Д.', 'П1', 'Фора 1 (-3.5)'],
            ['Зверев А. — Руне Х.', 'П1', 'Тотал по геймам больше 21.5'],
            ['Рублев А. — Циципас С.', 'П2', 'Тотал по геймам меньше 22.5'],
            ['Швёнтек И. — Свитолина Э.', 'П1', 'Тотал по геймам больше 20.5'],
            ['Соболенко А. — Гауф К.', 'П2', 'Фора 2 (+2.5)'],
            ['Паулини Л. — Кайя Дж.', '1X', 'Тотал по геймам больше 19.5'],
            ['Хачанов К. — Фриц Т.', 'П2', 'Тотал по геймам меньше 23.5']
        ],
        'Баскетбол': [
            ['ЦСКА — УНИКС', 'П1', 'Тотал больше 168.5'],
            ['Химки — Зенит', 'П2', 'Фора 2 (+5.5)'],
            ['Лейкерс — Селтикс', 'П1', 'Тотал больше 222.5'],
            ['Голден Стэйт — Сан-Антонио', '1X', 'Тотал меньше 230.5'],
            ['Реал — Барселона', 'П2', 'Фора 2 (-2.5)'],
            ['Олимпиакос — Фенербахче', 'П1', 'Тотал больше 158.5']
        ],
        'Киберспорт': [
            ['Team Spirit — Virtus.pro', 'П1', 'Тотал больше 2.5'],
            ['NAVI — FaZe Clan', 'П2', 'Тотал меньше 2.5'],
            ['G2 — mouz', '1X', 'Тотал больше 2.5'],
            ['Falcons — Liquid', 'П1', 'Фора 1 (-1.5)'],
            ['Cloud9 — Heroic', 'П2', 'Тотал меньше 2.5'],
            ['Vitality — Complexity', 'П1', 'Тотал больше 2.5']
        ]
    };

    var BOOKMAKERS = ['Фонбет', 'Winline', 'Марафон', 'Лига Ставок', 'Betcity'];

    var OUTCOME_BY_TYPE = {
        'П1': 'Победа', '1X': 'Победа', 'П2': 'Поражение', 'X2': 'Поражение', 'X': 'Ничья'
    };

    /** Линейная интерполяция коэффициента по вероятности. */
    function coefFor(p) {
        if (p >= 0.72) {
            return 1.28 + (0.86 - p) * 1.1;
        }
        if (p >= 0.48) {
            return 1.85 + (0.72 - p) * 3.4;
        }
        return 3.2 + (0.48 - p) * 5.2;
    }

    function mulberry32(seed) {
        return function () {
            seed |= 0;
            seed = seed + 0x6D2B79F5 | 0;
            var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function pick(list, rnd) {
        return list[Math.floor(rnd() * list.length) % list.length];
    }

    /**
     * Строит план ставок: вероятности по видам спорта, две серии
     * (просадка во 2-ю неделю и подъём в 8-ю), распределение по дням.
     */
    function buildPlan(rnd) {
        var SPORT_MIX = [
            { name: 'Футбол', count: 42, pMin: 0.42, pMax: 0.74 },
            { name: 'Теннис', count: 22, pMin: 0.44, pMax: 0.72 },
            { name: 'Хоккей', count: 14, pMin: 0.44, pMax: 0.70 },
            { name: 'Баскетбол', count: 11, pMin: 0.45, pMax: 0.70 },
            { name: 'Киберспорт', count: 11, pMin: 0.42, pMax: 0.68 }
        ];

        var plan = [];
        SPORT_MIX.forEach(function (sport) {
            var list = EVENTS[sport.name];
            for (var i = 0; i < sport.count; i++) {
                var row = list[Math.floor(rnd() * list.length) % list.length];
                var p = sport.pMin + rnd() * (sport.pMax - sport.pMin);
                plan.push({
                    sport: sport.name,
                    event: row[0],
                    betType: row[1],
                    selection: row[2],
                    p: p,
                    coef: KB.U.round2(Math.max(1.15, coefFor(p))),
                    bookmaker: pick(BOOKMAKERS, rnd)
                });
            }
        });

        /* Две серии: просадка (2-я неделя) и подъём (8-я неделя). */
        var dayIndex = function (daysAgo) { return 92 - daysAgo; };
        plan.forEach(function (item, i) {
            item.idx = i;
            if (i >= 6 && i < 14) {
                item.p -= 0.30;
                item.series = 'down';
            } else if (i >= 62 && i < 70) {
                item.p += 0.26;
                item.series = 'up';
            }
            item.p = KB.U.clamp(item.p, 0.05, 0.97);
        });

        /* Распределение по дням: 0..91 дней назад, 1-3 ставки в день. */
        var perDay = {};
        var maxDay = 91;
        plan.forEach(function (item) {
            var daysAgo = Math.floor(rnd() * maxDay);
            var guard = 0;
            while ((perDay[daysAgo] || 0) >= 3 && guard < 60) {
                daysAgo = Math.floor(rnd() * maxDay);
                guard++;
            }
            perDay[daysAgo] = (perDay[daysAgo] || 0) + 1;
            item.daysAgo = daysAgo;
        });

        /* Проигрышная серия из 9 ставок подряд в просадке. */
        plan.sort(function (a, b) {
            return (a.series === 'down' ? 0 : 1) - (b.series === 'down' ? 0 : 1) || a.idx - b.idx;
        });

        return plan;
    }

    /** Генерирует массив ставок. seed меняется, чтобы история не повторялась. */
    function generate(count) {
        var rnd = mulberry32(Date.now() % 100000);
        var plan = buildPlan(rnd);

        if (count && count < plan.length) {
            plan = plan.slice(0, count);
        }

        /* Детерминированный по плану результат с учётом вероятности. */
        var rollRnd = mulberry32(Math.floor(rnd() * 100000) + 7);
        var forcedLoss = 0;
        var forcedWin = 0;
        plan.forEach(function (item) {
            if (item.series === 'down') { forcedLoss++; }
            if (item.series === 'up') { forcedWin++; }
        });

        var lossesDone = 0;
        var winsDone = 0;
        var startBank = 100000;

        var bets = plan.map(function (item) {
            var roll = rollRnd();
            var won;
            if (item.series === 'down' && lossesDone < forcedLoss) {
                won = false;
                lossesDone++;
            } else if (item.series === 'up' && winsDone < forcedWin) {
                won = true;
                winsDone++;
            } else {
                won = roll < item.p;
            }

            var date = KB.U.fmt.daysAgo(item.daysAgo, 18 + (item.idx % 4), (item.idx * 7) % 60);
            var status = won ? 'won' : 'lost';

            /* Несколько возвратов для правдоподобия. */
            if (roll > 0.975) {
                status = 'push';
            }

            /* Последние ставки остаются нерассчитанными. */
            if (item.daysAgo <= 1 && roll > 0.35) {
                status = 'calc';
            }

            var bet = {
                id: KB.U.uid('b'),
                date: date.toISOString(),
                sport: item.sport,
                event: item.event,
                selection: item.selection,
                betType: item.betType,
                coef: item.coef,
                stake: STAKE,
                bookmaker: item.bookmaker,
                status: status,
                outcome: status === 'won' || status === 'lost' ? (OUTCOME_BY_TYPE[item.betType] || '') : '',
                note: status === 'calc' ? 'Ждём расчёт' : '',
                createdAt: date.toISOString()
            };
            return bet;
        });

        /* Сортировка: новые сверху. */
        bets.sort(function (a, b) {
            return new Date(b.date) - new Date(a.date);
        });

        return { bets: bets, startBank: startBank, bookmakers: BOOKMAKERS.slice() };
    }

    /**
     * Загружает демо-данные, если ставок ещё нет.
     * @returns {boolean} true, если данные были добавлены
     */
    function seedIfEmpty() {
        if (KB.Store.bets().length) {
            return false;
        }
        var demo = generate();
        KB.Store.replaceAll({
            bets: demo.bets,
            bookmakers: demo.bookmakers,
            settings: {
                startBank: demo.startBank,
                defaultStake: STAKE,
                defaultBookmaker: 'Фонбет',
                defaultSport: 'Футбол'
            }
        });
        return true;
    }

    function loadNow() {
        var demo = generate();
        KB.Store.replaceAll({
            bets: demo.bets,
            bookmakers: demo.bookmakers,
            settings: {
                startBank: demo.startBank,
                defaultStake: STAKE,
                defaultBookmaker: 'Фонбет',
                defaultSport: 'Футбол'
            }
        });
        return demo.bets.length;
    }

    KB.Demo = {
        generate: generate,
        seedIfEmpty: seedIfEmpty,
        loadNow: loadNow,
        BOOKMAKERS: BOOKMAKERS
    };
})(window.KB);
