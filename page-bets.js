/* ==========================================================================
   KuruBets — страница «Журнал ставок»
   ========================================================================== */
window.KB = window.KB || {};

(function (KB) {
    'use strict';

    var U = KB.U;
    var UI = KB.UI;

    var DEFAULT_FILTERS = {
        search: '', sport: '', status: '', bookmaker: '', from: '', to: '', sort: 'date-desc'
    };

    function cloneFilters(f) {
        return Object.assign({}, DEFAULT_FILTERS, f || {});
    }

    function render(ctx) {
        var filters = cloneFilters(ctx.state.filters);
        var rows = UI.applyBetsFilters(ctx.bets, filters);
        var summary = KB.AG.summarize(rows);
        var total = ctx.bets.length;

        if (!total) {
            return UI.empty('Пока нет ни одной ставки', 'loadDemo');
        }

        var head = ''
            + '<div class="filters-bar">' + UI.betsFiltersHtml(filters) + '</div>'
            + '<div class="chips-row" data-quick>'
            + quickChip('status', '', 'Все')
            + quickChip('status', 'calc', 'Не рассчитаны')
            + quickChip('status', 'won', 'Выигрышные')
            + quickChip('status', 'lost', 'Проигрышные')
            + quickChip('status', 'push', 'Возвраты')
            + '</div>';

        var stats = '<div class="stat-strip">'
            + stripItem('Показано', rows.length + ' из ' + total)
            + stripItem('Оборот', U.fmt.money(summary.staked))
            + stripItem('Прибыль', '<span class="' + U.signClass(summary.profit) + '">' + U.fmt.money(summary.profit, true) + '</span>')
            + stripItem('ROI', '<span class="' + U.signClass(summary.roi) + '">' + U.fmt.pct(summary.roi, true) + '</span>')
            + stripItem('Winrate', U.fmt.pct(summary.winRate))
            + stripItem('Средний кэф', U.fmt.coef(summary.avgCoef))
            + '</div>';

        var tableHtml = UI.table(KB.UI.betColumns(true), rows, {
            emptyText: 'Под фильтры не попала ни одна ставка',
            rowAttrs: function (b) {
                return 'data-bet-id="' + b.id + '" tabindex="0" role="button"';
            }
        });

        return head + stats + '<div class="card card--flush" data-bets-table>' + tableHtml + '</div>';
    }

    function quickChip(field, value, label) {
        return '<button class="chip chip--sm" data-quick-field="' + field + '" data-quick-value="' + value + '">'
            + U.esc(label) + '</button>';
    }

    function stripItem(label, value) {
        return '<div class="strip-item"><span class="strip-label">' + label + '</span>'
            + '<span class="strip-value">' + value + '</span></div>';
    }

    /* ----------------------------------------------------------------- события */

    function mount(app) {
        var page = app.pageEl;

        page.addEventListener('input', debounce(function (ev) {
            var el = ev.target.closest('[data-f]');
            if (!el) {
                return;
            }
            app.state.filters[el.dataset.f] = el.value;
            app.rerender({ keepFocus: el });
        }, 220));

        page.addEventListener('change', function (ev) {
            var el = ev.target.closest('[data-f]');
            if (el && el.tagName === 'SELECT') {
                app.state.filters[el.dataset.f] = el.value;
                app.rerender();
            }
        });

        page.addEventListener('click', function (ev) {
            var quick = ev.target.closest('[data-quick-field]');
            if (quick) {
                var value = quick.dataset.quickValue;
                app.state.filters.status = app.state.filters.status === value ? '' : value;
                app.rerender();
                return;
            }

            if (ev.target.closest('[data-action=reset-filters]')) {
                app.state.filters = cloneFilters();
                app.rerender();
                return;
            }

            var actionBtn = ev.target.closest('[data-action]');
            if (actionBtn && actionBtn.dataset.id) {
                ev.stopPropagation();
                var bet = KB.Store.betById(actionBtn.dataset.id);
                if (!bet) {
                    return;
                }
                if (actionBtn.dataset.action === 'edit') {
                    KB.Form.open(bet, function () {
                        app.refresh();
                    });
                } else if (actionBtn.dataset.action === 'delete') {
                    removeBet(app, bet);
                }
                return;
            }

            var row = ev.target.closest('[data-bet-id]');
            if (row) {
                var bet2 = KB.Store.betById(row.dataset.betId);
                if (bet2) {
                    detailModal(app, bet2);
                }
            }
        });

        page.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter') {
                return;
            }
            var row = ev.target.closest('[data-bet-id]');
            if (row) {
                var bet = KB.Store.betById(row.dataset.betId);
                if (bet) {
                    detailModal(app, bet);
                }
            }
        });
    }

    function removeBet(app, bet) {
        KB.Modals.confirm({
            title: 'Удалить ставку',
            text: bet.event + ' · ' + (bet.betType || bet.selection) + ' @' + U.fmt.coef(bet.coef)
                + ' на ' + U.fmt.money(bet.stake),
            danger: 'Ставка будет удалена из истории. Можно восстановить сразу после удаления.'
        }, function () {
            var removed = KB.Store.removeBet(bet.id);
            U.toast('Ставка удалена', 'success');
            app.refresh();
            if (removed) {
                setTimeout(function () {
                    U.toast('Удалить ставку можно было бы восстановить — ' + removed.event, 'info', 4000);
                }, 200);
            }
        });
    }

    function detailModal(app, bet) {
        var profit = KB.A.profitOf(bet);
        var possible = U.round2(bet.stake * bet.coef - bet.stake);
        var s = KB.Store.settings();
        var bank = Number(s.startBank) || 0;
        var share = bank ? U.round2(bet.stake / bank * 100) : 0;

        var body = '<div class="detail-grid">'
            + kv('Дата', U.fmt.date(bet.date) + ' ' + U.fmt.time(bet.date))
            + kv('Вид спорта', bet.sport)
            + kv('Букмекер', bet.bookmaker || '—')
            + kv('Событие', bet.event)
            + kv('Ставка', bet.selection || '—')
            + kv('Тип', bet.betType || '—')
            + kv('Коэффициент', U.fmt.coef(bet.coef))
            + kv('Сумма', U.fmt.money(bet.stake))
            + kv('Доля банкролла', U.fmt.pct(share))
            + kv('Возможный выигрыш', U.fmt.money(possible, true))
            + kv('Результат', KB.STATUS_LABEL(bet.status))
            + kv('Исход матча', bet.outcome || '—')
            + (bet.note ? '<div class="kv kv--wide"><span class="kv-label">Комментарий</span>'
                + '<span class="kv-value">' + U.esc(bet.note) + '</span></div>' : '')
            + '</div>'
            + (bet.status === 'calc'
                ? '<div class="detail-result detail-result--open">Ставка не рассчитана. Она не влияет на прибыль, '
                + 'но сумма ' + U.fmt.money(bet.stake) + ' уже вычтена из доступного банка.</div>'
                : '<div class="detail-result">Итог по ставке: <span class="' + U.signClass(profit) + '">'
                + U.fmt.money(profit, true) + '</span></div>');

        var footer = '<div class="modal-foot-split">'
            + '<div class="quick-status">'
            + KB.STATUSES.map(function (st) {
                return '<button class="btn btn--ghost btn--sm" data-set-status="' + st.id + '"'
                    + (st.id === bet.status ? ' disabled' : '') + '>' + st.label + '</button>';
            }).join('')
            + '</div>'
            + '<div class="modal-foot-actions">'
            + '<button class="btn btn--danger-ghost" data-del>Удалить</button>'
            + '<button class="btn btn--primary" data-edit>Редактировать</button>'
            + '</div>'
            + '</div>';

        KB.Modals.open({
            title: 'Ставка',
            body: body,
            wide: true,
            footer: footer,
            onMount: function (wrap) {
                wrap.querySelectorAll('[data-set-status]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        KB.Form.quickStatus(bet, btn.dataset.setStatus, function () {
                            KB.Modals.close();
                            app.refresh();
                        });
                    });
                });
                wrap.querySelector('[data-edit]').addEventListener('click', function () {
                    KB.Modals.close();
                    KB.Form.open(KB.Store.betById(bet.id), function () {
                        app.refresh();
                    });
                });
                wrap.querySelector('[data-del]').addEventListener('click', function () {
                    KB.Modals.close();
                    removeBet(app, bet);
                });
            }
        });
    }

    function debounce(fn, ms) {
        var t;
        return function (ev) {
            var args = arguments;
            clearTimeout(t);
            t = setTimeout(function () {
                fn.apply(null, args);
            }, ms);
        };
    }

    KB.Pages = KB.Pages || {};
    KB.Pages.bets = { render: render, mount: mount };
})(window.KB);
