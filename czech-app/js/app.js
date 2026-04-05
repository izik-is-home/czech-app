// Supabase Configuration
const SUPABASE_URL = 'https://gjygcfgbgfiaaidzyzji.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqeWdjZmdiZ2ZpYWFpZHp5emppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDgwMjYsImV4cCI6MjA4NTI4NDAyNn0.nV8ocbbXxnj0kqapUHLxE1rN5qfEi9bgoUfWclp80KI';

// Global Variables
let _supabase;
let wordsData = [];
let gameStack = [];
let currentWordIndex = 0;
let correctCount = 0;
let wrongCount = 0;
let autoNextTimer;
let gameInProgress = false;
let selectedDifficulty = 10;
let currentEditingId = null;
let sortLang = 'czech';
let sortOrder = 'asc';

// Memory Game Timer
let memoryTimer;
let memoryStartTime;

// Swipe Support
let touchStartX = 0;
let touchEndX = 0;

// Initialize
window.onload = async () => {
    try {
        _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Initialize authentication
        initializeAuthListeners();
        await checkAuthSession();

        await fetchWords();
        // set default selects
        const langSelect = document.getElementById('sort-lang');
        const orderSelect = document.getElementById('sort-order');
        if (langSelect) langSelect.value = sortLang;
        if (orderSelect) orderSelect.value = sortOrder;
    } catch (error) {
        console.error('שגיאה:', error);
        alert('שגיאה בהשקת האפליקציה');
    }
};

// Fetch all words from database
async function fetchWords() {
    try {
        // בדיקה: האם יש משתמש מחובר?
        if (!currentUser) {
            // אם אין משתמש מחובר, לא להציג מילים
            wordsData = [];
            renderTable();
            return;
        }

        const { data, error } = await _supabase
            .from('vocabulary')
            .select('*')
            .eq('user_id', currentUser.id);  // רק מילים של המשתמש המחובר

        if (error) throw error;

        wordsData = data || [];
        // default: sort ascending by czech
        applySort();
        renderTable();
        updateGamification();
    } catch (error) {
        console.error('שגיאה בטעינת מילים:', error);
        alert('שגיאה בטעינת מילים: ' + (error.message || error));
    }
}

