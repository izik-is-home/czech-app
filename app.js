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

// Initialize
window.onload = async () => {
    try {
        _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
        const { data, error } = await _supabase
            .from('vocabulary')
            .select('*');
        
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
    
    if (btn) btn.disabled = true;
    
    try {
        const { data, error } = await _supabase
            .from('vocabulary')
            .insert([{ czech, hebrew }]);
        
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
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    
    // Add active to clicked button
    if (event && event.target) event.target.classList.add('active');
    
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
            <h2>בחר קשיות</h2>
            <p>כמה כרטיסיות תרצה לשחק?</p>
            <div class="difficulty-buttons">
    `;
    
    const options = [4, 5, 10, 15, 20];
    options.forEach(option => {
        if (option <= maxCards) {
            difficultyHTML += `
                <button class="difficulty-btn ${option === selectedDifficulty ? 'selected' : ''}" 
                        onclick="startGameWithDifficulty(${option}, this)">
                    ${option} כרטיסיות
                </button>
            `;
        }
    });
    
    if (maxCards > 20) {
        difficultyHTML += `
            <button class="difficulty-btn ${maxCards === selectedDifficulty ? 'selected' : ''}" 
                    onclick="startGameWithDifficulty(${maxCards}, this)">
                הכל (${maxCards})
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
    const take = Math.min(selectedDifficulty, pool.length);
    gameStack = pool.slice(0, take); // unique, random, non-repeating
    currentWordIndex = 0;
    correctCount = 0;
    wrongCount = 0;
    updateScoreboard();
    
    startNewRound();
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
        <div class="game-progress">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressPercentage}%"></div>
            </div>
            <span class="progress-text">${currentWordIndex + 1} / ${gameStack.length}</span>
        </div>
        <div class="game-card">${currentWord.czech}</div>
        <div class="options-grid" id="options-grid"></div>
        <button class="btn btn-primary next-btn" id="next-btn" onclick="nextRound()" style="display: none;">
            ➡️ למילה הבאה ➡️
        </button>
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
window.onclick = function(event) {
    const modal = document.getElementById('editModal');
    if (event.target == modal) {
        closeEditModal();
    }
}