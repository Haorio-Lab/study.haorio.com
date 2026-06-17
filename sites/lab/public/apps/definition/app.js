const ORIGINAL_DATA = window.FLASHCARD_DATA;
const CARD_DATA_KEY = "bbikbbiki.cardData.v1";
const USER_STORE_KEY = "bbikbbiki.userStore.v1";
const APP_PROGRESS_KEY = "definition";
const PROGRESS_RESOURCE_KEY = "known-cards";
const COUNTDOWN_AUDIO_PATHS = {
  1: "./audio/countdown-1.mp3",
  2: "./audio/countdown-2.mp3",
  3: "./audio/countdown-3.mp3",
};
const progressClient = window.HaorioStudyProgress;
const CAN_SYNC_PROGRESS = Boolean(progressClient);
const SHEET_SPLIT_CONFIGS = [
  {
    sourceSheetName: "139단도리1차_삑삑이(90개 쓰기)",
    targetPrefix: "139단도리1차_삑삑이",
    dayLabels: ["1일차(5/1)", "2일차(5/2)", "3일차(5/3)", "4일차(5/4)", "5일차(5/5)"],
  },
];

let data = loadData();
let userStore = loadUserStore();

const state = {
  deckKey: "all-random",
  order: "sequential",
  cardVisibility: "unknown",
  cards: [],
  index: 0,
  auto: false,
  countdown: true,
  intervalSeconds: 30,
  stickyDefinition: false,
  stickyKeywords: false,
  showDefinition: false,
  showKeywords: false,
  startedAt: Date.now(),
  ticker: null,
  audioContext: null,
  audioUnlocked: false,
  countdownAudio: {},
  countdownBuffers: {},
  countdownTimers: [],
  lastBeepSecond: null,
  sprint: {
    active: false,
    complete: false,
    cards: [],
    index: 0,
    topicCount: 10,
    secondsPerTopic: 30,
    selectedCategories: null,
    scopeLabel: "전체 랜덤",
    topicStartedAt: Date.now(),
    countdownTimers: [],
    lastBeepSecond: null,
    previousAuto: false,
  },
  isAdmin: false,
  currentUser: "",
  currentUserLabel: "",
  isGuestMode: false,
  selectedAdminCardId: null,
  syncStatus: CAN_SYNC_PROGRESS ? "계정 동기화 준비" : "로컬 저장 모드",
};

