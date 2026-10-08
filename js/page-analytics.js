/* Экран аналитики: группы, распределения, серия ставок */
'use strict';

const PageAnalytics = {
    el: null,

    render() {
        const bets = Store.settled();
        if (bets.length < 2) {
            this.el.innerHTML = '<div class="empty">'
                + '<div class="empty-title">Нужно минимум две сыгранные ставки</div>'
                + '<div class="empty-sub">Отметьте исход у ставок со статусом «в игре» — и здесь появятся группы и распределения.</div>'
                + '</div>';
            return;
        }

        const groupBy = Analytics.groupBy || 'sport';
        const groups = Analytics.groupByFn(groupBy);

        this.el.innerHTML = `
            <div class="filters">
                <div class="filter-label">Группировка</div>
                <div class="chips" id="group-chips">
                    ${[
                        { key: 'sport', label: 'Вид спорта' },
                        { key: 'bookmaker', label: 'Букмекер' },
                        { key: 'market', label: 'Рынок' },
                        { key: 'month', label: 'Месяц' },
                        { key: 'oddsBucket', label: 'Диапазон коэффициента' }
                    ].map(g => `<button class="chip ${groupBy === g.key ? 'chip_active' : ''}" data-group="${g.key}">${g.label}</button>`).join('')}
                </div>
            </div>

            <div class="table-wrap">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Группа</th><th>Ставок</th><th>Прошли</th><th>ROI</th><th>Прибыль</th><th>Средний кэф</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${groups.map(g => `
                            <tr>
                                <td class="td-name">${esc(g.key)}</td>
                                <td>${g.count}</td>
                                <td>${g.won}<span class="muted"> / ${pct(g.winRate)}</span></td>
                                <td class="${g.roi >= 0 ? 'pos' : 'neg'}">${pct(g.roi)}</td>
                                <td class="${g.profit >= 0 ? 'pos' : 'neg'}">${money(g.profit)}</td>
                                <td>${g.avgOdds.toFixed(2)}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>

            <div class="analytics-grid">
                ${bucketCard('Распределение коэффициентов', Analytics.oddsBuckets(), 'coeff')}
                ${bucketCard('Размер ставки', Analytics.stakeBuckets(), 'stake')}
            </div>

            <div class="card">
                <div class="card-title">Последние 20 сыгранных ставок</div>
                ${seriesStrip(Analytics.streakData(20))}
                <div class="card-sub">Зелёный — зашёл, красный — проигрыш, серый — возврат или расчёт 0.5.</div>
            </div>
        `;

        this.el.querySelectorAll('#group-chips .chip').forEach(chip => {
            chip.addEventListener('click', () => {
                Analytics.groupBy = chip.dataset.group;
                this.render();
            });
        });
    }
};

function bucketCard(title, buckets, kind) {
    const max = Math.max(1, ...buckets.map(b => b.count));
    return `
        <div class="card">
            <div class="card-title">${title}</div>
            <div class="bars">
                ${buckets.map(b => `
                    <div class="bar-row">
                        <div class="bar-key">${esc(b.key)}</div>
                        <div class="bar-track">
                            <div class="bar-fill ${kind === 'stake' ? 'bar_fill_accent' : ''}" style="width:${Math.max(2, (b.count / max) * 100)}%"></div>
                        </div>
                        <div class="bar-meta">
                            <span>${b.count}</span>
                            <span class="${b.profit >= 0 ? 'pos' : 'neg'}">${money(b.profit)}</span>
                        </div>
                    </div>`).join('')}
            </div>
        </div>`;
}

function seriesStrip(data) {
    if (!data.length) {
        return '<div class="muted">Нет ставок с исходом</div>';
    }
    return '<div class="series">' + data.map(d => {
        const title = `${d.selection} · ${d.odds.toFixed(2)} · ${fmtDate(d.date)}`;
        const cls = d.result === 'win' ? 'series_win' : d.result === 'loss' ? 'series_loss' : 'series_push';
        return `<span class="series-item ${cls}" title="${esc(title)}"></span>`;
    }).join('') + '</div>';
}
