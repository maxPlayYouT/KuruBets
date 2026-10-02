/* ==========================================================================
   KuruBets — аналитика: фильтр периода, банкролл, метрики, просадки
   ========================================================================== */
window.KB = window.KB || {};

(function (KB) {
    'use strict';

    var U = KB.U;

    function isSettled(b) {
        return b.status === 'won' || b.status === 'lost' || b.status === 'push';
    }

    /** Прибыль по одному ставку: выигр., проигр., возврат. */
    function profitOf(b) {
        if (b.status === 'won') {
            return U.round2(b.stake * b.coef - b.stake);
        }
        if (b.status === 'lost') {
            return -U.round2(b.stake);
        }
        return 0;
    }

    function sortByDateAsc(bets) {
        return bets.slice().sort(function (a, b) {
            return new Date(a.date) - new Date(b.date);
        });
    }

    function monthKey(iso) {
        var d = new Date(iso);
        return d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
    }

    function dayKey(iso) {
        return U.fmt.toDateInput(iso);
    }

    /* ------------------------------------------------------------- фильтр */

    /**
     * range: { mode: 'all' | 'month' | 'custom' | 'ytd', month: 'YYYY-MM', from: Date, to: Date }
     */
    function filterBets(bets, range) {
        if (!range || range.mode === 'all') {
            return bets.slice();
        }
        var from;
        var to;

        if (range.mode === 'month') {
            var parts = String(range.month || monthKey(new Date())).split('-');
            from = new Date(Number(parts[0]), Number(parts[1]) - 1, 1, 0, 0, 0);
            to = new Date(Number(parts[0]), Number(parts[1]), 0, 23, 59, 59);
        } else if (range.mode === 'ytd') {
            from = new Date(new Date().getFullYear(), 0, 1);
            to = new Date();
        } else if (range.mode === 'custom') {
            from = range.from ? new Date(range.from) : null;
            to = range.to ? new Date(range.to) : null;
            if (from) { from.setHours(0, 0, 0, 0); }
            if (to) { to.setHours(23, 59, 59, 999); }
        }

        return bets.filter(function (b) {
            var d = new Date(b.date);
            if (from && d < from) { return false; }
            if (to && d > to) { return false; }
            return true;
        });
    }

    function monthKeys(bets) {
        var seen = {};
        var keys = [];
        bets.forEach(function (b) {
            var k = monthKey(b.date);
            if (!seen[k]) {
                seen[k] = true;
                keys.push(k);
            }
        });
        keys.sort().reverse();
        return keys;
    }

    /** Подпись периода для заголовков и CSV. */
    function rangeTitle(range) {
        if (!range || range.mode === 'all') {
            return 'Всё время';
        }
        if (range.mode === 'month') {
            return U.fmt.monthTitle(range.month);
        }
        if (range.mode === 'ytd') {
            return 'С начала года';
        }
        if (range.from && range.to) {
            return U.fmt.date(range.from) + ' — ' + U.fmt.date(range.to);
        }
        return 'Произвольный период';
    }

    /* ------------------------------------------------- серия банкролла */

    /**
     * Считает точку банкролла для каждой ставки (только рассчитанные).
     * Стартуем с startBank + прибыль всех ставок до начала периода.
     */
    function bankrollSeries(allBets, filtered, startBank) {
        var start = Number(startBank) || 0;
        var startBalance = start;

        if (filtered.length) {
            var firstDate = Math.min.apply(null, filtered.map(function (b) {
                return new Date(b.date).getTime();
            }));
            allBets.forEach(function (b) {
                if (isSettled(b) && new Date(b.date).getTime() < firstDate) {
                    startBalance += profitOf(b);
                }
            });
        }

        var points = [{ x: null, y: startBalance, bet: null, index: 0 }];
        var balance = startBalance;
        var seq = 0;

        sortByDateAsc(filtered.filter(isSettled)).forEach(function (b) {
            balance = U.round2(balance + profitOf(b));
            seq++;
            points.push({ x: new Date(b.date).getTime(), y: balance, bet: b, index: seq });
        });

        return { points: points, startBalance: startBalance, endBalance: balance };
    }

    /** Максимальная просадка по серии точек банкролла. */
    function drawdown(points) {
        var peak = points.length ? points[0].y : 0;
        var maxDd = 0;
        var maxDdPct = 0;
        var peakX = points.length ? points[0].x : null;
        var troughX = peakX;
        var best = { peakX: peakX, troughX: troughX };

        points.forEach(function (p) {
            if (p.y > peak) {
                peak = p.y;
                peakX = p.x;
            }
            var dd = peak - p.y;
            if (dd > 0) {
                var pct = peak > 0 ? (dd / peak) * 100 : 0;
                if (dd > maxDd) {
                    maxDd = dd;
                    maxDdPct = pct;
                    best = { peakX: peakX, troughX: p.x };
                }
            }
        });

        return { amount: U.round2(maxDd), pct: U.round2(maxDdPct), peakX: best.peakX, troughX: best.troughX };
    }

    /**
     * Все просадки > 5% с деталями: дата пика, дата дна, глубина,
     * сколько ставок и дней заняло восстановление.
     */
    function drawdownDetails(points) {
        if (points.length < 2) {
            return [];
        }
        var result = [];
        var peakIdx = 0;
        var peak = points[0].y;
        var i;

        for (i = 1; i < points.length; i++) {
            if (points[i].y >= peak) {
                /* Восстановление текущей просадки, если она была зафиксирована. */
                peak = points[i].y;
                peakIdx = i;
            } else {
                var dd = peak - points[i].y;
                var pct = peak > 0 ? (dd / peak) * 100 : 0;
                if (pct >= 5) {
                    var existing = result.length && result[result.length - 1];
                    if (existing && existing.peakIndex === peakIdx) {
                        if (dd > existing.amount) {
                            existing.amount = U.round2(dd);
                            existing.pct = U.round2(pct);
                            existing.troughIndex = i;
                        }
                    } else {
                        result.push({
                            peakIndex: peakIdx,
                            troughIndex: i,
                            peakX: points[peakIdx].x,
                            troughX: points[i].x,
                            peakValue: points[peakIdx].y,
                            amount: U.round2(dd),
                            pct: U.round2(pct),
                            betsInDrawdown: i - peakIdx,
                            recovered: false,
                            recoveryBets: null,
                            daysInDrawdown: 0
                        });
                    }
                }
            }
        }

        /* Поиск восстановления и длительности. */
        result.forEach(function (dd) {
            for (var j = dd.troughIndex; j < points.length; j++) {
                if (points[j].y >= dd.peakValue) {
                    dd.recovered = true;
                    dd.recoveryIndex = j;
                    dd.recoveryBets = j - dd.peakIndex;
                    break;
                }
            }
            var end = dd.recovered ? dd.recoveryIndex : dd.troughIndex;
            if (points[dd.peakIndex].x != null && points[end].x != null) {
                dd.daysInDrawdown = Math.round((points[end].x - points[dd.peakIndex].x) / 86400000);
            }
            dd.daysToBottom = points[dd.troughIndex].x != null && points[dd.peakIndex].x != null
                ? Math.round((points[dd.troughIndex].x - points[dd.peakIndex].x) / 86400000)
                : 0;
        });

        return result.sort(function (a, b) {
            return b.amount - a.amount;
        });
    }

    /* ---------------------------------------------------- серии побед/поражений */

    function streaks(bets) {
        var ordered = sortByDateAsc(bets.filter(isSettled));
        var maxWin = 0;
        var maxLose = 0;
        var curWin = 0;
        var curLose = 0;
        var curWinProfit = 0;
        var curLoseProfit = 0;
        var maxLoseAmount = 0;
        var curLoseAmount = 0;
        var current = { type: '', length: 0, profit: 0 };

        ordered.forEach(function (b) {
            if (b.status === 'won') {
                curWin++;
                curWinProfit += profitOf(b);
                curLose = 0;
                curLoseAmount = 0;
                if (curWin > maxWin) { maxWin = curWin; }
                current = { type: 'won', length: curWin, profit: U.round2(curWinProfit) };
            } else if (b.status === 'lost') {
                curLose++;
                curLoseAmount += Math.abs(profitOf(b));
                curWin = 0;
                curWinProfit = 0;
                if (curLose > maxLose) {
                    maxLose = curLose;
                    maxLoseAmount = curLoseAmount;
                }
                current = { type: 'lost', length: curLose, profit: -U.round2(curLoseAmount) };
            }
        });

        return {
            maxWin: maxWin,
            maxLose: maxLose,
            maxLoseAmount: U.round2(maxLoseAmount),
            current: current
        };
    }

    /* ------------------------------------------------------------- метрики */

    /** Максимальная одновременная открытая нагрузка (% от банкролла). */
    function maxExposurePct(allBets, filtered, startBank, balanceAtStart) {
        var open = filtered.filter(function (b) { return b.status === 'calc'; });
        if (!open.length) {
            return 0;
        }
        var byDay = {};
        open.forEach(function (b) {
            var k = dayKey(b.date);
            byDay[k] = (byDay[k] || 0) + b.stake;
        });
        var maxOpen = Math.max.apply(null, Object.keys(byDay).map(function (k) { return byDay[k]; }));
        var base = balanceAtStart || Number(startBank) || 0;
        return base > 0 ? U.round2((maxOpen / base) * 100) : 0;
    }

    function metrics(allBets, range) {
        var settings = KB.Store.settings();
        var startBank = Number(settings.startBank) || 0;
        var filtered = filterBets(allBets, range);
        var settled = filtered.filter(isSettled);
        var open = filtered.filter(function (b) { return b.status === 'calc'; });

        var won = 0;
        var lost = 0;
        var push = 0;
        var profit = 0;
        var staked = 0;
        var coefSum = 0;
        var highestCoef = 0;
        var biggestWin = 0;
        var biggestLoss = 0;

        settled.forEach(function (b) {
            var p = profitOf(b);
            profit += p;
            staked += b.stake;
            coefSum += b.coef;
            if (b.coef > highestCoef) { highestCoef = b.coef; }
            if (b.status === 'won') {
                won++;
                if (p > biggestWin) { biggestWin = p; }
            } else if (b.status === 'lost') {
                lost++;
                if (Math.abs(p) > biggestLoss) { biggestLoss = Math.abs(p); }
            } else {
                push++;
            }
        });

        var turnover = filtered.reduce(function (sum, b) { return sum + b.stake; }, 0);
        var openStake = open.reduce(function (sum, b) { return sum + b.stake; }, 0);
        var series = bankrollSeries(allBets, filtered, startBank);
        var dd = drawdown(series.points);
        var st = streaks(filtered);

        var decided = won + lost;
        var profitRounded = U.round2(profit);

        return {
            range: range,
            rangeTitle: rangeTitle(range),
            bets: filtered,
            settledBets: settled,
            openBets: open,

            total: filtered.length,
            settledCount: settled.length,
            openCount: open.length,
            won: won,
            lost: lost,
            push: push,
            decided: decided,

            profit: profitRounded,
            staked: U.round2(staked),
            turnover: U.round2(turnover),
            openStake: U.round2(openStake),

            winRate: decided ? U.round2((won / decided) * 100) : 0,
            avgCoef: settled.length ? U.round2(coefSum / settled.length) : 0,
            maxCoef: U.round2(highestCoef),
            roi: staked ? U.round2((profitRounded / staked) * 100) : 0,
            yield: turnover ? U.round2((profitRounded / turnover) * 100) : 0,
            avgProfit: filtered.length ? U.round2(profitRounded / filtered.length) : 0,

            biggestWin: U.round2(biggestWin),
            biggestLoss: U.round2(biggestLoss),

            startBank: startBank,
            startBalance: U.round2(series.startBalance),
            balance: U.round2(series.endBalance),
            points: series.points,

            maxDrawdown: dd.amount,
            maxDrawdownPct: dd.pct,
            drawdownPeakX: dd.peakX,
            drawdownTroughX: dd.troughX,
            drawdowns: drawdownDetails(series.points),

            maxWinStreak: st.maxWin,
            maxLoseStreak: st.maxLose,
            maxLoseStreakAmount: st.maxLoseAmount,
            currentStreak: st.current,

            maxExposurePct: maxExposurePct(allBets, filtered, startBank, series.startBalance)
        };
    }

    /** Динамика прибыли по дням периода (для графика). */
    function timeline(bets) {
        var points = bankrollSeries(bets, bets, KB.Store.settings().startBank).points;
        return points.map(function (p) {
            return { x: p.x, y: p.y, profit: U.round2(p.y - points[0].y), bet: p.bet };
        });
    }

    /** Прибыль по месяцам, от новых к старым. */
    function profitByMonth(bets) {
        var groups = U.groupBy(bets, function (b) { return monthKey(b.date); });
        return groups.map(function (g) {
            var settled = g.items.filter(isSettled);
            var profit = settled.reduce(function (s, b) { return s + profitOf(b); }, 0);
            var staked = settled.reduce(function (s, b) { return s + b.stake; }, 0);
            var won = settled.filter(function (b) { return b.status === 'won'; }).length;
            var lost = settled.filter(function (b) { return b.status === 'lost'; }).length;
            return {
                key: g.key,
                label: U.fmt.monthTitle(g.key),
                count: g.items.length,
                settled: settled.length,
                profit: U.round2(profit),
                staked: U.round2(staked),
                roi: staked ? U.round2((profit / staked) * 100) : 0,
                won: won,
                lost: lost,
                winRate: won + lost ? U.round2(won / (won + lost) * 100) : 0
            };
        }).sort(function (a, b) {
            return a.key < b.key ? 1 : -1;
        });
    }

    KB.A = {
        isSettled: isSettled,
        profitOf: profitOf,
        sortByDateAsc: sortByDateAsc,
        monthKey: monthKey,
        dayKey: dayKey,
        filterBets: filterBets,
        monthKeys: monthKeys,
        rangeTitle: rangeTitle,
        bankrollSeries: bankrollSeries,
        drawdown: drawdown,
        drawdownDetails: drawdownDetails,
        streaks: streaks,
        metrics: metrics,
        timeline: timeline,
        profitByMonth: profitByMonth
    };
})(window.KB);
