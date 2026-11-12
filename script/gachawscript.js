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

function playAudio(s) { 
  try { 
    const a = document.getElementById(s); 
    if(a){ a.currentTime = 0; a.play().catch(e => {}); } 
  } catch(e){} 
}

function getAvatarUrl(u) { 
  return u && u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'; 
}

function switchTab(t) {
  playAudio('audio-pop');
  if (autoGachaActive) toggleAutoGacha();
  ['gacha','daily','inventory','battle','shop'].forEach(tab => {
    document.getElementById(`tab-${tab}`).classList.add('hidden');
    document.getElementById(`tab-btn-${tab}`).className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-400 hover:text-white border border-slate-800';
  });
  document.getElementById(`tab-${t}`).classList.remove('hidden');
  document.getElementById(`tab-btn-${t}`).className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition bg-pink-600 text-white shadow-lg';
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
    if (distance <= 0) {
      document.getElementById('shop-reset-timer').innerText = 'Reset dalam: 00:00:00';
      fetchShopItems();
      return;
    }
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    document.getElementById('shop-reset-timer').innerText = `Reset dalam: ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }, 1000);
}

function renderShopGrid(items) {
  const grid = document.getElementById('shop-items-grid');
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
      waifuOptions += `<option value="${w.instanceId}">${w.name} (${w.rarity}) - HP: ${w.currentHp ?? w.hp}/${w.hp}</option>`;
    });
    grid.innerHTML += `
      <div class="bg-slate-950 border ${isSoldOut ? 'border-rose-900/40 opacity-60' : 'border-slate-800'} p-5 rounded-2xl flex flex-col justify-between space-y-4 shadow-lg">
        <div class="space-y-2">
          <div class="flex justify-between items-start">
            <h4 class="font-bold text-sm text-white">${item.name}</h4>
            <span class="text-[10px] bg-pink-500/20 text-pink-400 px-2 py-0.5 rounded font-mono font-bold">💖 ${item.price} Poin</span>
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
  document.getElementById('redeem-modal').classList.remove('hidden');
  document.getElementById('redeem-code-input').value = '';
}

function closeRedeemModal() {
  document.getElementById('redeem-modal').classList.add('hidden');
}

async function submitRedeemCode() {
  playAudio('audio-pop');
  const codeInput = document.getElementById('redeem-code-input');
  const code = codeInput.value.trim();
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

  document.getElementById('detail-modal-img').src = w.image;
  document.getElementById('detail-modal-rarity').innerText = w.rarity;
  document.getElementById('detail-modal-name').innerText = w.name;
  document.getElementById('detail-modal-title').innerText = w.title || '-';
  document.getElementById('detail-modal-element').innerText = `Element: ${w.element || 'Normal'}`;
  document.getElementById('detail-modal-desc').innerText = loreDesc;
  document.getElementById('detail-modal-hp').innerText = `${w.currentHp ?? w.hp}/${w.hp}`;
  document.getElementById('detail-modal-atk').innerText = w.attack;
  document.getElementById('detail-modal-def').innerText = w.defense;
  document.getElementById('detail-modal-dupes').innerText = `Duplikat / Level Merge: x${w.dupes || 1}`;

  document.getElementById('waifu-detail-modal').classList.remove('hidden');
}

function closeWaifuDetailModal() {
  document.getElementById('waifu-detail-modal').classList.add('hidden');
}

async function initAuthAndData() {
  const urlParams = new URLSearchParams(window.location.search);
  const userParam = urlParams.get('user');
  if (userParam) {
    try { 
      currentUser = JSON.parse(decodeURIComponent(userParam)); 
      localStorage.setItem('discord_user', JSON.stringify(currentUser)); 
      window.history.replaceState({}, document.title, window.location.pathname); 
    } catch(e){}
  } else {
    const saved = localStorage.getItem('discord_user');
    if (saved) currentUser = JSON.parse(saved);
  }

  if (currentUser && currentUser.id) {
    document.getElementById('login-prompt').classList.add('hidden');
    document.getElementById('gacha-app').classList.remove('hidden');
    document.getElementById('user-points-badge').classList.remove('hidden');
    document.getElementById('nav-user-badge').classList.remove('hidden');
    document.getElementById('nav-user-name').innerText = currentUser.global_name || currentUser.username;
    document.getElementById('nav-user-avatar').src = getAvatarUrl(currentUser);
    
    await fetchUserData();
    
    // Aktifkan tracker online secara real-time
    startOnlineTracker();
  } else {
    document.getElementById('login-prompt').classList.remove('hidden');
  }
}