const els = {
  deckSummary: document.querySelector("#deckSummary"),
  deckSelect: document.querySelector("#deckSelect"),
  orderSelect: document.querySelector("#orderSelect"),
  cardVisibilitySelect: document.querySelector("#cardVisibilitySelect"),
  intervalInput: document.querySelector("#intervalInput"),
  intervalLabel: document.querySelector("#intervalLabel"),
  autoButton: document.querySelector("#autoButton"),
  countdownButton: document.querySelector("#countdownButton"),
  stickyDefinitionButton: document.querySelector("#stickyDefinitionButton"),
  stickyKeywordsButton: document.querySelector("#stickyKeywordsButton"),
  sprintButton: document.querySelector("#sprintButton"),
  userStatusText: document.querySelector("#userStatusText"),
  userLogoutButton: document.querySelector("#userLogoutButton"),
  userCreateForm: document.querySelector("#userCreateForm"),
  userNameInput: document.querySelector("#userNameInput"),
  accountHelpButton: document.querySelector("#accountHelpButton"),
  accountHelpPopup: document.querySelector("#accountHelpPopup"),
  userMessage: document.querySelector("#userMessage"),
  quickLoginList: document.querySelector("#quickLoginList"),
  studyView: document.querySelector("#studyView"),
  sprintView: document.querySelector("#sprintView"),
  adminView: document.querySelector("#adminView"),
  backToStudyButton: document.querySelector("#backToStudyButton"),
  adminSearchInput: document.querySelector("#adminSearchInput"),
  adminSheetFilter: document.querySelector("#adminSheetFilter"),
  resetEditsButton: document.querySelector("#resetEditsButton"),
  adminCardList: document.querySelector("#adminCardList"),
  cardEditForm: document.querySelector("#cardEditForm"),
  editTitle: document.querySelector("#editTitle"),
  editMeta: document.querySelector("#editMeta"),
  editCategoryInput: document.querySelector("#editCategoryInput"),
  editQuestionInput: document.querySelector("#editQuestionInput"),
  editDefinitionInput: document.querySelector("#editDefinitionInput"),
  editKeywordsInput: document.querySelector("#editKeywordsInput"),
  editMessage: document.querySelector("#editMessage"),
  sheetBadge: document.querySelector("#sheetBadge"),
  progressText: document.querySelector("#progressText"),
  timerText: document.querySelector("#timerText"),
  categoryText: document.querySelector("#categoryText"),
  questionText: document.querySelector("#questionText"),
  knownCardButton: document.querySelector("#knownCardButton"),
  knownProgressText: document.querySelector("#knownProgressText"),
  definitionPanel: document.querySelector("#definitionPanel"),
  keywordsPanel: document.querySelector("#keywordsPanel"),
  definitionButton: document.querySelector("#definitionButton"),
  keywordsButton: document.querySelector("#keywordsButton"),
  definitionText: document.querySelector("#definitionText"),
  keywordsText: document.querySelector("#keywordsText"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  shuffleButton: document.querySelector("#shuffleButton"),
  sprintDialog: document.querySelector("#sprintDialog"),
  sprintForm: document.querySelector("#sprintForm"),
  sprintCancelButton: document.querySelector("#sprintCancelButton"),
  sprintRestartDialog: document.querySelector("#sprintRestartDialog"),
  sprintRestartCancelIconButton: document.querySelector("#sprintRestartCancelIconButton"),
  sprintCountInput: document.querySelector("#sprintCountInput"),
  sprintSecondsInput: document.querySelector("#sprintSecondsInput"),
  sprintDomainList: document.querySelector("#sprintDomainList"),
  sprintAllDomainsButton: document.querySelector("#sprintAllDomainsButton"),
  sprintClearDomainsButton: document.querySelector("#sprintClearDomainsButton"),
  sprintSetupMessage: document.querySelector("#sprintSetupMessage"),
  sprintStartButton: document.querySelector("#sprintStartButton"),
  sprintScopeText: document.querySelector("#sprintScopeText"),
  sprintProgressText: document.querySelector("#sprintProgressText"),
  sprintTimerText: document.querySelector("#sprintTimerText"),
  sprintActivePanel: document.querySelector("#sprintActivePanel"),
  sprintResultPanel: document.querySelector("#sprintResultPanel"),
  sprintCategoryText: document.querySelector("#sprintCategoryText"),
  sprintQuestionText: document.querySelector("#sprintQuestionText"),
  sprintResultList: document.querySelector("#sprintResultList"),
  sprintShowResultButton: document.querySelector("#sprintShowResultButton"),
  sprintStopButton: document.querySelector("#sprintStopButton"),
  sprintRestartButton: document.querySelector("#sprintRestartButton"),
  sprintSameCardsButton: document.querySelector("#sprintSameCardsButton"),
  sprintNewCardsButton: document.querySelector("#sprintNewCardsButton"),
  sprintRestartCancelButton: document.querySelector("#sprintRestartCancelButton"),
  sprintExitButton: document.querySelector("#sprintExitButton"),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function splitSheetByDay(sheet) {
  const config = SHEET_SPLIT_CONFIGS.find((item) => item.sourceSheetName === sheet.name);
  if (!config) return [sheet];

  const chunkSize = Math.floor((sheet.cards || []).length / config.dayLabels.length);
  const hasExactChunks = chunkSize > 0 && chunkSize * config.dayLabels.length === (sheet.cards || []).length;
  if (!hasExactChunks) return [sheet];

  return config.dayLabels.map((dayLabel, index) => {
    const nextSheetName = `${config.targetPrefix} ${dayLabel}`;
    const start = index * chunkSize;
    const cards = sheet.cards.slice(start, start + chunkSize).map((card) => ({
      ...card,
      sheet: nextSheetName,
    }));

    return {
      ...sheet,
      name: nextSheetName,
      count: cards.length,
      cards,
    };
  });
}

function migrateSheetData(cardData) {
  return {
    ...cardData,
    sheets: (cardData.sheets || []).flatMap((sheet) => splitSheetByDay(sheet)),
  };
}

function normalizeCard(card) {
  card.category = normalizeText(card.category);
  card.question = normalizeText(card.question);
  card.definition = normalizeText(card.definition);
  card.keywords = normalizeText(card.keywords);
  return card;
}

function normalizeCardData(cardData) {
  const migrated = migrateSheetData(cardData);
  for (const sheet of migrated.sheets || []) {
    for (const card of sheet.cards || []) {
      normalizeCard(card);
    }
  }
  return migrated;
}

function loadOriginalData() {
  return normalizeCardData(clone(ORIGINAL_DATA));
}

function loadData() {
  try {
    const saved = localStorage.getItem(CARD_DATA_KEY);
    return normalizeCardData(saved ? JSON.parse(saved) : clone(ORIGINAL_DATA));
  } catch {
    return loadOriginalData();
  }
}

function saveData() {
  data = normalizeCardData(data);
  localStorage.setItem(CARD_DATA_KEY, JSON.stringify(data));
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

function ensureLocalUser(name, label = name) {
  const existing = userStore.users.find((user) => user.name === name);
  if (!existing) {
    userStore.users.push({ name, label, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() });
  } else {
    existing.label = label || existing.label || name;
    existing.lastLoginAt = new Date().toISOString();
  }
  if (!userStore.knownByUser[name]) userStore.knownByUser[name] = [];
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

function getCurrentKnownList() {
  if (!state.currentUser) return [];
  if (!userStore.knownByUser[state.currentUser]) userStore.knownByUser[state.currentUser] = [];
  return userStore.knownByUser[state.currentUser];
}

function getCurrentKnownSet() {
  return new Set(getCurrentKnownList());
}

function isKnown(cardId) {
  return getCurrentKnownSet().has(cardId);
}

function setKnown(cardId, value) {
  if (!state.currentUser) return;
  const known = getCurrentKnownSet();
  if (value) {
    known.add(cardId);
  } else {
    known.delete(cardId);
  }
  userStore.knownByUser[state.currentUser] = [...known];
  saveUserStore();
  saveRemoteProgress();
}

function knownCount() {
  return getCurrentKnownSet().size;
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
    buildDeck(true);
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

function shuffle(cards) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function allCards() {
  return data.sheets.flatMap((sheet) => sheet.cards);
}

function currentSheet() {
  return data.sheets.find((sheet) => sheet.name === state.deckKey);
}

function findCard(cardId) {
  for (const sheet of data.sheets) {
    const card = sheet.cards.find((item) => item.id === cardId);
    if (card) return card;
  }
  return null;
}

function buildDeck(keepCurrent = false) {
  if (state.isGuestMode) {
    state.cardVisibility = "all";
  }

  const previousId = state.cards[state.index]?.id;
  const isAllRandom = state.deckKey === "all-random";
  const sourceCards = isAllRandom ? allCards() : currentSheet().cards;
  const visibleCards = state.cardVisibility === "unknown" && state.currentUser
    ? sourceCards.filter((card) => !isKnown(card.id))
    : sourceCards;
  const shouldShuffle = isAllRandom || state.order === "random";

  state.cards = shouldShuffle ? shuffle(visibleCards) : [...visibleCards];
  state.index = 0;

  if (keepCurrent && previousId) {
    const foundIndex = state.cards.findIndex((card) => card.id === previousId);
    state.index = foundIndex >= 0 ? foundIndex : 0;
  }

  resetCardReveal();
  resetTimer();
  render();
}

function resetCardReveal() {
  state.showDefinition = state.stickyDefinition;
  state.showKeywords = state.stickyKeywords;
}

function resetTimer() {
  clearCountdownTimers(state.countdownTimers);
  state.startedAt = Date.now();
  state.lastBeepSecond = null;
  scheduleCountdownTimers(state.countdownTimers, state.intervalSeconds, () => state.auto && !state.sprint.active && !state.sprint.complete);
}

function resetSprintTopicTimer() {
  clearCountdownTimers(state.sprint.countdownTimers);
  state.sprint.topicStartedAt = Date.now();
  state.sprint.lastBeepSecond = null;
  scheduleCountdownTimers(state.sprint.countdownTimers, state.sprint.secondsPerTopic, () => state.sprint.active);
}

function clearCountdownTimers(timers) {
  while (timers.length) {
    clearTimeout(timers.pop());
  }
}

function scheduleCountdownTimers(timers, totalSeconds, shouldPlay) {
  clearCountdownTimers(timers);
  for (const second of [3, 2, 1]) {
    const delayMs = Math.max(0, (totalSeconds - second) * 1000);
    timers.push(setTimeout(() => {
      if (shouldPlay()) playCountdownVoice(second);
    }, delayMs));
  }
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
  if (context?.state === "suspended") {
    try {
      await context.resume();
    } catch {
      // MP3 countdown can still work even if WebAudio resume fails.
    }
  }

  if (context && !state.audioUnlocked) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.01);
    state.audioUnlocked = true;
  }

  preloadCountdownAudio();
  void loadCountdownAudioBuffers();
  await unlockCountdownAudioElements();
}

function preloadCountdownAudio() {
  for (const [second, src] of Object.entries(COUNTDOWN_AUDIO_PATHS)) {
    if (state.countdownAudio[second]) continue;
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = 1;
    state.countdownAudio[second] = audio;
    audio.load();
  }
}

async function unlockCountdownAudioElements() {
  const unlocks = Object.values(state.countdownAudio).map(async (audio) => {
    const wasMuted = audio.muted;
    try {
      audio.muted = true;
      audio.currentTime = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // Some browsers still defer media-element audio. WebAudio fallback remains available.
    } finally {
      audio.muted = wasMuted;
    }
  });

  await Promise.allSettled(unlocks);
}

async function loadCountdownAudioBuffers() {
  const context = getAudioContext();
  if (!context) return;

  await Promise.allSettled(
    Object.entries(COUNTDOWN_AUDIO_PATHS).map(async ([second, src]) => {
      if (state.countdownBuffers[second]) return;
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      state.countdownBuffers[second] = await context.decodeAudioData(arrayBuffer);
    }),
  );
}

function playCountdownVoice(second) {
  if (playCountdownBuffer(second)) return;

  const audio = state.countdownAudio[second] || new Audio(COUNTDOWN_AUDIO_PATHS[second]);
  state.countdownAudio[second] = audio;
  audio.volume = 1;
  audio.muted = false;

  try {
    audio.pause();
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch(() => playFallbackBeep(second));
    }
  } catch {
    playFallbackBeep(second);
  }
}

function playCountdownBuffer(second) {
  const context = getAudioContext();
  const buffer = state.countdownBuffers[second];
  if (!context || context.state !== "running" || !buffer) return false;

  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.setValueAtTime(1, context.currentTime);
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(context.destination);
  source.start();
  return true;
}

async function playFallbackBeep(second) {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return;
    }
  }

  playBeep(second === 1 ? 1040 : 880, 0.1);
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

function move(delta) {
  if (!state.cards.length || !els.adminView.hidden) return;

  if (state.currentUser && state.cardVisibility === "unknown") {
    const currentIndex = state.index;
    const nextCard = findNextUnknownCard(currentIndex, delta);
    state.cards = state.cards.filter((card) => !isKnown(card.id));

    if (!state.cards.length) {
      state.index = 0;
      resetCardReveal();
      resetTimer();
      render();
      return;
    }

    if (nextCard) {
      const nextIndex = state.cards.findIndex((card) => card.id === nextCard.id);
      state.index = nextIndex >= 0 ? nextIndex : 0;
      resetCardReveal();
      resetTimer();
      render();
      return;
    }
  }

  state.index = (state.index + delta + state.cards.length) % state.cards.length;
  resetCardReveal();
  resetTimer();
  render();
}

function findNextUnknownCard(startIndex, delta) {
  if (!state.cards.length) return null;
  const direction = delta >= 0 ? 1 : -1;

  for (let step = 1; step <= state.cards.length; step += 1) {
    const index = (startIndex + direction * step + state.cards.length) % state.cards.length;
    const card = state.cards[index];
    if (!isKnown(card.id)) return card;
  }

  return null;
}

function sprintBaseSourceCards() {
  const sourceCards = state.deckKey === "all-random" ? allCards() : currentSheet().cards;
  return state.cardVisibility === "unknown" && state.currentUser
    ? sourceCards.filter((card) => !isKnown(card.id))
    : sourceCards;
}

function sprintCategoryName(card) {
  return card.category || "출제구분 없음";
}

function sprintCategorySummaries() {
  const categoryCounts = new Map();
  for (const card of sprintBaseSourceCards()) {
    const category = sprintCategoryName(card);
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }

  return [...categoryCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));
}

