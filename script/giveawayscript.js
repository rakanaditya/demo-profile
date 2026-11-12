const OWNER_ID = '628205121704296458';
const ADMIN_IDS = [
  '628205121704296458', // Owner
  '1128149108566269962', // Admin 1
  '995913592253710356'  // Admin 2
];

let currentUser = null;
let timerIntervals = [];
let isMuted = false;
let isLiveMode = false;
let isRollingActive = false;
let triggeredRollIds = new Set();

function toggleAudioMute() {
  isMuted = !isMuted;
  document.getElementById('audio-icon').innerText = isMuted ? '🔇' : '🔊';
  document.getElementById('audio-text').innerText = isMuted ? 'Sound OFF' : 'Sound ON';
}

function playAudio(id) {
  if (isMuted) return;
  try {
    const audio = document.getElementById(id);
    if (audio) { audio.currentTime = 0; audio.play().catch(e => {}); }
  } catch(e) {}
}

function toggleLiveDisplayMode() {
  isLiveMode = !isLiveMode;
  const header = document.getElementById('main-header');
  const footer = document.getElementById('main-footer');
  const mainContent = document.getElementById('main-content');

  if (isLiveMode) {
    header.classList.add('hidden');
    footer.classList.add('hidden');
    mainContent.classList.add('hidden');
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(e => {});
    }
  } else {
    header.classList.remove('hidden');
    footer.classList.remove('hidden');
    mainContent.classList.remove('hidden');
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(e => {});
    }
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isLiveMode) toggleLiveDisplayMode();
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && isLiveMode) {
    isLiveMode = false;
    document.getElementById('main-header').classList.remove('hidden');
    document.getElementById('main-footer').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');
  }
});