// Add new word
async function addWord() {
    const czechInput = document.getElementById('new-cs');
    const hebrewInput = document.getElementById('new-he');
    const btn = event?.target;

    const czech = czechInput.value.trim();
    const hebrew = hebrewInput.value.trim();

    if (!czech || !hebrew) {
        alert('מלא את כל השדות');
        return;
    }

    // בדיקה חדשה: האם יש משתמש מחובר?
    if (!currentUser) {
        alert('עליך להתחבר כדי להוסיף מילים');
        return;
    }

    if (btn) btn.disabled = true;

    try {
        const { data, error } = await _supabase
            .from('vocabulary')
            .insert([{
                czech,
                hebrew,
                user_id: currentUser.id  // שומר את מזהה המשתמש
            }]);

        if (error) throw error;

        czechInput.value = '';
        hebrewInput.value = '';
        await fetchWords();
        updateGamification();
    } catch (error) {
        alert('שגיאה: ' + (error.message || error));
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Open edit modal
function openEditModal(id, czech, hebrew) {
    currentEditingId = id;
    document.getElementById('edit-cs').value = czech;
    document.getElementById('edit-he').value = hebrew;
    document.getElementById('editModal').classList.add('show');
}

// Close edit modal
function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
    currentEditingId = null;
}

// Save edited word
async function saveEditWord() {
    const czech = document.getElementById('edit-cs').value.trim();
    const hebrew = document.getElementById('edit-he').value.trim();

    if (!czech || !hebrew) {
        alert('מלא את כל השדות');
        return;
    }

    try {
        const { error } = await _supabase
            .from('vocabulary')
            .update({ czech, hebrew })
            .eq('id', currentEditingId);

        if (error) throw error;

        closeEditModal();
        await fetchWords();
    } catch (error) {
        alert('שגיאה בעדכון: ' + (error.message || error));
    }
}

// Delete word
async function deleteWord(id) {
    try {
        const { error } = await _supabase
            .from('vocabulary')
            .delete()
            .eq('id', id);

        if (error) throw error;

        await fetchWords();
        updateGamification();
    } catch (error) {
        alert('שגיאה במחיקה: ' + (error.message || error));
    }
}

// Apply current sort to wordsData (in-memory)
function applySort() {
    if (!Array.isArray(wordsData)) return;
    const key = sortLang === 'hebrew' ? 'hebrew' : 'czech';
    wordsData.sort((a, b) => {
        const aVal = (a && a[key]) ? String(a[key]) : '';
        const bVal = (b && b[key]) ? String(b[key]) : '';
        const cmp = aVal.localeCompare(bVal, sortLang === 'hebrew' ? 'he' : 'cs', { sensitivity: 'base' });
        return sortOrder === 'asc' ? cmp : -cmp;
    });
}

// Update sort controls
function updateSort() {
    const lang = document.getElementById('sort-lang')?.value;
    const order = document.getElementById('sort-order')?.value;
    if (lang) sortLang = lang;
    if (order) sortOrder = order;
    applySort();
    renderTable();
}

// Render words table (uses sorted wordsData)
function renderTable() {
    const tbody = document.getElementById('words-tbody');
    tbody.innerHTML = '';

    // ensure sorted before rendering
    applySort();

    wordsData.forEach(word => {
        const safeCzech = (word.czech || '').replace(/'/g, "\\'");
        const safeHeb = (word.hebrew || '').replace(/'/g, "\\'");
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${word.czech || ''}</td>
            <td>${word.hebrew || ''}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-edit" onclick="openEditModal(${word.id}, '${safeCzech}', '${safeHeb}')">
                        ✏️ עדכן
                    </button>
                    <button class="btn btn-danger" onclick="deleteWord(${word.id})">
                        🗑️ מחק
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Search word
function searchWord() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const resultDiv = document.getElementById('search-result');

    if (!query) {
        resultDiv.textContent = '';
        return;
    }

    const found = wordsData.find(word =>
        (word.czech || '').toLowerCase().includes(query) ||
        (word.hebrew || '').toLowerCase().includes(query)
    );

    if (found) {
        resultDiv.textContent = `נמצא: ${found.czech} = ${found.hebrew}`;
    } else {
        resultDiv.textContent = `המילה '${query}' עדיין לא במילון`;
    }
}

// Show tab
function showTab(tabName) {
    // Also close edit modal if open
    if (typeof closeEditModal === 'function') {
        closeEditModal();
    }

    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        // If the button's onclick attribute contains the tabName, mark it active
        if (btn.getAttribute('onclick').includes(`'${tabName}'`)) {
            btn.classList.add('active');
        }
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');

    if (tabName === 'home') {
        updateGamification();
    }

    // Initialize game if game tab
    if (tabName === 'game') {
        showDifficultySelector();
    }

    // Load highscores if highscores tab
    if (tabName === 'highscores') {
        loadHighscores();
    }
}

// Show difficulty selector
function showDifficultySelector() {
    const container = document.getElementById('game-container');

    if (wordsData.length < 4) {
        container.innerHTML = `
            <div class="error-message">
                צריך לפחות 4 מילים במילון כדי לשחק.
            </div>
        `;
        return;
    }

    const maxCards = Math.min(wordsData.length, 50);
    let difficultyHTML = `
        <div class="difficulty-section">
            <div class="difficulty-buttons">
    `;

    const options = [5, 10, 25, 50];
    options.forEach(option => {
        if (option <= maxCards) {
            difficultyHTML += `
                <button class="difficulty-btn ${option === selectedDifficulty ? 'selected' : ''}" 
                        onclick="startGameWithDifficulty(${option}, this)">
                    ${option}
                </button>
            `;
        }
    });

    if (maxCards > 20) {
        difficultyHTML += `
            <button class="difficulty-btn ${maxCards === selectedDifficulty ? 'selected' : ''}" 
                    onclick="startGameWithDifficulty(${maxCards}, this)">
                הכל
            </button>
        `;
    }

    difficultyHTML += `
            </div>
        </div>
    `;

    container.innerHTML = difficultyHTML;
}

// Start game with selected difficulty
function startGameWithDifficulty(numCards, btnEl) {
    selectedDifficulty = numCards;
    // visually mark buttons
    document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
    if (btnEl) btnEl.classList.add('selected');
    initGame();
}

// Shuffle algorithm (Fisher-Yates)
function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Initialize game
async function initGame() {
    gameInProgress = true;

    if (wordsData.length < 4) {
        const container = document.getElementById('game-container');
        container.innerHTML = `
            <div class="error-message">
                צריך לפחות 4 מילים במילון כדי לשחק.
            </div>
        `;
        gameInProgress = false;
        return;
    }

    // choose unique random words for the game stack
    const pool = shuffle(wordsData);
    const take = selectedDifficulty === wordsData.length ? wordsData.length : Math.min(selectedDifficulty, pool.length);
    gameStack = pool.slice(0, take); // unique, random, non-repeating
    currentWordIndex = 0;
    correctCount = 0;
    wrongCount = 0;
    updateScoreboard();

    startMemoryTimer();
    startNewRound();
}

function startMemoryTimer() {
    clearInterval(memoryTimer);
    memoryStartTime = Date.now();
    memoryTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - memoryStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        const timerEl = document.getElementById('memory-timer-display');
        if (timerEl) timerEl.textContent = `${minutes}:${seconds}`;
    }, 1000);
}

function stopMemoryTimer() {
    clearInterval(memoryTimer);
    const elapsed = Math.floor((Date.now() - memoryStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function speakCzech(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'cs-CZ'; // Czech language code

        // Try to select a female Czech voice
        const voices = window.speechSynthesis.getVoices();
        const czechVoice = voices.find(voice =>
            voice.lang === 'cs-CZ' && (voice.name.includes('Zuzana') || voice.name.includes('Vlasta') || voice.name.includes('Google') || voice.name.toLowerCase().includes('female'))
        ) || voices.find(voice => voice.lang === 'cs-CZ');

        if (czechVoice) {
            utterance.voice = czechVoice;
        }

        window.speechSynthesis.speak(utterance);
    } else {
        console.warn('Text-to-speech not supported');
    }
}

// Preload voices to ensure they are ready when needed (Chrome quirk)
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

// Start new round
function startNewRound() {
    clearTimeout(autoNextTimer);

    if (currentWordIndex >= gameStack.length) {
        showSummary();
        return;
    }

    const currentWord = gameStack[currentWordIndex];
    const container = document.getElementById('game-container');

    // select 3 distinct wrong answers (no duplicates)
    const wrongPool = shuffle(wordsData.filter(w => w.id !== currentWord.id));
    let wrongAnswers = wrongPool.slice(0, 3);

    // If not enough distinct wrong answers, fill by repeating from pool but prefer distinct
    if (wrongAnswers.length < 3) {
        let i = 0;
        while (wrongAnswers.length < 3 && i < wordsData.length) {
            const candidate = wordsData[i];
            if (candidate.id !== currentWord.id && !wrongAnswers.find(w => w.id === candidate.id)) {
                wrongAnswers.push(candidate);
            }
            i++;
        }
    }

    let answers = [
        { hebrew: currentWord.hebrew, correct: true },
        ...wrongAnswers.map(w => ({ hebrew: w.hebrew, correct: false }))
    ];
    answers = shuffle(answers);

    const progressPercentage = ((currentWordIndex + 1) / gameStack.length * 100).toFixed(0);

    container.innerHTML = `
        <div class="game-play-area">
            <div class="game-header-area">
                <div class="game-progress">
                    <div class="memory-timer" style="font-size: 1.1rem; font-weight: bold; color: var(--primary); margin-bottom: 2px;">
                        ⏱️ זמן: <span id="memory-timer-display">00:00</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressPercentage}%"></div>
                    </div>
                    <span class="progress-text">${currentWordIndex + 1} / ${gameStack.length}</span>
                </div>
            </div>
            
            <div class="game-card" id="game-card">
                <div class="card-content">
                    <span class="czech-word">${currentWord.czech}</span>
                    <button class="speaker-btn" onclick="speakCzech('${currentWord.czech.replace(/'/g, "\\'")}')" title="שמע הגייה">
                        🔊
                    </button>
                </div>
            </div>

            <div class="options-grid" id="options-grid"></div>
            
            <div class="game-actions" style="margin-top: 20px;">
                <button class="btn btn-primary next-btn" id="next-btn" onclick="nextRound()" style="display: none;">
                    ➡️ למילה הבאה ➡️
                </button>
            </div>
        </div>
    `;

    // Add touch listeners for swipe
    const card = document.getElementById('game-card');
    card.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    card.addEventListener('touchend', e => { 
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, {passive: true});

    const optionsGrid = document.getElementById('options-grid');
    answers.forEach(answer => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = answer.hebrew;
        btn.onclick = () => handleAnswer(btn, answer.correct, currentWord);
        optionsGrid.appendChild(btn);
    });
}

function toggleCardFlip(text) {
    // Flip logic removed in v1.4 as per user request
    speakCzech(text);
}

function handleSwipe() {
    if (touchEndX < touchStartX - 50) {
        // Swipe left - can be used for "Next" if answer is correct or shown
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn && nextBtn.style.display !== 'none') {
            nextRound();
        }
    }
}

// Handle answer
function handleAnswer(btn, isCorrect, currentWord) {
    document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);

    if (isCorrect) {
        btn.classList.add('correct');
        btn.classList.add('pulse-green');
        correctCount++;
        playSound('correct');
    } else {
        btn.classList.add('wrong');
        btn.classList.add('shake');
        playSound('wrong');

        // Show correct answer
        document.querySelectorAll('.option-btn').forEach(b => {
            if (b.textContent === currentWord.hebrew) {
                b.classList.add('correct');
                b.style.opacity = "0.7";
            }
        });

        wrongCount++;
    }

    updateScoreboard();

    const nextBtn = document.getElementById('next-btn');
    nextBtn.style.display = 'block';

    // Auto-next after 2.5 seconds
    autoNextTimer = setTimeout(() => {
        nextRound();
    }, 2500);
}

// Next round
function nextRound() {
    clearTimeout(autoNextTimer);
    currentWordIndex++;
    startNewRound();
}

// Show summary
function showSummary() {
    // Calculate Score
    let calculatedScore = 0;
    if (correctCount > 0 && gameStack.length > 0) {
        const elapsed = Math.floor((Date.now() - memoryStartTime) / 1000);
        calculatedScore = Math.round((correctCount / gameStack.length) * 10000 / Math.max(1, elapsed));
    }

    // Save highscore
    if (currentUser && calculatedScore > 0) {
        saveHighscore(1, calculatedScore); // 1 for memory game
    }

    const container = document.getElementById('game-container');
    const accuracy = gameStack.length > 0
        ? ((correctCount / gameStack.length) * 100).toFixed(1)
        : 0;

    container.innerHTML = `
        <div class="game-summary">
            <h2>🏆 כל הכבוד!</h2>
            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-label">מילים שתרגלת</span>
                    <span class="stat-value">${gameStack.length}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">תשובות נכונות</span>
                    <span class="stat-value correct">${correctCount}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">תשובות שגויות</span>
                    <span class="stat-value wrong">${wrongCount}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">אחוזי דיוק</span>
                    <span class="stat-value">${accuracy}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">זמן כולל</span>
                    <span class="stat-value">${stopMemoryTimer()}</span>
                </div>
            </div>
            <button class="btn btn-primary" onclick="showDifficultySelector()">
                🔄 שחק שוב
            </button>
        </div>
    `;
}

// ============================================
// GAMIFICATION & UX HELPERS
// ============================================

function updateGamification() {
    const totalWords = wordsData.length;
    const totalWordsEl = document.getElementById('total-words-learned');
    const progressFill = document.getElementById('total-progress-fill');

    if (totalWordsEl) totalWordsEl.textContent = totalWords;
    
    if (progressFill) {
        // Goal of 100 words for the progress bar
        const percentage = Math.min((totalWords / 100) * 100, 100);
        progressFill.style.width = `${percentage}%`;
    }
}

// Update scoreboard
function updateScoreboard() {
    document.getElementById('correctCount').textContent = correctCount;
    document.getElementById('wrongCount').textContent = wrongCount;
}

// ============================================
// AUDIO FEEDBACK HELPERS
// ============================================

function playSound(type) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'correct') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'wrong') {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
        oscillator.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.2); // A2
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.4);
    }
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById('editModal');
    if (event.target == modal) {
        closeEditModal();
    }
}