async function fetchUserData() {
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
  } catch(e) {}
}

function updateUIState() {
  if (!userData) return;
  document.getElementById('user-points-val').innerText = `${userData.points} Poin`;
  document.getElementById('inv-count').innerText = userData.inventory ? userData.inventory.length : 0;
  document.getElementById('inventory-sub-count').innerText = userData.inventory ? userData.inventory.length : 0;
  
  const pityVal = userData.pityCounter || 0;
  const pityEl = document.getElementById('pity-counter-val');
  if (pityEl) pityEl.innerText = `${pityVal}/200`;

  renderInventory();
  renderBattleSelection();
  renderDailyStreakGrid();
}

async function refreshOpenRooms() {
  playAudio('audio-pop');
  try {
    const res = await fetch(`/api/gacha?action=get_open_rooms&id=${currentUser.id}`);
    const data = await res.json();
    if (data.success) {
      renderOpenRooms(data.openRooms || []);
    }
  } catch(e) {}
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
        <span class="text-xs font-black text-pink-300 font-mono">+${i * 100} Poin</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${isClaimed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-900 text-slate-500'}">
          ${isClaimed ? '✓ Diklaim' : 'Terkunci'}
        </span>
      </div>
    `;
  }
  checkDailyClaimStatus();
}

function checkDailyClaimStatus() {
  if (!userData || !userData.lastDailyClaim) {
    document.getElementById('daily-countdown-banner').classList.add('hidden');
    document.getElementById('daily-msg').innerText = '';
    const btn = document.getElementById('claim-daily-btn');
    btn.disabled = false;
    btn.className = 'px-10 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-900/30 transition transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center space-x-2 mx-auto cursor-pointer';
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
      document.getElementById('daily-countdown-banner').classList.add('hidden');
      document.getElementById('daily-msg').innerText = '✨ Reward harian siap diklaim sekarang!';
      const btn = document.getElementById('claim-daily-btn');
      btn.disabled = false;
      btn.className = 'px-10 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-900/30 transition transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center space-x-2 mx-auto cursor-pointer';
      return;
    }

    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, '0');
    document.getElementById('daily-timer-val').innerText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    document.getElementById('daily-countdown-banner').classList.remove('hidden');
    document.getElementById('daily-msg').innerText = 'Reward harian sudah diambil hari ini. Coba lagi besok!';

    const btn = document.getElementById('claim-daily-btn');
    btn.disabled = true;
    btn.className = 'px-10 py-4 bg-slate-800 text-slate-500 font-black text-sm rounded-2xl shadow-inner cursor-not-allowed flex items-center justify-center space-x-2 mx-auto';
  }, 1000);
}

async function claimDailyReward() {
  playAudio('audio-pop');
  try {
    const res = await fetch('/api/gacha', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ action: 'daily', userId: currentUser.id }) });
    const data = await res.json();
    if (data.success) {
      playAudio('audio-chime');
      userData.points = data.points;
      userData.loginStreak = data.streak;
      userData.lastDailyClaim = new Date(); 
      updateUIState();
      document.getElementById('daily-msg').innerText = data.message;
    } else {
      document.getElementById('daily-msg').innerText = data.error;
    }
  } catch(e) {
    document.getElementById('daily-msg').innerText = 'Gagal melakukan klaim reward.';
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
    text.innerText = 'Auto Gacha: ON';
    btn.className = 'px-6 py-3.5 bg-pink-600 hover:bg-pink-500 border border-pink-500 text-white font-bold text-sm rounded-2xl shadow-xl transition flex items-center space-x-2 animate-pulse';
    
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
    text.innerText = 'Auto Gacha: OFF';
    btn.className = 'px-6 py-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-sm rounded-2xl shadow-xl transition flex items-center space-x-2';
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
  box.innerHTML = '<span class="text-pink-400 animate-pulse">🔮 Membuka portal gacha...</span>';
  try {
    const res = await fetch('/api/gacha', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ action: 'gacha', userId: currentUser.id }) });
    const data = await res.json();
    if (data.success) {
      playAudio('audio-chime');
      userData.points = data.points;
      userData.pityCounter = data.pityCounter;
      
      const idx = userData.inventory.findIndex(i => i.waifuId === data.waifu.waifuId);
      if (idx !== -1) userData.inventory[idx] = data.waifu; else userData.inventory.push(data.waifu);
      updateUIState();

      const isNew = data.isNewUnlocked;

      box.innerHTML = `
        <div class="summon-anim bg-slate-950 p-6 rounded-2xl border-2 ${isNew ? 'border-amber-400 shadow-amber-500/50' : 'border-pink-500'} text-center space-y-3 shadow-2xl relative overflow-hidden">
          ${isNew ? '<div class="absolute top-0 inset-x-0 bg-gradient-to-r from-amber-500 to-pink-500 text-black text-[10px] font-black uppercase tracking-widest py-0.5 animate-pulse">✨ NEW CHARACTER UNLOCKED! ✨</div>' : ''}
          <span class="text-xs bg-pink-500/20 text-pink-300 px-3 py-1 rounded-full font-bold mt-2 inline-block">${data.waifu.rarity} &bull; ${data.waifu.element}</span>
          <img src="${data.waifu.image}" onclick="openWaifuDetailModal('${data.waifu.instanceId}')" class="w-32 h-32 mx-auto rounded-xl object-cover border border-slate-700 shadow-md cursor-pointer hover:scale-105 transition">
          <div>
            <h4 class="font-black text-lg text-white">${data.waifu.name}</h4>
            <p class="text-xs text-pink-400 italic">${data.waifu.title}</p>
            <p class="text-[10px] text-slate-400 font-mono mt-1">ATK: ${data.waifu.attack} | DEF: ${data.waifu.defense} | HP: ${data.waifu.hp}</p>
          </div>
          <p class="text-xs font-bold ${isNew ? 'text-amber-300 animate-bounce' : 'text-emerald-400'}">${data.message}</p>
        </div>
      `;
    } else { 
      box.innerHTML = `<span class="text-rose-400 text-sm font-bold">${data.error}</span>`;
      if (autoGachaActive) toggleAutoGacha();
    }
  } catch(e) { 
    box.innerHTML = `<span class="text-rose-400 text-sm">Gagal summon. Terjadi kesalahan koneksi.</span>`;
    if (autoGachaActive) toggleAutoGacha();
  }
}

function renderInventory() {
  const c = document.getElementById('inventory-grid');
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
            <span>HP: ${curHp}/${w.hp}</span>
            <span>ATK: ${w.attack} | DEF: ${w.defense}</span>
          </div>
          <button onclick="deleteWaifu('${w.instanceId}')" class="w-full py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-xs font-bold rounded-xl transition">🗑️ Hapus</button>
        </div>
      </div>
    `;
  });
}