function showToast(msg, isError = false) {
  const existingToast = document.getElementById('custom-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.id = 'custom-toast';
  toast.className = `fixed bottom-5 right-5 z-50 ${isError ? 'bg-rose-600 border-rose-400' : 'bg-emerald-600 border-emerald-400'} text-white px-5 py-3 rounded-xl shadow-2xl border text-xs sm:text-sm font-medium flex items-center space-x-2 animate-bounce`;
  toast.innerHTML = `<span>${isError ? '❌' : '✅'}</span><span>${msg}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

async function safeFetchJson(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { return { success: false, error: `Server Error (${res.status})` }; }
  } catch (err) { return { success: false, error: "Gagal menghubungkan ke jaringan." }; }
}

function triggerWebhook(payload) {
  fetch('/api/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(e => {});
}

function initAuth() {
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

  if (currentUser && currentUser.id) {
    document.getElementById('login-alert').classList.add('hidden');
    document.getElementById('user-badge').classList.remove('hidden');
    document.getElementById('nav-name').innerText = currentUser.global_name || currentUser.username;
    document.getElementById('nav-avatar').src = currentUser.avatar 
      ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
      : 'https://cdn.discordapp.com/embed/avatars/0.png';

    if (ADMIN_IDS.includes(currentUser.id)) {
      document.getElementById('owner-panel').classList.remove('hidden');
    }
    if (currentUser.id === OWNER_ID) {
      const activityNav = document.getElementById('nav-activity-log');
      if (activityNav) activityNav.classList.remove('hidden');
    }

    // Mulai tracker online user
    startOnlineTracker();
  }
}

function logoutSession() {
  localStorage.removeItem('discord_user');
  window.location.reload();
}

function getAvatarUrl(p) {
  return p.avatar 
    ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png` 
    : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

// Live Online Users Tracker (5 menit terakhir)
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

function runCountdownSequence(onComplete) {
  const overlay = document.getElementById('countdown-overlay');
  const numElem = document.getElementById('countdown-number');
  overlay.classList.remove('hidden');
  
  const steps = [
    { text: '5', sound: 'audio-tick', class: 'animate-zoom-glow' },
    { text: '4', sound: 'audio-tick', class: 'animate-zoom-glow' },
    { text: '3', sound: 'audio-shake', class: 'animate-shake' },
    { text: '2', sound: 'audio-tick', class: 'animate-zoom-glow' },
    { text: '1', sound: 'audio-dramatic', class: 'animate-flash' },
    { text: 'GET READY...', sound: 'audio-pop', class: 'animate-pulse' }
  ];

  let index = 0;
  function nextStep() {
    if (index >= steps.length) {
      overlay.classList.add('hidden');
      if (onComplete) onComplete();
      return;
    }
    const step = steps[index];
    numElem.innerText = step.text;
    playAudio(step.sound);
    numElem.className = "text-5xl sm:text-8xl font-black text-white tracking-tighter drop-shadow-[0_0_35px_rgba(234,179,8,0.8)] " + step.class;
    index++;
    setTimeout(nextStep, step.text === 'GET READY...' ? 1200 : 1000);
  }
  nextStep();
}

function startRollingAnimation(participants, winners, giveawayTitle, prize, onFinish) {
  isRollingActive = true;
  const modal = document.getElementById('rolling-modal');
  const track = document.getElementById('roll-track');
  const carouselContainer = document.getElementById('carousel-container');
  const statusBadge = document.getElementById('status-badge');
  const winnerInfo = document.getElementById('winner-display-info');
  const refreshIndicator = document.getElementById('refresh-indicator');
  const refreshTimerVal = document.getElementById('refresh-timer-val');

  modal.classList.remove('hidden');
  carouselContainer.classList.remove('hidden');
  winnerInfo.classList.add('hidden');
  refreshIndicator.classList.add('hidden');
  
  statusBadge.innerText = 'ROLLING...';
  statusBadge.className = 'inline-block px-4 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full text-xs font-bold tracking-wide uppercase animate-pulse';

  let displayList = [];
  for (let i = 0; i < 30; i++) {
    const shuffled = [...participants].sort(() => 0.5 - Math.random());
    displayList = displayList.concat(shuffled);
  }
  const firstWinner = winners[0];
  displayList.push(firstWinner);

  const winnerIndex = participants.findIndex(p => p.id === firstWinner.id);

  track.innerHTML = displayList.map((p) => `
    <div class="flex-shrink-0 w-24 sm:w-28 bg-slate-900 border border-slate-700 rounded-xl p-3 flex flex-col items-center space-y-2 shadow-lg">
      <img src="${getAvatarUrl(p)}" class="w-14 h-14 rounded-full object-cover border-2 border-indigo-500 shadow-md">
      <span class="text-[10px] font-bold text-slate-300 truncate w-full">${p.global_name || p.username}</span>
      <span class="text-[9px] font-mono text-slate-500 truncate w-full">@${p.username}</span>
    </div>
  `).join('');

  let currentPos = 0;
  const totalItems = displayList.length;
  const itemWidth = 120;
  const maxScroll = (totalItems - 3) * itemWidth;

  const rollInterval = setInterval(() => {
    playAudio('audio-pop');
    currentPos += 45;
    if (currentPos >= maxScroll) currentPos = 0;
    track.style.transform = `translateX(-${currentPos}px)`;
  }, 60);

  setTimeout(() => {
    clearInterval(rollInterval);

    const targetScroll = (totalItems - 2.5) * itemWidth;
    track.style.transition = 'transform 0.8s cubic-bezier(0.15, 0.85, 0.35, 1)';
    track.style.transform = `translateX(-${targetScroll}px)`;

    setTimeout(() => {
      playAudio('audio-win');
      
      statusBadge.innerText = 'WINNER SELECTED';
      statusBadge.className = 'inline-block px-4 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-bold tracking-wide uppercase animate-bounce';

      carouselContainer.classList.add('hidden');
      winnerInfo.classList.remove('hidden');

      document.getElementById('winner-profile-avatar').src = getAvatarUrl(firstWinner);
      document.getElementById('winner-entry-badge').innerText = `#${winnerIndex !== -1 ? winnerIndex + 1 : 1}`;
      document.getElementById('winner-profile-globalname').innerText = firstWinner.global_name || firstWinner.username;
      document.getElementById('winner-profile-username').innerText = `@${firstWinner.username}`;

      refreshIndicator.classList.remove('hidden');
      let refreshSeconds = 10;
      refreshTimerVal.innerText = refreshSeconds;

      const refreshCountdown = setInterval(() => {
        refreshSeconds--;
        refreshTimerVal.innerText = refreshSeconds;
        if (refreshSeconds <= 0) {
          clearInterval(refreshCountdown);
          window.location.reload();
        }
      }, 1000);

      if (onFinish) onFinish();
    }, 800);

  }, 4500);
}

async function loadGiveaways() {
  if (isRollingActive) return;
  timerIntervals.forEach(clearInterval);
  timerIntervals = [];

  const container = document.getElementById('giveaway-list');
  const data = await safeFetchJson('/api/giveaway');

  if (data.success && data.data && data.data.length > 0) {
    container.innerHTML = '';
    data.data.forEach(gw => {
      const isAdmin = currentUser && ADMIN_IDS.includes(currentUser.id);
      const participants = gw.participants || [];
      const isJoined = currentUser && participants.some(p => p.id === currentUser.id);
      const isEnded = gw.status === 'ended';
      const isClaimed = gw.status === 'claimed';

      let statusText = 'READY';
      let statusStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

      if (isEnded) {
        statusText = 'WAITING CLAIM (5 MIN)';
        statusStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      } else if (isClaimed) {
        statusText = 'COMPLETED (SUCCESSFULLY CLAIMED)';
        statusStyle = 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40';
      }

      const card = document.createElement('div');
      card.className = 'bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4 relative overflow-hidden shadow-lg';

      let winnersHTML = '';
      let isUserWinner = false;

      if ((isEnded || isClaimed) && gw.winners && gw.winners.length > 0) {
        isUserWinner = currentUser && gw.winners.some(w => w.id === currentUser.id);

        winnersHTML = `
          <div class="bg-gradient-to-r from-emerald-950/80 to-slate-900 border border-emerald-500/40 p-3 rounded-xl space-y-2">
            <span class="font-bold text-xs text-emerald-400 flex items-center space-x-1">
              <span>🏆 WINNER SELECTED:</span>
            </span>
            <div class="flex flex-wrap gap-2">
              ${gw.winners.map(w => {
                const wIndex = participants.findIndex(p => p.id === w.id);
                return `
                  <div class="flex items-center space-x-2 bg-emerald-900/40 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                    <span class="text-[10px] bg-emerald-500 text-slate-950 font-black px-1.5 py-0.5 rounded-full">#${wIndex !== -1 ? wIndex + 1 : 1}</span>
                    <img src="${getAvatarUrl(w)}" class="w-5 h-5 rounded-full object-cover">
                    <span class="text-xs font-semibold text-white">${w.global_name || w.username}</span>
                  </div>
                `;
              }).join('')}
            </div>
            ${isEnded ? `<div id="claim-timer-${gw._id}" class="text-[11px] font-mono text-amber-300 pt-1">⏳ Batas Waktu Klaim: Menghitung...</div>` : ''}
          </div>
        `;
      }

      let avatarsPreviewHTML = '';
      if (participants.length > 0) {
        avatarsPreviewHTML = `
          <div class="flex items-center space-x-2 pt-1">
            <div class="flex -space-x-2 overflow-hidden">
              ${participants.slice(0, 5).map((p, idx) => `
                <div class="relative inline-block">
                  <img class="h-6 w-6 rounded-full ring-2 ring-slate-900 object-cover" src="${getAvatarUrl(p)}" title="#${idx + 1} - ${p.global_name || p.username}">
                </div>
              `).join('')}
            </div>
            ${participants.length > 5 ? `<span class="text-[10px] text-slate-400">+${participants.length - 5} lainnya</span>` : ''}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="space-y-3">
          <div class="flex justify-between items-start">
            <h4 class="font-bold text-lg text-white leading-tight">${gw.title}</h4>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle}">${statusText}</span>
          </div>
          <p class="text-xs text-indigo-400 font-medium">🎁 Hadiah: ${gw.prize}</p>
          <p class="text-xs text-slate-400">${gw.description || 'Tidak ada deskripsi.'}</p>
          
          ${gw.endsAt && !isEnded && !isClaimed ? `<div id="timer-${gw._id}" class="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg w-fit">⏳ Menghitung...</div>` : ''}

          <div class="flex items-center justify-between border-t border-slate-800/60 pt-2">
            <div class="space-y-1">
              <p class="text-[11px] text-slate-400">👥 Total Peserta: <span class="font-bold text-white">${participants.length}</span></p>
              ${avatarsPreviewHTML}
            </div>
            <button onclick="openParticipantsModal('${encodeURIComponent(JSON.stringify(participants))}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition border border-slate-700 flex items-center space-x-1">
              <span>ℹ️ Participants</span>
            </button>
          </div>
          ${winnersHTML}
        </div>

        <div class="space-y-2 pt-2 border-t border-slate-800/60">
          ${!isEnded && !isClaimed ? `
            <button onclick="joinGiveaway('${gw._id}')" ${isJoined ? 'disabled' : ''} class="w-full py-2 px-4 ${isJoined ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'} rounded-xl text-xs font-semibold transition">
              ${isJoined ? '✓ Sudah Mengikuti' : '🎉 Ikuti Giveaway'}
            </button>
          ` : ''}

          ${isEnded && isUserWinner ? `
            <button onclick="openClaimModal('${gw._id}')" class="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30 animate-pulse">
              🎁 KLAIM HADIAH SEKARANG (CLAIM)
            </button>
          ` : ''}

          ${isClaimed ? `
            <div class="w-full py-2 px-4 bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 rounded-xl text-xs font-semibold text-center">
              ✅ Successfully Claimed (Completed)
            </div>
          ` : ''}

          ${isAdmin ? `
            <div class="space-y-2 pt-1">
              <div class="flex space-x-2">
                ${!isEnded && !isClaimed ? `<button onclick="triggerRollStart('${gw._id}')" class="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium transition">🎲 START ROLL</button>` : ''}
                ${isEnded ? `<button onclick="rerollGiveaway('${gw._id}')" class="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition">🔄 REROLL</button>` : ''}
                <button onclick="deleteGiveaway('${gw._id}')" class="flex-1 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg text-xs font-medium transition border border-rose-500/30">🗑️ Hapus</button>
              </div>
              ${isEnded ? `
                <button onclick="completeGiveaway('${gw._id}')" class="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-emerald-600/20 flex items-center justify-center space-x-1">
                  <span>✅ Selesaikan Giveaway (Mark as Completed)</span>
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>
      `;

      container.appendChild(card);

      if (gw.endsAt && !isEnded && !isClaimed) {
        const timerElem = document.getElementById(`timer-${gw._id}`);
        const endTime = new Date(gw.endsAt).getTime();

        const interval = setInterval(() => {
          const now = new Date().getTime();
          const distance = endTime - now;

          if (distance <= 0) {
            clearInterval(interval);
            timerElem.innerText = '🎲 Waktu Habis! Mengocok Pemenang...';
            if (!triggeredRollIds.has(gw._id)) {
              triggeredRollIds.add(gw._id);
              triggerAutoRoll(gw._id);
            }
          } else {
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            let timerStr = '⏳ Sisa Waktu: ';
            if (days > 0) timerStr += `${days}h `;
            if (hours > 0 || days > 0) timerStr += `${hours}j `;
            timerStr += `${minutes}m ${seconds}s`;
            timerElem.innerText = timerStr;
          }
        }, 1000);
        timerIntervals.push(interval);
      }

      if (isEnded && gw.claimExpiresAt) {
        const claimTimerElem = document.getElementById(`claim-timer-${gw._id}`);
        const expireTime = new Date(gw.claimExpiresAt).getTime();

        const claimInterval = setInterval(() => {
          const now = new Date().getTime();
          const distance = expireTime - now;

          if (distance <= 0) {
            clearInterval(claimInterval);
            if (claimTimerElem) claimTimerElem.innerText = '⚠️ Waktu klaim habis! Silakan lakukan Reroll.';
          } else {
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            if (claimTimerElem) claimTimerElem.innerText = `⏳ Batas Waktu Klaim: ${minutes}m ${seconds}s lagi`;
          }
        }, 1000);
        timerIntervals.push(claimInterval);
      }
    });
  } else if (data.success && data.data.length === 0) {
    container.innerHTML = '<p class="text-slate-500 text-sm col-span-2">Belum ada giveaway yang dibuat.</p>';
  } else {
    container.innerHTML = `<p class="text-rose-400 text-sm col-span-2">Gagal memuat data giveaway.</p>`;
  }
}

// Modal Form Klaim Hadiah
function openClaimModal(giveawayId) {
  if (!currentUser) return showToast('Silakan login terlebih dahulu!', true);
  document.getElementById('claim-giveaway-id').value = giveawayId;
  document.getElementById('claim-username').value = currentUser.username || '';
  document.getElementById('claim-discord-id').value = currentUser.id || '';
  document.getElementById('claim-modal').classList.remove('hidden');
}

function closeClaimModal() {
  document.getElementById('claim-modal').classList.add('hidden');
  document.getElementById('claim-form').reset();
}

document.getElementById('claim-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn.dataset.submitting === 'true') return;
  submitBtn.dataset.submitting = 'true';
  
  const originalText = submitBtn.innerText;
  submitBtn.innerText = 'Mengirim Klaim...';
  submitBtn.disabled = true;
  submitBtn.classList.add('opacity-50', 'cursor-not-allowed');

  const giveawayId = document.getElementById('claim-giveaway-id').value;
  const discordUsername = document.getElementById('claim-username').value;
  const discordId = document.getElementById('claim-discord-id').value;
  const fileInput = document.getElementById('claim-proof-file');

  const formData = new FormData();
  formData.append('giveawayId', giveawayId);
  formData.append('discordUsername', discordUsername);
  formData.append('discordId', discordId);
  formData.append('user', JSON.stringify(currentUser));

  if (fileInput.files && fileInput.files[0]) {
    formData.append('proofFile', fileInput.files[0]);
  }

  try {
    await fetch('/api/webhooksnotif', {
      method: 'POST',
      body: formData
    });

    const data = await safeFetchJson('/api/giveaway', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'claim', 
        giveawayId, 
        user: currentUser,
        claimDetails: { discordUsername, discordId } 
      })
    });

    if (data.success) {
      playAudio('audio-win');
      closeClaimModal();
      showToast('🎉 Berhasil melakukan klaim! Data & bukti telah dikirim ke panitia.');
      loadGiveaways();
    } else {
      showToast(data.error || 'Gagal melakukan klaim.', true);
      submitBtn.dataset.submitting = 'false';
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  } catch (err) {
    showToast('Terjadi kesalahan jaringan.', true);
    submitBtn.dataset.submitting = 'false';
    submitBtn.innerText = originalText;
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
});

async function completeGiveaway(id) {
  if (!confirm('Yakin ingin menandai giveaway ini sebagai selesai (Successfully Claimed)?')) return;

  const data = await safeFetchJson('/api/giveaway', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'complete', giveawayId: id, user: currentUser })
  });

  if (data.success) {
    playAudio('audio-win');
    showToast('✅ Giveaway berhasil diselesaikan (Completed)!');
    loadGiveaways();
  } else {
    showToast(data.error || 'Gagal menyelesaikan giveaway.', true);
  }
}