// ============================================
// AUTHENTICATION SECTION
// ============================================

let currentUser = null;

// ------- Helpers -------
function showAuthMessage(msg, isError = false) {
    const authMessages = document.getElementById('auth-messages');
    if (authMessages) {
        authMessages.textContent = msg;
        authMessages.style.color = isError ? 'var(--danger)' : 'var(--success)';
        authMessages.style.padding = '10px';
        authMessages.style.marginTop = '10px';
        authMessages.style.borderRadius = '5px';
        authMessages.style.backgroundColor = isError ? '#f8d7da' : '#d4edda';
    }
}

// ------- Auth functions -------
async function signUp(email, password) {
    try {
        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) throw error;
        showAuthMessage('נשלחה הודעת אימות אם נדרשת. בדוק את המייל.');
        return data;
    } catch (error) {
        showAuthMessage(error.message, true);
        return null;
    }
}

async function signIn(email, password) {
    try {
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showAuthMessage('התחברת בהצלחה');
        return data;
    } catch (error) {
        showAuthMessage(error.message, true);
        return null;
    }
}

async function signInWithProvider(provider) {
    try {
        const { data, error } = await _supabase.auth.signInWithOAuth({ provider });
        if (error) throw error;
        return { data, error };
    } catch (error) {
        showAuthMessage(error.message, true);
        return { data: null, error };
    }
}

