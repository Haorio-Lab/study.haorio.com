const rawData = window.JUMO_SAMPLE_DATA;
const files = rawData.files?.length
  ? rawData.files
  : [{ id: "legacy-file", name: rawData.source || "샘플", cards: rawData.cards || [], summary: {} }];
const ALL_FILES_ID = "all-files";

const USER_STORE_KEY = "jumo.prototype.userStore.v2";
const APP_PROGRESS_KEY = "jumo";
const PROGRESS_RESOURCE_KEY = "known-cards";
const progressClient = window.HaorioStudyProgress;

let userStore = loadUserStore();

const CAN_SYNC_PROGRESS = Boolean(progressClient);

const state = {
  fileId: ALL_FILES_ID,
  order: "sequential",
  cardVisibility: "unknown",
  cards: [],
  index: 0,
  answerOpen: false,
  answerPinned: false,
  auto: false,
  countdown: true,
  intervalSeconds: 30,
  startedAt: Date.now(),
  ticker: null,
  audioContext: null,
  audioUnlocked: false,
  lastBeepSecond: null,
  currentUser: "",
  currentUserLabel: "",
  isGuestMode: false,
  syncStatus: CAN_SYNC_PROGRESS ? "계정 동기화 준비" : "로컬 저장 모드",
  dialogImages: [],
  dialogImageIndex: -1,
};

const els = {
  sourceText: document.querySelector("#sourceText"),
  counterText: document.querySelector("#counterText"),
  userStatusText: document.querySelector("#userStatusText"),
  userLogoutButton: document.querySelector("#userLogoutButton"),
  userCreateForm: document.querySelector("#userCreateForm"),
  userNameInput: document.querySelector("#userNameInput"),
  quickLoginList: document.querySelector("#quickLoginList"),
  userMessage: document.querySelector("#userMessage"),
  fileSelect: document.querySelector("#fileSelect"),
  orderSelect: document.querySelector("#orderSelect"),
  cardVisibilitySelect: document.querySelector("#cardVisibilitySelect"),
  intervalInput: document.querySelector("#intervalInput"),
  intervalLabel: document.querySelector("#intervalLabel"),
  autoButton: document.querySelector("#autoButton"),
  countdownButton: document.querySelector("#countdownButton"),
  timerText: document.querySelector("#timerText"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  shuffleButton: document.querySelector("#shuffleButton"),
  answerButton: document.querySelector("#answerButton"),
  pinAnswerButton: document.querySelector("#pinAnswerButton"),
  knownButton: document.querySelector("#knownButton"),
  fileBadge: document.querySelector("#fileBadge"),
  sheetBadge: document.querySelector("#sheetBadge"),
  intentBadge: document.querySelector("#intentBadge"),
  questionText: document.querySelector("#questionText"),
  knownProgressText: document.querySelector("#knownProgressText"),
  answerPanel: document.querySelector("#answerPanel"),
  sectionCountText: document.querySelector("#sectionCountText"),
  sectionsList: document.querySelector("#sectionsList"),
  imageDialog: document.querySelector("#imageDialog"),
  dialogImage: document.querySelector("#dialogImage"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function normalizeUserName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function readGuestMode() {
  return new URLSearchParams(window.location.search).get("mode") === "guest"
    || Boolean(progressClient?.isGuestMode?.());
}

function applyStudyAccount() {
  state.isGuestMode = readGuestMode();
  if (state.isGuestMode) {
    state.currentUser = "";
    state.currentUserLabel = "";
    state.cardVisibility = "all";
    state.syncStatus = "게스트 모드";
    return false;
  }

  const account = progressClient?.getAccount?.();
  if (!account?.id) {
    state.currentUser = "";
    state.currentUserLabel = "";
    state.syncStatus = CAN_SYNC_PROGRESS ? "로그인 정보를 기다리는 중" : "로컬 저장 모드";
    return false;
  }

  const changed = state.currentUser !== account.id;
  state.currentUser = account.id;
  state.currentUserLabel = account.label || "현재 계정";
  ensureLocalUser(state.currentUser, state.currentUserLabel);
  saveUserStore();
  if (changed) state.syncStatus = "계정 연결 완료";
  return changed;
}

function currentUserLabel() {
  return state.currentUserLabel || "현재 계정";
}

function resetTimer() {
  state.startedAt = Date.now();
  state.lastBeepSecond = null;
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!state.audioContext) {
    state.audioContext = new AudioContextClass();
  }
  return state.audioContext;
}

async function unlockAudio() {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return;
    }
  }

  if (!state.audioUnlocked) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.01);
    state.audioUnlocked = true;
  }
}

