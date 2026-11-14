// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs, live comparables and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlist: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, detailPage: false };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 100) / 100).toFixed(2) + 'x'; }
  function fmtRatio(n) { return (Math.round(n * 1000) / 1000).toFixed(3) + 'x'; }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var ageF;
    if (age <= model.age_peak_days) ageF = model.age_floor + ((model.age_peak - model.age_floor) * age) / model.age_peak_days;
    else ageF = model.age_peak * (1 - (model.age_decay * Math.min(age - model.age_peak_days, model.age_decay_days)) / model.age_decay_days);
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_max_extra);
    var chainF = 1 + model.chain_step * extra;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * ageF * chainF));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL, age,
  // seven-day move and implied value decide the action, the capital, the hold, the watch, the
  // second front and every cost and time. No name is special-cased, and no two rows share a plan
  // unless their own figures agree.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('launchpad') >= 0) return 'Join ' + name + "'s next launch on " + chain + ' with $' + capital + ' and hold the allocation.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + " into " + name + "'s private pool on " + chain + ' and keep the note.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyActionFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Borrow $10 against the supply on ' + name + ' once, then repay it the same week, so the position shows both sides.';
    if (c.indexOf('dex') >= 0) return 'Swap $10 through ' + name + ' on ' + chain + ' once a week, alternating the pair, so the wallet shows trading activity.';
    if (c.indexOf('yield') >= 0) return 'Claim or restake the yield ' + name + ' pays once a week instead of letting it sit unclaimed.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $10 back and forth through ' + name + ' once a week, so the wallet shows repeated use.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Top up the stake by $5 once a week so the position grows instead of sitting flat.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close and reopen a $10 hedge on ' + name + ' once a week so the account shows fresh trades.';
    if (c.indexOf('prediction') >= 0) return 'Settle one small market on ' + name + ' each week instead of leaving a single open bet.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Rebalance $10 between ' + name + "'s vaults once a week so the wallet shows active allocation.";
    if (c.indexOf('stable') >= 0) return 'Mint and redeem $10 of the stable asset through ' + name + ' once a week to show both directions.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield ' + name + ' paid this week and reinvest $10 of it back into the same asset.';
    if (c.indexOf('insurance') >= 0) return 'Renew or extend the cover by $10 once a week so the policy stays current.';
    if (c.indexOf('launchpad') >= 0) return 'Vote or check in on ' + name + "'s next launch each week so the wallet stays on its list.";
    if (c.indexOf('privacy') >= 0) return 'Make one small private transfer through ' + name + ' each week so the wallet stays active.';
    return 'Make one small action on ' + name + ' each week, such as a swap, a vote or a deposit, so the wallet stays active.';
  }
  function watchStepFor(p, chain) {
    var g = p.change_7d;
    var name = p.name;
    if (g === null || g === undefined) return 'No seven-day change is reported for ' + name + ', so open its own TVL page on ' + chain + ' and confirm the deposits are still there before you add more.';
    if (g >= 10) return 'TVL jumped ' + g.toFixed(1) + '% in seven days: check whether the growth is new deposits on ' + chain + ' or one large wallet, and only add more once the inflow holds for a second week.';
    if (g <= -10) return 'TVL fell ' + Math.abs(g).toFixed(1) + '% in seven days: wait for the outflow on ' + chain + ' to slow before you add more, and check the protocol\'s own page for what changed.';
    if (g >= 0) return 'TVL moved +' + g.toFixed(1) + '% in seven days: steady, not hot. Add more only after the next weekly check confirms the direction.';
    return 'TVL moved ' + g.toFixed(1) + '% in seven days: a small dip, not a rout. Watch one more week on ' + chain + ' before you add more.';
  }
  function secondFrontFor(p, chain, capital) {
    var name = p.name;
    var others = (p.chains || []).filter(function (c) { return c !== chain; });
    if (others.length > 0) return 'Open a second position on ' + others[0] + ' with $' + Math.max(25, Math.round(capital / 3)) + ' so the wallet shows activity on two of ' + name + "'s " + p.chains.length + ' chains, not one.';
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Lend a second asset on ' + name + ' with $25 so the wallet shows more than one supply position on ' + chain + '.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Add $25 to a second pool on ' + name + ' on ' + chain + ' so the wallet shows two positions, not one.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $25 to a second destination through ' + name + ' so the wallet shows two routes, not one.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake a second asset through ' + name + ' with $25 so the wallet shows two stakes on ' + chain + '.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open a second small hedge on ' + name + ' on ' + chain + ' so the account shows two trades, not one.';
    if (c.indexOf('prediction') >= 0) return 'Place a second market position on ' + name + ' with $10 so the wallet shows two markets, not one.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $25 into a second ' + name + ' vault on ' + chain + ' so the wallet shows two allocations, not one.';
    return 'Use a second feature of ' + name + ' on ' + chain + ' with $25, such as a vote, a second pool or a second asset, so the wallet shows two touchpoints, not one.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var age = p.age_days;
    var impliedUsd = '$' + p.implied_value_usd.toLocaleString('en-US');
    return [
      { text: 'Use a fresh wallet on ' + chain + ' that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyActionFor(p, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days' + (age !== null && age !== undefined && age < 180 ? ', longer than usual, because the protocol is only ' + Math.max(1, Math.round(age)) + ' days old and a young farm needs a longer qualifying window' : ' so the activity is counted in more than one snapshot') + '.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: watchStepFor(p, chain), cost: 'no fee to check', time: '10 minutes a week' },
      { text: secondFrontFor(p, chain, capital), cost: 'about $2 of gas', time: '15 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, and plan the exit against the ' + impliedUsd + ' implied value before you enter: check the sell price first, then unwind in small steps.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // Which factor moves this row most: the largest log-distance from neutral, named in the detail view.
  function driverOf(row) {
    var parts = [
      ['Category multiple', Math.log(Math.max(row.multiple, 0.001) / Math.max(DATA.global_multiple, 0.001))],
      ['Seven-day growth', Math.log(Math.max(row.growth_multiplier, 0.001))],
      ['Age with no token', Math.log(Math.max(row.age_factor, 0.001))],
      ['Multi-chain reach', Math.log(Math.max(row.chain_factor, 0.001))]
    ];
    var best = parts[0];
    parts.forEach(function (p) { if (Math.abs(p[1]) > Math.abs(best[1])) best = p; });
    if (Math.abs(best[1]) < 0.02) return 'TVL alone: the factors nearly cancel out';
    return best[0] + (best[1] > 0 ? ' lifts it' : ' holds it back');
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlist = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) { state.selected = params.get('p'); state.detailPage = true; }
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlist && !r.on_watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    var fetched = DATA.source.indexOf(', fetched ') >= 0 ? DATA.source.split(', fetched ')[1] : DATA.as_of;
    fetched = fetched.replace('T', ' ').slice(0, 16) + ' UTC';
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'Fetched ' + fetched }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { html: '<em>' + DATA.watchlist_size + ' watchlist protocols</em>, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more pre-token protocols below that floor, every one the snapshot can rank. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every slug on the list' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' early rows below the floor' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: fmtUsd(DATA.rows[0] ? DATA.rows[0].implied_value_usd : 0) }), el('small', { text: DATA.rows[0] ? DATA.rows[0].name : '' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'their market caps are facts, not models' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlist ? 'checked' : null, 'aria-label': 'Watchlist only' });
    watchBox.addEventListener('change', function () { state.watchlist = watchBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'toggle', for: 'watchlist' }, watchBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        class: r.rank <= 3 ? 'top3' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank-badge', text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), r.on_watchlist ? el('span', { class: 'pill', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, live comparables and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', class: 'plain', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var ratio = (r.mcap_usd && r.tvl_usd) ? fmtRatio(r.mcap_usd / r.tvl_usd) : 'n/a';
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num' }, el('span', { class: 'status live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: ratio }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market-cap-per-TVL is what calibrates the pre-token multiples above. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', class: 'plain', text: 'Status' }),
            el('th', { scope: 'col', class: 'plain', text: 'Protocol' }),
            el('th', { scope: 'col', class: 'plain num', text: 'TVL' }),
            el('th', { scope: 'col', class: 'plain num', text: '7d' }),
            el('th', { scope: 'col', class: 'plain num', text: 'Market cap' }),
            el('th', { scope: 'col', class: 'plain num', text: 'Mcap / TVL' }),
            el('th', { scope: 'col', class: 'plain', text: 'Token' }
          ))),
          tbody
        )
      )
    );
  }

  // The market line as a picture: the live protocols' own points (log TVL against log market cap)
  // with the fitted line through them. A flat multiple would be a line of slope 1; the market's
  // line is flatter, which is why the giants are worth less per TVL dollar than the early ones.
  function logAxisLabel(v) {
    if (v >= 9) return '$' + Math.pow(10, v - 9) + 'B';
    if (v >= 6) return '$' + Math.pow(10, v - 6) + 'M';
    return '$' + Math.pow(10, v - 3) + 'K';
  }
  function scatterSVG(w, h, labels) {
    var pts = DATA.calibrators || [];
    if (pts.length === 0) return '';
    var xs = pts.map(function (p) { return Math.log10(p.tvl_usd); });
    var ys = pts.map(function (p) { return Math.log10(p.mcap_usd); });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    var padL = labels ? 46 : 6, padB = labels ? 22 : 6, padT = 6, padR = 6;
    function X(x) { return padL + ((x - x0) / (x1 - x0)) * (w - padL - padR); }
    function Y(y) { return h - padB - ((y - y0) / (y1 - y0)) * (h - padT - padB); }
    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="scatter" role="img" aria-label="Live protocols: market cap against TVL, with the fitted line">';
    var gx;
    for (gx = x0; gx <= x1; gx++) {
      s += '<line x1="' + X(gx).toFixed(1) + '" y1="' + Y(y0).toFixed(1) + '" x2="' + X(gx).toFixed(1) + '" y2="' + Y(y1).toFixed(1) + '" class="grid"/>';
      if (labels) s += '<text x="' + X(gx).toFixed(1) + '" y="' + (h - 6) + '" class="axis" text-anchor="' + (gx === x0 ? 'start' : gx === x1 ? 'end' : 'middle') + '">' + logAxisLabel(gx) + '</text>';
    }
    var gy;
    for (gy = y0; gy <= y1; gy++) {
      s += '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(gy).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(gy).toFixed(1) + '" class="grid"/>';
      if (labels) s += '<text x="4" y="' + (Y(gy) + 3).toFixed(1) + '" class="axis">' + logAxisLabel(gy) + '</text>';
    }
    var fit = DATA.fit;
    var fx0 = x0, fy0 = fit.global_intercept + fit.slope * x0, fx1 = x1, fy1 = fit.global_intercept + fit.slope * x1;
    s += '<line x1="' + X(fx0).toFixed(1) + '" y1="' + Y(fy0).toFixed(1) + '" x2="' + X(fx1).toFixed(1) + '" y2="' + Y(fy1).toFixed(1) + '" class="fitline"/>';
    pts.forEach(function (p) {
      s += '<circle cx="' + X(Math.log10(p.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(p.mcap_usd)).toFixed(1) + '" r="2.6" class="dot"/>';
    });
    s += '</svg>';
    return s;
  }

  // The board's value by category: the eight categories holding the most implied value, as bars.
  function categoryBarsSVG() {
    var totals = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      totals[c] = (totals[c] || 0) + r.implied_value_usd;
    });
    var list = Object.keys(totals).map(function (c) { return { c: c, v: totals[c] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    if (list.length === 0) return '';
    var max = list[0].v;
    var w = 640, rowH = 26, h = list.length * rowH + 8;
    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="catbars" role="img" aria-label="Implied value by category">';
    list.forEach(function (d, i) {
      var y = 8 + i * rowH;
      var bw = Math.max(4, Math.round(((w - 220) * d.v) / max));
      s += '<text x="0" y="' + (y + 13) + '" class="catlabel">' + d.c.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text>';
      s += '<rect x="150" y="' + y + '" width="' + bw + '" height="14" rx="3" class="catbar"/>';
      s += '<text x="' + (150 + bw + 8) + '" y="' + (y + 13) + '" class="catvalue">' + fmtUsd(d.v) + '</text>';
    });
    s += '</svg>';
    return s;
  }

  // One strip under the lede: the fitted line, visible on the board's first screen.
  function marketLineStrip() {
    var fit = DATA.fit;
    return el('section', { class: 'panel marketline' },
      el('div', { class: 'pad marketline-grid' },
        el('div', null,
          el('h2', { text: 'The market does not pay a flat multiple' }),
          el('p', { text: 'Each dot is one of the ' + fit.live_count + ' live-token protocols, TVL against market cap. The line is the fit: log10(market cap) = ' + fit.global_intercept.toFixed(2) + ' + ' + fit.slope.toFixed(2) + ' x log10(TVL). Ten times the TVL is worth only about ' + Math.pow(10, fit.slope).toFixed(1) + 'x more — so a flat ratio would overprice the giants and underprice the early ones.' })
        ),
        el('div', { html: scatterSVG(900, 170, true) })
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var fit = DATA.fit;
    var calRows = DATA.calibration.filter(function (c) { return c.live_count > 0; });
    var calBody = el('tbody');
    calRows.forEach(function (c) {
      calBody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.live_count) }),
        el('td', { class: 'num', text: c.median_ratio === null ? 'n/a' : fmtRatio(c.median_ratio) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
      ));
    });
    return el('section', { class: 'panel model' },
      el('div', { class: 'pad' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
        el('div', { class: 'formula' },
          'implied = round( tvl_usd x multiple x growth x age x chains )'
        ),
        el('p', { text: 'multiple: the size-fitted multiple for this row — the fitted market line at its TVL, from log10(market cap) = intercept + ' + fit.slope.toFixed(2) + ' x log10(TVL), fitted within categories over ' + fit.live_count + ' live-token protocols, with each category\'s intercept shrunk toward the global intercept of ' + fit.global_intercept.toFixed(2) + ' and the multiple clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']. The line explains R² = ' + fit.r2.toFixed(2) + ' of the live market caps, with a residual spread of ' + fit.residual_sd.toFixed(2) + ' in log10 — the market is noisy, so the line is a central tendency, not a prediction. A flat multiple would assume a slope of 1.0; the market\'s own slope is ' + fit.slope.toFixed(2) + '. growth: 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + '. age: ' + m.age_floor + ' for a newborn protocol, rising to ' + m.age_peak + ' at ' + Math.round(m.age_peak_days / 365) + ' years, then easing by up to ' + Math.round(m.age_decay * 100) + '% over ' + Math.round(m.age_decay_days / 365) + ' more years. chains: 1 + ' + m.chain_step + ' per extra chain, up to ' + m.chain_max_extra + '.' }),
        el('p', { text: 'TVL, seven-day growth and age come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. A protocol records no token, never that it has none: the snapshot cannot prove a token does not exist.' }),
        el('h3', { text: 'The fitted line through the live market' }),
        el('div', { html: scatterSVG(900, 260, true) }),
        el('p', { class: 'sub', text: 'Each dot is a live-token protocol. The line is the global fit; each category\'s own intercept shifts it up or down. The median market-cap-per-TVL falls from 0.42x under $50M of TVL to 0.03x above $1B — that fall is the size effect, and the line captures it.' }),
        el('h3', { text: 'Implied value by category' }),
        el('div', { html: categoryBarsSVG() }),
        el('h3', { text: 'Calibration: what the market pays per dollar of TVL' }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('thead', null, el('tr', null,
              el('th', { scope: 'col', class: 'plain', text: 'Category' }),
              el('th', { scope: 'col', class: 'plain num', text: 'Live protocols' }),
              el('th', { scope: 'col', class: 'plain num', text: 'Median mcap / TVL' }),
              el('th', { scope: 'col', class: 'plain num', text: 'Fitted multiple at $100M TVL' }
            ))),
            calBody
          )
        ),
        el('p', { class: 'note', text: 'Showing all ' + calRows.length + ' categories with live protocols. The fitted multiple is the line at $100M of TVL; it falls as TVL rises, so a category\'s giants are priced below its early protocols. Categories with no live protocol use the global intercept of ' + fit.global_intercept.toFixed(2) + '.' })
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  // The detail view's four parts, built once and used by the modal and by the detail page alike.
  // What moves this row: each factor's log-distance from neutral, as bars. A bar to the right
  // (amber) lifts the row above its TVL; a muted bar holds it back.
  function factorBars(row) {
    var parts = [
      ['Size-fitted multiple', Math.log(Math.max(row.multiple, 0.001) / Math.max(DATA.global_multiple, 0.001))],
      ['Seven-day growth', Math.log(Math.max(row.growth_multiplier, 0.001))],
      ['Age with no token', Math.log(Math.max(row.age_factor, 0.001))],
      ['Multi-chain reach', Math.log(Math.max(row.chain_factor, 0.001))]
    ];
    var max = 0.05;
    parts.forEach(function (p) { if (Math.abs(p[1]) > max) max = Math.abs(p[1]); });
    var bars = parts.map(function (p) {
      var pct = Math.round((Math.abs(p[1]) / max) * 100);
      var sign = p[1] >= 0 ? '+' : '−';
      return el('div', { class: 'factor' },
        el('span', { class: 'factor-name', text: p[0] }),
        el('span', { class: 'factor-track' }, el('i', { class: p[1] >= 0 ? 'up' : 'down', style: 'width:' + Math.max(2, pct) + '%' })),
        el('span', { class: 'factor-val num', text: sign + Math.abs(p[1]).toFixed(2) })
      );
    });
    return el('div', { class: 'factors' },
      el('h4', { text: 'What moves this row (log scale, against a neutral protocol)' }),
      bars
    );
  }

  function detailParts(row) {
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var comps = DATA.comparables[row.category || ''] || [];
    var compSection = null;
    if (comps.length > 0) {
      var compBody = el('tbody');
      comps.forEach(function (c) {
        compBody.appendChild(el('tr', null,
          el('td', { text: c.name }),
          el('td', { class: 'num', text: fmtUsd(c.mcap_usd) }),
          el('td', { class: 'num', text: fmtUsd(c.tvl_usd) }),
          el('td', { class: 'num', text: fmtRatio(c.ratio) })
        ));
      });
      compSection = el('section', { class: 'detail-section' },
        el('h3', { text: 'Live comparables in ' + (row.category || 'this category') }),
        el('table', { class: 'comps' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', class: 'plain', text: 'Protocol' }),
            el('th', { scope: 'col', class: 'plain num', text: 'Market cap' }),
            el('th', { scope: 'col', class: 'plain num', text: 'TVL' }),
            el('th', { scope: 'col', class: 'plain num', text: 'Mcap / TVL' }
          ))),
          compBody
        ),
        el('p', { class: 'sub', text: 'These tokens already trade. The fitted line through them — not their raw median — prices this row: at this TVL the line gives the ' + fmtMult(row.multiple) + ' multiple above, after the category intercept.' })
      );
    }
    var head = el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? '  ·  Watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + '  ·  ' + driverOf(row) })
      )
    );
    var implied = el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: (row.category || 'Category') + ' multiple' }), el('b', { class: 'num', text: fmtMult(row.multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' → ' + row.growth_multiplier.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + ' → ' + row.age_factor.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Chains (' + (row.chains || []).length + ')' }), el('b', { class: 'num', text: row.chain_factor.toFixed(2) + 'x' })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      factorBars(row),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    );
    var farm = el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    );
    return { head: head, implied: implied, comps: compSection, farm: farm };
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    state.detailPage = false;
    writeHash();
    var parts = detailParts(row);
    dialog.textContent = '';
    var closeBtn = el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } });
    parts.head.appendChild(closeBtn);
    dialog.appendChild(parts.head);
    dialog.appendChild(parts.implied);
    if (parts.comps) dialog.appendChild(parts.comps);
    dialog.appendChild(parts.farm);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  // The detail view as its own page, for a link straight to one protocol: the same parts, laid out
  // in two columns, with a way back to the board.
  function detailPage(row) {
    var parts = detailParts(row);
    var back = el('button', { class: 'button', type: 'button', text: '← Back to the board', onclick: function () { state.selected = null; state.detailPage = false; writeHash(); render(); } });
    var left = el('div', { class: 'col' }, parts.implied, parts.comps);
    var right = el('div', { class: 'col' }, parts.farm);
    return el('section', { class: 'panel detail-page' },
      el('div', { class: 'detail-nav' }, back),
      parts.head,
      el('div', { class: 'detail-grid' }, left, right)
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    var detailRow = state.detailPage && state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    if (detailRow) {
      shell.appendChild(detailPage(detailRow));
      app.appendChild(shell);
      app.setAttribute('aria-busy', 'false');
      if (!dialog.isConnected) app.appendChild(dialog);
      return;
    }
    shell.appendChild(lede());
    shell.appendChild(marketLineStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected && !state.detailPage) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
    else if (e.key === 'Escape' && state.detailPage) { state.selected = null; state.detailPage = false; writeHash(); render(); }
  });
})();