function activeSprintCategories(categories = sprintCategorySummaries()) {
  const availableNames = new Set(categories.map((category) => category.name));
  if (!Array.isArray(state.sprint.selectedCategories)) {
    return categories.map((category) => category.name);
  }
  return state.sprint.selectedCategories.filter((category) => availableNames.has(category));
}

function selectedSprintSourceCards() {
  const categories = sprintCategorySummaries();
  const selected = new Set(activeSprintCategories(categories));
  if (!selected.size) return [];
  return sprintBaseSourceCards().filter((card) => selected.has(sprintCategoryName(card)));
}

function sprintScopeLabel() {
  const categories = sprintCategorySummaries();
  const selected = activeSprintCategories(categories);
  const baseText = state.deckKey === "all-random" ? "전체 랜덤" : state.deckKey;

  if (!categories.length) return baseText;
  if (selected.length === categories.length) return `${baseText} · 전체 도메인`;
  if (selected.length === 1) return `${baseText} · ${selected[0]}`;
  return `${baseText} · ${selected.length}개 도메인`;
}

function renderSprintDomainOptions() {
  const categories = sprintCategorySummaries();
  const selected = new Set(activeSprintCategories(categories));
  els.sprintDomainList.innerHTML = "";

  if (!categories.length) {
    const empty = document.createElement("p");
    empty.className = "sprint-domain-empty";
    empty.textContent = "선택할 도메인이 없습니다.";
    els.sprintDomainList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const category of categories) {
    const label = document.createElement("label");
    label.className = "sprint-domain-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = category.name;
    checkbox.checked = selected.has(category.name);

    const text = document.createElement("span");
    text.textContent = `${category.name} (${category.count.toLocaleString("ko-KR")})`;

    label.append(checkbox, text);
    fragment.append(label);
  }
  els.sprintDomainList.append(fragment);
}

