/* ==========================================================================
   KuruBets — модальные окна: инфраструктура, подтверждение, настройки, импорт
   ========================================================================== */
window.KB = window.KB || {};

(function (KB) {
    'use strict';

    var U = KB.U;
    var root;
    var stack = [];

    function ensureRoot() {
        if (!root) {
            root = document.getElementById('modal-root');
        }
        return root;
    }

    function open(cfg) {
        ensureRoot();
        var wrap = document.createElement('div');
        wrap.className = 'modal';
        wrap.innerHTML =
            '<div class="modal-backdrop" data-close="1"></div>'
            + '<div class="modal-card' + (cfg.wide ? ' modal-card--wide' : '') + '" role="dialog" aria-modal="true">'
            + '<div class="modal-head">'
            + '<h2 class="modal-title">' + U.esc(cfg.title) + '</h2>'
            + '<button class="icon-btn" data-close="1" title="Закрыть" aria-label="Закрыть">'
            + '<svg viewBox="0 0 24 24"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>'
            + '</button>'
            + '</div>'
            + '<div class="modal-body">' + (cfg.body || '') + '</div>'
            + (cfg.footer === false ? '' : '<div class="modal-foot">' + (cfg.footer || '<button class="btn btn--ghost" data-close="1">Закрыть</button>') + '</div>')
            + '</div>';

        wrap.addEventListener('click', function (ev) {
            if (ev.target.closest('[data-close]')) {
                close();
            }
        });

        root.appendChild(wrap);
        stack.push(wrap);
        document.body.classList.add('no-scroll');
        requestAnimationFrame(function () {
            wrap.classList.add('is-open');
        });

        if (cfg.onMount) {
            cfg.onMount(wrap);
        }
        var focusable = wrap.querySelector('input, select, textarea, button.btn--primary');
        if (focusable) {
            focusable.focus();
        }
        return wrap;
    }

    function close() {
        var top = stack.pop();
        if (!top) {
            return;
        }
        top.classList.remove('is-open');
        setTimeout(function () {
            if (top.parentNode) {
                top.parentNode.removeChild(top);
            }
            if (!stack.length) {
                document.body.classList.remove('no-scroll');
            }
        }, 180);
    }

    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && stack.length) {
            close();
        }
    });

    /* --------------------------------------------------------- подтверждение */

    function confirm(cfg, onYes) {
        open({
            title: cfg.title || 'Подтверждение',
            body: '<p class="confirm-text">' + U.esc(cfg.text || '') + '</p>'
                + (cfg.danger ? '<p class="confirm-warn">' + U.esc(cfg.danger) + '</p>' : ''),
            footer: '<button class="btn btn--ghost" data-close="1">Отмена</button>'
                + '<button class="btn ' + (cfg.danger ? 'btn--danger' : 'btn--primary') + '" data-yes>Подтвердить</button>',
            onMount: function (wrap) {
                wrap.querySelector('[data-yes]').addEventListener('click', function () {
                    close();
                    onYes();
                });
            }
        });
    }

    /* -------------------------------------------------------------- поля */

    function field(label, control, hint, cls) {
        return '<label class="field' + (cls ? ' ' + cls : '') + '">'
            + '<span class="field-label">' + U.esc(label) + '</span>'
            + control
            + (hint ? '<span class="field-hint">' + U.esc(hint) + '</span>' : '')
            + '</label>';
    }

    function switchRow(name, label, hint, on) {
        return '<div class="switch-row">'
            + '<div><div class="switch-label">' + U.esc(label) + '</div>'
            + '<div class="field-hint">' + U.esc(hint) + '</div></div>'
            + '<button type="button" class="switch' + (on ? ' is-on' : '') + '" data-sw="' + name + '" role="switch"></button>'
            + '</div>';
    }

    function datalist(id, values) {
        return '<datalist id="' + id + '">' + values.map(function (v) {
            return '<option value="' + U.esc(v) + '"></option>';
        }).join('') + '</datalist>';
    }

    /* ------------------------------------------------------------- настройки */

    function settingsModal(onSaved) {
        var s = KB.Store.settings();

        var body = ''
            + '<div class="form-grid">'
            + field('Стартовый банкролл, ' + U.CURRENCY,
                '<input class="input" type="number" min="0" step="100" name="startBank" value="' + (s.startBank || 0) + '">')
            + field('Ставка по умолчанию, ' + U.CURRENCY,
                '<input class="input" type="number" min="0" step="50" name="defaultStake" value="' + (s.defaultStake || 0) + '">')
            + field('Вид спорта по умолчанию',
                '<select class="input" name="defaultSport">' + KB.Store.sports().map(function (sp) {
                    return '<option value="' + U.esc(sp) + '"' + (s.defaultSport === sp ? ' selected' : '') + '>' + U.esc(sp) + '</option>';
                }).join('') + '</select>')
            + field('Букмекер по умолчанию',
                '<input class="input" name="defaultBookmaker" list="dl-bookmakers" value="' + U.esc(s.defaultBookmaker || '') + '">')
            + field('Учёт доходности',
                '<select class="input" name="roiMode">'
                + '<option value="flat"' + (s.roiMode !== 'turnover' ? ' selected' : '') + '>ROI по выигравшим ставкам</option>'
                + '<option value="turnover"' + (s.roiMode === 'turnover' ? ' selected' : '') + '>Yield по всему обороту</option>'
                + '</select>')
            + '</div>'
            + '<div class="switches">'
            + switchRow('warnDuplicate', 'Предупреждать о дублях', 'такая же ставка в тот же день', s.warnDuplicate !== false)
            + switchRow('warnBigStake', 'Предупреждать о крупных ставках', 'больше 5% от банкролла', s.warnBigStake !== false)
            + '</div>'
            + '<hr class="rule">'
            + '<div class="data-actions">'
            + '<button class="btn btn--ghost" data-act="exportJson">Экспорт JSON</button>'
            + '<button class="btn btn--ghost" data-act="exportCsv">Экспорт CSV</button>'
            + '<button class="btn btn--ghost" data-act="importJson">Импорт JSON</button>'
            + '<button class="btn btn--ghost" data-act="loadDemo">Добавить демо-данные</button>'
            + '<button class="btn btn--danger-ghost" data-act="reset">Удалить все ставки</button>'
            + '<input type="file" accept="application/json,.json" class="file-hidden" data-act="file">'
            + '</div>'
            + '<div class="data-note muted">Данные хранятся только в этом браузере (localStorage). '
            + 'Экспортируйте JSON, чтобы перенести историю в другой браузер.</div>'
            + datalist('dl-bookmakers', KB.Store.bookmakers());

        open({
            title: 'Настройки и данные',
            body: body,
            wide: true,
            footer: '<button class="btn btn--ghost" data-close="1">Отмена</button>'
                + '<button class="btn btn--primary" data-save>Сохранить</button>',
            onMount: function (wrap) {
                wrap.querySelector('[data-save]').addEventListener('click', function () {
                    KB.Store.setSettings({
                        startBank: Math.max(0, Number(wrap.querySelector('[name=startBank]').value) || 0),
                        defaultStake: Math.max(0, Number(wrap.querySelector('[name=defaultStake]').value) || 0),
                        defaultSport: wrap.querySelector('[name=defaultSport]').value,
                        defaultBookmaker: wrap.querySelector('[name=defaultBookmaker]').value.trim(),
                        roiMode: wrap.querySelector('[name=roiMode]').value,
                        warnDuplicate: wrap.querySelector('[data-sw=warnDuplicate]').classList.contains('is-on'),
                        warnBigStake: wrap.querySelector('[data-sw=warnBigStake]').classList.contains('is-on')
                    });
                    close();
                    U.toast('Настройки сохранены', 'success');
                    if (onSaved) {
                        onSaved();
                    }
                });

                wrap.querySelectorAll('[data-sw]').forEach(function (sw) {
                    sw.addEventListener('click', function () {
                        sw.classList.toggle('is-on');
                    });
                });

                bindDataActions(wrap, onSaved);
            }
        });
    }

    function bindDataActions(wrap, onSaved) {
        var fileInput = wrap.querySelector('[data-act=file]');

        wrap.querySelector('[data-act=exportJson]').addEventListener('click', function () {
            U.download('kurbets-' + U.fmt.toDateInput(new Date()) + '.json',
                JSON.stringify(KB.Store.data, null, 2), 'application/json');
            U.toast('JSON выгружен', 'success');
        });

        wrap.querySelector('[data-act=exportCsv]').addEventListener('click', function () {
            var rows = [['Дата', 'Вид', 'Событие', 'Ставка', 'Тип', 'Кэф', 'Сумма', 'Букмекер', 'Статус', 'Прибыль', 'Заметка']];
            KB.A.sortByDateAsc(KB.Store.bets()).forEach(function (b) {
                rows.push([
                    U.fmt.toDateTimeInput(b.date).replace('T', ' '),
                    b.sport, b.event, b.selection, b.betType,
                    U.fmt.coef(b.coef), String(b.stake), b.bookmaker,
                    KB.STATUS_LABEL(b.status),
                    b.status === 'calc' ? '' : U.fmt.amount(KB.A.profitOf(b)),
                    b.note
                ]);
            });
            U.download('kurbets-' + U.fmt.toDateInput(new Date()) + '.csv', U.toCsv(rows), 'text/csv');
            U.toast('CSV выгружен', 'success');
        });

        wrap.querySelector('[data-act=importJson]').addEventListener('click', function () {
            fileInput.click();
        });

        fileInput.addEventListener('change', function () {
            var file = fileInput.files && fileInput.files[0];
            if (!file) {
                return;
            }
            var reader = new FileReader();
            reader.onload = function () {
                var parsed;
                try {
                    parsed = JSON.parse(String(reader.result || ''));
                } catch (e) {
                    U.toast('Файл повреждён — JSON не читается', 'error', 5000);
                    return;
                }
                var incoming = Array.isArray(parsed) ? parsed : (parsed && parsed.bets);
                if (!Array.isArray(incoming)) {
                    U.toast('В файле нет массива ставок', 'error', 5000);
                    return;
                }
                close();
                chooseImportMode(incoming, parsed, onSaved);
            };
            reader.readAsText(file, 'utf-8');
            fileInput.value = '';
        });

        wrap.querySelector('[data-act=loadDemo]').addEventListener('click', function () {
            var demo = KB.Demo.generate();
            var added = KB.Store.mergeBets(demo.bets);
            close();
            U.toast('Добавлено демо-ставок: ' + added, 'success');
            if (onSaved) {
                onSaved();
            }
        });

        wrap.querySelector('[data-act=reset]').addEventListener('click', function () {
            var count = KB.Store.bets().length;
            if (!count) {
                U.toast('Ставок и так нет', 'info');
                return;
            }
            close();
            confirm({
                title: 'Удалить все ставки',
                text: 'Будет удалено ставок: ' + count + ', вместе с историей банкролла.',
                danger: 'Действие необратимо. Сначала сделайте экспорт JSON, если данные нужны.'
            }, function () {
                KB.Store.reset();
                U.toast('Все ставки удалены', 'success');
                if (onSaved) {
                    onSaved();
                }
            });
        });
    }

    function chooseImportMode(incoming, parsed, onSaved) {
        open({
            title: 'Как импортировать?',
            body: '<p class="confirm-text">В файле ' + incoming.length + ' ставок, в базе сейчас '
                + KB.Store.bets().length + '.</p>'
                + '<div class="import-modes">'
                + '<button class="mode-card" data-mode="append">'
                + '<span class="mode-title">Добавить к текущим</span>'
                + '<span class="mode-sub">Текущие ставки останутся, дубликаты получат новые id</span></button>'
                + '<button class="mode-card mode-card--danger" data-mode="replace">'
                + '<span class="mode-title">Заменить всё</span>'
                + '<span class="mode-sub">Текущая база будет удалена, настройки возьмутся из файла</span></button>'
                + '</div>',
            onMount: function (wrap) {
                wrap.querySelectorAll('[data-mode]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        if (btn.dataset.mode === 'append') {
                            U.toast('Добавлено ставок: ' + KB.Store.mergeBets(incoming), 'success');
                        } else {
                            U.toast('База заменена. Ставок: ' + KB.Store.replaceAll(parsed), 'success');
                        }
                        close();
                        if (onSaved) {
                            onSaved();
                        }
                    });
                });
            }
        });
    }

    KB.Modals = {
        open: open,
        close: close,
        confirm: confirm,
        settings: settingsModal,
        field: field,
        switchRow: switchRow,
        datalist: datalist,
        isOpen: function () {
            return stack.length > 0;
        }
    };
})(window.KB);