function playBeep(frequency = 880, duration = 0.12) {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function loadUserStore() {
  try {
    const saved = localStorage.getItem(USER_STORE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return parsed?.users && parsed?.knownByUser ? parsed : { users: [], knownByUser: {} };
  } catch {
    return { users: [], knownByUser: {} };
  }
}

function saveUserStore() {
  localStorage.setItem(USER_STORE_KEY, JSON.stringify(userStore));
}

async function refreshRemoteUsers() {
  await syncUserFromRemote(state.currentUser);
}

async function syncUserFromRemote(name = state.currentUser) {
  if (state.isGuestMode) {
    state.syncStatus = "게스트 모드";
    render();
    return;
  }

  if (!CAN_SYNC_PROGRESS || !name) {
    state.syncStatus = "이 브라우저에만 저장됩니다.";
    render();
    return;
  }

  try {
    state.syncStatus = "학습 기록 동기화 중";
    renderUserAccounts();
    const payload = await progressClient.loadKnown(APP_PROGRESS_KEY, PROGRESS_RESOURCE_KEY);
    if (payload.account?.id && payload.account.id !== state.currentUser) {
      applyStudyAccount();
      name = state.currentUser;
    }
    const remoteKnown = new Set(Array.isArray(payload.known) ? payload.known : []);
    const localKnown = new Set(userStore.knownByUser[name] || []);
    const mergedKnown = [...new Set([...remoteKnown, ...localKnown])];
    ensureLocalUser(name, currentUserLabel());
    userStore.knownByUser[name] = mergedKnown;
    saveUserStore();

    if (mergedKnown.length !== remoteKnown.size) {
      await saveRemoteProgress(name);
    }

    state.syncStatus = "동기화 완료";
    buildDeck({ keepCurrent: true });
  } catch (error) {
    state.syncStatus = "동기화 실패, 이 브라우저 기록으로 계속합니다.";
    render();
  }
}

async function saveRemoteProgress(name = state.currentUser) {
  if (!CAN_SYNC_PROGRESS || !name) return;

  try {
    const known = userStore.knownByUser[name] || [];
    await progressClient.saveKnown(APP_PROGRESS_KEY, PROGRESS_RESOURCE_KEY, known);
    state.syncStatus = "저장 완료";
    renderUserAccounts();
  } catch (error) {
    state.syncStatus = "저장 실패, 이 브라우저에는 저장됨";
    renderUserAccounts();
  }
}

function ensureLocalUser(name, label = name) {
  const existing = userStore.users.find((user) => user.name === name);
  if (!existing) {
    userStore.users.push({ name, label, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() });
  } else {
    existing.label = label || existing.label || name;
    existing.lastLoginAt = new Date().toISOString();
  }
  if (!userStore.knownByUser[name]) {
    userStore.knownByUser[name] = [];
  }
}

function getCurrentKnownList() {
  if (!state.currentUser) return [];
  if (!userStore.knownByUser[state.currentUser]) {
    userStore.knownByUser[state.currentUser] = [];
  }
  return userStore.knownByUser[state.currentUser];
}

function getCurrentKnownSet() {
  return new Set(getCurrentKnownList());
}

function isKnown(cardId) {
  return getCurrentKnownSet().has(cardId);
}

async function setKnown(cardId, value) {
  if (!state.currentUser) return;
  const known = getCurrentKnownSet();
  if (value) {
    known.add(cardId);
  } else {
    known.delete(cardId);
  }
  userStore.knownByUser[state.currentUser] = [...known];
  saveUserStore();
  await saveRemoteProgress();
}

function allCards() {
  return files.flatMap((file) => file.cards || []);
}

function currentFile() {
  if (state.fileId === ALL_FILES_ID) {
    return {
      id: ALL_FILES_ID,
      name: "전체",
      cards: allCards(),
      summary: rawData.summary || {},
    };
  }
  return files.find((file) => file.id === state.fileId) || files[0];
}

function currentCard() {
  return state.cards[state.index];
}

function selectedSourceCards() {
  if (state.fileId === ALL_FILES_ID) return allCards();
  return currentFile()?.cards || [];
}

function visibleSourceCards() {
  const source = selectedSourceCards();
  if (state.cardVisibility === "unknown" && state.currentUser) {
    return source.filter((card) => !isKnown(card.id));
  }
  return source;
}

function knownCount(cards = allCards()) {
  if (!state.currentUser) return 0;
  return cards.filter((card) => isKnown(card.id)).length;
}

function shuffle(cards) {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function buildDeck({ keepCurrent = false } = {}) {
  if (state.isGuestMode) {
    state.cardVisibility = "all";
  }

  const previousId = currentCard()?.id;
  const nextCards = visibleSourceCards();
  state.cards = state.order === "random" ? shuffle(nextCards) : [...nextCards];
  state.index = 0;

  if (keepCurrent && previousId) {
    const foundIndex = state.cards.findIndex((card) => card.id === previousId);
    state.index = foundIndex >= 0 ? foundIndex : 0;
  }

  if (state.index >= state.cards.length) {
    state.index = 0;
  }

  state.answerOpen = state.answerPinned && state.cards.length > 0;
  resetTimer();
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
}

function move(delta) {
  if (!state.cards.length) return;

  const previousCards = state.cards;
  const previousIndex = state.index;
  const activeCard = currentCard();

  if (state.cardVisibility === "unknown" && state.currentUser) {
    const availableCards = previousCards.filter((card) => !isKnown(card.id));

    if (!availableCards.length) {
      state.cards = [];
      state.index = 0;
      state.answerOpen = false;
      render();
      return;
    }

    let nextCard = null;
    const currentAvailableIndex = activeCard
      ? availableCards.findIndex((card) => card.id === activeCard.id)
      : -1;

    if (currentAvailableIndex >= 0) {
      nextCard = availableCards[
        (currentAvailableIndex + delta + availableCards.length) % availableCards.length
      ];
    } else {
      const direction = delta >= 0 ? 1 : -1;
      for (let step = 1; step <= previousCards.length; step += 1) {
        const candidate = previousCards[
          (previousIndex + direction * step + previousCards.length) % previousCards.length
        ];
        if (!isKnown(candidate.id)) {
          nextCard = candidate;
          break;
        }
      }
    }

    state.cards = availableCards;
    state.index = Math.max(0, state.cards.findIndex((card) => card.id === nextCard?.id));
  } else {
    state.index = (state.index + delta + state.cards.length) % state.cards.length;
  }

  state.answerOpen = state.answerPinned;
  resetTimer();
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
}

function toggleKnown() {
  const card = currentCard();
  if (!card) return;

  if (!state.currentUser) {
    els.userMessage.textContent = "아는 카드 체크는 로그인 후 사용할 수 있습니다.";
    return;
  }

  setKnown(card.id, !isKnown(card.id));
  render();
}

function toggleAnswer() {
  if (!currentCard()) return;
  state.answerOpen = !state.answerOpen;
  if (!state.answerOpen) {
    state.answerPinned = false;
  }
  render();
}

function toggleAnswerPinned() {
  if (!currentCard()) return;
  state.answerPinned = !state.answerPinned;
  if (state.answerPinned) {
    state.answerOpen = true;
  }
  render();
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSelects() {
  els.fileSelect.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = ALL_FILES_ID;
  allOption.textContent = `전체 (${formatNumber(allCards().length)}문항)`;
  els.fileSelect.append(allOption);

  for (const file of files) {
    const option = document.createElement("option");
    option.value = file.id;
    option.textContent = `${file.name} (${formatNumber(file.cards?.length)}문항)`;
    els.fileSelect.append(option);
  }

  els.fileSelect.value = state.fileId;
  els.orderSelect.value = state.order;
  const unknownOption = els.cardVisibilitySelect.querySelector('option[value="unknown"]');
  const needsLogin = !state.currentUser;

  if (needsLogin && state.cardVisibility === "unknown") {
    state.cardVisibility = "all";
  }

  if (unknownOption) {
    unknownOption.disabled = needsLogin;
    unknownOption.textContent = needsLogin ? "모르는 카드만 (로그인 필요)" : "모르는 카드만";
  }

  els.cardVisibilitySelect.value = state.cardVisibility;
  els.cardVisibilitySelect.title = needsLogin ? "모르는 카드만 보려면 로그인해주세요." : "";
}

function renderUserAccounts() {
  const totalKnown = knownCount();
  const selectedKnown = knownCount(selectedSourceCards());
  const selectedTotal = selectedSourceCards().length;
  const statusParts = [];
  if (state.currentUser) {
    statusParts.push(`${currentUserLabel()} 연결됨`);
    statusParts.push(`전체 ${formatNumber(totalKnown)}장 체크`);
    statusParts.push(`현재 범위 ${formatNumber(selectedKnown)} / ${formatNumber(selectedTotal)}장`);
    if (state.syncStatus) statusParts.push(`(${state.syncStatus})`);
  } else {
    statusParts.push(state.isGuestMode ? "게스트 모드 · 전체 카드만 볼 수 있습니다." : "로그인 정보를 확인하는 중입니다.");
  }

  els.userLogoutButton.hidden = !state.currentUser;
  els.userStatusText.textContent = statusParts.join(" · ");
  els.quickLoginList.innerHTML = "";

  if (!userStore.users.length) {
    const empty = document.createElement("span");
    empty.className = "quick-empty";
    empty.textContent = "저장된 계정 없음";
    els.quickLoginList.append(empty);
    return;
  }

  for (const user of userStore.users) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `quick-login${user.name === state.currentUser ? " is-current" : ""}`;
    button.dataset.userName = user.name;
    const count = userStore.knownByUser[user.name]?.length || 0;
    button.textContent = `${user.label || user.name} (${formatNumber(count)})`;
    els.quickLoginList.append(button);
  }
}

function renderSections(card) {
  els.sectionsList.innerHTML = "";

  if (!card.sections.length) {
    const empty = document.createElement("article");
    empty.className = "section-row";
    empty.innerHTML = "<p class=\"empty-text\">이 카드에는 추출된 답안이 없습니다.</p>";
    els.sectionsList.append(empty);
    return;
  }

  for (const [index, section] of card.sections.entries()) {
    const article = document.createElement("article");
    const images = section.images.map((image, imageIndex) => `
      <button class="image-card" type="button" data-src="${escapeText(image.src)}" data-alt="${escapeText(`${card.questionNo}번 ${section.row}행 이미지 ${imageIndex + 1}`)}">
        <img src="${escapeText(image.src)}" alt="${escapeText(`${card.questionNo}번 답안 참고 이미지`)}" loading="lazy" />
        <small>${image.width || "-"} × ${image.height || "-"} px</small>
      </button>
    `).join("");

    article.className = "section-row";
    article.innerHTML = `
      <div class="section-meta">${index + 1} / ${card.sections.length} · 이미지 ${section.images.length}개</div>
      <h4 class="section-title">${escapeText(section.title || `${section.row}행 답안`)}</h4>
      <pre class="section-body">${escapeText(section.body)}</pre>
      ${images ? `<div class="image-grid">${images}</div>` : ""}
    `;
    els.sectionsList.append(article);
  }
}

function renderEmptyState() {
  const hasAccountFilteredEmpty = state.cardVisibility === "unknown" && state.currentUser;
  state.answerPinned = false;
  els.counterText.textContent = `0 / 0`;
  els.fileBadge.textContent = currentFile()?.name || "-";
  els.sheetBadge.textContent = "-";
  els.intentBadge.textContent = hasAccountFilteredEmpty ? "모르는 카드 없음" : "카드 없음";
  els.questionText.textContent = hasAccountFilteredEmpty
    ? "현재 범위에서 모르는 카드가 없습니다."
    : "표시할 카드가 없습니다.";
  els.knownProgressText.textContent = hasAccountFilteredEmpty
    ? "전체 카드 보기로 바꾸거나 아는 카드를 해제하면 다시 볼 수 있습니다."
    : "다른 파일을 선택해보세요.";
  els.answerPanel.classList.add("is-hidden");
  els.answerButton.textContent = "답안 열기";
  els.pinAnswerButton.textContent = "답안 고정";
  els.pinAnswerButton.setAttribute("aria-pressed", "false");
  els.knownButton.textContent = "아는 카드";
  els.prevButton.disabled = true;
  els.nextButton.disabled = true;
  els.shuffleButton.disabled = true;
  els.answerButton.disabled = true;
  els.pinAnswerButton.disabled = true;
  els.knownButton.disabled = true;
  els.sectionCountText.textContent = "";
  els.sectionsList.innerHTML = "";
}

function renderCurrentCard(card) {
  const file = currentFile();
  const isCardKnown = state.currentUser ? isKnown(card.id) : false;
  const totalImages = card.sections.reduce((sum, section) => sum + section.images.length, 0);
  const selectedKnown = knownCount(selectedSourceCards());
  const selectedTotal = selectedSourceCards().length;

  els.counterText.textContent = `${state.index + 1} / ${state.cards.length}`;
  els.fileBadge.textContent = state.fileId === ALL_FILES_ID ? card.fileName : file?.name || card.fileName || "-";
  els.sheetBadge.textContent = `${card.sheet} · ${card.questionNo}번`;
  els.intentBadge.textContent = card.intent || "출제의도 없음";
  els.questionText.textContent = card.question || "(문제 텍스트 없음)";
  els.answerPanel.classList.toggle("is-hidden", !state.answerOpen);
  els.prevButton.disabled = false;
  els.nextButton.disabled = false;
  els.shuffleButton.disabled = false;
  els.answerButton.disabled = false;
  els.pinAnswerButton.disabled = false;
  els.answerButton.textContent = state.answerOpen ? "답안 닫기" : "답안 열기";
  els.answerButton.classList.toggle("is-on", state.answerOpen);
  els.pinAnswerButton.textContent = state.answerPinned ? "답안 고정 해제" : "답안 고정";
  els.pinAnswerButton.setAttribute("aria-pressed", String(state.answerPinned));
  els.knownButton.disabled = !state.currentUser;
  els.knownButton.textContent = isCardKnown ? "모르는 카드로 되돌리기" : "아는 카드로 체크";
  els.knownButton.setAttribute("aria-pressed", String(isCardKnown));
  els.knownProgressText.textContent = state.currentUser
    ? `${currentUserLabel()}: 현재 범위 ${formatNumber(selectedKnown)} / ${formatNumber(selectedTotal)}장 체크`
    : "모르는 카드만 보기와 아는 카드 체크는 로그인 후 사용할 수 있습니다.";
  els.sectionCountText.textContent = `${card.sections.length}개 조각 · 이미지 ${totalImages}개`;
  renderSections(card);
}

function render() {
  const file = currentFile();
  const totalCards = rawData.summary?.cards ?? allCards().length;
  const totalImages = rawData.summary?.images ?? 0;
  const modeText = state.order === "random" ? "랜덤" : "순차";
  const visibilityText = state.cardVisibility === "unknown" && state.currentUser ? "모르는 카드만" : "전체 카드";

  els.sourceText.textContent = `${formatNumber(files.length)}개 파일 · ${formatNumber(totalCards)}문항 · 이미지 ${formatNumber(totalImages)}개 · ${file?.name || "-"} · ${modeText} · ${visibilityText}`;
  els.intervalLabel.textContent = `${state.intervalSeconds}초`;
  els.autoButton.classList.toggle("is-on", state.auto);
  els.autoButton.setAttribute("aria-pressed", String(state.auto));
  els.countdownButton.classList.toggle("is-on", state.countdown);
  els.countdownButton.setAttribute("aria-pressed", String(state.countdown));
  renderSelects();
  renderUserAccounts();

  const card = currentCard();
  if (!card) {
    renderEmptyState();
    return;
  }

  renderCurrentCard(card);
  renderTimer();
}

function renderTimer() {
  els.timerText.classList.remove("countdown");

  if (!state.auto) {
    els.timerText.textContent = "수동";
    return;
  }

  const elapsedSeconds = (Date.now() - state.startedAt) / 1000;
  const left = Math.max(0, state.intervalSeconds - elapsedSeconds);

  if (left <= 0) {
    playBeep(1040, 0.18);
    move(1);
    return;
  }

  if (state.countdown && left <= 3) {
    const beepSecond = Math.ceil(left);
    if (beepSecond !== state.lastBeepSecond) {
      state.lastBeepSecond = beepSecond;
      playBeep(beepSecond === 1 ? 1040 : 880, 0.1);
    }
    els.timerText.textContent = `${beepSecond}초`;
    els.timerText.classList.add("countdown");
    return;
  }

  els.timerText.textContent = `${Math.ceil(left)}초 후`;
}

function startTicker() {
  if (state.ticker) clearInterval(state.ticker);
  state.ticker = setInterval(renderTimer, 200);
}

async function createOrLoginUser(rawName) {
  const name = normalizeUserName(rawName);
  if (!name) {
    els.userMessage.textContent = "사용자 이름을 입력해주세요.";
    return;
  }

  const exists = userStore.users.some((user) => user.name === name);
  ensureLocalUser(name);
  const user = userStore.users.find((item) => item.name === name);
  if (user) user.lastLoginAt = new Date().toISOString();

  state.currentUser = name;
  state.isGuestMode = false;
  saveUserStore();
  els.userNameInput.value = "";
  els.userMessage.textContent = exists ? `${name} 계정으로 로그인했습니다.` : `${name} 계정을 만들고 로그인했습니다.`;
  await syncUserFromRemote(name);
}

async function loginUser(name) {
  ensureLocalUser(name);
  state.currentUser = name;
  state.isGuestMode = false;
  const user = userStore.users.find((item) => item.name === name);
  if (user) user.lastLoginAt = new Date().toISOString();
  saveUserStore();
  els.userMessage.textContent = `${name} 계정으로 로그인했습니다.`;
  await syncUserFromRemote(name);
}

function logoutUser() {
  applyStudyAccount();
  els.userMessage.textContent = "현재 로그인 계정을 기준으로 다시 연결했습니다.";
  buildDeck({ keepCurrent: true });
}

function getCurrentCardImages(card = currentCard()) {
  if (!card) return [];

  return card.sections.flatMap((section, sectionIndex) =>
    section.images.map((image, imageIndex) => ({
      src: image.src,
      alt: `${card.questionNo || ""} ${section.title || `section ${sectionIndex + 1}`} image ${imageIndex + 1}`,
    }))
  );
}

function renderDialogImage() {
  const image = state.dialogImages[state.dialogImageIndex];
  if (!image) return;

  els.dialogImage.src = image.src;
  els.dialogImage.alt = image.alt;
}

function openImage(src, alt) {
  const images = getCurrentCardImages();
  const matchingIndex = images.findIndex((image) => image.src === src);

  state.dialogImages = images.length ? images : [{ src, alt: alt || "" }];
  state.dialogImageIndex = matchingIndex >= 0 ? matchingIndex : 0;

  if (alt && state.dialogImages[state.dialogImageIndex]) {
    state.dialogImages[state.dialogImageIndex].alt = alt;
  }

  renderDialogImage();

  if (!els.imageDialog.open) {
    els.imageDialog.showModal();
  }
}

function closeImageDialog() {
  if (els.imageDialog.open) {
    els.imageDialog.close();
  }
}

function resetImageDialog() {
  state.dialogImages = [];
  state.dialogImageIndex = -1;
  els.dialogImage.removeAttribute("src");
  els.dialogImage.alt = "";
}

function moveDialogImage(delta) {
  if (!els.imageDialog.open || state.dialogImages.length < 2) return;

  state.dialogImageIndex = (
    state.dialogImageIndex + delta + state.dialogImages.length
  ) % state.dialogImages.length;
  renderDialogImage();
}

function wireEvents() {
  els.fileSelect.addEventListener("change", () => {
    state.fileId = els.fileSelect.value;
    buildDeck();
  });

  els.orderSelect.addEventListener("change", () => {
    state.order = els.orderSelect.value;
    buildDeck({ keepCurrent: true });
  });

  els.cardVisibilitySelect.addEventListener("change", () => {
    if (!state.currentUser && els.cardVisibilitySelect.value === "unknown") {
      state.cardVisibility = "all";
      els.userMessage.textContent = "모르는 카드만 보려면 로그인해주세요.";
      buildDeck({ keepCurrent: true });
      return;
    }

    state.cardVisibility = els.cardVisibilitySelect.value;
    buildDeck({ keepCurrent: true });
  });

  els.intervalInput.addEventListener("input", () => {
    state.intervalSeconds = Number(els.intervalInput.value);
    resetTimer();
    render();
  });

  els.autoButton.addEventListener("click", () => {
    state.auto = !state.auto;
    if (state.auto) unlockAudio();
    resetTimer();
    render();
  });

  els.countdownButton.addEventListener("click", () => {
    state.countdown = !state.countdown;
    render();
  });

  els.prevButton.addEventListener("click", () => move(-1));
  els.nextButton.addEventListener("click", () => move(1));
  els.shuffleButton.addEventListener("click", () => buildDeck());
  els.answerButton.addEventListener("click", toggleAnswer);
  els.pinAnswerButton.addEventListener("click", toggleAnswerPinned);
  els.knownButton.addEventListener("click", toggleKnown);
  els.closeDialogButton.addEventListener("click", closeImageDialog);
  els.imageDialog.addEventListener("click", closeImageDialog);
  els.imageDialog.addEventListener("close", resetImageDialog);

  els.userCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createOrLoginUser(els.userNameInput.value);
  });

  els.userLogoutButton.addEventListener("click", logoutUser);
  els.quickLoginList.addEventListener("click", async (event) => {
    const button = event.target.closest(".quick-login");
    if (button) await loginUser(button.dataset.userName);
  });

  els.sectionsList.addEventListener("click", (event) => {
    const button = event.target.closest(".image-card");
    if (!button) return;
    openImage(button.dataset.src, button.dataset.alt);
  });

  window.addEventListener("keydown", (event) => {
    const tagName = event.target?.tagName;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tagName)) return;
    if (els.imageDialog.open) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveDialogImage(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveDialogImage(1);
        return;
      }
      if (event.key !== "Escape") {
        event.preventDefault();
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    }
    if (event.key === "ArrowRight" || event.key === " ") {
      event.preventDefault();
      move(1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      toggleAnswer();
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      toggleKnown();
    }
  });

  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("touchstart", unlockAudio, { once: true });

  window.HaorioRemoteInput?.installKeyboardBridge();
}

applyStudyAccount();
renderSelects();
wireEvents();
window.addEventListener(progressClient?.authChangeEvent || "haorio-study-auth-change", async () => {
  applyStudyAccount();
  buildDeck({ keepCurrent: true });
  await syncUserFromRemote(state.currentUser);
});
buildDeck();
startTicker();
refreshRemoteUsers();
