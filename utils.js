/* ==========================================================================
   KuruBets — утилиты: форматирование, экранирование, toast, CSV
   ========================================================================== */
window.KB = window.KB || {};

(function (KB) {
    'use strict';

    var CURRENCY = '₽';

    function pad(n) {
        return n < 10 ? '0' + n : '' + n;
    }

    function uid(prefix) {
        return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    /* ------------------------------------------------------- форматирование */

    var fmt = {
        money: function (value, withSign) {
            return fmt.amount(value, withSign) + ' ' + CURRENCY;
        },

        amount: function (value, withSign) {
            var v = Math.round((Number(value) || 0) * 100) / 100;
            var body = Math.abs(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
            var sign = v < 0 ? '-' : (withSign && v > 0 ? '+' : '');
            return sign + body;
        },

        num: function (value, digits) {
            return (Number(value) || 0).toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: digits == null ? 1 : digits
            });
        },

        pct: function (value, withSign) {
            var v = Number(value) || 0;
            var sign = v < 0 ? '-' : (withSign && v > 0 ? '+' : '');
            return sign + Math.abs(v).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%';
        },

        coef: function (value) {
            return (Number(value) || 0).toFixed(2);
        },

        date: function (iso) {
            var d = new Date(iso);
            return isNaN(d) ? '—' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
        },

        shortDate: function (iso) {
            var d = new Date(iso);
            return isNaN(d) ? '—' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
        },

        time: function (iso) {
            var d = new Date(iso);
            return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes());
        },

        dayTitle: function (iso) {
            var d = new Date(iso);
            if (isNaN(d)) {
                return '—';
            }
            var base = new Date();
            var diff = function (offset) {
                var x = new Date();
                x.setDate(base.getDate() - offset);
                return x;
            };
            var same = function (a, b) {
                return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
            };
            if (same(d, base)) { return 'Сегодня'; }
            if (same(d, diff(1))) { return 'Вчера'; }
            if (same(d, diff(-1))) { return 'Завтра'; }
            return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
        },

        monthTitle: function (key) {
            var parts = String(key).split('-');
            var d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
            return isNaN(d) ? String(key) : d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        },

        /** Значение для <input type="date"> по местному времени. */
        toDateInput: function (iso) {
            var d = iso ? new Date(iso) : new Date();
            if (isNaN(d)) { d = new Date(); }
            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        },

        /** Значение для <input type="datetime-local"> по местному времени. */
        toDateTimeInput: function (iso) {
            var d = iso ? new Date(iso) : new Date();
            if (isNaN(d)) { d = new Date(); }
            return fmt.toDateInput(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        },

        daysAgo: function (n, hour, minute) {
            var d = new Date();
            d.setDate(d.getDate() - n);
            d.setHours(hour == null ? 19 : hour, minute || 0, 0, 0);
            return d;
        },

        plural: function (n, one, few, many) {
            var mod10 = n % 10;
            var mod100 = n % 100;
            if (mod10 === 1 && mod100 !== 11) { return one; }
            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) { return few; }
            return many;
        }
    };

    /* ------------------------------------------------------------ helpers */

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** Класс цвета для числа: зелёный в плюсе, красный в минусе. */
    function signClass(value) {
        var v = Number(value) || 0;
        return v > 0 ? 'pos' : (v < 0 ? 'neg' : 'muted');
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, Number(value) || 0));
    }

    function round2(v) {
        return Math.round((Number(v) || 0) * 100) / 100;
    }

    function round3(v) {
        return Math.round((Number(v) || 0) * 1000) / 1000;
    }

    function groupBy(list, getKey) {
        var map = {};
        var order = [];
        list.forEach(function (item) {
            var key = getKey(item);
            if (!map[key]) {
                map[key] = [];
                order.push(key);
            }
            map[key].push(item);
        });
        return order.map(function (key) {
            return { key: key, items: map[key] };
        });
    }

    function download(filename, text, mime) {
        var blob = new Blob(['\uFEFF' + text], { type: (mime || 'application/json') + ';charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 1000);
    }

    function toCsv(rows) {
        return rows.map(function (row) {
            return row.map(function (cell) {
                var value = cell == null ? '' : String(cell).replace(/"/g, '""');
                return /[";\n]/.test(value) ? '"' + value + '"' : value;
            }).join(';');
        }).join('\r\n');
    }

    /* ---------------------------------------------------------------- toast */

    var toastRoot;

    function toast(message, kind, timeout) {
        if (!toastRoot) {
            toastRoot = document.getElementById('toast-root');
        }
        if (!toastRoot) {
            return;
        }
        var el = document.createElement('div');
        el.className = 'toast' + (kind ? ' toast--' + kind : '');
        el.textContent = message;
        toastRoot.appendChild(el);
        setTimeout(function () {
            el.style.opacity = '0';
            setTimeout(function () {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            }, 250);
        }, timeout || 3200);
    }

    KB.U = {
        uid: uid,
        esc: esc,
        fmt: fmt,
        signClass: signClass,
        clamp: clamp,
        round2: round2,
        round3: round3,
        groupBy: groupBy,
        download: download,
        toCsv: toCsv,
        toast: toast,
        CURRENCY: CURRENCY
    };
})(window.KB);