async function triggerRollStart(id) {
  triggerWebhook({ type: 'roll_start' });
  runCountdownSequence(() => { rollGiveaway(id); });
}

async function triggerAutoRoll(id) {
  triggerWebhook({ type: 'roll_auto' });
  rollGiveaway(id);
}

async function rollGiveaway(id) {
  const data = await safeFetchJson('/api/giveaway', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'roll', giveawayId: id, user: currentUser })
  });

  if (data.success && data.data && data.data.winners && data.data.winners.length > 0) {
    const gw = data.data;
    const winners = gw.winners;
    const participants = gw.participants || winners;

    startRollingAnimation(participants, winners, gw.title, gw.prize, () => {
      triggerWebhook({ type: 'winner', giveaway: gw, winners: winners });
      const winnerNames = winners.map(w => w.global_name || w.username).join(', ');
      showToast(`Selamat! ${winnerNames} menang ${gw.prize}! Silakan klaim dalam 5 menit.`);
    });
  } else {
    showToast(data.error || 'Gagal mengocok pemenang.', true);
  }
}

async function rerollGiveaway(id) {
  if (!confirm('Apakah pemenang sebelumnya tidak mengklaim hadiah dan Anda ingin melakukan reroll (cari pemenang lain)?')) return;

  const data = await safeFetchJson('/api/giveaway', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reroll', giveawayId: id, user: currentUser })
  });

  if (data.success && data.data && data.data.winners && data.data.winners.length > 0) {
    const gw = data.data;
    const winners = gw.winners;
    const participants = gw.participants || winners;

    startRollingAnimation(participants, winners, gw.title, gw.prize, () => {
      const winnerNames = winners.map(w => w.global_name || w.username).join(', ');
      showToast(`Reroll Berhasil! Pemenang baru: ${winnerNames}`);
    });
  } else {
    showToast(data.error || 'Gagal melakukan reroll pemenang.', true);
  }
}