function updateSprintSetupState() {
  const availableCount = selectedSprintSourceCards().length;
  els.sprintCountInput.max = String(Math.max(1, availableCount));
  els.sprintCountInput.value = String(Math.min(Number(els.sprintCountInput.value) || state.sprint.topicCount, Math.max(1, availableCount)));
  els.sprintStartButton.disabled = availableCount === 0;
  els.sprintSetupMessage.textContent = availableCount
    ? `선택한 범위에서 ${availableCount.toLocaleString("ko-KR")}개 토픽 사용 가능`
    : "선택한 도메인에 사용할 토픽이 없습니다.";
}

function openSprintDialog() {
  els.sprintCountInput.value = String(state.sprint.topicCount);
  els.sprintSecondsInput.value = String(state.sprint.secondsPerTopic);
  renderSprintDomainOptions();
  updateSprintSetupState();

  try {
    if (typeof els.sprintDialog.showModal === "function" && !els.sprintDialog.open) {
      els.sprintDialog.showModal();
    } else {
      els.sprintDialog.setAttribute("open", "");
    }
  } catch {
    els.sprintDialog.setAttribute("open", "");
  }
  els.sprintDialog.classList.add("is-open");
}

function closeSprintDialog() {
  els.sprintDialog.classList.remove("is-open");
  if (els.sprintDialog.open && typeof els.sprintDialog.close === "function") {
    try {
      els.sprintDialog.close();
      return;
    } catch {
      els.sprintDialog.removeAttribute("open");
      return;
    }
  }
  els.sprintDialog.removeAttribute("open");
}

function openSprintRestartDialog() {
  try {
    if (typeof els.sprintRestartDialog.showModal === "function" && !els.sprintRestartDialog.open) {
      els.sprintRestartDialog.showModal();
    } else {
      els.sprintRestartDialog.setAttribute("open", "");
    }
  } catch {
    els.sprintRestartDialog.setAttribute("open", "");
  }
  els.sprintRestartDialog.classList.add("is-open");
}

function closeSprintRestartDialog() {
  els.sprintRestartDialog.classList.remove("is-open");
  if (els.sprintRestartDialog.open && typeof els.sprintRestartDialog.close === "function") {
    try {
      els.sprintRestartDialog.close();
      return;
    } catch {
      els.sprintRestartDialog.removeAttribute("open");
      return;
    }
  }
  els.sprintRestartDialog.removeAttribute("open");
}

function startSprint() {
  const sourceCards = selectedSprintSourceCards();
  const requestedCount = Math.max(1, Number(els.sprintCountInput.value) || 1);
  const secondsPerTopic = Math.max(5, Number(els.sprintSecondsInput.value) || 30);
  const sprintCards = shuffle(sourceCards).slice(0, Math.min(requestedCount, sourceCards.length));

  if (!sprintCards.length) {
    els.sprintSetupMessage.textContent = "스프린트할 토픽이 없습니다.";
    return;
  }

  state.sprint.active = true;
  state.sprint.complete = false;
  state.sprint.cards = sprintCards;
  state.sprint.index = 0;
  state.sprint.topicCount = sprintCards.length;
  state.sprint.secondsPerTopic = secondsPerTopic;
  state.sprint.scopeLabel = sprintScopeLabel();
  state.sprint.previousAuto = state.auto;
  state.auto = false;
  resetSprintTopicTimer();
  unlockAudio();
  closeSprintDialog();
  renderSprint();
}

function finishSprint() {
  clearCountdownTimers(state.sprint.countdownTimers);
  state.sprint.complete = true;
  state.sprint.active = false;
  renderSprint();
}

function showSprintResultsNow() {
  if (!state.sprint.active) return;
  clearCountdownTimers(state.sprint.countdownTimers);
  state.sprint.complete = true;
  state.sprint.active = false;
  renderSprint();
}

function restartSprintWithSameCards() {
  if (!state.sprint.cards.length) return;
  state.sprint.active = true;
  state.sprint.complete = false;
  state.sprint.index = 0;
  state.sprint.previousAuto = state.auto;
  state.auto = false;
  resetSprintTopicTimer();
  unlockAudio();
  closeSprintRestartDialog();
  renderSprint();
}