async function deleteWaifu(id) {
  if(!confirm('Hapus waifu dari koleksi?')) return;
  const res = await fetch('/api/gacha', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'delete_waifu', userId:currentUser.id, instanceId:id})});
  const data = await res.json();
  if(data.success) { userData.inventory = data.inventory; updateUIState(); }
}

async function mergeAllDupes() {
  const res = await fetch('/api/gacha', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'merge_dupes', userId:currentUser.id})});
  const data = await res.json();
  if(data.success) { userData.inventory = data.inventory; updateUIState(); alert(data.message); }
}

function renderBattleSelection() {
  const c = document.getElementById('battle-inventory-select');
  const inv = userData.inventory || [];
  if (inv.length === 0) { c.innerHTML = '<p class="text-slate-500 text-xs col-span-4 text-center">Inventory kosong.</p>'; return; }
  c.innerHTML = '';
  inv.forEach(w => {
    const curHp = w.currentHp ?? w.hp;
    const isDead = curHp <= 0;
    const isSel = selectedBattleInstanceId === w.instanceId;
    c.innerHTML += `
      <div onclick="${isDead ? '' : `selectBattleWaifu('${w.instanceId}')`}" class="cursor-pointer p-3 rounded-xl border ${isDead ? 'border-rose-900/40 bg-slate-900/50 opacity-50 cursor-not-allowed' : (isSel ? 'border-pink-500 bg-pink-950/30 shadow-lg':'border-slate-800 bg-slate-900')} flex items-center space-x-3 transition">
        <img src="${w.image}" class="w-10 h-10 rounded-lg object-cover">
        <div>
          <h5 class="font-bold text-xs text-white">${w.name} ${isDead ? '(HP Habis)' : ''}</h5>
          <p class="text-[10px] ${isDead ? 'text-rose-400' : 'text-pink-400'} font-mono">HP: ${curHp}/${w.hp} | ATK: ${w.attack}</p>
        </div>
      </div>
    `;
  });
}