document.getElementById('create-giveaway-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser || !ADMIN_IDS.includes(currentUser.id)) {
    return showToast("Hanya Owner atau Admin yang dapat membuat giveaway!", true);
  }

  const payload = {
    title: document.getElementById('gw-title').value,
    prize: document.getElementById('gw-prize').value,
    winnersCount: document.getElementById('gw-winners').value,
    durationValue: document.getElementById('gw-duration-val').value,
    durationUnit: document.getElementById('gw-duration-unit').value,
    description: document.getElementById('gw-desc').value,
    userId: currentUser.id
  };

  const data = await safeFetchJson('/api/giveaway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (data.success) {
    triggerWebhook({ type: 'create', giveaway: data.data });
    showToast('Giveaway berhasil dibuat!');
    document.getElementById('create-giveaway-form').reset();
    loadGiveaways();
  } else {
    showToast(data.error || 'Gagal membuat giveaway.', true);
  }
});

async function joinGiveaway(id) {
  if (!currentUser) return showToast('Silakan login terlebih dahulu!', true);
  
  const data = await safeFetchJson('/api/giveaway', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'join', giveawayId: id, user: currentUser })
  });

  if (data.success) {
    playAudio('audio-chime');
    showToast('Berhasil mendaftar giveaway! Nomor urut Anda telah dicatat.');
    loadGiveaways();
  } else {
    showToast(data.error, true);
  }
}

