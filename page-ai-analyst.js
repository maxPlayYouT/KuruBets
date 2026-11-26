/* KuruBets — AI Analyst page */
'use strict';
(function () {
  var HISTORY_KEY = 'kurubets.ai-analysis.v1';
  var sport = 'CS2';
  var busy = false;

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function history() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function saveHistory(items) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 20))); }
    catch (_) { /* Storage may be disabled or full; the current result still works. */ }
  }
  function setError(message) {
    var box = byId('aiAnalysisError');
    box.textContent = message;
    box.hidden = !message;
  }
  function setBusy(value) {
    busy = value;
    byId('aiAnalyzeBtn').disabled = value;
    byId('aiAnalyzeBtn').textContent = value ? 'Идёт анализ…' : '⌕ Найти матч и провести анализ';
    byId('aiAnalysisLoading').hidden = !value;
  }
  function safeDate(value) {
    if (!value) return 'Дата не подтверждена';
    var date = new Date(value);
    return isNaN(date.getTime()) ? String(value) : date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function renderSources(sources) {
    if (!Array.isArray(sources) || !sources.length) return '<p class="muted">Ссылки на источники не получены.</p>';
    return '<div class="ai-sources">' + sources.map(function (source) {
      var url = String(source.url || '');
      if (!/^https:\/\//i.test(url)) return '';
      return '<a class="ai-source" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.title || url) + '<small>' + esc(source.domain || '') + '</small></a>';
    }).join('') + '</div>';
  }
  function renderAnalysis(data) {
    var match = data.match || {};
    var root = byId('aiAnalysisResult');
    root.innerHTML = '' +
      '<div class="ai-result-card"><div class="ai-match-title">' + esc(match.teamA || 'Команда 1') + ' — ' + esc(match.teamB || 'Команда 2') + '</div>' +
      '<div class="ai-meta"><span>' + esc(data.sport || sport) + '</span><span>' + esc(match.tournament || 'Турнир не подтверждён') + '</span><span>' + esc(safeDate(match.date)) + '</span><span>' + esc(match.format || 'Формат не подтверждён') + '</span></div>' +
      '<p>' + esc(match.status || 'Статус матча не подтверждён') + '</p></div>' +
      '<div class="ai-result-card ai-verdict"><h3>Краткий вывод</h3><p>' + esc(data.summary || 'Недостаточно информации для вывода.') + '</p><p><strong>Сравнительная оценка:</strong> ' + esc(data.comparison || 'Не определена') + '</p><p class="muted">' + esc(data.confidence || 'Уровень уверенности не определён') + '</p></div>' +
      '<div class="ai-result-card"><h3>Что говорит статистика</h3><p>' + esc(data.statistics || 'Надёжная статистика не найдена.') + '</p></div>' +
      '<div class="ai-result-card"><h3>Новости и составы</h3><p>' + esc(data.news || 'Актуальные новости не найдены.') + '</p></div>' +
      '<div class="ai-result-card"><h3>Аргументы в пользу каждой команды</h3><p><strong>' + esc(match.teamA || 'Команда 1') + ':</strong> ' + esc(data.teamAFactors || 'Нет подтверждённых факторов.') + '</p><p><strong>' + esc(match.teamB || 'Команда 2') + ':</strong> ' + esc(data.teamBFactors || 'Нет подтверждённых факторов.') + '</p></div>' +
      '<div class="ai-result-card"><h3>Риски и противоречия</h3><p>' + esc(data.risks || 'Существенные риски не выявлены либо данных недостаточно.') + '</p></div>' +
      '<div class="ai-result-card"><h3>Источники</h3>' + renderSources(data.sources) + '</div>';
    root.hidden = false;
  }
  function renderHistory() {
    var items = history();
    var box = byId('aiAnalysisHistory');
    if (!items.length) { box.className = 'ai-history-empty muted'; box.textContent = 'Пока нет сохранённых анализов.'; return; }
    box.className = 'ai-history-list';
    box.innerHTML = items.map(function (item, index) {
      return '<div class="ai-history-item"><button type="button" data-ai-history="' + index + '">' +
        '<strong>' + esc(item.match.teamA) + ' — ' + esc(item.match.teamB) + '</strong><small>' + esc(item.sport) + ' · ' + esc(item.match.tournament || 'Турнир не указан') + ' · ' + esc(new Date(item.savedAt).toLocaleString('ru-RU')) + '</small></button>' +
        '<span class="muted">Открыть</span></div>';
    }).join('');
    box.querySelectorAll('[data-ai-history]').forEach(function (button) {
      button.addEventListener('click', function () {
        var item = history()[Number(button.dataset.aiHistory)];
        if (item) { renderAnalysis(item); byId('aiAnalysisResult').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    });
  }
  async function analyze() {
    if (busy) return;
    var teamA = byId('aiTeamA').value.trim();
    var teamB = byId('aiTeamB').value.trim();
    if (!teamA || !teamB) { setError('Введи названия обеих команд.'); return; }
    if (teamA.toLowerCase() === teamB.toLowerCase()) { setError('Укажи две разные команды.'); return; }
    setError('');
    if (!window.KuruCloud || !window.KuruCloud.client) { setError('Модуль Supabase ещё не загрузился. Обнови страницу и попробуй снова.'); return; }
    setBusy(true);
    try {
      var sessionResult = await window.KuruCloud.client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      if (!sessionResult.data.session) throw new Error('Для AI-аналитики сначала войди в аккаунт KuruBets.');
      var response = await window.KuruCloud.client.functions.invoke('ai-match-analysis', {
        body: { sport: sport, teamA: teamA, teamB: teamB, tournament: byId('aiTournament').value.trim(), matchDate: byId('aiMatchDate').value || null }
      });
      if (response.error) {
        var details = response.error.message || 'Ошибка вызова Edge Function';
        if (response.error.context && response.error.context.json) {
          try { var payload = await response.error.context.json(); details = payload.error || details; } catch (_) {}
        }
        throw new Error(details + '. Проверь настройку Supabase Edge Function и секретов.');
      }
      var data = response.data;
      if (!data || !data.match) throw new Error('Сервер вернул неполный ответ. Попробуй ещё раз.');
      data.sport = sport;
      data.savedAt = new Date().toISOString();
      renderAnalysis(data);
      var items = history();
      items.unshift(data);
      saveHistory(items);
      renderHistory();
      byId('aiAnalysisResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      setError(error && error.message ? error.message : 'Не удалось выполнить анализ.');
    } finally { setBusy(false); }
  }
  function init() {
    document.querySelectorAll('[data-ai-sport]').forEach(function (button) {
      button.addEventListener('click', function () {
        sport = button.dataset.aiSport;
        document.querySelectorAll('[data-ai-sport]').forEach(function (item) { item.classList.toggle('active', item === button); });
        byId('aiTeamA').placeholder = sport === 'Футбол' ? 'Например, Arsenal' : (sport === 'CS2' ? 'Например, NAVI' : 'Например, Team Spirit');
        byId('aiTeamB').placeholder = sport === 'Футбол' ? 'Например, Manchester City' : (sport === 'CS2' ? 'Например, Vitality' : 'Например, Team Liquid');
      });
    });
    byId('aiAnalyzeBtn').addEventListener('click', analyze);
    ['aiTeamA', 'aiTeamB'].forEach(function (id) {
      byId(id).addEventListener('keydown', function (event) { if (event.key === 'Enter') analyze(); });
    });
    renderHistory();
  }
  window.KuruAIAnalyst = { render: renderHistory };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