function selectBattleWaifu(id) {
  playAudio('audio-pop');
  selectedBattleInstanceId = id;
  renderBattleSelection();
  document.getElementById('create-room-btn').disabled = false;
  document.getElementById('create-bot-room-btn').disabled = false;
}

async function renderOpenRooms(rooms) {
  const list = document.getElementById('open-rooms-list');
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
  const res = await fetch('/api/gacha', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'create_pvp_room', userId:currentUser.id, instanceId:selectedBattleInstanceId, isBot}) });
  const data = await res.json();
  if(data.success) {
    activeRoomId = data.roomId;
    document.getElementById('pvp-lobby').classList.add('hidden');
    document.getElementById('live-battle-room').classList.remove('hidden');
    setupRoomUI(data.room);
    startPollingRoom();
  } else {
    alert(data.error);
  }
}

async function joinPvPRoom(roomId) {
  if (!selectedBattleInstanceId) return alert('Pilih waifu andalan Anda terlebih dahulu di bawah!');
  const res = await fetch('/api/gacha', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'join_pvp_room', userId:currentUser.id, instanceId:selectedBattleInstanceId, roomId}) });
  const data = await res.json();
  if(data.success) {
    activeRoomId = data.roomId;
    document.getElementById('pvp-lobby').classList.add('hidden');
    document.getElementById('live-battle-room').classList.remove('hidden');
    startPollingRoom();
  } else {
    alert(data.error);
  }
}

async function setPlayerReady() {
  playAudio('audio-pop');
  if (!activeRoomId) return;
  const res = await fetch('/api/gacha', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'player_ready', userId:currentUser.id, roomId:activeRoomId}) });
  const data = await res.json();
  if(data.success) {
    document.getElementById('ready-btn').disabled = true;
    document.getElementById('ready-btn').innerText = '✓ READY';
    document.getElementById('ready-btn').className = 'px-8 py-3 bg-slate-800 text-slate-400 font-bold text-sm rounded-xl cursor-not-allowed';
  }
}

function setupRoomUI(room) {
  const isP1 = room.player1.id === currentUser.id;
  const me = isP1 ? room.player1 : room.player2;
  const op = isP1 ? room.player2 : room.player1;

  document.getElementById('p1-name').innerText = me ? me.name : 'Anda';
  document.getElementById('p1-img').src = me ? me.waifu.image : '';
  document.getElementById('p1-hp-text').innerText = me ? `HP: ${me.currentHp}/${me.maxHp}` : '';
  document.getElementById('p1-hp-bar').style.width = `${Math.max(0, (me.currentHp / me.maxHp) * 100)}%`;
  document.getElementById('p1-status-ready').innerText = me && me.ready ? "READY ✓" : "MENUNGGU READY...";
  document.getElementById('p1-status-ready').className = me && me.ready ? "text-emerald-400 font-bold" : "text-amber-400 font-bold";

  if (op) {
    document.getElementById('p2-name').innerText = op.name;
    document.getElementById('p2-img').src = op.waifu.image;
    document.getElementById('p2-hp-text').innerText = `HP: ${op.currentHp}/${op.maxHp}`;
    document.getElementById('p2-hp-bar').style.width = `${Math.max(0, (op.currentHp / op.maxHp) * 100)}%`;
    document.getElementById('p2-status-ready').innerText = op.ready ? "READY ✓" : "MENUNGGU READY...";
    document.getElementById('p2-status-ready').className = op.ready ? "text-emerald-400 font-bold" : "text-amber-400 font-bold";
    
    if (room.status === 'finished') {
      document.getElementById('room-status-badge').innerText = `Status: Pertarungan Selesai! Pemenang: ${room.winner}. Tekan Ready untuk Rematch!`;
      const readyBtn = document.getElementById('ready-btn');
      readyBtn.disabled = false;
      readyBtn.innerText = '✅ SIAP REMATCH (READY)';
      readyBtn.className = 'px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg transition';
    } else if (room.status === 'battling') {
      document.getElementById('room-status-badge').innerText = "Status: Pertarungan Sedang Berlangsung!";
    } else {
      document.getElementById('room-status-badge').innerText = "Status: Lawan Bergabung! Silakan tekan Ready.";
    }
  } else {
    document.getElementById('room-status-badge').innerText = "Status: Menunggu Lawan Bergabung ke Room...";
  }
}