async function resetPassword(email) {
    if (!email) {
        showAuthMessage('הכנס אימייל לשחזור', true);
        return;
    }
    try {
        const { error } = await _supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.href,
        });
        if (error) throw error;
        showAuthMessage('הוראות לשחזור סיסמה נשלחו למייל שלך');
    } catch (error) {
        showAuthMessage('שגיאה בשחזור סיסמה: ' + error.message, true);
    }
}

async function signOutUser() {
    try {
        const { error } = await _supabase.auth.signOut();
        if (error) throw error;
        showAuthMessage('התנתקת בהצלחה');
        currentUser = null;
    } catch (error) {
        showAuthMessage(error.message, true);
    }
}

// ------- UI update -------
function updateUIForUser(user) {
    currentUser = user;
    const userInfo = document.getElementById('user-info');
    const authForms = document.getElementById('auth-forms');
    const userEmail = document.getElementById('user-email');

    const authContainer = document.getElementById('auth-container');

    if (user) {
        if (userInfo) userInfo.style.display = 'flex';
        if (authForms) authForms.style.display = 'none';
        if (authContainer) authContainer.classList.add('logged-in');
        if (userEmail) userEmail.textContent = `משתמש: ${user.email || 'לא ידוע'}`;
    } else {
        if (userInfo) userInfo.style.display = 'none';
        if (authForms) authForms.style.display = 'block';
        if (authContainer) authContainer.classList.remove('logged-in');
        if (userEmail) userEmail.textContent = '';
    }
}