function restartSprintWithNewCards() {
  closeSprintRestartDialog();
  openSprintDialog();
}

function exitSprint() {
  clearCountdownTimers(state.sprint.countdownTimers);
  state.sprint.active = false;
  state.sprint.complete = false;
  state.sprint.cards = [];
  state.sprint.index = 0;
  state.sprint.scopeLabel = "전체 랜덤";
  state.auto = state.sprint.previousAuto;
  resetTimer();
  render();
}

function advanceSprint() {
  if (!state.sprint.active) return;
  if (state.sprint.index >= state.sprint.cards.length - 1) {
    finishSprint();
    return;
  }

  state.sprint.index += 1;
  resetSprintTopicTimer();
  renderSprint();
}

function setPressed(button, value) {
  button.classList.toggle("is-on", value);
  button.setAttribute("aria-pressed", String(value));
}

function renderDeckOptions() {
  const selectedDeck = els.deckSelect.value || state.deckKey;
  const total = allCards().length;
  els.deckSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all-random";
  allOption.textContent = `전체 랜덤 (${total})`;
  els.deckSelect.append(allOption);

  for (const sheet of data.sheets) {
    const option = document.createElement("option");
    option.value = sheet.name;
    option.textContent = `${sheet.name} (${sheet.cards.length})`;
    els.deckSelect.append(option);
  }

  els.deckSelect.value = [...els.deckSelect.options].some((option) => option.value === selectedDeck) ? selectedDeck : "all-random";
  state.deckKey = els.deckSelect.value;
}

function renderCardVisibilityControl() {
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

function renderAdminSheetFilter() {
  const selectedSheet = els.adminSheetFilter.value || "all";
  els.adminSheetFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "전체 시트";
  els.adminSheetFilter.append(allOption);

  for (const sheet of data.sheets) {
    const option = document.createElement("option");
    option.value = sheet.name;
    option.textContent = `${sheet.name} (${sheet.cards.length})`;
    els.adminSheetFilter.append(option);
  }

  els.adminSheetFilter.value = [...els.adminSheetFilter.options].some((option) => option.value === selectedSheet) ? selectedSheet : "all";
}

function render() {
  const card = state.cards[state.index];
  const total = allCards().length;
  const modeText = state.deckKey === "all-random" ? "전체 랜덤" : state.order === "random" ? "랜덤" : "순차";
  const knownTotal = state.currentUser ? knownCount() : 0;
  const viewText = state.cardVisibility === "unknown" && state.currentUser ? "모르는 카드만" : "전체 카드";

  els.deckSummary.textContent = state.currentUser
    ? `${currentUserLabel()} · ${knownTotal.toLocaleString("ko-KR")}장 체크 · ${total.toLocaleString("ko-KR")}장`
    : `${data.sheets.length}개 시트 · ${total.toLocaleString("ko-KR")}장`;
  els.orderSelect.disabled = state.deckKey === "all-random";
  renderCardVisibilityControl();
  els.intervalLabel.textContent = `${state.intervalSeconds}초`;
  els.shuffleButton.textContent = state.deckKey === "all-random" || state.order === "random" ? "다시 섞기" : "처음으로";
  setPressed(els.autoButton, state.auto);
  setPressed(els.countdownButton, state.countdown);
  setPressed(els.stickyDefinitionButton, state.stickyDefinition);
  setPressed(els.stickyKeywordsButton, state.stickyKeywords);
  renderUserAccounts();
  renderAuth();

  if (!card) {
    els.sheetBadge.textContent = "-";
    els.progressText.textContent = "0 / 0";
    els.categoryText.textContent = "-";
    els.questionText.textContent = state.cardVisibility === "unknown" && state.currentUser
      ? "모르는 카드가 없습니다."
      : "카드가 없습니다.";
    els.definitionText.textContent = "";
    els.keywordsText.textContent = "";
    els.knownCardButton.disabled = true;
    els.knownProgressText.textContent = state.currentUser
      ? "모든 카드를 아는 카드로 체크했습니다."
      : "모르는 카드만 보기와 아는 카드 체크는 로그인 후 사용할 수 있습니다.";
    return;
  }

  els.sheetBadge.textContent = `${card.sheet} · ${modeText} · ${viewText}`;
  els.progressText.textContent = `${(state.index + 1).toLocaleString("ko-KR")} / ${state.cards.length.toLocaleString("ko-KR")}`;
  els.categoryText.textContent = card.category || "출제구분 없음";
  els.questionText.textContent = card.question || "(문제 없음)";
  els.definitionText.textContent = card.definition || "정의가 비어 있습니다.";
  els.keywordsText.textContent = card.keywords || "키워드가 비어 있습니다.";
  renderKnownState(card);

  renderPanel(els.definitionPanel, els.definitionButton, state.showDefinition);
  renderPanel(els.keywordsPanel, els.keywordsButton, state.showKeywords);
  renderTimer();
}

function renderPanel(panel, button, visible) {
  panel.classList.toggle("is-hidden", !visible);
  button.textContent = visible ? "닫기" : "열기";
}

function renderTimer() {
  els.timerText.classList.remove("countdown");

  if (state.sprint.active || state.sprint.complete || els.studyView.hidden || !state.auto) {
    els.timerText.textContent = "수동";
    return;
  }

  const elapsedSeconds = (Date.now() - state.startedAt) / 1000;
  const left = Math.max(0, state.intervalSeconds - elapsedSeconds);

  if (left <= 0) {
    move(1);
    return;
  }

  if (left <= 3) {
    const beepSecond = Math.ceil(left);
    if (state.countdown) {
      els.timerText.textContent = `${beepSecond}초`;
      els.timerText.classList.add("countdown");
      return;
    }
  }

  els.timerText.textContent = `${Math.ceil(left)}초 후`;
}

function renderSprintTimer() {
  els.sprintTimerText.classList.remove("countdown");

  if (!state.sprint.active || els.sprintView.hidden) {
    els.sprintTimerText.textContent = state.sprint.complete ? "완료" : "대기";
    return;
  }

  const elapsedSeconds = (Date.now() - state.sprint.topicStartedAt) / 1000;
  const left = Math.max(0, state.sprint.secondsPerTopic - elapsedSeconds);

  if (left <= 0) {
    advanceSprint();
    return;
  }

  if (left <= 3) {
    const beepSecond = Math.ceil(left);
    els.sprintTimerText.textContent = `${beepSecond}초`;
    els.sprintTimerText.classList.add("countdown");
    return;
  }

  els.sprintTimerText.textContent = `${Math.ceil(left)}초 후`;
}

function renderSprintResults() {
  els.sprintResultList.innerHTML = "";

  for (const [index, card] of state.sprint.cards.entries()) {
    const item = document.createElement("article");
    item.className = "sprint-result-card";
    item.innerHTML = `
      <div class="sprint-result-meta">${index + 1} / ${state.sprint.cards.length} · ${escapeHtml(card.sheet)} · ${escapeHtml(card.category || "출제구분 없음")}</div>
      <h3>${escapeHtml(card.question || "(문제 없음)")}</h3>
      <div class="sprint-answer-grid">
        <section>
          <strong>정의</strong>
          <p>${escapeHtml(card.definition || "정의가 비어 있습니다.")}</p>
        </section>
        <section>
          <strong>키워드</strong>
          <p>${escapeHtml(card.keywords || "키워드가 비어 있습니다.")}</p>
        </section>
      </div>
    `;
    els.sprintResultList.append(item);
  }
}

function renderSprint() {
  const sprintVisible = state.sprint.active || state.sprint.complete;
  els.studyView.hidden = sprintVisible;
  els.adminView.hidden = true;
  els.sprintView.hidden = !sprintVisible;

  if (!sprintVisible) return;

  const card = state.sprint.cards[state.sprint.index];
  els.sprintScopeText.textContent = `${state.sprint.scopeLabel} · ${state.sprint.secondsPerTopic}초씩`;
  els.sprintProgressText.textContent = `${Math.min(state.sprint.index + 1, state.sprint.cards.length)} / ${state.sprint.cards.length}`;
  els.sprintActivePanel.hidden = state.sprint.complete;
  els.sprintResultPanel.hidden = !state.sprint.complete;

  if (state.sprint.complete) {
    renderSprintTimer();
    renderSprintResults();
    return;
  }

  els.sprintCategoryText.textContent = card?.category || "출제구분 없음";
  els.sprintQuestionText.textContent = card?.question || "(문제 없음)";
  renderSprintTimer();
}

function renderAuth() {
  state.isAdmin = false;
  if (state.sprint.active || state.sprint.complete) {
    if (els.adminView) els.adminView.hidden = true;
    if (els.studyView) els.studyView.hidden = true;
    if (els.sprintView) els.sprintView.hidden = false;
    return;
  }
  if (els.adminView) els.adminView.hidden = true;
  if (els.studyView) els.studyView.hidden = false;
  if (els.sprintView) els.sprintView.hidden = true;
}

function renderUserAccounts() {
  els.userLogoutButton.hidden = !state.currentUser;
  els.userStatusText.textContent = state.currentUser
    ? `${currentUserLabel()} · 아는 카드 ${knownCount().toLocaleString("ko-KR")}장 · ${state.syncStatus}`
    : state.isGuestMode
      ? "게스트 모드 · 전체 카드만 볼 수 있습니다."
      : `로그인 정보를 확인하는 중 · ${state.syncStatus}`;
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
    button.textContent = `${user.label || user.name} (${count})`;
    els.quickLoginList.append(button);
  }
}