function startPollingRoom() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    if (!activeRoomId) return;
    const res = await fetch(`/api/gacha?action=check_room&roomId=${activeRoomId}`);
    const data = await res.json();
    if (data.success && data.room) {
      const room = data.room;
      setupRoomUI(room);

      if (room.status === 'battling' && (!room.logs || room.logs.length === 0)) {
        const turnRes = await fetch('/api/gacha', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'get_pvp_status', userId:currentUser.id, roomId:activeRoomId}) });
        const turnData = await turnRes.json();
        if (turnData.success && turnData.room.status === 'finished') {
          renderBattleAnimationAndLogs(turnData.room.logs, turnData.room.winner, turnData.room);
          fetchUserData();
        }
      }
    }
  }, 2000);
}

// Live Online Users Tracker
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
    const res = await fetch(`/api/gacha?action=online_users`);
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
  logBox.innerHTML = '<p class="text-pink-400 animate-pulse">⚔️ Pertarungan Real-Time Dimulai...</p>';
  
  const isP1 = room.player1.id === currentUser.id;

  for (let i = 0; i < logs.length; i++) {
    await new Promise(r => setTimeout(r, 1200));
    playAudio('audio-pop');
    const l = logs[i];
    logBox.innerHTML += `<p>Turn ${l.turn}: <span class="text-pink-400">${l.attacker}</span> menyerang <span class="text-indigo-400">${l.defender}</span> sebesar <span class="text-rose-400">-${l.damage} DMG</span></p>`;
    logBox.scrollTop = logBox.scrollHeight;

    if (isP1) {
      document.getElementById('p1-hp-text').innerText = `HP: ${l.p1Hp}/${room.player1.maxHp}`;
      document.getElementById('p1-hp-bar').style.width = `${Math.max(0, (l.p1Hp / room.player1.maxHp) * 100)}%`;
      document.getElementById('p2-hp-text').innerText = `HP: ${l.p2Hp}/${room.player2.maxHp}`;
      document.getElementById('p2-hp-bar').style.width = `${Math.max(0, (l.p2Hp / room.player2.maxHp) * 100)}%`;
    } else {
      document.getElementById('p1-hp-text').innerText = `HP: ${l.p2Hp}/${room.player2.maxHp}`;
      document.getElementById('p1-hp-bar').style.width = `${Math.max(0, (l.p2Hp / room.player2.maxHp) * 100)}%`;
      document.getElementById('p2-hp-text').innerText = `HP: ${l.p1Hp}/${room.player1.maxHp}`;
      document.getElementById('p2-hp-bar').style.width = `${Math.max(0, (l.p1Hp / room.player1.maxHp) * 100)}%`;
    }
  }

  playAudio('audio-chime');
  logBox.innerHTML += `<p class="font-bold text-emerald-400 mt-2 text-sm">🎉 PEMENANG: ${winner}!</p>`;
  document.getElementById('room-status-badge').innerText = `Status: Pertarungan Selesai! Pemenang: ${winner}. Tekan Ready untuk Rematch!`;
  
  const readyBtn = document.getElementById('ready-btn');
  readyBtn.disabled = false;
  readyBtn.innerText = '✅ SIAP REMATCH (READY)';
  readyBtn.className = 'px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg transition';
}

async function leaveActiveRoom(roomId) {
  try {
    const res = await fetch('/api/gacha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'leave_room', userId: currentUser.id, roomId: roomId })
    });
    const data = await res.json();
    if (data.success) {
      alert("Room aktif berhasil dibersihkan! Silakan buat room baru.");
      window.location.reload();
    }
  } catch (e) {
    console.error("Gagal menghapus room", e);
  }
}

async function leaveRoom() {
  if (activeRoomId) {
    await fetch('/api/gacha', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'leave_room', userId:currentUser.id, roomId:activeRoomId}) });
  }
  if (pollInterval) clearInterval(pollInterval);
  activeRoomId = null;
  document.getElementById('live-battle-room').classList.add('hidden');
  document.getElementById('pvp-lobby').classList.remove('hidden');
  document.getElementById('ready-btn').disabled = false;
  document.getElementById('ready-btn').innerText = '✅ SIAP (READY)';
  document.getElementById('ready-btn').className = 'px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg transition';
  fetchUserData();
}

window.addEventListener('DOMContentLoaded', () => { initAuthAndData(); });