async function deleteGiveaway(id) {
  if (!confirm('Yakin ingin menghapus giveaway ini?')) return;
  const data = await safeFetchJson('/api/giveaway', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ giveawayId: id, userId: currentUser.id })
  });

  if (data.success) {
    showToast('Giveaway berhasil dihapus!');
    loadGiveaways();
  } else {
    showToast(data.error, true);
  }
}

function openParticipantsModal(encodedData) {
  const participants = JSON.parse(decodeURIComponent(encodedData));
  const listContainer = document.getElementById('modal-participants-list');
  listContainer.innerHTML = '';

  if (participants.length === 0) {
    listContainer.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">Belum ada peserta yang mendaftar.</p>';
  } else {
    participants.forEach((p, index) => {
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800';
      item.innerHTML = `
        <div class="flex items-center space-x-3">
          <span class="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold text-xs flex items-center justify-center border border-amber-500/30">#${index + 1}</span>
          <img src="${getAvatarUrl(p)}" class="w-8 h-8 rounded-full object-cover border border-slate-700">
          <div>
            <p class="text-xs font-bold text-white leading-tight">${p.global_name || p.username}</p>
            <p class="text-[10px] text-slate-400">@${p.username}</p>
          </div>
        </div>
        <span class="text-[10px] text-emerald-400 font-mono">Urutan #${index + 1}</span>
      `;
      listContainer.appendChild(item);
    });
  }
  document.getElementById('participants-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('participants-modal').classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', () => {
  initAuth();
  loadGiveaways();
  setInterval(() => { loadGiveaways(); }, 30000);
});