function renderKnownState(card) {
  const known = state.currentUser ? isKnown(card.id) : false;
  els.knownCardButton.disabled = !state.currentUser;
  els.knownCardButton.textContent = known ? "모르는 카드로 되돌리기" : "아는 카드로 체크";
  setPressed(els.knownCardButton, known);

  if (!state.currentUser) {
    els.knownProgressText.textContent = "모르는 카드만 보기와 아는 카드 체크는 로그인 후 사용할 수 있습니다.";
    return;
  }

  const total = allCards().length;
  els.knownProgressText.textContent = `${currentUserLabel()}: ${knownCount().toLocaleString("ko-KR")} / ${total.toLocaleString("ko-KR")}장 체크`;
}

function toggleKnownCard() {
  const card = state.cards[state.index];
  if (!card) return false;
  if (!state.currentUser) {
    els.userMessage.textContent = "아는 카드 체크는 로그인 후 사용할 수 있습니다.";
    renderKnownState(card);
    return true;
  }

  setKnown(card.id, !isKnown(card.id));
  render();
  return true;
}

async function createOrLoginUser(rawName) {
  const name = normalizeUserName(rawName);
  if (!name) {
    els.userMessage.textContent = "사용자 이름을 입력해주세요.";
    return;
  }

  const exists = userStore.users.some((user) => user.name === name);
  if (!exists) {
    ensureLocalUser(name);
  } else {
    const user = userStore.users.find((item) => item.name === name);
    user.lastLoginAt = new Date().toISOString();
  }

  state.currentUser = name;
  state.isGuestMode = false;
  saveUserStore();
  els.userNameInput.value = "";
  els.userMessage.textContent = exists ? `${name} 계정으로 로그인했습니다.` : `${name} 계정을 만들고 로그인했습니다.`;
  buildDeck(true);
  await syncUserFromRemote(name);
}