// ------- Session handling -------
async function checkAuthSession() {
    try {
        const { data } = await _supabase.auth.getSession();
        const session = data?.session ?? null;
        updateUIForUser(session?.user ?? null);
    } catch (error) {
        console.error('Auth session error:', error);
    }
}

// ------- Initialize Auth Event Listeners -------
function initializeAuthListeners() {
    // Auth state change listener
    _supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth event:', event, session);
        updateUIForUser(session?.user ?? null);

        // Refresh words when auth state changes
        if (event === 'SIGNED_IN') {
            fetchWords();
        } else if (event === 'SIGNED_OUT') {
            wordsData = [];
            renderTable();
        }
    });

    // Signup form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            await signUp(email, password);
        });
    }

    // Signin form
    const signinForm = document.getElementById('signin-form');
    if (signinForm) {
        signinForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signin-email').value;
            const password = document.getElementById('signin-password').value;
            await signIn(email, password);
        });
    }

    // Signout button
    const signoutButton = document.getElementById('signout-button');
    if (signoutButton) {
        signoutButton.addEventListener('click', async () => {
            await signOutUser();
        });
    }

    // Provider buttons (GitHub, Google)
    const providerButtons = document.querySelectorAll('.provider-btn');
    providerButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const provider = e.currentTarget.dataset.provider;
            signInWithProvider(provider);
        });
    });

    // Reset Password button
    const resetPasswordBtn = document.getElementById('reset-password-btn');
    if (resetPasswordBtn) {
        resetPasswordBtn.addEventListener('click', async () => {
            const email = document.getElementById('signin-email').value;
            await resetPassword(email);
        });
    }
}

