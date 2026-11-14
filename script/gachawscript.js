let currentUser = null;
let userData = null;
let serverWaifusData = [];
let selectedBattleInstanceId = null;
let activeRoomId = null;
let pollInterval = null;
let dailyCountdownInterval = null;
let autoGachaActive = false;
let autoGachaTimer = null;
let shopCountdownInterval = null;
let targetResetTimestamp = null;
let isRenderingLogs = false;

function playAudio(s) {
  try {
    const a = document.getElementById(s);
    if (a) { a.currentTime = 0; a.play().catch(e => {}); }
  } catch (e) {}
}

function getAvatarUrl(u) {
  return u && u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function formatNumber(num) {
  if (num === undefined || num === null || isNaN(num)) return '0';
  const val = Number(num);
  if (val < 10000) {
    return Math.round(val).toLocaleString('id-ID');
  }
  const suffixes = [
    { value: 1e33, symbol: 'Dc' },
    { value: 1e30, symbol: 'No' },
    { value: 1e27, symbol: 'Oc' },
    { value: 1e24, symbol: 'Sp' },
    { value: 1e21, symbol: 'Sx' },
    { value: 1e18, symbol: 'Qi' },
    { value: 1e15, symbol: 'Qa' },
    { value: 1e12, symbol: 'T'  },
    { value: 1e9,  symbol: 'B'  },
    { value: 1e6,  symbol: 'M'  },
    { value: 1e3,  symbol: 'k'  }
  ];
  for (let i = 0; i < suffixes.length; i++) {
    if (val >= suffixes[i].value) {
      return (val / suffixes[i].value).toFixed(2).replace(/\.?0+$/, '') + suffixes[i].symbol;
    }
  }
  return Math.round(val).toString();
}

function animateHpTransition(textEl, barEl, startHp, endHp, maxHp, duration = 650) {
  if (!textEl || !barEl) return;
  const startTime = performance.now();
  const safeMax = Math.max(1, maxHp);

  function step(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const currentVal = Math.round(startHp + (endHp - startHp) * progress);
    const pct = Math.max(0, Math.min(100, (currentVal / safeMax) * 100));

    textEl.innerText = `HP: ${formatNumber(currentVal)} / ${formatNumber(safeMax)}`;
    barEl.style.width = `${pct}%`;

    if (pct <= 25) {
      barEl.className = 'bg-rose-500 h-full transition-all duration-150';
    } else if (pct <= 50) {
      barEl.className = 'bg-amber-400 h-full transition-all duration-150';
    } else {
      barEl.className = 'bg-emerald-500 h-full transition-all duration-150';
    }

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

function switchTab(t) {
  playAudio('audio-pop');
  if (autoGachaActive) toggleAutoGacha();
  ['gacha', 'daily', 'inventory', 'battle', 'shop'].forEach(tab => {
    const el = document.getElementById(`tab-${tab}`);
    const btn = document.getElementById(`tab-btn-${tab}`);
    if (el) el.classList.add('hidden');
    if (btn) btn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-400 hover:text-white border border-slate-800';
  });
  const activeEl = document.getElementById(`tab-${t}`);
  const activeBtn = document.getElementById(`tab-btn-${t}`);
  if (activeEl) activeEl.classList.remove('hidden');
  if (activeBtn) activeBtn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition bg-pink-600 text-white shadow-lg';
  if (t === 'daily') renderDailyStreakGrid();
  if (t === 'battle' && !activeRoomId) refreshOpenRooms();
  if (t === 'shop') fetchShopItems();
}

async function fetchShopItems() {
  try {
    const res = await fetch('/api/shopw');
    const data = await res.json();
    if (data.success) {
      renderShopGrid(data.items);
      if (data.nextResetTime) {
        targetResetTimestamp = new Date(data.nextResetTime).getTime();
        startShopCountdown();
      }
    }
  } catch (e) {}
}

function startShopCountdown() {
  if (shopCountdownInterval) clearInterval(shopCountdownInterval);
  shopCountdownInterval = setInterval(() => {
    if (!targetResetTimestamp) return;
    const now = new Date().getTime();
    const distance = targetResetTimestamp - now;
    const timerEl = document.getElementById('shop-reset-timer');
    if (!timerEl) return;
    if (distance <= 0) {
      timerEl.innerText = 'Reset dalam: 00:00:00';
      fetchShopItems();
      return;
    }
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    timerEl.innerText = `Reset dalam: ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }, 1000);
}

function renderShopGrid(items) {
  const grid = document.getElementById('shop-items-grid');
  if (!grid) return;
  if (!items || items.length === 0) {
    grid.innerHTML = '<p class="text-xs text-slate-500 col-span-3 text-center">Tidak ada item di shop.</p>';
    return;
  }
  const inv = userData.inventory || [];
  grid.innerHTML = '';
  items.forEach(item => {
    const isSoldOut = item.stock !== undefined && item.stock <= 0;
    let waifuOptions = '<option value="">-- Pilih Waifu Target --</option>';
    inv.forEach(w => {
      waifuOptions += `<option value="${w.instanceId}">${w.name} (${w.rarity}) - HP: ${formatNumber(w.currentHp ?? w.hp)}/${formatNumber(w.hp)}</option>`;
    });
    grid.innerHTML += `
      <div class="bg-slate-950 border ${isSoldOut ? 'border-rose-900/40 opacity-60' : 'border-slate-800'} p-5 rounded-2xl flex flex-col justify-between space-y-4 shadow-lg">
        <div class="space-y-2">
          <div class="flex justify-between items-start">
            <h4 class="font-bold text-sm text-white">${item.name}</h4>
            <span class="text-[10px] bg-pink-500/20 text-pink-400 px-2 py-0.5 rounded font-mono font-bold">💖 ${formatNumber(item.price)} Poin</span>
          </div>
          <p class="text-xs text-slate-400">${item.description}</p>
          <p class="text-[10px] text-slate-500 font-mono">Stok Tersedia: ${item.stock !== undefined ? item.stock : 'Unlimited'}</p>
        </div>
        <div class="space-y-2 pt-2 border-t border-slate-900">
          <label class="text-[10px] text-slate-400 font-bold">Terapkan ke Waifu:</label>
          <select id="target-waifu-${item.itemId}" class="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-xl p-2 focus:outline-none focus:border-pink-500">
            ${waifuOptions}
          </select>
          <button onclick="buyShopItem('${item.itemId}')" ${isSoldOut ? 'disabled' : ''} class="w-full py-2.5 bg-pink-600 hover:bg-pink-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs rounded-xl transition shadow-md">
            ${isSoldOut ? 'Stok Habis' : 'Beli Item'}
          </button>
        </div>
      </div>
    `;
  });
}

async function buyShopItem(itemId) {
  playAudio('audio-pop');
  const selectEl = document.getElementById(`target-waifu-${itemId}`);
  const instanceId = selectEl ? selectEl.value : '';
  if (!instanceId) return alert('Silakan pilih waifu target terlebih dahulu dari dropdown!');
  try {
    const res = await fetch('/api/shopw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, itemId, instanceId })
    });
    const data = await res.json();
    if (data.success) {
      playAudio('audio-chime');
      userData.points = data.points;
      userData.inventory = data.inventory;
      updateUIState();
      fetchShopItems();
      alert(data.message);
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert('Gagal melakukan pembelian item.');
  }
}

function openRedeemModal() {
  playAudio('audio-pop');
  const modal = document.getElementById('redeem-modal');
  if (modal) modal.classList.remove('hidden');
  const input = document.getElementById('redeem-code-input');
  if (input) input.value = '';
}

function closeRedeemModal() {
  const modal = document.getElementById('redeem-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitRedeemCode() {
  playAudio('audio-pop');
  const codeInput = document.getElementById('redeem-code-input');
  const code = codeInput ? codeInput.value.trim() : '';
  if (!code) return alert('Silakan masukkan kode redeem terlebih dahulu!');
  if (!currentUser || !currentUser.id) return alert('Anda harus login terlebih dahulu.');
  try {
    const res = await fetch('/api/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, code: code })
    });
    const data = await res.json();
    if (data.success) {
      playAudio('audio-chime');
      userData.points = data.points;
      updateUIState();
      alert(data.message);
      closeRedeemModal();
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert('Gagal memproses kode redeem.');
  }
}

function openWaifuDetailModal(instanceId) {
  playAudio('audio-pop');
  const inv = userData.inventory || [];
  const w = inv.find(item => item.instanceId === instanceId);
  if (!w) return;
  const masterWaifu = serverWaifusData.find(m => m.id === w.waifuId) || {};
  const loreDesc = masterWaifu.description || 'Tidak ada catatan lore untuk waifu ini.';

  const setElText = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
  const setElAttr = (id, attr, val) => { const el = document.getElementById(id); if (el) el[attr] = val; };

  setElAttr('detail-modal-img', 'src', w.image);
  setElText('detail-modal-rarity', w.rarity);
  setElText('detail-modal-name', w.name);
  setElText('detail-modal-title', w.title || '-');
  setElText('detail-modal-element', `Element: ${w.element || 'Normal'}`);
  setElText('detail-modal-desc', loreDesc);
  setElText('detail-modal-hp', `${formatNumber(w.currentHp ?? w.hp)} / ${formatNumber(w.hp)}`);
  setElText('detail-modal-atk', formatNumber(w.attack));
  setElText('detail-modal-def', formatNumber(w.defense));
  setElText('detail-modal-dupes', `Duplikat / Level Merge: x${formatNumber(w.dupes || 1)}`);

  const modal = document.getElementById('waifu-detail-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeWaifuDetailModal() {
  const modal = document.getElementById('waifu-detail-modal');
  if (modal) modal.classList.add('hidden');
}

function logoutSession() {
  localStorage.removeItem('discord_user');
  window.location.reload();
}

async function initAuthAndData() {
  const urlParams = new URLSearchParams(window.location.search);
  const userParam = urlParams.get('user');
  if (userParam) {
    try {
      currentUser = JSON.parse(decodeURIComponent(userParam));
      localStorage.setItem('discord_user', JSON.stringify(currentUser));
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (e) {}
  } else {
    const saved = localStorage.getItem('discord_user');
    if (saved) currentUser = JSON.parse(saved);
  }

  const loginPrompt = document.getElementById('login-prompt');
  const gachaApp = document.getElementById('gacha-app');
  const pointsBadge = document.getElementById('user-points-badge');
  const navBadge = document.getElementById('nav-user-badge');

  if (currentUser && currentUser.id) {
    if (loginPrompt) loginPrompt.classList.add('hidden');
    if (gachaApp) gachaApp.classList.remove('hidden');
    if (pointsBadge) {
      pointsBadge.classList.remove('hidden');
      pointsBadge.classList.add('flex');
    }
    if (navBadge) navBadge.classList.remove('hidden');

    const navName = document.getElementById('nav-user-name');
    const navAvatar = document.getElementById('nav-user-avatar');
    if (navName) navName.innerText = currentUser.global_name || currentUser.username;
    if (navAvatar) navAvatar.src = getAvatarUrl(currentUser);

    await fetchUserData();
    startOnlineTracker();
  } else {
    if (loginPrompt) loginPrompt.classList.remove('hidden');
  }
}

async function fetchUserData() {
  if (!currentUser || !currentUser.id) return;
  try {
    const res = await fetch(`/api/gacha?action=profile&id=${currentUser.id}&username=${encodeURIComponent(currentUser.username)}&global_name=${encodeURIComponent(currentUser.global_name || currentUser.username)}&avatar=${currentUser.avatar || ''}`);
    const data = await res.json();
    if (data.success) {
      userData = data.user;
      serverWaifusData = data.waifus || [];
      updateUIState();
      renderOpenRooms(data.openRooms || []);
      renderDailyStreakGrid();
    }
  } catch (e) {}
}

function updateUIState() {
  if (!userData) return;
  const formattedPoints = formatNumber(userData.points || 0);
  const pointsEl = document.getElementById('user-points-val');
  if (pointsEl) pointsEl.innerText = `${formattedPoints} Poin`;

  const invCount = userData.inventory ? userData.inventory.length : 0;
  const invCountEl = document.getElementById('inv-count');
  const subInvCountEl = document.getElementById('inventory-sub-count');
  if (invCountEl) invCountEl.innerText = invCount;
  if (subInvCountEl) subInvCountEl.innerText = invCount;

  const pityVal = userData.pityCounter || 0;
  const pityEl = document.getElementById('pity-counter-val');
  if (pityEl) pityEl.innerText = `${pityVal}/100`;

  renderInventory();
  renderBattleSelection();
  renderDailyStreakGrid();
}

async function refreshOpenRooms() {
  playAudio('audio-pop');
  if (!currentUser || !currentUser.id) return;
  try {
    const res = await fetch(`/api/gacha?action=get_open_rooms&id=${currentUser.id}`);
    const data = await res.json();
    if (data.success) {
      renderOpenRooms(data.openRooms || []);
    }
  } catch (e) {}
}

function renderDailyStreakGrid() {
  const grid = document.getElementById('daily-streak-grid');
  if (!grid || !userData) return;
  const currentStreak = userData.loginStreak || 0;
  grid.innerHTML = '';

  for (let i = 1; i <= 7; i++) {
    const isClaimed = i <= currentStreak;
    grid.innerHTML += `
      <div class="relative bg-slate-950/90 border ${isClaimed ? 'border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-950/40' : 'border-slate-800'} p-4 rounded-2xl flex flex-col items-center justify-center space-y-2 transition transform hover:scale-105">
        <span class="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider">Hari ${i}</span>
        <div class="w-10 h-10 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center text-sm font-black border border-pink-500/20 shadow-inner">
          🎁
        </div>
        <span class="text-xs font-black text-pink-300 font-mono">+${formatNumber(i * 100)} Poin</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${isClaimed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-900 text-slate-500'}">
          ${isClaimed ? '✓ Diklaim' : 'Terkunci'}
        </span>
      </div>
    `;
  }
  checkDailyClaimStatus();
}

function checkDailyClaimStatus() {
  const countdownBanner = document.getElementById('daily-countdown-banner');
  const dailyMsg = document.getElementById('daily-msg');
  const claimBtn = document.getElementById('claim-daily-btn');

  if (!userData || !userData.lastDailyClaim) {
    if (countdownBanner) countdownBanner.classList.add('hidden');
    if (dailyMsg) dailyMsg.innerText = '';
    if (claimBtn) {
      claimBtn.disabled = false;
      claimBtn.className = 'px-10 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-900/30 transition transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center space-x-2 mx-auto cursor-pointer';
    }
    return;
  }

  const lastClaimTime = new Date(userData.lastDailyClaim).getTime();
  const nextClaimTime = lastClaimTime + (24 * 60 * 60 * 1000);

  if (dailyCountdownInterval) clearInterval(dailyCountdownInterval);

  dailyCountdownInterval = setInterval(() => {
    const now = new Date().getTime();
    const distance = nextClaimTime - now;

    if (distance <= 0) {
      clearInterval(dailyCountdownInterval);
      if (countdownBanner) countdownBanner.classList.add('hidden');
      if (dailyMsg) dailyMsg.innerText = '✨ Reward harian siap diklaim sekarang!';
      if (claimBtn) {
        claimBtn.disabled = false;
        claimBtn.className = 'px-10 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-900/30 transition transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center space-x-2 mx-auto cursor-pointer';
      }
      return;
    }

    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, '0');
    const timerVal = document.getElementById('daily-timer-val');
    if (timerVal) timerVal.innerText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    if (countdownBanner) countdownBanner.classList.remove('hidden');
    if (dailyMsg) dailyMsg.innerText = 'Reward harian sudah diambil hari ini. Coba lagi besok!';

    if (claimBtn) {
      claimBtn.disabled = true;
      claimBtn.className = 'px-10 py-4 bg-slate-800 text-slate-500 font-black text-sm rounded-2xl shadow-inner cursor-not-allowed flex items-center justify-center space-x-2 mx-auto';
    }
  }, 1000);
}

async function claimDailyReward() {
  playAudio('audio-pop');
  try {
    const res = await fetch('/api/gacha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'daily', userId: currentUser.id }) });
    const data = await res.json();
    const dailyMsg = document.getElementById('daily-msg');
    if (data.success) {
      playAudio('audio-chime');
      userData.points = data.points;
      userData.loginStreak = data.streak;
      userData.lastDailyClaim = new Date();
      updateUIState();
      if (dailyMsg) dailyMsg.innerText = data.message;
    } else {
      if (dailyMsg) dailyMsg.innerText = data.error;
    }
  } catch (e) {
    const dailyMsg = document.getElementById('daily-msg');
    if (dailyMsg) dailyMsg.innerText = 'Gagal melakukan klaim reward.';
  }
}

function toggleAutoGacha() {
  playAudio('audio-pop');
  const btn = document.getElementById('auto-gacha-btn');
  const text = document.getElementById('auto-gacha-text');

  if (!autoGachaActive) {
    if (userData && userData.points < 50) {
      alert('Poin Anda tidak cukup untuk memulai Auto Gacha!');
      return;
    }
    autoGachaActive = true;
    if (text) text.innerText = 'Auto Gacha: ON';
    if (btn) btn.className = 'px-6 py-3.5 bg-pink-600 hover:bg-pink-500 border border-pink-500 text-white font-bold text-sm rounded-2xl shadow-xl transition flex items-center space-x-2 animate-pulse';

    autoGachaTimer = setInterval(() => {
      if (!userData || userData.points < 50) {
        toggleAutoGacha();
        alert('Auto Gacha berhenti otomatis karena Poin habis!');
        return;
      }
      doGachaPull();
    }, 1600);
  } else {
    autoGachaActive = false;
    if (text) text.innerText = 'Auto Gacha: OFF';
    if (btn) btn.className = 'px-6 py-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-sm rounded-2xl shadow-xl transition flex items-center space-x-2';
    if (autoGachaTimer) clearInterval(autoGachaTimer);
  }
}

window.addEventListener('keydown', (e) => {
  if ((e.key === 'r' || e.key === 'R') && document.getElementById('tab-gacha') && !document.getElementById('tab-gacha').classList.contains('hidden')) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    e.preventDefault();
    doGachaPull();
  }
});

async function doGachaPull() {
  playAudio('audio-pop');
  const box = document.getElementById('gacha-result-box');
  if (box) box.innerHTML = '<span class="text-pink-400 animate-pulse">🔮 Membuka portal gacha...</span>';
  try {
    const res = await fetch('/api/gacha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'gacha', userId: currentUser.id }) });
    const data = await res.json();
    if (data.success) {
      playAudio('audio-chime');
      userData.points = data.points;
      userData.pityCounter = data.pityCounter;

      const idx = userData.inventory.findIndex(i => i.waifuId === data.waifu.waifuId);
      if (idx !== -1) userData.inventory[idx] = data.waifu; else userData.inventory.push(data.waifu);
      updateUIState();

      const isNew = data.isNewUnlocked;

      if (box) {
        box.innerHTML = `
          <div class="summon-anim bg-slate-950 p-6 rounded-2xl border-2 ${isNew ? 'border-amber-400 shadow-amber-500/50' : 'border-pink-500'} text-center space-y-3 shadow-2xl relative overflow-hidden">
            ${isNew ? '<div class="absolute top-0 inset-x-0 bg-gradient-to-r from-amber-500 to-pink-500 text-black text-[10px] font-black uppercase tracking-widest py-0.5 animate-pulse">✨ NEW CHARACTER UNLOCKED! ✨</div>' : ''}
            <span class="text-xs bg-pink-500/20 text-pink-300 px-3 py-1 rounded-full font-bold mt-2 inline-block">${data.waifu.rarity} &bull; ${data.waifu.element}</span>
            <img src="${data.waifu.image}" onclick="openWaifuDetailModal('${data.waifu.instanceId}')" class="w-32 h-32 mx-auto rounded-xl object-cover border border-slate-700 shadow-md cursor-pointer hover:scale-105 transition">
            <div>
              <h4 class="font-black text-lg text-white">${data.waifu.name}</h4>
              <p class="text-xs text-pink-400 italic">${data.waifu.title}</p>
              <p class="text-[10px] text-slate-400 font-mono mt-1">ATK: ${formatNumber(data.waifu.attack)} | DEF: ${formatNumber(data.waifu.defense)} | HP: ${formatNumber(data.waifu.hp)}</p>
            </div>
            <p class="text-xs font-bold ${isNew ? 'text-amber-300 animate-bounce' : 'text-emerald-400'}">${data.message}</p>
          </div>
        `;
      }
    } else {
      if (box) box.innerHTML = `<span class="text-rose-400 text-sm font-bold">${data.error}</span>`;
      if (autoGachaActive) toggleAutoGacha();
    }
  } catch (e) {
    if (box) box.innerHTML = `<span class="text-rose-400 text-sm">Gagal summon. Terjadi kesalahan koneksi.</span>`;
    if (autoGachaActive) toggleAutoGacha();
  }
}

function renderInventory() {
  const c = document.getElementById('inventory-grid');
  if (!c) return;
  const inv = userData.inventory || [];
  if (inv.length === 0) { c.innerHTML = '<p class="text-slate-500 text-sm col-span-4 text-center py-10">Belum ada waifu.</p>'; return; }
  c.innerHTML = '';
  inv.forEach(w => {
    const curHp = w.currentHp ?? w.hp;
    const isDead = curHp <= 0;
    const masterWaifu = serverWaifusData.find(m => m.id === w.waifuId) || {};
    const shortDesc = masterWaifu.description || 'Koleksi waifu istimewa Rakan Aditya Community.';

    c.innerHTML += `
      <div class="bg-slate-900 border ${isDead ? 'border-rose-900/50 opacity-70' : 'border-slate-800'} p-4 rounded-2xl space-y-3 flex flex-col justify-between shadow-lg">
        <div class="space-y-2">
          <div class="relative cursor-pointer group" onclick="openWaifuDetailModal('${w.instanceId}')">
            <img src="${w.image}" class="w-full h-36 rounded-xl object-cover border border-slate-800 group-hover:border-pink-500 transition">
            <span class="absolute top-2 right-2 text-[10px] bg-black/70 px-2 py-0.5 rounded-md text-pink-400 font-bold">${w.rarity}</span>
            <span class="absolute bottom-2 left-2 text-[9px] bg-black/70 px-2 py-0.5 rounded text-indigo-300 font-mono">🔍 Details selengkapnya</span>
            ${isDead ? '<span class="absolute inset-0 bg-black/60 flex items-center justify-center text-xs font-bold text-rose-400 rounded-xl">HP HABIS (0)</span>' : ''}
          </div>
          <div>
            <h4 class="font-bold text-sm text-white">${w.name}</h4>
            <p class="text-[11px] text-pink-400 italic">${w.title || ''}</p>
            <p class="text-[10px] text-slate-400 mt-1 line-clamp-2">${shortDesc}</p>
          </div>
        </div>
        <div class="space-y-2 pt-2 border-t border-slate-800">
          <div class="flex justify-between text-[10px] font-mono ${isDead ? 'text-rose-400' : 'text-slate-300'}">
            <span>HP: ${formatNumber(curHp)}/${formatNumber(w.hp)}</span>
            <span>ATK: ${formatNumber(w.attack)} | DEF: ${formatNumber(w.defense)}</span>
          </div>
          <button onclick="deleteWaifu('${w.instanceId}')" class="w-full py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-xs font-bold rounded-xl transition">🗑️ Hapus</button>
        </div>
      </div>
    `;
  });
}

async function deleteWaifu(id) {
  if (!confirm('Hapus waifu dari koleksi?')) return;
  const res = await fetch('/api/gacha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_waifu', userId: currentUser.id, instanceId: id }) });
  const data = await res.json();
  if (data.success) { userData.inventory = data.inventory; updateUIState(); }
}

async function mergeAllDupes() {
  const res = await fetch('/api/gacha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'merge_dupes', userId: currentUser.id }) });
  const data = await res.json();
  if (data.success) { userData.inventory = data.inventory; updateUIState(); alert(data.message); }
}

function renderBattleSelection() {
  const c = document.getElementById('battle-inventory-select');
  if (!c) return;
  const inv = userData.inventory || [];
  if (inv.length === 0) { c.innerHTML = '<p class="text-slate-500 text-xs col-span-4 text-center">Inventory kosong.</p>'; return; }
  c.innerHTML = '';
  inv.forEach(w => {
    const curHp = w.currentHp ?? w.hp;
    const isDead = curHp <= 0;
    const isSel = selectedBattleInstanceId === w.instanceId;
    c.innerHTML += `
      <div onclick="${isDead ? '' : `selectBattleWaifu('${w.instanceId}')`}" class="cursor-pointer p-3 rounded-xl border ${isDead ? 'border-rose-900/40 bg-slate-900/50 opacity-50 cursor-not-allowed' : (isSel ? 'border-pink-500 bg-pink-950/30 shadow-lg' : 'border-slate-800 bg-slate-900')} flex items-center space-x-3 transition">
        <img src="${w.image}" class="w-10 h-10 rounded-lg object-cover">
        <div>
          <h5 class="font-bold text-xs text-white">${w.name} ${isDead ? '(HP Habis)' : ''}</h5>
          <p class="text-[10px] ${isDead ? 'text-rose-400' : 'text-pink-400'} font-mono">HP: ${formatNumber(curHp)}/${formatNumber(w.hp)} | ATK: ${formatNumber(w.attack)}</p>
        </div>
      </div>
    `;
  });
}

function selectBattleWaifu(id) {
  playAudio('audio-pop');
  selectedBattleInstanceId = id;
  renderBattleSelection();
  const createRoomBtn = document.getElementById('create-room-btn');
  const createBotBtn = document.getElementById('create-bot-room-btn');
  if (createRoomBtn) createRoomBtn.disabled = false;
  if (createBotBtn) createBotBtn.disabled = false;
}

async function renderOpenRooms(rooms) {
  const list = document.getElementById('open-rooms-list');
  if (!list) return;
  if (!rooms || rooms.length === 0) { list.innerHTML = '<p class="text-xs text-slate-500">Tidak ada room terbuka. Buat room baru atau lawan bot!</p>'; return; }
  list.innerHTML = '';
  rooms.forEach(r => {
    list.innerHTML += `
      <div class="flex justify-between items-center bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div class="flex items-center space-x-2">
          <img src="${r.player1.waifu.image}" class="w-8 h-8 rounded-lg object-cover">
          <span class="text-xs text-white font-bold">Room: ${r.player1.name} (${r.player1.waifu.name})</span>
        </div>
        <button onclick="joinPvPRoom('${r._id}')" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition">Masuk Room</button>
      </div>
    `;
  });
}

async function createPvPRoom(isBot) {
  if (!selectedBattleInstanceId) return alert('Pilih waifu andalan Anda terlebih dahulu di bawah!');
  const res = await fetch('/api/gacha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_pvp_room', userId: currentUser.id, instanceId: selectedBattleInstanceId, isBot }) });
  const data = await res.json();
  if (data.success) {
    activeRoomId = data.roomId;
    const lobby = document.getElementById('pvp-lobby');
    const battleRoom = document.getElementById('live-battle-room');
    if (lobby) lobby.classList.add('hidden');
    if (battleRoom) battleRoom.classList.remove('hidden');
    setupRoomUI(data.room);
    startPollingRoom();
  } else {
    alert(data.error);
  }
}

async function joinPvPRoom(roomId) {
  if (!selectedBattleInstanceId) return alert('Pilih waifu andalan Anda terlebih dahulu di bawah!');
  const res = await fetch('/api/gacha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'join_pvp_room', userId: currentUser.id, instanceId: selectedBattleInstanceId, roomId }) });
  const data = await res.json();
  if (data.success) {
    activeRoomId = data.roomId;
    const lobby = document.getElementById('pvp-lobby');
    const battleRoom = document.getElementById('live-battle-room');
    if (lobby) lobby.classList.add('hidden');
    if (battleRoom) battleRoom.classList.remove('hidden');
    startPollingRoom();
  } else {
    alert(data.error);
  }
}

async function setPlayerReady() {
  playAudio('audio-pop');
  if (!activeRoomId || activeRoomId.length !== 24) return;

  const readyBtn = document.getElementById('ready-btn');
  if (readyBtn) {
    readyBtn.disabled = true;
    readyBtn.innerText = '⏳ MEMPROSES...';
  }

  try {
    const res = await fetch('/api/gacha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'player_ready', userId: currentUser.id, roomId: activeRoomId })
    });
    const data = await res.json();

    if (data.success) {
      if (readyBtn) {
        readyBtn.innerText = '✓ READY';
        readyBtn.className = 'px-8 py-3 bg-slate-800 text-slate-400 font-bold text-sm rounded-xl cursor-not-allowed';
      }
      await checkRoomAndTriggerBattle();
    } else {
      alert(data.error || 'Gagal mengubah status ready.');
      if (readyBtn) {
        readyBtn.disabled = false;
        readyBtn.innerText = '✅ SIAP (READY / REMATCH)';
      }
    }
  } catch (e) {
    alert('Terjadi kesalahan koneksi.');
    if (readyBtn) {
      readyBtn.disabled = false;
      readyBtn.innerText = '✅ SIAP (READY / REMATCH)';
    }
  }
}

function setupRoomUI(room) {
  if (!room) return;
  const isP1 = room.player1.id === currentUser.id;
  const me = isP1 ? room.player1 : room.player2;
  const op = isP1 ? room.player2 : room.player1;
  const isBotRoom = room.player2 && room.player2.id === 'bot_ai';

  const setElText = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
  const setElAttr = (id, attr, val) => { const el = document.getElementById(id); if (el) el[attr] = val; };

  setElText('p1-name', me ? me.name : 'Anda');
  setElAttr('p1-img', 'src', me && me.waifu ? me.waifu.image : '');

  if (!isRenderingLogs && room.status !== 'finished') {
    setElText('p1-hp-text', me ? `HP: ${formatNumber(me.currentHp)} / ${formatNumber(me.maxHp)}` : '');
    const p1Bar = document.getElementById('p1-hp-bar');
    if (p1Bar && me) {
      p1Bar.style.width = `${Math.max(0, (me.currentHp / me.maxHp) * 100)}%`;
      p1Bar.className = 'bg-emerald-500 h-full transition-all duration-300';
    }
  }

  const p1Ready = document.getElementById('p1-status-ready');
  if (p1Ready) {
    if (room.status === 'finished' && !isRenderingLogs) {
      p1Ready.innerText = 'SELESAI';
      p1Ready.className = 'text-slate-400 font-bold';
    } else {
      p1Ready.innerText = me && me.ready ? 'READY ✓' : 'MENUNGGU READY...';
      p1Ready.className = me && me.ready ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold';
    }
  }

  if (op) {
    setElText('p2-name', op.name);
    setElAttr('p2-img', 'src', op.waifu ? op.waifu.image : '');

    if (!isRenderingLogs && room.status !== 'finished') {
      setElText('p2-hp-text', `HP: ${formatNumber(op.currentHp)} / ${formatNumber(op.maxHp)}`);
      const p2Bar = document.getElementById('p2-hp-bar');
      if (p2Bar) {
        p2Bar.style.width = `${Math.max(0, (op.currentHp / op.maxHp) * 100)}%`;
        p2Bar.className = 'bg-emerald-500 h-full transition-all duration-300';
      }
    }

    const p2Ready = document.getElementById('p2-status-ready');
    if (p2Ready) {
      if (room.status === 'finished' && !isRenderingLogs) {
        p2Ready.innerText = 'SELESAI';
        p2Ready.className = 'text-slate-400 font-bold';
      } else if (isBotRoom) {
        p2Ready.innerText = 'READY ✓ (BOT)';
        p2Ready.className = 'text-emerald-400 font-bold';
      } else {
        p2Ready.innerText = op.ready ? 'READY ✓' : 'MENUNGGU READY...';
        p2Ready.className = op.ready ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold';
      }
    }

    const banner = document.getElementById('battle-result-banner');
    const statusBadge = document.getElementById('room-status-badge');

    if (room.status === 'finished' && !isRenderingLogs) {
      if (statusBadge) statusBadge.innerText = 'Status: SELESAI';
      const readyBtn = document.getElementById('ready-btn');
      if (readyBtn) {
        readyBtn.disabled = false;
        readyBtn.innerText = '✅ SIAP REMATCH (READY)';
        readyBtn.className = 'px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg transition';
      }
    } else if (room.status === 'battling') {
      if (statusBadge) statusBadge.innerText = 'Status: Pertarungan Sedang Berlangsung!';
      if (banner) banner.classList.add('hidden');
    } else {
      if (statusBadge) statusBadge.innerText = isBotRoom ? 'Status: Lawan Bot Siap! Silakan tekan Ready.' : 'Status: Lawan Bergabung! Silakan tekan Ready.';
      if (banner) banner.classList.add('hidden');
    }
  } else {
    const statusBadge = document.getElementById('room-status-badge');
    if (statusBadge) statusBadge.innerText = 'Status: Menunggu Lawan Bergabung ke Room...';
  }
}

async function checkRoomAndTriggerBattle() {
  if (!activeRoomId || typeof activeRoomId !== 'string' || activeRoomId.length !== 24) return;
  try {
    const res = await fetch(`/api/gacha?action=check_room&roomId=${activeRoomId}`);
    const data = await res.json();
    if (data.success && data.room) {
      const room = data.room;
      setupRoomUI(room);

      if (room.status === 'battling' || room.status === 'finished') {
        const turnRes = await fetch('/api/gacha', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_pvp_status', userId: currentUser.id, roomId: activeRoomId })
        });
        const turnData = await turnRes.json();
        if (turnData.success && turnData.room && turnData.room.logs && turnData.room.logs.length > 0) {
          if (pollInterval) clearInterval(pollInterval);
          await renderBattleAnimationAndLogs(turnData.room.logs, turnData.room.winner, turnData.room);
          fetchUserData();
        }
      }
    }
  } catch (e) {}
}

function startPollingRoom() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    if (!activeRoomId) return;
    await checkRoomAndTriggerBattle();
  }, 8000);
}

function startOnlineTracker() {
  if (!currentUser || !currentUser.id) return;
  sendHeartbeat();
  fetchOnlineUsers();

  setInterval(() => {
    sendHeartbeat();
    fetchOnlineUsers();
  }, 30000);
}

async function sendHeartbeat() {
  if (!currentUser || !currentUser.id) return;
  try {
    await fetch('/api/gacha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'heartbeat', userId: currentUser.id })
    });
  } catch (e) {}
}

async function fetchOnlineUsers() {
  try {
    const res = await fetch('/api/gacha?action=online_users');
    const data = await res.json();
    if (data.success) {
      renderOnlineUsers(data.onlineUsers || []);
    }
  } catch (e) {}
}

function renderOnlineUsers(users) {
  const container = document.getElementById('online-users-list');
  const countEl = document.getElementById('online-count');
  if (!container || !countEl) return;

  countEl.innerText = users.length;
  if (users.length === 0) {
    container.innerHTML = '<p class="text-[11px] text-slate-500">Tidak ada user lain yang online.</p>';
    return;
  }

  container.innerHTML = '';
  users.forEach(u => {
    const avatarUrl = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
    const name = u.global_name || u.username;
    container.innerHTML += `
      <div class="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl shadow-sm" title="${name}">
        <div class="relative">
          <img src="${avatarUrl}" class="w-5 h-5 rounded-full object-cover">
          <span class="w-2 h-2 bg-emerald-500 border border-slate-950 rounded-full absolute bottom-0 right-0"></span>
        </div>
        <span class="text-[11px] font-medium text-slate-200 max-w-[100px] truncate">${name}</span>
      </div>
    `;
  });
}
async function renderBattleAnimationAndLogs(logs, winner, room) {
  const logBox = document.getElementById('battle-combat-logs');
  if (!logBox || isRenderingLogs) return;
  isRenderingLogs = true;

  const STEP_MS = 1800; // Dipercepat dari 1100ms menjadi 650ms per serangan
  const startTime = room.battleStartTime || Date.now();

  const roundBox = document.getElementById('battle-round-indicator');
  const roundText = document.getElementById('round-indicator-text');
  const statusBadge = document.getElementById('room-status-badge');
  const p1Card = document.getElementById('p1-card');
  const p2Card = document.getElementById('p2-card');
  const banner = document.getElementById('battle-result-banner');

  const p1HpText = document.getElementById('p1-hp-text');
  const p1HpBar = document.getElementById('p1-hp-bar');
  const p2HpText = document.getElementById('p2-hp-text');
  const p2HpBar = document.getElementById('p2-hp-bar');

  const isP1 = room.player1.id === currentUser.id;
  const myMaxHp = isP1 ? room.player1.maxHp : room.player2.maxHp;
  const opMaxHp = isP1 ? room.player2.maxHp : room.player1.maxHp;

  const firstLog = logs[0];
  let curMyHp = isP1
    ? (firstLog.p1Hp + (firstLog.attacker === room.player2.name ? firstLog.damage : 0))
    : (firstLog.p2Hp + (firstLog.attacker === room.player1.name ? firstLog.damage : 0));
  let curOpHp = isP1
    ? (firstLog.p2Hp + (firstLog.attacker === room.player1.name ? firstLog.damage : 0))
    : (firstLog.p1Hp + (firstLog.attacker === room.player2.name ? firstLog.damage : 0));
  curMyHp = Math.min(myMaxHp, curMyHp);
  curOpHp = Math.min(opMaxHp, curOpHp);

  if (p1HpText) p1HpText.innerText = `HP: ${formatNumber(curMyHp)} / ${formatNumber(myMaxHp)}`;
  if (p1HpBar) {
    p1HpBar.style.width = `${Math.max(0, (curMyHp / myMaxHp) * 100)}%`;
    p1HpBar.className = 'bg-emerald-500 h-full transition-all duration-150';
  }
  if (p2HpText) p2HpText.innerText = `HP: ${formatNumber(curOpHp)} / ${formatNumber(opMaxHp)}`;
  if (p2HpBar) {
    p2HpBar.style.width = `${Math.max(0, (curOpHp / opMaxHp) * 100)}%`;
    p2HpBar.className = 'bg-emerald-500 h-full transition-all duration-150';
  }

  if (banner) banner.classList.add('hidden');
  if (statusBadge) statusBadge.innerText = 'Status: Pertarungan Sedang Berlangsung! (BATTLING)';
  if (roundBox) roundBox.classList.remove('hidden');
  if (roundText) {
    roundText.innerText = '⚔️ ROUND 1 — BATTLING...';
    roundText.className = 'text-sm sm:text-base font-black tracking-widest uppercase text-amber-400 animate-pulse';
  }

  logBox.innerHTML = '<p class="text-pink-400 animate-pulse">⚔️ Pertarungan Real-Time Dimulai...</p>';

  let lastTurn = 0;

  for (let i = 0; i < logs.length; i++) {
    const l = logs[i];

    if (l.turn !== lastTurn) {
      lastTurn = l.turn;
      if (roundText) {
        roundText.innerText = `🔥 ROUND ${l.turn} — BATTLING 🔥`;
      }
      logBox.innerHTML += `<div class="text-[11px] font-black text-amber-400 border-b border-slate-800 pb-0.5 pt-1.5 tracking-wider uppercase">— ROUND ${l.turn} —</div>`;
    }

    // SINKRONISASI WAKTU: Tunggu hingga tepat waktu jadwal serangan ke-i berdasarkan jam server
    const targetTime = startTime + (i + 1) * STEP_MS;
    const waitMs = Math.max(80, targetTime - Date.now());
    await new Promise(r => setTimeout(r, waitMs));

    playAudio('audio-pop');

    const isMeAttacking = (isP1 && l.attacker === room.player1.name) || (!isP1 && l.attacker === room.player2.name);
    if (p1Card && p2Card) {
      if (isMeAttacking) {
        p1Card.classList.add('ring-2', 'ring-pink-500', 'scale-[1.02]');
        p2Card.classList.remove('ring-2', 'ring-rose-500', 'scale-[1.02]');
      } else {
        p2Card.classList.add('ring-2', 'ring-rose-500', 'scale-[1.02]');
        p1Card.classList.remove('ring-2', 'ring-pink-500', 'scale-[1.02]');
      }
    }

    logBox.innerHTML += `<p>[Round ${l.turn}] <span class="text-pink-400 font-bold">${l.attacker}</span> menyerang <span class="text-indigo-400 font-bold">${l.defender}</span> sebesar <span class="text-rose-400 font-bold">-${formatNumber(l.damage)} DMG</span></p>`;
    logBox.scrollTop = logBox.scrollHeight;

    const nextMyHp = isP1 ? l.p1Hp : l.p2Hp;
    const nextOpHp = isP1 ? l.p2Hp : l.p1Hp;

    if (nextMyHp !== curMyHp) {
      animateHpTransition(p1HpText, p1HpBar, curMyHp, nextMyHp, myMaxHp, 1200);
      curMyHp = nextMyHp;
    }
    if (nextOpHp !== curOpHp) {
      animateHpTransition(p2HpText, p2HpBar, curOpHp, nextOpHp, opMaxHp, 1200);
      curOpHp = nextOpHp;
    }
  }

  await new Promise(r => setTimeout(r, 450));

  if (p1Card) p1Card.classList.remove('ring-2', 'ring-pink-500', 'scale-[1.02]');
  if (p2Card) p2Card.classList.remove('ring-2', 'ring-rose-500', 'scale-[1.02]');

  playAudio('audio-chime');
  logBox.innerHTML += `<p class="font-bold text-emerald-400 mt-2 text-sm">🎉 PEMENANG: ${winner}!</p>`;
  logBox.scrollTop = logBox.scrollHeight;

  if (statusBadge) statusBadge.innerText = 'Status: SELESAI';
  if (roundText) {
    roundText.innerText = `🏁 PERTARUNGAN SELESAI (${lastTurn} ROUND)`;
    roundText.className = 'text-sm sm:text-base font-black tracking-widest uppercase text-emerald-400';
  }

  const myName = isP1 ? room.player1.name : room.player2.name;
  const isWinner = winner === myName;
  const isAgainstBot = room.player2?.id === 'bot_ai';
  const rewardText = isAgainstBot ? '+200 Poin (Lawan Bot)' : '+500 Poin (Lawan User)';

  const outcomeTitle = document.getElementById('battle-outcome-title');
  const outcomeDesc = document.getElementById('battle-outcome-desc');

  if (banner && outcomeTitle && outcomeDesc) {
    banner.classList.remove('hidden');
    if (isWinner) {
      banner.className = 'p-6 rounded-2xl text-center space-y-2 border bg-emerald-950/40 border-emerald-500/50 shadow-2xl';
      outcomeTitle.innerText = '🏆 KEMENANGAN BERHASIL DIRAIH!';
      outcomeTitle.className = 'text-2xl font-black uppercase tracking-wider text-emerald-400';
      outcomeDesc.innerHTML = `Selamat, waifu andalanmu menang! Kamu mendapatkan reward <span class="font-mono font-bold text-pink-400">${rewardText}</span>.`;
    } else {
      banner.className = 'p-6 rounded-2xl text-center space-y-2 border bg-rose-950/40 border-rose-500/50 shadow-2xl';
      outcomeTitle.innerText = '💀 ANDA KALAH DALAM PERTEMPURAN';
      outcomeTitle.className = 'text-2xl font-black uppercase tracking-wider text-rose-400';
      outcomeDesc.innerHTML = `Sayang sekali waifu lawan lebih tangguh. Tingkatkan level atau gacha waifu lain untuk balas dendam!`;
    }
  }

  const readyBtn = document.getElementById('ready-btn');
  if (readyBtn) {
    readyBtn.disabled = false;
    readyBtn.innerText = '✅ SIAP REMATCH (READY)';
    readyBtn.className = 'px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg transition';
  }

  isRenderingLogs = false;
}

async function leaveRoom() {
  if (activeRoomId && activeRoomId.length === 24) {
    await fetch('/api/gacha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'leave_room', userId: currentUser.id, roomId: activeRoomId }) });
  }
  if (pollInterval) clearInterval(pollInterval);
  activeRoomId = null;
  isRenderingLogs = false;
  const battleRoom = document.getElementById('live-battle-room');
  const lobby = document.getElementById('pvp-lobby');
  const roundBox = document.getElementById('battle-round-indicator');
  if (battleRoom) battleRoom.classList.add('hidden');
  if (lobby) lobby.classList.remove('hidden');
  if (roundBox) roundBox.classList.add('hidden');
  const banner = document.getElementById('battle-result-banner');
  if (banner) banner.classList.add('hidden');
  const readyBtn = document.getElementById('ready-btn');
  if (readyBtn) {
    readyBtn.disabled = false;
    readyBtn.innerText = '✅ SIAP (READY / REMATCH)';
    readyBtn.className = 'px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg transition';
  }
  fetchUserData();
}

window.addEventListener('DOMContentLoaded', () => { initAuthAndData(); });