async function loginUser(name) {
  state.currentUser = name;
  state.isGuestMode = false;
  ensureLocalUser(name);
  const user = userStore.users.find((item) => item.name === name);
  if (user) user.lastLoginAt = new Date().toISOString();
  saveUserStore();
  els.userMessage.textContent = `${name} 계정으로 로그인했습니다.`;
  buildDeck(true);
  await syncUserFromRemote(name);
}

function logoutUser() {
  applyStudyAccount();
  els.userMessage.textContent = "현재 로그인 계정을 기준으로 다시 연결했습니다.";
  buildDeck(true);
}

function getAdminCards() {
  const search = els.adminSearchInput.value.trim().toLowerCase();
  const sheetName = els.adminSheetFilter.value;
  return allCards().filter((card) => {
    const matchesSheet = sheetName === "all" || card.sheet === sheetName;
    const haystack = `${card.sheet} ${card.category} ${card.question} ${card.definition} ${card.keywords}`.toLowerCase();
    return matchesSheet && (!search || haystack.includes(search));
  });
}

function renderAdminList() {
  const cards = getAdminCards();
  els.adminCardList.innerHTML = "";

  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "검색 결과가 없습니다.";
    els.adminCardList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const card of cards) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `card-row${card.id === state.selectedAdminCardId ? " is-selected" : ""}`;
    button.dataset.cardId = card.id;
    button.innerHTML = `
      <span>${escapeHtml(card.sheet)}</span>
      <strong>${escapeHtml(card.question || "(문제 없음)")}</strong>
      <small>${escapeHtml(card.category || "출제구분 없음")}</small>
    `;
    fragment.append(button);
  }
  els.adminCardList.append(fragment);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selectAdminCard(cardId) {
  const card = findCard(cardId);
  if (!card) return;

  state.selectedAdminCardId = card.id;
  els.editTitle.textContent = card.question || "(문제 없음)";
  els.editMeta.textContent = `${card.sheet} · ${card.id}`;
  els.editCategoryInput.value = card.category || "";
  els.editQuestionInput.value = card.question || "";
  els.editDefinitionInput.value = card.definition || "";
  els.editKeywordsInput.value = card.keywords || "";
  els.editMessage.textContent = "";
  renderAdminList();
}

function saveSelectedCard() {
  const card = findCard(state.selectedAdminCardId);
  if (!card) return;

  card.category = normalizeText(els.editCategoryInput.value);
  card.question = normalizeText(els.editQuestionInput.value);
  card.definition = normalizeText(els.editDefinitionInput.value);
  card.keywords = normalizeText(els.editKeywordsInput.value);
  saveData();
  buildDeck(true);
  renderDeckOptions();
  renderAdminSheetFilter();
  selectAdminCard(card.id);
  els.editMessage.textContent = "저장되었습니다. 학습 카드에도 바로 반영됩니다.";
}

function showAdminView() {
  if (!state.isAdmin) return;
  state.auto = false;
  els.studyView.hidden = true;
  els.adminView.hidden = false;
  renderAdminSheetFilter();
  renderAdminList();

  const firstVisibleCard = getAdminCards()[0];
  if (!state.selectedAdminCardId && firstVisibleCard) {
    selectAdminCard(firstVisibleCard.id);
  } else if (state.selectedAdminCardId) {
    selectAdminCard(state.selectedAdminCardId);
  }
  render();
}

function showStudyView() {
  els.adminView.hidden = true;
  els.studyView.hidden = false;
  resetTimer();
  render();
}

function startTicker() {
  if (state.ticker) clearInterval(state.ticker);
  state.ticker = setInterval(() => {
    renderTimer();
    renderSprintTimer();
  }, 200);
}

