/* ==========================================================================
   KuruBets — графики на чистом SVG (без внешних библиотек)
   ========================================================================== */
window.KB = window.KB || {};

(function (KB) {
    'use strict';

    var U = KB.U;
    var NS = 'http://www.w3.org/2000/svg';

    function el(tag, attrs) {
        var node = document.createElementNS(NS, tag);
        Object.keys(attrs || {}).forEach(function (k) {
            node.setAttribute(k, attrs[k]);
        });
        return node;
    }

    function size(container) {
        var rect = container.getBoundingClientRect();
        return {
            w: Math.max(320, Math.round(rect.width || container.clientWidth || 800)),
            h: Math.round(container.getAttribute('data-h') || rect.height || 260)
        };
    }

    function niceTicks(min, max, count) {
        var span = max - min || 1;
        var step = Math.pow(10, Math.floor(Math.log(span / (count || 4)) / Math.LN10));
        var err = (span / (count || 4)) / step;
        if (err >= 7.5) { step *= 10; } else if (err >= 3) { step *= 5; } else if (err >= 1.5) { step *= 2; }
        var start = Math.floor(min / step) * step;
        var ticks = [];
        for (var v = start; v <= max + step * 0.5; v += step) {
            ticks.push(Math.round(v * 1000) / 1000);
        }
        return ticks;
    }

    var tooltip = {
        node: null,
        show: function (html, x, y) {
            if (!this.node) {
                this.node = document.createElement('div');
                this.node.className = 'chart-tip';
                document.body.appendChild(this.node);
            }
            this.node.innerHTML = html;
            this.node.style.display = 'block';
            var rect = this.node.getBoundingClientRect();
            var left = Math.min(window.innerWidth - rect.width - 12, Math.max(12, x + 14));
            var top = Math.max(12, y - rect.height - 12);
            this.node.style.left = left + 'px';
            this.node.style.top = top + 'px';
        },
        hide: function () {
            if (this.node) {
                this.node.style.display = 'none';
            }
        }
    };

    /* ------------------------------------------------------------ line chart */

    /**
     * Линейный график банкролла/прибыли.
     * points: [{x: timestamp|null, y: number, bet: obj}]
     * opts: { shade: {fromX,toX}|null, mode: 'bankroll'|'profit', onPointClick: fn }
     */
    function line(container, points, opts) {
        opts = opts || {};
        container.innerHTML = '';
        if (!points || points.length < 2) {
            container.innerHTML = '<div class="chart-empty">Недостаточно рассчитанных ставок для графика</div>';
            return;
        }

        var s = size(container);
        var padL = 62;
        var padR = 16;
        var padT = 14;
        var padB = 26;
        var innerW = s.w - padL - padR;
        var innerH = s.h - padT - padB;

        var svg = el('svg', { width: s.w, height: s.h, viewBox: '0 0 ' + s.w + ' ' + s.h, class: 'chart-svg' });
        var defs = el('defs');
        var grad = el('linearGradient', { id: 'areaGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
        grad.appendChild(el('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.30' }));
        grad.appendChild(el('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': '0' }));
        defs.appendChild(grad);
        svg.appendChild(defs);

        var ys = points.map(function (p) { return p.y; });
        var minY = Math.min.apply(null, ys);
        var maxY = Math.max.apply(null, ys);
        var pad = (maxY - minY) * 0.08 || Math.abs(maxY) * 0.05 || 100;
        minY -= pad;
        maxY += pad;

        var minX = points[0].x != null ? points[0].x : 0;
        var maxX = points[points.length - 1].x != null ? points[points.length - 1].x : points.length - 1;
        var sameX = maxX === minX;

        var X = function (p, i) {
            if (p.x == null || sameX) {
                return padL + (i / (points.length - 1)) * innerW;
            }
            return padL + ((p.x - minX) / (maxX - minX)) * innerW;
        };
        var Y = function (v) {
            return padT + innerH - ((v - minY) / (maxY - minY)) * innerH;
        };

        /* Сетка и подписи оси Y */
        niceTicks(minY, maxY, 4).forEach(function (t) {
            if (t < minY || t > maxY) { return; }
            var y = Y(t);
            svg.appendChild(el('line', { x1: padL, y1: y, x2: s.w - padR, y2: y, class: 'chart-grid' }));
            var label = el('text', { x: padL - 10, y: y + 4, class: 'chart-axis', 'text-anchor': 'end' });
            label.textContent = U.fmt.amount(t).replace(/,\d+$/, '');
            svg.appendChild(label);
        });

        /* Подсветка зоны просадки */
        if (opts.shade && opts.shade.fromX != null && opts.shade.toX != null) {
            var x1 = padL + ((opts.shade.fromX - minX) / (sameX ? 1 : maxX - minX)) * innerW;
            var x2 = padL + ((opts.shade.toX - minX) / (sameX ? 1 : maxX - minX)) * innerW;
            svg.appendChild(el('rect', {
                x: Math.min(x1, x2), y: padT, width: Math.max(2, Math.abs(x2 - x1)), height: innerH,
                class: 'chart-dd-zone'
            }));
            var ddLabel = el('text', { x: Math.min(x1, x2) + 6, y: padT + 14, class: 'chart-dd-label' });
            ddLabel.textContent = 'просадка';
            svg.appendChild(ddLabel);
        }

        /* Линия и область */
        var d = '';
        points.forEach(function (p, i) {
            d += (i ? 'L' : 'M') + X(p, i).toFixed(1) + ' ' + Y(p.y).toFixed(1);
        });
        var area = d + 'L' + X(points[points.length - 1], points.length - 1).toFixed(1) + ' ' + (padT + innerH)
            + 'L' + X(points[0], 0).toFixed(1) + ' ' + (padT + innerH) + 'Z';
        svg.appendChild(el('path', { d: area, fill: 'url(#areaGrad)' }));
        svg.appendChild(el('path', { d: d, class: 'chart-line' }));

        /* Точки ставок */
        points.forEach(function (p, i) {
            if (!p.bet) { return; }
            var dot = el('circle', {
                cx: X(p, i).toFixed(1), cy: Y(p.y).toFixed(1), r: 3.2,
                class: 'chart-dot chart-dot--' + p.bet.status
            });
            svg.appendChild(dot);
        });

        /* Ось X */
        var labelCount = Math.min(6, points.length);
        for (var k = 0; k < labelCount; k++) {
            var idx = Math.round(k * (points.length - 1) / Math.max(1, labelCount - 1));
            var pt = points[idx];
            if (pt.x == null) { continue; }
            var tx = el('text', { x: X(pt, idx), y: s.h - 8, class: 'chart-axis', 'text-anchor': 'middle' });
            tx.textContent = U.fmt.shortDate(pt.x);
            svg.appendChild(tx);
        }

        /* Интерактив */
        var cross = el('line', { x1: 0, y1: padT, x2: 0, y2: padT + innerH, class: 'chart-cross', opacity: '0' });
        var marker = el('circle', { r: 5, class: 'chart-marker', opacity: '0' });
        svg.appendChild(cross);
        svg.appendChild(marker);

        var hit = el('rect', { x: padL, y: padT, width: innerW, height: innerH, fill: 'transparent' });
        svg.appendChild(hit);

        function nearest(clientX) {
            var rect = svg.getBoundingClientRect();
            var rel = clientX - rect.left;
            var best = 0;
            var bestDist = Infinity;
            points.forEach(function (p, i) {
                var dist = Math.abs(X(p, i) - rel);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = i;
                }
            });
            return best;
        }

        function move(ev) {
            var i = nearest(ev.clientX);
            var p = points[i];
            var px = X(p, i);
            var py = Y(p.y);
            cross.setAttribute('x1', px);
            cross.setAttribute('x2', px);
            cross.setAttribute('opacity', '1');
            marker.setAttribute('cx', px);
            marker.setAttribute('cy', py);
            marker.setAttribute('opacity', '1');

            var html = '<div class="tip-title">' + U.fmt.amount(p.y) + ' ' + U.CURRENCY + '</div>';
            if (p.bet) {
                html += '<div class="tip-row">' + U.esc(p.bet.event) + '</div>';
                html += '<div class="tip-row">' + U.esc(p.bet.betType) + ' @' + U.fmt.coef(p.bet.coef)
                    + ' · ' + KB.STATUS_LABEL(p.bet.status) + '</div>';
                html += '<div class="tip-row ' + (A0(p) >= 0 ? 'pos' : 'neg') + '">'
                    + U.fmt.money(A0(p), true) + ' · ' + U.fmt.date(p.bet.date) + '</div>';
                html += '<div class="tip-hint">Нажмите на точку, чтобы открыть ставку</div>';
            }
            tooltip.show(html, ev.clientX, ev.clientY);
        }

        function A0(p) {
            return p.bet ? KB.A.profitOf(p.bet) : 0;
        }

        hit.addEventListener('mousemove', move);
        hit.addEventListener('mouseleave', function () {
            tooltip.hide();
            cross.setAttribute('opacity', '0');
            marker.setAttribute('opacity', '0');
        });
        hit.addEventListener('click', function (ev) {
            var p = points[nearest(ev.clientX)];
            if (p && p.bet && opts.onPointClick) {
                tooltip.hide();
                opts.onPointClick(p.bet);
            }
        });

        container.appendChild(svg);
    }

    /* ------------------------------------------------------------- bar chart */

    /**
     * Горизонтальные бары по категориям.
     * rows: [{label, value, display, sub}]
     * opts: { labelW }
     */
    function bars(container, rows, opts) {
        opts = opts || {};
        container.innerHTML = '';
        if (!rows || !rows.length) {
            container.innerHTML = '<div class="chart-empty">Нет данных для графика</div>';
            return;
        }

        var rowH = 26;
        var gap = 10;
        var labelW = opts.labelW || 170;
        var valueW = 150;
        var s = size(container);
        var barW = Math.max(60, s.w - labelW - valueW - 24);
        var maxAbs = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); })) || 1;
        var half = barW / 2;

        var wrap = document.createElement('div');
        wrap.className = 'bars';

        rows.forEach(function (r) {
            var lineEl = document.createElement('div');
            lineEl.className = 'bar-row';

            var label = document.createElement('div');
            label.className = 'bar-label';
            label.title = r.label;
            label.textContent = r.label;

            var track = document.createElement('div');
            track.className = 'bar-track';
            track.style.width = barW + 'px';

            var zero = document.createElement('div');
            zero.className = 'bar-zero';
            zero.style.left = half + 'px';
            track.appendChild(zero);

            var fill = document.createElement('div');
            var w = Math.max(2, (Math.abs(r.value) / maxAbs) * half);
            fill.className = 'bar-fill ' + (r.value >= 0 ? 'pos' : 'neg');
            fill.style.width = w + 'px';
            if (r.value >= 0) {
                fill.style.left = half + 'px';
            } else {
                fill.style.right = (barW - half) + 'px';
            }
            track.appendChild(fill);

            var value = document.createElement('div');
            value.className = 'bar-value';
            value.innerHTML = '<span class="' + U.signClass(r.value) + '">' + r.display + '</span>'
                + (r.sub ? '<span class="bar-sub">' + U.esc(r.sub) + '</span>' : '');

            lineEl.appendChild(label);
            lineEl.appendChild(track);
            lineEl.appendChild(value);
            wrap.appendChild(lineEl);
        });

        container.appendChild(wrap);
        container.style.height = (rows.length * (rowH + gap) + 8) + 'px';
    }

    /**
     * Вертикальные столбцы по дням (прибыль за день).
     * rows: [{label, profit}]
     */
    function dayBars(container, rows) {
        container.innerHTML = '';
        rows = (rows || []).filter(function (r) { return r.profit !== 0; });
        if (!rows.length) {
            container.innerHTML = '<div class="chart-empty">Нет рассчитанных ставок за период</div>';
            return;
        }

        var s = size(container);
        var padL = 62;
        var padR = 12;
        var padT = 14;
        var padB = 26;
        var innerW = s.w - padL - padR;
        var innerH = s.h - padT - padB;

        var svg = el('svg', { width: s.w, height: s.h, viewBox: '0 0 ' + s.w + ' ' + s.h, class: 'chart-svg' });
        var values = rows.map(function (r) { return r.profit; });
        var maxAbs = Math.max.apply(null, values.map(Math.abs)) || 1;
        var zeroY = padT + innerH / 2;
        var slot = innerW / rows.length;
        var barW = Math.max(2, Math.min(22, slot * 0.66));

        niceTicks(-maxAbs, maxAbs, 4).forEach(function (t) {
            var y = zeroY - (t / maxAbs) * (innerH / 2);
            svg.appendChild(el('line', { x1: padL, y1: y, x2: s.w - padR, y2: y, class: 'chart-grid' }));
            var label = el('text', { x: padL - 10, y: y + 4, class: 'chart-axis', 'text-anchor': 'end' });
            label.textContent = U.fmt.amount(t).replace(/,\d+$/, '');
            svg.appendChild(label);
        });

        rows.forEach(function (r, i) {
            var h = Math.max(2, (Math.abs(r.profit) / maxAbs) * (innerH / 2));
            var x = padL + i * slot + (slot - barW) / 2;
            var y = r.profit >= 0 ? zeroY - h : zeroY;
            var rect = el('rect', {
                x: x.toFixed(1), y: y.toFixed(1), width: barW.toFixed(1), height: h.toFixed(1),
                class: 'chart-bar ' + (r.profit >= 0 ? 'chart-bar--pos' : 'chart-bar--neg'), rx: '1.5'
            });
            rect.addEventListener('mousemove', function (ev) {
                tooltip.show('<div class="tip-title">' + U.esc(r.label) + '</div>'
                    + '<div class="tip-row ' + (r.profit >= 0 ? 'pos' : 'neg') + '">' + U.fmt.money(r.profit, true) + '</div>',
                    ev.clientX, ev.clientY);
            });
            rect.addEventListener('mouseleave', function () {
                tooltip.hide();
            });
            svg.appendChild(rect);
        });

        svg.appendChild(el('line', { x1: padL, y1: zeroY, x2: s.w - padR, y2: zeroY, class: 'chart-zero' }));

        var step = Math.max(1, Math.round(rows.length / 7));
        rows.forEach(function (r, i) {
            if (i % step) { return; }
            var tx = el('text', { x: padL + i * slot + slot / 2, y: s.h - 8, class: 'chart-axis', 'text-anchor': 'middle' });
            tx.textContent = r.label;
            svg.appendChild(tx);
        });

        container.appendChild(svg);
    }

    /* ------------------------------------------------------------------ funnel */

    /** Воронка «гипотеза → реальность». */
    function funnel(container, steps) {
        container.innerHTML = '';
        if (!steps || !steps.length) {
            container.innerHTML = '<div class="chart-empty">Нет данных для воронки</div>';
            return;
        }
        var wrap = document.createElement('div');
        wrap.className = 'funnel';
        var max = Math.max.apply(null, steps.map(function (s) { return s.value; })) || 1;

        steps.forEach(function (step, i) {
            var row = document.createElement('div');
            row.className = 'funnel-step';
            var width = Math.max(6, (step.value / max) * 100);
            row.innerHTML =
                '<div class="funnel-bar" style="width:' + width + '%">'
                + '<span class="funnel-cap">' + U.esc(step.label) + '</span>'
                + '<span class="funnel-val">' + U.fmt.amount(step.value) + ' ' + U.CURRENCY + '</span>'
                + '</div>'
                + (step.note ? '<div class="funnel-note">' + U.esc(step.note) + '</div>' : '');
            wrap.appendChild(row);
            if (i < steps.length - 1) {
                var arrow = document.createElement('div');
                arrow.className = 'funnel-arrow';
                arrow.textContent = '↓';
                wrap.appendChild(arrow);
            }
        });

        container.appendChild(wrap);
    }

    /* -------------------------------------------------------------- spotlight */

    /**
     * «Прожектор»: процент от прибыли, приходящийся на N лучших ставок.
     * rows: [{label, profit}]
     */
    function spotlight(container, rows, totalProfit) {
        container.innerHTML = '';
        if (!rows || !rows.length) {
            container.innerHTML = '<div class="chart-empty">Нет данных</div>';
        }
        var wrap = document.createElement('div');
        wrap.className = 'spotlight';
        rows.forEach(function (r) {
            var share = totalProfit ? (r.profit / totalProfit) * 100 : 0;
            var item = document.createElement('div');
            item.className = 'spot-row';
            item.innerHTML =
                '<div class="spot-main">'
                + '<span class="' + U.signClass(r.profit) + ' spot-profit">' + U.fmt.money(r.profit, true) + '</span>'
                + '<span class="spot-label">' + U.esc(r.label) + '</span>'
                + '</div>'
                + '<div class="spot-share">' + U.fmt.pct(share) + '</div>';
            wrap.appendChild(item);
        });
        container.appendChild(wrap);
    }

    /** Мини-спарклайн для таблиц. */
    function sparkline(values, width, height) {
        width = width || 90;
        height = height || 22;
        if (!values || values.length < 2) {
            return '';
        }
        var min = Math.min.apply(null, values);
        var max = Math.max.apply(null, values);
        var span = max - min || 1;
        var d = values.map(function (v, i) {
            var x = (i / (values.length - 1)) * width;
            var y = height - ((v - min) / span) * height;
            return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
        }).join('');
        var last = values[values.length - 1];
        var color = last >= values[0] ? 'var(--pos)' : 'var(--neg)';
        return '<svg width="' + width + '" height="' + height + '" class="spark">'
            + '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.6"/></svg>';
    }

    KB.Charts = {
        line: line,
        bars: bars,
        dayBars: dayBars,
        funnel: funnel,
        spotlight: spotlight,
        sparkline: sparkline,
        hideTip: function () {
            tooltip.hide();
        }
    };
})(window.KB);