// ============================================
// SPELLING GAME SECTION
// ============================================

let spellingTimer;
let spellingScore = 0;
let spellingTimeLeft = 60;
let currentSpellingWord = null;
let spellingGameActive = false;

function startSpellingGame() {
    if (wordsData.length < 3) {
        alert('צריך לפחות 3 מילים במילון כדי לשחק.');
        return;
    }

    const durationSelect = document.getElementById('spelling-duration');
    spellingTimeLeft = durationSelect ? parseInt(durationSelect.value) : 60;
    spellingScore = 0;
    spellingGameActive = true;

    // UI Setup
    const container = document.getElementById('spelling-container');
    container.innerHTML = `
        <div class="spelling-header">
            <div class="spelling-timer">⏳ <span id="s-timer">${spellingTimeLeft}</span>s</div>
            <div class="spelling-score">ניקוד: <span id="s-score">0</span></div>
        </div>
        
        <div class="spelling-hint" id="s-hint"></div>
        
        <div id="scrambled-word" class="scrambled-word"></div>
        
        <div class="spelling-input-section">
            <div class="spelling-input-row">
                <input type="text" id="spelling-input" placeholder="הקלד או לחץ על האותיות..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                <button class="btn btn-icon" onclick="deleteLastChar()" title="מחק תו אחרון">⌫</button>
                <button class="btn btn-icon" onclick="clearSpellingInput()" title="נקה הכל">🗑️</button>
            </div>
            <div class="spelling-action-row">
                <button class="btn btn-primary" onclick="checkSpellingAnswer()">בדיקה</button>
                <button class="btn btn-skip" onclick="skipSpellingWord()">דלג</button>
            </div>
        </div>
        <div id="spelling-feedback" style="height: 20px; color: red; margin-top: 5px;"></div>
    `;

    // Focus input on enter
    const input = document.getElementById('spelling-input');
    input.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            checkSpellingAnswer();
        }
    });
    input.focus();

    // Start Timer
    clearInterval(spellingTimer);
    spellingTimer = setInterval(() => {
        spellingTimeLeft--;
        const timerEl = document.getElementById('s-timer');
        if (timerEl) timerEl.textContent = spellingTimeLeft;

        if (spellingTimeLeft <= 0) {
            endSpellingGame();
        }
    }, 1000);

    nextSpellingRound();
}

