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

    // Initialize game if game tab
    if (tabName === 'game') {
        showDifficultySelector();
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
            <div class="game-progress">
                <div class="memory-timer" style="font-size: 1.1rem; font-weight: bold; color: var(--primary); margin-bottom: 2px;">
                    ⏱️ זמן: <span id="memory-timer-display">00:00</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercentage}%"></div>
                </div>
                <span class="progress-text">${currentWordIndex + 1} / ${gameStack.length}</span>
            </div>
            <div class="game-card" onclick="speakCzech('${currentWord.czech.replace(/'/g, "\\'")}')" style="cursor: pointer; position: relative;">
                ${currentWord.czech} <span style="font-size: 1.2rem; position: absolute; right: 10px; top: 10px;">🔊</span>
            </div>
            <div class="options-grid" id="options-grid"></div>
            <button class="btn btn-primary next-btn" id="next-btn" onclick="nextRound()" style="display: none;">
                ➡️ למילה הבאה ➡️
            </button>
        </div>
    `;

    const optionsGrid = document.getElementById('options-grid');
    answers.forEach(answer => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = answer.hebrew;
        btn.onclick = () => handleAnswer(btn, answer.correct, currentWord);
        optionsGrid.appendChild(btn);
    });
}

// Handle answer
function handleAnswer(btn, isCorrect, currentWord) {
    document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);

    if (isCorrect) {
        btn.classList.add('correct');
        correctCount++;
    } else {
        btn.classList.add('wrong');

        // Show correct answer in light green until next
        document.querySelectorAll('.option-btn').forEach(b => {
            if (b.textContent === currentWord.hebrew) {
                b.classList.add('correct-shown');
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
    const container = document.getElementById('game-container');
    const accuracy = gameStack.length > 0
        ? ((correctCount / gameStack.length) * 100).toFixed(1)
        : 0;

    container.innerHTML = `
        <div class="game-summary">
            <h2>🎉 סיימת!</h2>
            <p>מילים: <strong>${gameStack.length}</strong></p>
            <p>תשובות נכונות: <strong>${correctCount}</strong></p>
            <p>תשובות שגויות: <strong>${wrongCount}</strong></p>
            <p>דיוק: <strong>${accuracy}%</strong></p>
            <p>זמן כולל: <strong>${stopMemoryTimer()}</strong></p>
            <button class="btn btn-primary" onclick="showDifficultySelector()" style="margin-top: 20px;">
                שחק שוב 🔄
            </button>
        </div>
    `;
}

// Update scoreboard
function updateScoreboard() {
    document.getElementById('correctCount').textContent = correctCount;
    document.getElementById('wrongCount').textContent = wrongCount;
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
            <div style="position: relative; display: flex; align-items: center; gap: 5px;">
                <input type="text" id="spelling-input" placeholder="הקלד או לחץ על האותיות..." autocomplete="off" style="flex: 1;">
                <button class="btn btn-secondary" onclick="deleteLastChar()" title="מחק תו אחרון">⌫</button>
                <button class="btn btn-danger" onclick="clearSpellingInput()" title="נקה הכל">🗑️</button>
            </div>
            <button class="btn btn-primary" onclick="checkSpellingAnswer()" style="margin-top: 10px; width: 100%;">בדיקה ✅</button>
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

    // Pick random word
    const randomIndex = Math.floor(Math.random() * wordsData.length);
    currentSpellingWord = wordsData[randomIndex];

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

    const container = document.getElementById('spelling-container');
    container.innerHTML = `
        <div class="game-summary">
            <h2>⏰ הזמן נגמר!</h2>
            <p>הצלחת לאיית <strong>${spellingScore}</strong> מילים נכון.</p>
            <button class="btn btn-primary" onclick="startSpellingGame()">שחק שוב 🔄</button>
        </div>
    `;
}