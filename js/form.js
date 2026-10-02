/* ==========================================================================
   KuruBets — форма ставки: валидация, пресеты, предупреждения о дублях
   ========================================================================== */
window.KB = window.KB || {};

(function (KB) {
    'use strict';

    var U = KB.U;
    var F = KB.Modals.field;
    var DL = KB.Modals.datalist;

    var TYPES_BY_SPORT = {
        'Футбол': ['П1', '1X', 'X2', 'П2', 'X', 'Фора', 'Тотал больше', 'Тотал меньше', 'Обе забьют'],
        'Хоккей': ['П1', '1X', 'X2', 'П2', 'Фора', 'Тотал больше', 'Тотал меньше'],
        'Теннис': ['П1', 'П2', 'Фора по геймам', 'Тотал по геймам больше', 'Тотал по геймам меньше'],
        'Баскетбол': ['П1', 'П2', 'Фора', 'Тотал больше', 'Тотал меньше'],
        'Киберспорт': ['П1', 'П2', 'Фора по картам', 'Тотал по картам больше', 'Тотал по картам меньше'],
        'Другое': ['П1', '1X', 'X2', 'П2', 'Фора', 'Тотал']
    };

    function presetChips(kind) {
        var groups = {
            coef: ['1.50', '1.70', '1.85', '2.10', '2.50', '3.40'],
            stake: ['500', '1000', '2000', '3000', '5000']
        };
        return '<div class="chips">' + groups[kind].map(function (v) {
            return '<button type="button" class="chip" data-chip="' + kind + '" data-value="' + v + '">'
                + (kind === 'coef' ? v : U.fmt.amount(v)) + '</button>';
        }).join('') + '</div>';
    }

    function formHtml(bet) {
        var s = KB.Store.settings();
        var b = bet || {};
        var isEdit = !!bet;
        var sports = KB.Store.sports();
        var sport = b.sport || s.defaultSport || 'Футбол';

        return '<form class="bet-form" novalidate>'
            + '<div class="form-grid">'

            + F('Дата и время',
                '<input class="input" type="datetime-local" name="date" value="'
                + U.fmt.toDateTimeInput(b.date || new Date()) + '">')

            + F('Вид спорта',
                '<select class="input" name="sport">' + sports.map(function (sp) {
                    return '<option value="' + U.esc(sp) + '"' + (sport === sp ? ' selected' : '') + '>' + U.esc(sp) + '</option>';
                }).join('') + '</select>')

            + F('Событие',
                '<input class="input" name="event" placeholder="Зенит — Краснодар" value="' + U.esc(b.event || '') + '" autocomplete="off">',
                'Название матча или турнира', 'field--wide')

            + F('Ставка / исход',
                '<input class="input" name="selection" placeholder="Тотал больше 2.5" value="' + U.esc(b.selection || '') + '" autocomplete="off">',
                'Что именно играли', 'field--wide')

            + F('Тип ставки',
                '<input class="input" name="betType" list="dl-bet-types" value="' + U.esc(b.betType || '') + '" autocomplete="off">')

            + F('Коэффициент',
                '<input class="input" type="number" name="coef" step="0.01" min="1.01" inputmode="decimal" '
                + 'placeholder="1.85" value="' + (b.coef ? U.fmt.coef(b.coef) : '') + '">'
                + presetChips('coef'), 'Минимум 1.01')

            + F('Сумма ставки, ' + U.CURRENCY,
                '<input class="input" type="number" name="stake" step="10" min="1" inputmode="numeric" '
                + 'placeholder="' + (s.defaultStake || 1000) + '" value="' + (b.stake || '') + '">'
                + presetChips('stake'), 'По умолчанию ' + U.fmt.amount(s.defaultStake || 0) + ' ' + U.CURRENCY)

            + F('Букмекер',
                '<input class="input" name="bookmaker" list="dl-bookmakers" value="' + U.esc(b.bookmaker || '') + '" autocomplete="off">')

            + F('Результат',
                '<select class="input" name="status">' + KB.STATUSES.map(function (st) {
                    return '<option value="' + st.id + '"' + ((b.status || 'calc') === st.id ? ' selected' : '') + '>'
                        + st.label + '</option>';
                }).join('') + '</select>')

            + F('Исход матча',
                '<select class="input" name="outcome">'
                + '<option value="">— не указан —</option>'
                + KB.OUTCOMES.map(function (o) {
                    return '<option value="' + U.esc(o) + '"' + (b.outcome === o ? ' selected' : '') + '>' + o + '</option>';
                }).join('') + '</select>', 'Нужен для статистики по типам')

            + F('Комментарий',
                '<textarea class="input textarea" name="note" rows="3" placeholder="Почему зашёл, что не учёл">'
                + U.esc(b.note || '') + '</textarea>', '', 'field--wide')

            + '</div>'
            + '<div class="form-alerts" data-alerts></div>'
            + DL('dl-bookmakers', KB.Store.bookmakers())
            + DL('dl-bet-types', TYPES_BY_SPORT[sport] || TYPES_BY_SPORT['Другое'])
            + '</form>';
    }

    function readForm(wrap) {
        var form = wrap.querySelector('form');
        return {
            date: form.date.value ? new Date(form.date.value).toISOString() : new Date().toISOString(),
            sport: form.sport.value,
            event: form.event.value.trim(),
            selection: form.selection.value.trim(),
            betType: form.betType.value.trim(),
            coef: Number(form.coef.value) || 0,
            stake: Number(form.stake.value) || 0,
            bookmaker: form.bookmaker.value.trim(),
            status: form.status.value,
            outcome: form.outcome.value,
            note: form.note.value.trim()
        };
    }

    function validate(model) {
        var errors = [];
        if (!model.event) {
            errors.push('Укажите событие');
        }
        if (!model.selection) {
            errors.push('Укажите ставку или исход');
        }
        if (!(model.coef > 1)) {
            errors.push('Коэффициент должен быть больше 1');
        }
        if (model.coef > 1000) {
            errors.push('Коэффициент больше 1000 — проверьте ввод');
        }
        if (!(model.stake > 0)) {
            errors.push('Сумма ставки должна быть больше нуля');
        }
        return errors;
    }

    /** Предупреждения, которые не блокируют сохранение. */
    function warnings(model, existingId) {
        var s = KB.Store.settings();
        var list = [];

        if (s.warnDuplicate !== false) {
            var dups = KB.Store.findDuplicates(model, existingId);
            if (dups.length) {
                list.push({
                    kind: 'warn',
                    text: 'Похожая ставка уже есть: ' + dups[0].event + ' · ' + (dups[0].betType || dups[0].selection)
                        + ' @' + U.fmt.coef(dups[0].coef) + ' от ' + U.fmt.date(dups[0].date)
                });
            }
        }

        if (s.warnBigStake !== false) {
            var bank = Number(s.startBank) || 0;
            if (bank > 0 && model.stake > bank * 0.05) {
                list.push({
                    kind: 'warn',
                    text: 'Ставка больше 5% от банкролла (' + U.fmt.money(bank) + ') — ' + U.fmt.money(model.stake)
                });
            }
        }

        if (model.status === 'won' && model.coef > 1) {
            list.push({
                kind: 'info',
                text: 'Прибыль по этой ставке: ' + U.fmt.money(model.stake * model.coef - model.stake, true)
            });
        }

        return list;
    }

    function renderAlerts(wrap, list) {
        var box = wrap.querySelector('[data-alerts]');
        box.innerHTML = list.map(function (w) {
            return '<div class="alert alert--' + w.kind + '">' + U.esc(w.text) + '</div>';
        }).join('');
    }

    /**
     * Открытие формы. saved(bet) — колбэк после записи в хранилище.
     */
    function open(bet, saved) {
        var isEdit = !!bet;

        KB.Modals.open({
            title: isEdit ? 'Редактирование ставки' : 'Новая ставка',
            body: formHtml(bet),
            wide: true,
            footer: '<button class="btn btn--ghost" data-close="1">Отмена</button>'
                + '<button class="btn btn--primary" data-submit>' + (isEdit ? 'Сохранить' : 'Добавить ставку') + '</button>',
            onMount: function (wrap) {
                var form = wrap.querySelector('form');

                function refresh() {
                    renderAlerts(wrap, warnings(readForm(wrap), isEdit ? bet.id : null));
                }

                form.addEventListener('input', function (ev) {
                    if (ev.target.name === 'coef' || ev.target.name === 'stake') {
                        refresh();
                    }
                    if (ev.target.name === 'status') {
                        refresh();
                    }
                });

                form.addEventListener('change', function (ev) {
                    if (ev.target.name === 'sport') {
                        var dl = wrap.querySelector('#dl-bet-types');
                        dl.innerHTML = (TYPES_BY_SPORT[ev.target.value] || TYPES_BY_SPORT['Другое']).map(function (t) {
                            return '<option value="' + U.esc(t) + '"></option>';
                        }).join('');
                    }
                    refresh();
                });

                wrap.querySelectorAll('[data-chip]').forEach(function (chip) {
                    chip.addEventListener('click', function () {
                        var kind = chip.dataset.chip;
                        var value = chip.dataset.value;
                        if (kind === 'coef') {
                            form.coef.value = value;
                        } else {
                            var current = Number(form.stake.value) || 0;
                            form.stake.value = current === Number(value) ? '' : value;
                        }
                        chip.classList.toggle('is-active');
                        refresh();
                    });
                });

                wrap.querySelector('[data-submit]').addEventListener('click', function () {
                    var model = readForm(wrap);
                    var errors = validate(model);
                    if (errors.length) {
                        renderAlerts(wrap, errors.map(function (e) {
                            return { kind: 'error', text: e };
                        }));
                        U.toast('Проверьте поля формы', 'error');
                        return;
                    }

                    var result = isEdit ? KB.Store.updateBet(bet.id, model) : KB.Store.addBet(model);
                    if (!result) {
                        U.toast('Не удалось сохранить ставку', 'error');
                        return;
                    }
                    if (model.bookmaker) {
                        KB.Store.addBookmaker(model.bookmaker);
                    }
                    KB.Modals.close();
                    U.toast(isEdit ? 'Ставка обновлена' : 'Ставка добавлена', 'success');
                    if (saved) {
                        saved(result);
                    }
                });

                form.addEventListener('submit', function (ev) {
                    ev.preventDefault();
                    wrap.querySelector('[data-submit]').click();
                });

                form.date.addEventListener('keydown', function (ev) {
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        form.event.focus();
                    }
                });

                if (!isEdit) {
                    renderAlerts(wrap, warnings(readForm(wrap), null));
                }
            }
        });
    }

    /** Быстрая смена статуса прямо из таблицы. */
    function quickStatus(bet, status, done) {
        var updated = KB.Store.updateBet(bet.id, {
            status: status,
            outcome: status === 'calc' ? '' : (bet.outcome || guessOutcome(bet.betType))
        });
        if (updated) {
            U.toast('Статус: ' + KB.STATUS_LABEL(status), 'success', 2000);
            if (done) {
                done(updated);
            }
        }
    }

    function guessOutcome(betType) {
        var t = String(betType || '');
        if (t.indexOf('П1') === 0 || t.indexOf('1X') === 0) {
            return 'Победа';
        }
        if (t.indexOf('П2') === 0 || t.indexOf('X2') === 0) {
            return 'Поражение';
        }
        if (t === 'X') {
            return 'Ничья';
        }
        return '';
    }

    KB.Form = {
        open: open,
        quickStatus: quickStatus,
        TYPES_BY_SPORT: TYPES_BY_SPORT,
        guessOutcome: guessOutcome
    };
})(window.KB);