function nextSpellingRound() {
    if (!spellingGameActive) return;

    // Pick random word (different from current if skipping/next)
    const pool = wordsData.filter(w => !currentSpellingWord || w.id !== currentSpellingWord.id);
    const randomIndex = Math.floor(Math.random() * pool.length);
    currentSpellingWord = pool[randomIndex];

    // Update Hint
    document.getElementById('s-hint').textContent = `תרגום: ${currentSpellingWord.hebrew}`;

    // Scramble logic
    const letters = currentSpellingWord.czech.split('');
    const scrambled = shuffle(letters);

    // Update Scrambled Display
    const scrambledContainer = document.getElementById('scrambled-word');
    scrambledContainer.innerHTML = '';
    scrambled.forEach(letter => {
        const div = document.createElement('div');
        div.className = 'letter-box';
        div.textContent = letter;
        div.style.cursor = 'pointer';
        div.onclick = () => handleLetterClick(letter);
        scrambledContainer.appendChild(div);
    });

    // Clear input
    const input = document.getElementById('spelling-input');
    input.value = '';
    input.focus();
}

function checkSpellingAnswer() {
    if (!spellingGameActive) return;

    const input = document.getElementById('spelling-input');
    const userAns = input.value.trim();
    const correctAns = currentSpellingWord.czech.trim();

    if (userAns.toLowerCase() === correctAns.toLowerCase()) {
        // Correct
        spellingScore++;
        document.getElementById('s-score').textContent = spellingScore;

        // Visual feedback
        input.classList.add('feedback-correct');
        setTimeout(() => input.classList.remove('feedback-correct'), 500);

        nextSpellingRound();
    } else {
        // Wrong
        input.classList.add('feedback-wrong');
        setTimeout(() => input.classList.remove('feedback-wrong'), 500);

        const feedback = document.getElementById('spelling-feedback');
        feedback.textContent = 'לא מדוייק, נסה שוב!';
        setTimeout(() => feedback.textContent = '', 1000);
    }
}

function skipSpellingWord() {
    if (!spellingGameActive) return;
    nextSpellingRound();
}

function handleLetterClick(letter) {
    if (!spellingGameActive) return;
    const input = document.getElementById('spelling-input');
    input.value += letter;
    input.focus();
}

function deleteLastChar() {
    const input = document.getElementById('spelling-input');
    input.value = input.value.slice(0, -1);
    input.focus();
}

function clearSpellingInput() {
    const input = document.getElementById('spelling-input');
    input.value = '';
    input.focus();
}

function endSpellingGame() {
    clearInterval(spellingTimer);
    spellingGameActive = false;

    // Calculate score based on correct words and time allocated
    let calculatedScore = 0;
    if (spellingScore > 0) {
        const durationSelect = document.getElementById('spelling-duration');
        const totalDuration = durationSelect ? parseInt(durationSelect.value) : 60;
        calculatedScore = Math.round((spellingScore / Math.max(1, totalDuration)) * 1000);
    }

    // Save highscore
    if (currentUser && calculatedScore > 0) {
        saveHighscore(2, calculatedScore); // 2 for spelling game
    }

    const container = document.getElementById('spelling-container');
    container.innerHTML = `
        <div class="game-summary">
            <h2>⏰ הזמן נגמר!</h2>
            <p>הצלחת לאיית <strong>${spellingScore}</strong> מילים נכון.</p>
            <button class="btn btn-primary" onclick="startSpellingGame()">שחק שוב 🔄</button>
        </div>
    `;
}

