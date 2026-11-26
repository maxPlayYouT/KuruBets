/* ==========================================================================
   KuruBets — аналитика: разбивки по видам, конторам, коэффициентам, времени
   ========================================================================== */
window.KB = window.KB || {};

(function (KB) {
    'use strict';

    var U = KB.U;
    var A = KB.A;

    /** Базовая агрегация группы ставок. */
    function summarize(items) {
        var settled = items.filter(A.isSettled);
        var won = 0;
        var lost = 0;
        var push = 0;
        var profit = 0;
        var staked = 0;
        var coefSum = 0;

        settled.forEach(function (b) {
            profit += A.profitOf(b);
            staked += b.stake;
            coefSum += b.coef;
            if (b.status === 'won') { won++; } else if (b.status === 'lost') { lost++; } else { push++; }
        });

        var decided = won + lost;
        return {
            count: items.length,
            settled: settled.length,
            open: items.length - settled.length,
            won: won,
            lost: lost,
            push: push,
            winRate: decided ? U.round2(won / decided * 100) : 0,
            profit: U.round2(profit),
            staked: U.round2(staked),
            roi: staked ? U.round2(profit / staked * 100) : 0,
            avgCoef: settled.length ? U.round2(coefSum / settled.length) : 0,
            avgProfit: items.length ? U.round2(profit / items.length) : 0
        };
    }

    function byField(bets, getKey, labelFn) {
        return U.groupBy(bets, getKey).map(function (g) {
            var row = summarize(g.items);
            row.key = g.key;
            row.label = labelFn ? labelFn(g.key) : g.key;
            row.items = g.items;
            return row;
        }).sort(function (a, b) {
            return b.profit - a.profit;
        });
    }

    function bySport(bets) {
        return byField(bets, function (b) { return b.sport || 'Без вида'; });
    }

    function byBookmaker(bets) {
        return byField(bets, function (b) { return b.bookmaker || 'Не указана'; });
    }

    function byBetType(bets) {
        return byField(bets, function (b) { return b.betType || 'Без типа'; });
    }

    function bySelection(bets) {
        return byField(bets, function (b) { return b.selection || 'Без исхода'; });
    }

    /* ------------------------------------------------------- коэффициенты */

    var COEF_BUCKETS = [
        { min: 1.0, max: 1.5 },
        { min: 1.5, max: 2.0 },
        { min: 2.0, max: 3.0 },
        { min: 3.0, max: 5.0 },
        { min: 5.0, max: 10.0 },
        { min: 10.0, max: Infinity }
    ];

    function byCoef(bets) {
        return COEF_BUCKETS.map(function (bucket) {
            var items = bets.filter(function (b) {
                return b.coef >= bucket.min && b.coef < bucket.max;
            });
            var row = summarize(items);
            row.key = bucket.min + '-' + bucket.max;
            row.label = bucket.max === Infinity
                ? '10.0+'
                : bucket.min.toFixed(1) + '–' + bucket.max.toFixed(1);
            row.min = bucket.min;
            row.max = bucket.max;
            return row;
        }).filter(function (row) {
            return row.count > 0;
        });
    }

    /* --------------------------------------------------------------- время */

    var WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

    var DAYPARTS = [
        { key: 'night', label: 'Ночь, 00–06', test: function (h) { return h < 6; } },
        { key: 'morning', label: 'Утро, 06–12', test: function (h) { return h >= 6 && h < 12; } },
        { key: 'day', label: 'День, 12–18', test: function (h) { return h >= 12 && h < 18; } },
        { key: 'evening', label: 'Вечер, 18–24', test: function (h) { return h >= 18; } }
    ];

    function byWeekday(bets) {
        var rows = WEEKDAYS.map(function (name, index) {
            var items = bets.filter(function (b) { return new Date(b.date).getDay() === index; });
            var row = summarize(items);
            row.key = String(index);
            row.label = name;
            return row;
        });
        return rows.filter(function (r) { return r.count > 0; });
    }

    function byDaypart(bets) {
        return DAYPARTS.map(function (part) {
            var items = bets.filter(function (b) {
                return part.test(new Date(b.date).getHours());
            });
            var row = summarize(items);
            row.key = part.key;
            row.label = part.label;
            return row;
        }).filter(function (r) { return r.count > 0; });
    }

    /* ------------------------------------------------------ суммы ставок */

    var STAKE_BUCKETS = [
        { label: 'до 500 ₽', test: function (s) { return s < 500; } },
        { label: '500–1000 ₽', test: function (s) { return s >= 500 && s < 1000; } },
        { label: '1000–3000 ₽', test: function (s) { return s >= 1000 && s < 3000; } },
        { label: '3000–10000 ₽', test: function (s) { return s >= 3000 && s < 10000; } },
        { label: 'от 10000 ₽', test: function (s) { return s >= 10000; } }
    ];

    function byStake(bets) {
        return STAKE_BUCKETS.map(function (bucket) {
            var items = bets.filter(function (b) { return bucket.test(b.stake); });
            var row = summarize(items);
            row.key = bucket.label;
            row.label = bucket.label;
            return row;
        }).filter(function (r) { return r.count > 0; });
    }

    /* --------------------------------------------------- распределение серий */

    /**
     * Распределение серий одинаковой длины: сколько раз случалось
     * 3 подряд выигрыша, 5 подряд проигрыша и т.д.
     */
    function streakDistribution(bets) {
        var ordered = A.sortByDateAsc(bets.filter(A.isSettled));
        var runs = [];
        var current = null;

        ordered.forEach(function (b) {
            if (b.status === 'push') {
                return;
            }
            var type = b.status === 'won' ? 'won' : 'lost';
            if (current && current.type === type) {
                current.length++;
                current.profit += A.profitOf(b);
            } else {
                current = { type: type, length: 1, profit: A.profitOf(b) };
                runs.push(current);
            }
        });

        var map = {};
        runs.forEach(function (run) {
            var key = run.type + ':' + run.length;
            if (!map[key]) {
                map[key] = { type: run.type, length: run.length, times: 0, profit: 0 };
            }
            map[key].times++;
            map[key].profit = U.round2(map[key].profit + run.profit);
        });

        return Object.keys(map).map(function (k) {
            var row = map[k];
            row.label = (row.type === 'won' ? 'Побед ' : 'Поражений ') + row.length;
            return row;
        }).sort(function (a, b) {
            return a.length - b.length || (a.type === b.type ? 0 : a.type === 'lost' ? -1 : 1);
        });
    }

    /** Лучшие и худшие ставки периода. */
    function topBets(bets, limit) {
        var settled = bets.filter(A.isSettled).slice().sort(function (a, b) {
            return A.profitOf(b) - A.profitOf(a);
        });
        return {
            best: settled.slice(0, limit || 5),
            worst: settled.slice(-Math.min(limit || 5, settled.length)).reverse()
        };
    }

    KB.AG = {
        summarize: summarize,
        bySport: bySport,
        byBookmaker: byBookmaker,
        byBetType: byBetType,
        bySelection: bySelection,
        byCoef: byCoef,
        byWeekday: byWeekday,
        byDaypart: byDaypart,
        byStake: byStake,
        streakDistribution: streakDistribution,
        topBets: topBets
    };
})(window.KB);
