/* ==========================================================================
   KuruBets — общие элементы интерфейса: карточки, таблицы, фильтр периода
   ========================================================================== */
window.KB = window.KB || {};

(function (KB) {
    'use strict';

    var U = KB.U;

    /* ------------------------------------------------------------- карточки */

    function metricCard(cfg) {
        var tone = cfg.tone || 'neutral';
        return '<div class="card metric' + (cfg.cls ? ' ' + cfg.cls : '') + '">'
            + '<div class="metric-top">'
            + '<span class="metric-label">' + U.esc(cfg.label) + '</span>'
            + (cfg.badge ? '<span class="badge badge--' + cfg.badgeTone + '">' + U.esc(cfg.badge) + '</span>' : '')
            + '</div>'
            + '<div class="metric-value metric-value--' + tone + '">' + cfg.value + '</div>'
            + (cfg.hint ? '<div class="metric-hint">' + cfg.hint + '</div>' : '')
            + (cfg.spark ? '<div class="metric-spark">' + cfg.spark + '</div>' : '')
            + '</div>';
    }

    function empty(text, action) {
        return '<div class="empty">'
            + '<div class="empty-title">' + U.esc(text) + '</div>'
            + (action ? '<button class="btn btn--primary" data-action="' + U.esc(action) + '">'
                + U.esc(action === 'loadDemo' ? 'Загрузить демо-данные' : 'Добавить ставку') + '</button>' : '')
            + '</div>';
    }

    function statusBadge(status) {
        return '<span class="pill pill--' + status + '">' + U.esc(KB.STATUS_LABEL(status)) + '</span>';
    }

    /* ---------------------------------------------------------- фильтр периода */

    /**
     * Панель периода. range: {mode, month, from, to}
     * Возвращает HTML; события навешивает bindPeriodBar.
     */
    function periodBarHtml(range, months) {
        var r = range || { mode: 'all' };
        var options = [
            { id: 'all', label: 'Всё время' },
            { id: 'ytd', label: 'С начала года' },
            { id: 'month', label: 'Месяц' },
            { id: 'custom', label: 'Период' }
        ];

        return '<div class="period-bar">'
            + '<div class="segmented">'
            + options.map(function (o) {
                return '<button class="segmented-btn' + (r.mode === o.id ? ' is-active' : '')
                    + '" data-period="' + o.id + '">' + o.label + '</button>';
            }).join('')
            + '</div>'

            + '<div class="period-extra' + (r.mode === 'month' ? ' is-visible' : '') + '" data-when="month">'
            + '<select class="input input--sm" data-period-month>'
            + (months || []).map(function (m) {
                return '<option value="' + m + '"' + (r.month === m ? ' selected' : '') + '>'
                    + U.esc(U.fmt.monthTitle(m)) + '</option>';
            }).join('')
            + '</select>'
            + '</div>'

            + '<div class="period-extra' + (r.mode === 'custom' ? ' is-visible' : '') + '" data-when="custom">'
            + '<input type="date" class="input input--sm" data-period-from value="' + (r.from || '') + '" aria-label="Дата начала">'
            + '<span class="muted">—</span>'
            + '<input type="date" class="input input--sm" data-period-to value="' + (r.to || '') + '" aria-label="Дата окончания">'
            + '</div>'

            + '<div class="period-caption muted">' + U.esc(KB.A.rangeTitle(toModel(r))) + '</div>'
            + '</div>';
    }

    /** Приводит форму фильтра к модели периода для аналитики. */
    function toModel(range) {
        var r = range || { mode: 'all' };
        if (r.mode === 'custom') {
            return { mode: 'custom', from: r.from ? new Date(r.from + 'T00:00:00') : null, to: r.to ? new Date(r.to + 'T23:59:59') : null };
        }
        if (r.mode === 'month') {
            return { mode: 'month', month: r.month };
        }
        return { mode: r.mode };
    }

    function bindPeriodBar(container, range, onChange) {
        container.addEventListener('click', function (ev) {
            var btn = ev.target.closest('[data-period]');
            if (!btn) {
                return;
            }
            range.mode = btn.dataset.period;
            onChange();
        });
        container.addEventListener('change', function (ev) {
            if (ev.target.hasAttribute('data-period-month')) {
                range.month = ev.target.value;
                range.mode = 'month';
            } else if (ev.target.hasAttribute('data-period-from')) {
                range.from = ev.target.value;
            } else if (ev.target.hasAttribute('data-period-to')) {
                range.to = ev.target.value;
            } else {
                return;
            }
            onChange();
        });
    }

    /* --------------------------------------------------------------- таблицы */

    /**
     * columns: [{key, label, align, width, render(row)}]
     * opts: { rowAttrs(row), emptyText, onRowClick }
     */
    function table(columns, rows, opts) {
        opts = opts || {};
        if (!rows || !rows.length) {
            return '<div class="empty"><div class="empty-title">' + U.esc(opts.emptyText || 'Нет данных') + '</div></div>';
        }

        var head = '<thead><tr>' + columns.map(function (c) {
            return '<th class="th--' + (c.align || 'left') + '"' + (c.width ? ' style="width:' + c.width + '"' : '') + '>'
                + U.esc(c.label) + '</th>';
        }).join('') + '</tr></thead>';

        var body = '<tbody>' + rows.map(function (row, i) {
            var attrs = opts.rowAttrs ? opts.rowAttrs(row, i) : '';
            return '<tr ' + attrs + '>' + columns.map(function (c) {
                var value = c.render ? c.render(row, i) : U.esc(row[c.key]);
                return '<td class="td--' + (c.align || 'left') + '">' + value + '</td>';
            }).join('') + '</tr>';
        }).join('') + '</tbody>';

        return '<div class="table-wrap"><table class="table">' + head + body + '</table></div>';
    }

    /* --------------------------------------------------------- ставка как строка */

    function betCells(bet) {
        var profit = KB.A.profitOf(bet);
        return {
            profit: profit,
            event: '<div class="cell-event">'
                + '<span class="cell-event-main">' + U.esc(bet.event) + '</span>'
                + '<span class="cell-event-sub">' + U.esc(bet.selection) + '</span>'
                + '</div>',
            meta: '<div class="cell-meta">' + U.esc(bet.sport) + (bet.bookmaker ? ' · ' + U.esc(bet.bookmaker) : '') + '</div>'
        };
    }

    function betColumns(withActions) {
        var cols = [
            {
                label: 'Дата', width: '112px', render: function (b) {
                    return '<div class="cell-date"><span>' + U.fmt.date(b.date) + '</span>'
                        + '<span class="cell-event-sub">' + U.fmt.time(b.date) + '</span></div>';
                }
            },
            {
                label: 'Событие / ставка', render: function (b) {
                    var c = betCells(b);
                    return '<div class="cell-event">'
                        + '<span class="cell-event-main">' + U.esc(bet_event(b)) + '</span>'
                        + '<span class="cell-event-sub">' + U.esc(b.betType || '—') + ' · ' + U.esc(b.selection || '—') + '</span>'
                        + '</div>';
                }
            },
            {
                label: 'Вид / контора', width: '150px', render: function (b) {
                    return '<div class="cell-meta">' + U.esc(b.sport) + '<br>' + U.esc(b.bookmaker || '—') + '</div>';
                }
            },
            { label: 'Кэф', align: 'right', width: '74px', render: function (b) { return U.fmt.coef(b.coef); } },
            { label: 'Ставка', align: 'right', width: '104px', render: function (b) { return U.fmt.money(b.stake); } },
            {
                label: 'Исход', align: 'right', width: '120px', render: function (b) {
                    if (b.status === 'calc') {
                        return '<span class="muted">в ожидании</span>';
                    }
                    var p = KB.A.profitOf(b);
                    return '<span class="' + U.signClass(p) + '">' + U.fmt.money(p, true) + '</span>';
                }
            },
            { label: 'Статус', align: 'center', width: '120px', render: function (b) { return statusBadge(b.status); } }
        ];

        if (withActions) {
            cols.push({
                label: '', align: 'right', width: '96px', render: function (b) {
                    return '<div class="row-actions">'
                        + '<button class="icon-btn" data-action="edit" data-id="' + b.id + '" title="Редактировать">'
                        + '<svg viewBox="0 0 24 24"><path d="M4 17.2V20h2.8L16 10.8 13.2 8 4 17.2zM19.7 8.3a1 1 0 0 0 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0l-1.4 1.4L18.3 9.7l1.4-1.4z"/></svg>'
                        + '</button>'
                        + '<button class="icon-btn icon-btn--danger" data-action="delete" data-id="' + b.id + '" title="Удалить">'
                        + '<svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg>'
                        + '</button>'
                        + '</div>';
                }
            });
        }

        return cols;
    }

    function bet_event(b) {
        return b.event;
    }

    /* --------------------------------------------------------------- фильтры */

    function betsFiltersHtml(f) {
        var sports = KB.Store.sports();
        var books = KB.Store.bookmakers();

        return ''
            + '<input type="search" class="input" data-f="search" placeholder="Поиск: событие, ставка, заметка" value="' + U.esc(f.search) + '">'
            + '<select class="input input--sm" data-f="sport">'
            + '<option value="">Все виды</option>'
            + sports.map(function (s) {
                return '<option value="' + U.esc(s) + '"' + (f.sport === s ? ' selected' : '') + '>' + U.esc(s) + '</option>';
            }).join('')
            + '</select>'
            + '<select class="input input--sm" data-f="status">'
            + KB.STATUSES.map(function (s) {
                return '<option value="' + s.id + '"' + (f.status === s.id ? ' selected' : '') + '>' + s.label + '</option>';
            }).join('')
            + '<option value=""' + (f.status === '' ? ' selected' : '') + '>Любой статус</option>'
            + '</select>'
            + '<select class="input input--sm" data-f="bookmaker">'
            + '<option value="">Все конторы</option>'
            + books.map(function (b) {
                return '<option value="' + U.esc(b) + '"' + (f.bookmaker === b ? ' selected' : '') + '>' + U.esc(b) + '</option>';
            }).join('')
            + '</select>'
            + '<input type="date" class="input input--sm" data-f="from" value="' + (f.from || '') + '" title="С даты">'
            + '<input type="date" class="input input--sm" data-f="to" value="' + (f.to || '') + '" title="По дату">'
            + '<select class="input input--sm" data-f="sort">'
            + '<option value="date-desc"' + (f.sort === 'date-desc' ? ' selected' : '') + '>Сначала новые</option>'
            + '<option value="date-asc"' + (f.sort === 'date-asc' ? ' selected' : '') + '>Сначала старые</option>'
            + '<option value="profit-desc"' + (f.sort === 'profit-desc' ? ' selected' : '') + '>Прибыль ↓</option>'
            + '<option value="profit-asc"' + (f.sort === 'profit-asc' ? ' selected' : '') + '>Прибыль ↑</option>'
            + '<option value="coef-desc"' + (f.sort === 'coef-desc' ? ' selected' : '') + '>Коэффициент ↓</option>'
            + '<option value="stake-desc"' + (f.sort === 'stake-desc' ? ' selected' : '') + '>Ставка ↓</option>'
            + '</select>'
            + '<button class="btn btn--ghost" data-action="reset-filters">Сбросить</button>';
    }

    function applyBetsFilters(bets, f) {
        var search = String(f.search || '').trim().toLowerCase();
        var from = f.from ? new Date(f.from + 'T00:00:00') : null;
        var to = f.to ? new Date(f.to + 'T23:59:59') : null;

        var rows = bets.filter(function (b) {
            if (f.sport && b.sport !== f.sport) { return false; }
            if (f.status && b.status !== f.status) { return false; }
            if (f.bookmaker && b.bookmaker !== f.bookmaker) { return false; }
            var d = new Date(b.date);
            if (from && d < from) { return false; }
            if (to && d > to) { return false; }
            if (search) {
                var hay = (b.event + ' ' + b.selection + ' ' + b.betType + ' ' + b.note + ' ' + b.bookmaker).toLowerCase();
                if (hay.indexOf(search) < 0) {
                    return false;
                }
            }
            return true;
        });

        var sorters = {
            'date-desc': function (a, b) { return new Date(b.date) - new Date(a.date); },
            'date-asc': function (a, b) { return new Date(a.date) - new Date(b.date); },
            'profit-desc': function (a, b) { return KB.A.profitOf(b) - KB.A.profitOf(a); },
            'profit-asc': function (a, b) { return KB.A.profitOf(a) - KB.A.profitOf(b); },
            'coef-desc': function (a, b) { return b.coef - a.coef; },
            'stake-desc': function (a, b) { return b.stake - a.stake; }
        };

        return rows.sort(sorters[f.sort] || sorters['date-desc']);
    }

    /* ------------------------------------------------------------- переключатели */

    function segControl(name, options, active) {
        return '<div class="segmented segmented--sm" data-seg="' + name + '">'
            + options.map(function (o) {
                return '<button class="segmented-btn' + (active === o.id ? ' is-active' : '')
                    + '" data-seg-value="' + o.id + '">' + U.esc(o.label) + '</button>';
            }).join('') + '</div>';
    }

    function bindSeg(container, onPick) {
        container.addEventListener('click', function (ev) {
            var btn = ev.target.closest('[data-seg-value]');
            if (!btn) {
                return;
            }
            var group = btn.closest('[data-seg]');
            group.querySelectorAll('[data-seg-value]').forEach(function (b) {
                b.classList.toggle('is-active', b === btn);
            });
            onPick(group.dataset.seg, btn.dataset.segValue);
        });
    }

    UI_export({
        metricCard: metricCard,
        empty: empty,
        statusBadge: statusBadge,
        periodBarHtml: periodBarHtml,
        bindPeriodBar: bindPeriodBar,
        toModel: toModel,
        table: table,
        betColumns: betColumns,
        betsFiltersHtml: betsFiltersHtml,
        applyBetsFilters: applyBetsFilters,
        segControl: segControl,
        bindSeg: bindSeg
    });

    function UI_export(obj) {
        KB.UI = obj;
    }
})(window.KB);