function wireEvents() {
  els.deckSelect.addEventListener("change", () => {
    state.deckKey = els.deckSelect.value;
    buildDeck();
  });

  els.orderSelect.addEventListener("change", () => {
    state.order = els.orderSelect.value;
    buildDeck();
  });

  els.cardVisibilitySelect.addEventListener("change", () => {
    if (!state.currentUser && els.cardVisibilitySelect.value === "unknown") {
      state.cardVisibility = "all";
      els.userMessage.textContent = "모르는 카드만 보려면 로그인해주세요.";
      buildDeck(true);
      return;
    }

    state.cardVisibility = els.cardVisibilitySelect.value;
    buildDeck(true);
  });

  els.intervalInput.addEventListener("input", () => {
    state.intervalSeconds = Number(els.intervalInput.value);
    resetTimer();
    render();
  });

  els.autoButton.addEventListener("click", () => {
    state.auto = !state.auto;
    if (state.auto) unlockAudio();
    if (!state.auto) clearCountdownTimers(state.countdownTimers);
    resetTimer();
    render();
  });

  els.countdownButton.addEventListener("click", () => {
    state.countdown = !state.countdown;
    render();
  });

  els.sprintButton.addEventListener("click", openSprintDialog);

  els.sprintCancelButton.addEventListener("click", closeSprintDialog);

  els.sprintDialog.addEventListener("click", (event) => {
    if (event.target === els.sprintDialog) closeSprintDialog();
  });

  els.sprintDomainList.addEventListener("change", () => {
    state.sprint.selectedCategories = [...els.sprintDomainList.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => input.value);
    updateSprintSetupState();
  });

  els.sprintAllDomainsButton.addEventListener("click", () => {
    state.sprint.selectedCategories = null;
    renderSprintDomainOptions();
    updateSprintSetupState();
  });

  els.sprintClearDomainsButton.addEventListener("click", () => {
    state.sprint.selectedCategories = [];
    renderSprintDomainOptions();
    updateSprintSetupState();
  });

  els.sprintCountInput.addEventListener("input", updateSprintSetupState);

  els.sprintForm.addEventListener("submit", (event) => {
    event.preventDefault();
    startSprint();
  });

  els.sprintRestartButton.addEventListener("click", openSprintRestartDialog);

  els.sprintShowResultButton.addEventListener("click", showSprintResultsNow);
  els.sprintStopButton.addEventListener("click", exitSprint);
  els.sprintSameCardsButton.addEventListener("click", restartSprintWithSameCards);
  els.sprintNewCardsButton.addEventListener("click", restartSprintWithNewCards);
  els.sprintRestartCancelButton.addEventListener("click", closeSprintRestartDialog);
  els.sprintRestartCancelIconButton.addEventListener("click", closeSprintRestartDialog);
  els.sprintRestartDialog.addEventListener("click", (event) => {
    if (event.target === els.sprintRestartDialog) closeSprintRestartDialog();
  });
  els.sprintExitButton.addEventListener("click", exitSprint);

  els.stickyDefinitionButton.addEventListener("click", () => {
    state.stickyDefinition = !state.stickyDefinition;
    state.showDefinition = state.stickyDefinition || state.showDefinition;
    render();
  });

  els.stickyKeywordsButton.addEventListener("click", () => {
    state.stickyKeywords = !state.stickyKeywords;
    state.showKeywords = state.stickyKeywords || state.showKeywords;
    render();
  });

  els.definitionButton.addEventListener("click", () => {
    state.showDefinition = !state.showDefinition;
    render();
  });

  els.keywordsButton.addEventListener("click", () => {
    state.showKeywords = !state.showKeywords;
    render();
  });

  els.knownCardButton.addEventListener("click", () => {
    const card = state.cards[state.index];
    if (!card) return;
    if (!state.currentUser) {
      els.userMessage.textContent = "아는 카드 체크는 로그인 후 사용할 수 있습니다.";
      return;
    }
    setKnown(card.id, !isKnown(card.id));
    render();
  });

  els.prevButton.addEventListener("click", () => move(-1));
  els.nextButton.addEventListener("click", () => move(1));
  els.shuffleButton.addEventListener("click", () => {
    const shouldShuffle = state.deckKey === "all-random" || state.order === "random";
    buildDeck(shouldShuffle);
  });

  els.userCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createOrLoginUser(els.userNameInput.value);
  });

  els.userLogoutButton.addEventListener("click", logoutUser);

  els.accountHelpButton.addEventListener("click", () => {
    els.accountHelpPopup.hidden = !els.accountHelpPopup.hidden;
  });

  els.quickLoginList.addEventListener("click", async (event) => {
    const button = event.target.closest(".quick-login");
    if (button) await loginUser(button.dataset.userName);
  });

  els.backToStudyButton.addEventListener("click", showStudyView);

  els.adminSearchInput.addEventListener("input", () => {
    renderAdminList();
  });

  els.adminSheetFilter.addEventListener("change", () => {
    renderAdminList();
  });

  els.adminCardList.addEventListener("click", (event) => {
    const row = event.target.closest(".card-row");
    if (row) selectAdminCard(row.dataset.cardId);
  });

  els.cardEditForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSelectedCard();
  });

  els.resetEditsButton.addEventListener("click", () => {
    if (!confirm("브라우저에 저장된 카드 수정 내용을 모두 초기화할까요?")) return;
    localStorage.removeItem(CARD_DATA_KEY);
    data = loadOriginalData();
    state.selectedAdminCardId = null;
    renderDeckOptions();
    buildDeck(true);
    renderAdminSheetFilter();
    renderAdminList();
    els.editTitle.textContent = "카드를 선택하세요";
    els.editMeta.textContent = "";
    els.editCategoryInput.value = "";
    els.editQuestionInput.value = "";
    els.editDefinitionInput.value = "";
    els.editKeywordsInput.value = "";
    els.editMessage.textContent = "초기화되었습니다.";
  });

  window.addEventListener("keydown", (event) => {
    if (!els.adminView.hidden) return;

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
      const shouldOpen = !(state.showDefinition && state.showKeywords);
      state.showDefinition = shouldOpen;
      state.showKeywords = shouldOpen;
      render();
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const card = state.cards[state.index];
      if (!card) return;
      if (!state.currentUser) {
        els.userMessage.textContent = "아는 카드 체크는 로그인 후 사용할 수 있습니다.";
        renderKnownState(card);
        return;
      }
      setKnown(card.id, !isKnown(card.id));
      render();
    }
    if (event.key === "1") {
      state.showDefinition = !state.showDefinition;
      render();
    }
    if (event.key === "2") {
      state.showKeywords = !state.showKeywords;
      render();
    }
  });

  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("touchstart", unlockAudio, { once: true });

  window.HaorioRemoteInput?.installKeyboardBridge({
    actionHandlers: {
      previous() {
        if (!els.adminView.hidden) return false;
        move(-1);
        return true;
      },
      next() {
        if (!els.adminView.hidden) return false;
        move(1);
        return true;
      },
      confirm() {
        if (!els.adminView.hidden) return false;
        return toggleKnownCard();
      },
    },
  });
}

function init() {
  sessionStorage.removeItem("bbikbbiki.adminSession.v1");

  if (!data?.sheets?.length) {
    els.questionText.textContent = "카드 데이터를 찾지 못했습니다.";
    return;
  }

  applyStudyAccount();

  preloadCountdownAudio();
  renderDeckOptions();
  renderAdminSheetFilter();
  wireEvents();
  window.addEventListener(progressClient?.authChangeEvent || "haorio-study-auth-change", async () => {
    applyStudyAccount();
    buildDeck(true);
    await syncUserFromRemote(state.currentUser);
  });
  buildDeck();
  startTicker();
  refreshRemoteUsers();
}

init();
