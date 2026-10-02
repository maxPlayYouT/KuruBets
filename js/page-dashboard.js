/* ==========================================================================
   KuruBets — страница «Обзор»: деньги, банкролл, главные инсайты
   ========================================================================== */
window.KB = window.KB || {};

(function (KB) {
    'use strict';

    var U = KB.U;
    var UI = KB.UI;

    function render(ctx) {
        var m = ctx.m;
        var state = ctx.state;

        if (!ctx.bets.length) {
            return '<div class="card">' + UI.empty('Добавьте первую ставку или загрузите демо-данные, чтобы увидеть аналитику', 'loadDemo') + '</div>';
        }

        var html = UI.periodBarHtml(state.range, ctx.months);

        html += '<div class="metric-grid">' + cards(m, state) + '</div>';

        html += '<div class="card chart-card">'
            + '<div class="card-head">'
            + '<div><h2 class="card-title">Динамика</h2>'
            + '<p class="card-sub">' + U.esc(m.rangeTitle) + ' · ' + m.settledCount + ' рассчитанных ставок</p></div>'
            + '<div class="card-tools">'
            + UI.segControl('dashView', [
                { id: 'bankroll', label: 'Банкролл' },
                { id: 'profit', label: 'Прибыль по дням' }
            ], state.dashView)
            + UI.segControl('dashChart', [
                { id: 'line', label: 'Линия' },
                { id: 'bars', label: 'Столбцы' }
            ], state.dashChart)
            + '</div>'
            + '</div>'
            + '<div class="chart" data-chart data-h="300"></div>'
            + '<div class="chart-legend">'
            + '<span><i class="dot dot--won"></i>выигрыш</span>'
            + '<span><i class="dot dot--lost"></i>проигрыш</span>'
            + '<span><i class="dot dot--push"></i>возврат</span>'
            + '<span class="muted">клик по точке открывает ставку</span>'
            + '</div>'
            + '</div>';

        html += '<div class="grid-2">'
            + funnelCard(m)
            + spotlightCard(m)
            + '</div>';

        html += '<div class="grid-2">'
            + openBetsCard(m)
            + drawdownCard(m)
            + '</div>';

        return html;
    }

    /* -------------------------------------------------------------- карточки */

    function cards(m, state) {
        var roiLabel = KB.Store.settings().roiMode === 'turnover' ? 'Yield' : 'ROI';
        var roiValue = KB.Store.settings().roiMode === 'turnover' ? m.yield : m.roi;
        var profitByDay = KB.A.profitByMonth(m.bets).slice().reverse().map(function (p) {
            return p.profit;
        });

        return [
            UI.metricCard({
                label: 'Текущий банкролл',
                value: U.fmt.money(m.balance),
                tone: m.balance >= m.startBank ? 'pos' : 'neg',
                hint: 'старт ' + U.fmt.money(m.startBank) + ' · изменение '
                    + '<span class="' + U.signClass(m.profit) + '">' + U.fmt.money(m.profit, true) + '</span>',
                badge: m.total ? null : 'нет ставок'
            }),
            UI.metricCard({
                label: 'Прибыль',
                value: U.fmt.money(m.profit, true),
                tone: U.signClass(m.profit) === 'pos' ? 'pos' : (U.signClass(m.profit) === 'neg' ? 'neg' : 'neutral'),
                hint: m.settledCount + ' рассчитанных ставок',
                spark: KB.Charts.sparkline(profitByDay.length ? profitByDay : [0, 0])
            }),
            UI.metricCard({
                label: roiLabel,
                value: U.fmt.pct(roiValue, true),
                tone: roiValue >= 0 ? 'pos' : 'neg',
                hint: roiLabel === 'ROI'
                    ? 'на ставку по рассчитанным'
                    : 'на весь оборот, включая нерассчитанные'
            }),
            UI.metricCard({
                label: 'Winrate',
                value: U.fmt.pct(m.winRate),
                hint: m.won + ' выигрышей · ' + m.lost + ' проигрышей'
                    + (m.push ? ' · ' + m.push + ' возвратов' : ''),
                badge: m.decided >= 20 && m.winRate < 35 ? 'низкий' : null,
                badgeTone: 'warn'
            }),
            UI.metricCard({
                label: 'Средний коэффициент',
                value: U.fmt.coef(m.avgCoef),
                hint: 'максимальный за период ' + U.fmt.coef(m.maxCoef)
            }),
            UI.metricCard({
                label: 'Средняя прибыль на ставку',
                value: U.fmt.money(m.avgProfit, true),
                tone: m.avgProfit >= 0 ? 'pos' : 'neg',
                hint: 'на ' + m.total + ' ставок с нерассчитанными'
            }),
            UI.metricCard({
                label: 'Максимальная просадка',
                value: U.fmt.money(-m.maxDrawdown),
                tone: 'neg',
                hint: U.fmt.pct(-m.maxDrawdownPct) + ' от пика'
                    + (m.drawdownPeakX ? ' · пик ' + U.fmt.date(m.drawdownPeakX) : ''),
                badge: m.maxDrawdownPct > 20 ? 'критично' : (m.maxDrawdownPct > 10 ? 'высокая' : null),
                badgeTone: m.maxDrawdownPct > 20 ? 'bad' : 'warn'
            }),
            UI.metricCard({
                label: 'Серия поражений',
                value: m.maxLoseStreak + ' подряд',
                tone: 'neg',
                hint: 'минус ' + U.fmt.money(m.maxLoseStreakAmount) + ' · побед максимум ' + m.maxWinStreak
            }),
            UI.metricCard({
                label: 'Крупнейший выигрыш',
                value: U.fmt.money(m.biggestWin, true),
                tone: 'pos',
                hint: m.total ? 'самая результативная ставка' : '—'
            }),
            UI.metricCard({
                label: 'Крупнейший проигрыш',
                value: U.fmt.money(-m.biggestLoss, true),
                tone: 'neg',
                hint: 'при обороте ' + U.fmt.money(m.turnover)
            }),
            UI.metricCard({
                label: 'В работе',
                value: m.openCount + ' шт',
                tone: 'neutral',
                hint: 'заморожено ' + U.fmt.money(m.openStake),
                badge: m.maxExposurePct > 10 ? 'высокая нагрузка' : null,
                badgeTone: 'warn'
            }),
            UI.metricCard({
                label: 'Оборот за период',
                value: U.fmt.money(m.turnover),
                hint: m.total + ' ставок · ' + U.fmt.money(m.staked) + ' по рассчитанным'
            })
        ].join('');
    }

    /* ----------------------------------------------------------------- графики */

    function drawChart(ctx) {
        var m = ctx.m;
        var state = ctx.state;
        var host = ctx.pageEl.querySelector('[data-chart]');
        if (!host) {
            return;
        }

        if (state.dashChart === 'bars') {
            var byDay = dayProfits(m.bets);
            if (!byDay.length) {
                host.innerHTML = '<div class="chart-empty">Нет рассчитанных ставок за период</div>';
                return;
            }
            KB.Charts.dayBars(host, byDay);
            return;
        }

        if (!m.points || m.points.length < 2) {
            host.innerHTML = '<div class="chart-empty">Нужно минимум две рассчитанные ставки для линии банкролла</div>';
            return;
        }

        var points = m.points;
        if (state.dashView === 'profit') {
            var base = m.points[0].y;
            points = m.points.map(function (p) {
                return { x: p.x, y: U.round2(p.y - base), bet: p.bet };
            });
        }

        KB.Charts.line(host, points, {
            shade: m.maxDrawdown > 0 ? { fromX: m.drawdownPeakX, toX: m.drawdownTroughX } : null,
            onPointClick: function (bet) {
                KB.Form.open(bet, function () {
                    ctx.app.refresh();
                });
            }
        });
    }

    function dayProfits(bets) {
        var map = {};
        bets.filter(KB.A.isSettled).forEach(function (b) {
            var k = U.fmt.toDateInput(b.date);
            map[k] = (map[k] || 0) + KB.A.profitOf(b);
        });
        return Object.keys(map).sort().map(function (k) {
            return { key: k, label: U.fmt.shortDate(k), profit: U.round2(map[k]) };
        });
    }

    /* ----------------------------------------------------------- карточки инсайтов */

    function funnelCard(m) {
        var hypothetical = m.bets.reduce(function (sum, b) {
            return sum + (b.coef > 1 ? b.stake * (1 / b.coef - 1) : 0);
        }, 0);
        var steps = [
            { label: 'Выиграно денег', value: m.bets.filter(function (b) { return b.status === 'won'; })
                .reduce(function (s, b) { return s + b.stake * b.coef; }, 0) },
            { label: 'Проиграно ставок', value: m.bets.filter(function (b) { return b.status === 'lost'; })
                .reduce(function (s, b) { return s + b.stake; }, 0) },
            { label: 'Итог периода', value: m.profit }
        ];

        return '<div class="card">'
            + '<h2 class="card-title">Куда делись деньги</h2>'
            + '<p class="card-sub">Выигрыши минус проигрыши за период</p>'
            + '<div data-funnel></div>'
            + '<p class="card-note muted">Гипотетический итог, если бы ставки заходили с частотой их вероятностей: '
            + '<span class="' + U.signClass(-hypothetical) + '">' + U.fmt.money(-hypothetical, true) + '</span>. '
            + 'Разница с фактом '
            + '<span class="' + U.signClass(m.profit + hypothetical) + '">' + U.fmt.money(m.profit + hypothetical, true)
            + '</span> — это везение или его отсутствие.</p>'
            + '</div>';
    }

    function spotlightCard(m) {
        var settled = m.bets.filter(KB.A.isSettled).slice().sort(function (a, b) {
            return KB.A.profitOf(b) - KB.A.profitOf(a);
        });
        var n = Math.min(5, settled.length);
        var rows = settled.slice(0, n).map(function (b) {
            return { label: b.event + ' · ' + (b.betType || b.selection) + ' @' + U.fmt.coef(b.coef), profit: KB.A.profitOf(b) };
        });
        var worst = settled.slice(-Math.min(3, settled.length)).reverse().map(function (b) {
            return { label: b.event + ' · ' + (b.betType || b.selection) + ' @' + U.fmt.coef(b.coef), profit: KB.A.profitOf(b) };
        });

        return '<div class="card">'
            + '<h2 class="card-title">' + n + ' ставок, которые сделали результат</h2>'
            + '<p class="card-sub">и ' + worst.length + ' самых болезненных</p>'
            + '<div data-spotlight></div>'
            + '<div class="mini-split">'
            + '<div class="mini-split-item"><span class="muted">Топ-' + n + ' дали</span> <b class="'
            + U.signClass(rows.reduce(function (s, r) { return s + r.profit; }, 0)) + '">'
            + U.fmt.money(rows.reduce(function (s, r) { return s + r.profit; }, 0), true) + '</b></div>'
            + '<div class="mini-split-item"><span class="muted">Прибыль всего периода</span> <b class="'
            + U.signClass(m.profit) + '">' + U.fmt.money(m.profit, true) + '</b></div>'
            + '</div>'
            + '</div>';
    }

    function openBetsCard(m) {
        if (!m.openBets.length) {
            return '<div class="card">'
                + '<h2 class="card-title">Ставки в работе</h2>'
                + '<p class="card-sub">Нет нерассчитанных ставок — банк полностью свободен</p>'
                + '</div>';
        }

        var rows = m.openBets.slice().sort(function (a, b) {
            return new Date(a.date) - new Date(b.date);
        }).slice(0, 8);

        var possible = m.openBets.reduce(function (s, b) { return s + (b.stake * b.coef - b.stake); }, 0);

        return '<div class="card">'
            + '<div class="card-head"><div><h2 class="card-title">Ставки в работе</h2>'
            + '<p class="card-sub">' + m.openBets.length + ' шт · заморожено ' + U.fmt.money(m.openStake)
            + ' · возможная прибыль ' + U.fmt.money(possible, true) + '</p></div></div>'
            + UI.table([
                { label: 'Дата', width: '110px', render: function (b) { return U.fmt.date(b.date) + ' ' + U.fmt.time(b.date); } },
                { label: 'Событие', render: function (b) { return U.esc(b.event) + '<div class="cell-event-sub">' + U.esc(b.selection) + '</div>'; } },
                { label: 'Кэф', align: 'right', width: '70px', render: function (b) { return U.fmt.coef(b.coef); } },
                { label: 'Ставка', align: 'right', width: '100px', render: function (b) { return U.fmt.money(b.stake); } },
                { label: 'Возможно', align: 'right', width: '110px', render: function (b) {
                    return '<span class="pos">' + U.fmt.money(b.stake * b.coef - b.stake, true) + '</span>';
                } }
            ], rows, { emptyText: 'Нет ставок' })
            + (m.openBets.length > 8 ? '<p class="card-note muted">и ещё ' + (m.openBets.length - 8) + ' ставок</p>' : '')
            + '</div>';
    }

    function drawdownCard(m) {
        var worst = m.drawdowns[0];
        if (!worst) {
            return '<div class="card">'
                + '<h2 class="card-title">Просадки</h2>'
                + '<p class="card-sub">За период просадок глубже 5% не было — банкролл только рос или стоял на месте</p>'
                + '</div>';
        }

        var rows = m.drawdowns.slice(0, 4);

        return '<div class="card">'
            + '<div class="card-head"><div><h2 class="card-title">Просадки глубже 5%</h2>'
            + '<p class="card-sub">Найдено ' + m.drawdowns.length + ' · максимум ' + U.fmt.pct(m.maxDrawdownPct) + '</p></div></div>'
            + UI.table([
                { label: 'Пик', width: '110px', render: function (d) { return d.peakX ? U.fmt.date(d.peakX) : '—'; } },
                { label: 'Дно', width: '110px', render: function (d) { return d.troughX ? U.fmt.date(d.troughX) : '—'; } },
                { label: 'Глубина', align: 'right', width: '120px', render: function (d) {
                    return '<span class="neg">' + U.fmt.money(-d.amount) + ' · ' + U.fmt.pct(-d.pct) + '</span>';
                } },
                { label: 'Ставок', align: 'right', width: '90px', render: function (d) { return d.betsInDrawdown; } },
                { label: 'Дней', align: 'right', width: '80px', render: function (d) { return d.daysInDrawdown || '—'; } },
                { label: 'Восстановление', align: 'right', width: '140px', render: function (d) {
                    return d.recovered
                        ? '<span class="pos">' + d.recoveryBets + ' ставок</span>'
                        : '<span class="badge badge--bad">не восстановлена</span>';
                } }
            ], rows, { emptyText: 'Нет просадок' })
            + '<p class="card-note muted">Среднее восстановление: ' + avgRecovery(m.drawdowns) + '</p>'
            + '</div>';
    }

    function avgRecovery(list) {
        var done = list.filter(function (d) { return d.recovered && d.recoveryBets; });
        if (!done.length) {
            return '—';
        }
        var avg = done.reduce(function (s, d) { return s + d.recoveryBets; }, 0) / done.length;
        return U.fmt.num(avg, 1) + ' ставок';
    }

    /* --------------------------------------------------------------- события */

    function mount(ctx) {
        drawChart(ctx);
        var m = ctx.m;

        var funnelHost = ctx.pageEl.querySelector('[data-funnel]');
        if (funnelHost) {
            var won = m.bets.filter(function (b) { return b.status === 'won'; })
                .reduce(function (s, b) { return s + b.stake * b.coef; }, 0);
            var lost = m.bets.filter(function (b) { return b.status === 'lost'; })
                .reduce(function (s, b) { return s + b.stake; }, 0);
            KB.Charts.funnel(funnelHost, [
                { label: 'Получили выигрышей', value: won },
                { label: 'Отдали проигрышей', value: lost },
                { label: 'Осталось на руки', value: m.profit }
            ]);
        }

        var spotHost = ctx.pageEl.querySelector('[data-spotlight]');
        if (spotHost) {
            var settled = m.bets.filter(KB.A.isSettled).slice().sort(function (a, b) {
                return KB.A.profitOf(b) - KB.A.profitOf(a);
            });
            KB.Charts.spotlight(spotHost, settled.slice(0, 5).map(function (b) {
                return { label: b.event + ' · @' + U.fmt.coef(b.coef), profit: KB.A.profitOf(b) };
            }), m.profit);
        }
    }

    KB.Pages = KB.Pages || {};
    KB.Pages.dashboard = { render: render, mount: mount, drawChart: drawChart };
})(window.KB);