// Highscores functions
let currentHighscoreScope = 'global'; // 'global' or 'personal'
let currentHighscoreGame = 1;

window.changeHighscoreScope = function(scope) {
    currentHighscoreScope = scope;
    if (scope === 'personal' && !currentUser) {
        alert('עליך להתחבר כדי לראות שיאים אישיים.');
        currentHighscoreScope = 'global';
        document.getElementById('highscore-scope-select').value = 'global';
    }
    showHighscoresTab(currentHighscoreGame);
};

async function loadHighscores() {
    const container = document.getElementById('highscores-container');
    container.innerHTML = `
        <h2>טבלת שיאים</h2>
        
        <div style="margin-bottom: 20px; display: flex; justify-content: center; gap: 15px; align-items: center;">
            <label style="font-weight: bold;">הצג עבור:</label>
            <select id="highscore-scope-select" onchange="changeHighscoreScope(this.value)" style="padding: 8px 12px; border-radius: 8px; font-size: 1rem; border: 2px solid var(--primary-light);">
                <option value="global">כלל השחקנים (עולמי)</option>
                <option value="personal">שיאים אישיים שלי</option>
            </select>
        </div>

        <div class="highscores-tabs">
            <button class="highscore-tab active" onclick="showHighscoresTab(1)">משחק זיכרון</button>
            <button class="highscore-tab" onclick="showHighscoresTab(2)">משחק איות</button>
        </div>
        <div id="highscores-content">
            <p>טוען שיאים...</p>
        </div>
    `;

    document.getElementById('highscore-scope-select').value = currentHighscoreScope;
    showHighscoresTab(1);
}

async function showHighscoresTab(gameNumber) {
    currentHighscoreGame = gameNumber;
    
    // Update tab buttons
    document.querySelectorAll('.highscore-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.highscore-tab')[gameNumber - 1].classList.add('active');

    const content = document.getElementById('highscores-content');

    try {
        let query = _supabase
            .from('highscores')
            .select(`
                highscore,
                created_at,
                profiles!inner (
                    email
                )
            `)
            .eq('game_number', gameNumber)
            .order('highscore', { ascending: false })
            .limit(5);

        if (currentHighscoreScope === 'personal') {
            if (!currentUser) return;
            query = query.eq('user_id', currentUser.id);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (!data || data.length === 0) {
            content.innerHTML = '<p>אין עדיין שיאים למשחק זה.</p>';
            return;
        }

        let html = '<table class="highscores-table"><thead><tr><th>מקום</th><th>שיא</th><th>מייל</th><th>תאריך</th></tr></thead><tbody>';

        data.forEach((record, index) => {
            const email = record.profiles?.email || 'לא זמין';
            const maskedEmail = maskEmail(email);
            const date = new Date(record.created_at).toLocaleDateString('he-IL', {hour: '2-digit', minute:'2-digit'});

            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${record.highscore}</td>
                    <td>${maskedEmail}</td>
                    <td>${date}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        content.innerHTML = html;
    } catch (error) {
        console.error('שגיאה בטעינת שיאים:', error);
        content.innerHTML = '<p>שגיאה בטעינת שיאים.</p>';
    }
}

function maskEmail(email) {
    if (!email || typeof email !== 'string') return email;
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const local = parts[0];
    const domain = parts[1];
    if (local.length <= 3) return email; // Too short to mask nicely
    
    const firstThree = local.substring(0, 3);
    const stars = '*'.repeat(Math.max(1, local.length - 3));
    
    return firstThree + stars + '@' + domain;
}

async function saveHighscore(gameNumber, score) {
    if (!currentUser) return;

    try {
        // Insert new highscore, keeping history so user can see their top 5
        const { error } = await _supabase
            .from('highscores')
            .insert([{
                user_id: currentUser.id,
                highscore: score,
                game_number: gameNumber
            }]);

        if (error) throw error;
    } catch (error) {
        console.error('שגיאה בשמירת שיא:', error);
    }
}