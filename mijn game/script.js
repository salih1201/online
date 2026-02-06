// حالة اللعبة
const gameState = {
    isHost: false,
    peerId: null,
    conn: null,
    opponentName: 'الخصم',
    opponentAvatar: 'player2',
    myName: '',
    myAvatar: 'p1',
    myRole: null, // 'host' or 'client'

    // Game Logic
    currentScreen: 'lobby-screen',
    gameActive: false,
    rounds: 10,
    currentRound: 1,
    category: 'all',
    questions: [],

    // Scores
    myScore: 0,
    opponentScore: 0,

    // Round State
    currentQuestion: null,
    myBid: 12,
    opponentBid: 12,
    myBidLocked: false,
    opponentBidLocked: false,
    activePlayer: null, // 'host' or 'client'

    // Timer
    timerInterval: null,
    timeRemaining: 0
};

// PeerJS Instance
let peer = null;

// ==========================================
// Initialization & PeerJS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initPeer();

    // Avatar Setup
    if (document.getElementById('my-avatar')) {
        gameState.myAvatar = 'seed' + Math.floor(Math.random() * 1000);
        document.getElementById('my-avatar').src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${gameState.myAvatar}`;
    }

    // Event Listeners
    const nameInput = document.getElementById('my-name');
    if (nameInput) {
        nameInput.addEventListener('input', (e) => {
            gameState.myName = e.target.value;
            validateSetup();
        });
    }

    const joinInput = document.getElementById('join-code-input');
    if (joinInput) {
        joinInput.addEventListener('input', validateSetup);
    }

    // Bid Slider
    const bidSlider = document.getElementById('bid-slider');
    if (bidSlider) {
        bidSlider.addEventListener('input', (e) => {
            if (!gameState.myBidLocked) {
                gameState.myBid = parseInt(e.target.value);
                updateBidUI();
                // Send live update to opponent
                sendData('STATE_UPDATE', {
                    event: 'LIVE_BID_UPDATE',
                    bidValue: gameState.myBid
                });
            }
        });
    }

    // Disable Sound
    window.playSound = () => { }; // No-op
});

function initPeer() {
    peer = new Peer(); // Cloud hosted PeerJS

    peer.on('open', (id) => {
        gameState.peerId = id;
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.textContent = '✅ متصل بالخادم';
            statusEl.style.color = 'var(--success-color)';
        }
        validateSetup();
    });

    peer.on('connection', (conn) => {
        // Only Host receives this initially
        handleConnection(conn);
    });

    peer.on('error', (err) => {
        console.error(err);
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.textContent = '❌ خطأ في الاتصال';
        }
        // alert('خطأ في الاتصال: ' + err.type);
    });
}

function validateSetup() {
    if (!document.getElementById('btn-host')) return;

    const nameEntered = gameState.myName.trim().length > 0;
    const hasPeerId = !!gameState.peerId;

    document.getElementById('btn-host').disabled = !(nameEntered && hasPeerId);

    const joinCode = document.getElementById('join-code-input').value.trim();
    document.getElementById('btn-join').disabled = !(nameEntered && hasPeerId && joinCode);
}

function changeMyAvatar() {
    gameState.myAvatar = 'seed' + Math.floor(Math.random() * 1000);
    document.getElementById('my-avatar').src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${gameState.myAvatar}`;
}

// ==========================================
// Hosting & Joining
// ==========================================

function hostGame() {
    gameState.isHost = true;
    gameState.myRole = 'host';

    // Show Code
    document.getElementById('host-info').classList.remove('hidden');
    document.getElementById('room-code').textContent = gameState.peerId;

    // Game Settings
    gameState.rounds = parseInt(document.getElementById('rounds-select').value);

    // Prepare Questions (Host Only)
    prepareQuestions();
}

function joinGame() {
    gameState.isHost = false;
    gameState.myRole = 'client';

    const hostId = document.getElementById('join-code-input').value.trim();
    const conn = peer.connect(hostId);

    document.getElementById('btn-join').textContent = 'جاري الاتصال...';
    document.getElementById('btn-join').disabled = true;

    handleConnection(conn);
}

function handleConnection(conn) {
    gameState.conn = conn;

    conn.on('open', () => {
        console.log('Connected to: ' + conn.peer);

        // Send my info
        sendData('HELLO', {
            name: gameState.myName,
            avatar: gameState.myAvatar
        });
    });

    conn.on('data', (data) => {
        handleData(data);
    });

    conn.on('close', () => {
        alert('انقطع الاتصال بالطرف الآخر!');
        setTimeout(() => location.reload(), 2000);
    });
}

function sendData(type, payload) {
    if (gameState.conn && gameState.conn.open) {
        gameState.conn.send({ type, payload });
    }
}

function handleData(data) {
    const { type, payload } = data;
    // console.log('Received:', type, payload);

    switch (type) {
        case 'HELLO':
            gameState.opponentName = payload.name;
            gameState.opponentAvatar = payload.avatar;

            if (gameState.isHost) {
                // Show "Player Joined" UI
                document.getElementById('host-status-text').classList.add('hidden');
                document.getElementById('player-joined-area').classList.remove('hidden');
                document.getElementById('joined-player-name').textContent = gameState.opponentName;

                // Send acknowledgment
                sendData('ACK_JOIN', { hostName: gameState.myName });
            }
            break;

        case 'ACK_JOIN':
            // Client sees this, knows connection is solid
            document.getElementById('btn-join').textContent = '✅ تم الاتصال! بانتظار المضيف...';
            break;

        case 'WELCOME':
            gameState.rounds = payload.rounds;
            gameState.category = payload.category;
            gameState.opponentName = payload.hostName;
            gameState.opponentAvatar = payload.hostAvatar;
            break;

        case 'STATE_UPDATE':
            syncState(payload);
            break;
    }
}

function startHostGame() {
    // Initial syncing
    sendData('WELCOME', {
        rounds: gameState.rounds,
        category: gameState.category,
        hostName: gameState.myName,
        hostAvatar: gameState.myAvatar
    });

    // Give a small buffer for WELCOME to arrive
    setTimeout(() => {
        startGameflow();
    }, 500);
}

function copyRoomCode() {
    const code = document.getElementById('room-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector('.btn-copy');
        btn.innerHTML = '<span class="material-icons">check</span>';
        setTimeout(() => {
            btn.innerHTML = '<span class="material-icons">content_copy</span>';
        }, 2000);
    });
}

// ==========================================
// Game Flow (Host Logic)
// ==========================================

function prepareQuestions() {
    // Flatten categories from questionsBank (assuming questionsBank is globally available from questions.js)
    if (typeof questionsBank === 'undefined') {
        console.error('Questions bank not loaded!');
        return;
    }

    let allQuestions = [...questionsBank]; // from questions.js

    // Shuffle
    allQuestions.sort(() => Math.random() - 0.5);
    gameState.questions = allQuestions.slice(0, gameState.rounds);
}

function startGameflow() {
    gameState.currentRound = 1;
    gameState.myScore = 0;
    gameState.opponentScore = 0;

    startBiddingPhase();
}

function startBiddingPhase() {
    // Reset Round State
    gameState.myBid = 12;
    gameState.opponentBid = 12; // Default
    gameState.myBidLocked = false;
    gameState.opponentBidLocked = false;

    const packet = {
        screen: 'bidding-screen',
        round: gameState.currentRound,
        hostScore: gameState.myScore,
        clientScore: gameState.opponentScore
    };

    // Notify Client & Self
    sendData('STATE_UPDATE', packet);
    syncState(packet);
}

function lockMyBid() {
    gameState.myBidLocked = true;

    // UI Update immediately
    document.getElementById('lock-bid-btn').disabled = true;
    document.getElementById('lock-bid-btn').classList.add('locked');
    document.getElementById('lock-bid-btn').textContent = 'تم التثبيت ✅';
    document.querySelector('.player-bid-card.my-card').classList.add('locked');

    // Send to other player
    sendData('STATE_UPDATE', {
        event: 'OPPONENT_LOCKED_BID',
        bidValue: gameState.myBid
    });

    checkBothBidsLocked();
}

// Receiving Updates
function syncState(payload) {
    // Screen Navigation
    if (payload.screen && payload.screen !== gameState.currentScreen) {
        showScreen(payload.screen);

        // If entering bidding screen
        if (payload.screen === 'bidding-screen') {
            setupBiddingScreen(payload);
        }
    }

    // Events
    if (payload.event === 'OPPONENT_LOCKED_BID') {
        gameState.opponentBidLocked = true;
        gameState.opponentBid = payload.bidValue;

        const opponentCard = document.querySelector('.player-bid-card.opponent-card');
        if (opponentCard) opponentCard.classList.add('locked');

        checkBothBidsLocked();
    }

    if (payload.event === 'LIVE_BID_UPDATE') {
        // Just visual feedback could be added here if we want to show opponent slider moving
        // For now kept hidden for fairness, or maybe just show "Changing..." status
    }

    if (payload.event === 'START_EXECUTION') {
        startExecutionPhase(payload.activePlayerRole, payload.question, payload.bidTime);
    }

    if (payload.event === 'CLIENT_ANSWER' && gameState.isHost) {
        checkAnswer(payload.answerIndex);
    }

    if (payload.event === 'ROUND_RESULT') {
        showRoundResult(payload);
    }

    if (payload.event === 'GAME_OVER') {
        showFinalResults(payload);
    }
}

function setupBiddingScreen(payload) {
    document.getElementById('round-number-bid').textContent = payload.round;

    // P1 is always Host in the data, but UI depends on role
    // Score Badge 1 = Host, Score Badge 2 = Client
    const p1ScoreEl = document.querySelector('.player1-score span:last-child');
    const p2ScoreEl = document.querySelector('.player2-score span:last-child');

    if (p1ScoreEl) p1ScoreEl.textContent = payload.hostScore;
    if (p2ScoreEl) p2ScoreEl.textContent = payload.clientScore;

    // Set Names/Avatars on Bidding Screen (if not static)
    // We should update them based on roles once
    updatePlayerProfiles();

    // Reset Controls
    gameState.myBidLocked = false;
    gameState.myBid = 12;
    updateBidUI();
    document.getElementById('bid-slider').value = 12;

    const lockBtn = document.getElementById('lock-bid-btn');
    if (lockBtn) {
        lockBtn.disabled = false;
        lockBtn.classList.remove('locked');
        lockBtn.textContent = 'تثبيت المزايدة 🔒';
    }

    document.querySelectorAll('.player-bid-card').forEach(c => c.classList.remove('locked'));
}

function updatePlayerProfiles() {
    // My Card
    const myNameEl = document.querySelector('.player-bid-card.my-card .bidding-player-name');
    const myAvatarEl = document.querySelector('.player-bid-card.my-card .bidding-avatar');
    if (myNameEl) myNameEl.textContent = gameState.myName;
    if (myAvatarEl) myAvatarEl.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${gameState.myAvatar}`;

    // Opponent Card
    const opNameEl = document.querySelector('.player-bid-card.opponent-card .bidding-player-name');
    const opAvatarEl = document.querySelector('.player-bid-card.opponent-card .bidding-avatar');
    if (opNameEl) opNameEl.textContent = gameState.opponentName;
    if (opAvatarEl) opAvatarEl.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${gameState.opponentAvatar}`;
}

function checkBothBidsLocked() {
    if (gameState.myBidLocked && gameState.opponentBidLocked) {
        if (gameState.isHost) {
            setTimeout(determineBidWinner, 1000);
        }
    }
}

function determineBidWinner() {
    let winner = null; // 'host' or 'client'

    // Lower bid wins
    if (gameState.myBid < gameState.opponentBid) {
        winner = 'host';
    } else if (gameState.opponentBid < gameState.myBid) {
        winner = 'client';
    } else {
        winner = Math.random() > 0.5 ? 'host' : 'client';
    }

    const winningBid = winner === 'host' ? gameState.myBid : gameState.opponentBid;
    gameState.activePlayer = winner;

    // Get Question
    gameState.currentQuestion = gameState.questions[gameState.currentRound - 1];
    if (!gameState.currentQuestion) {
        // Fallback / End game safety
        finishGame();
        return;
    }

    const packet = {
        event: 'START_EXECUTION',
        activePlayerRole: winner,
        question: gameState.currentQuestion,
        bidTime: winningBid,
        screen: 'execution-screen'
    };

    sendData('STATE_UPDATE', packet);
    syncState(packet);
}

// ==========================================
// Execution Phase
// ==========================================

function startExecutionPhase(activeRole, question, time) {
    showScreen('execution-screen');

    const isMyTurn = (gameState.myRole === activeRole);

    document.getElementById('active-player-name').textContent = isMyTurn ? gameState.myName : gameState.opponentName;
    document.getElementById('active-player-avatar').src = isMyTurn ?
        document.getElementById('my-avatar').src :
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${gameState.opponentAvatar}`;

    document.getElementById('question-category').textContent = categoryNames[question.category] || 'عام';
    document.getElementById('question-text').textContent = question.question;

    // Setup Answers
    const answersGrid = document.getElementById('answers-grid');
    answersGrid.innerHTML = '';

    question.answers.forEach((ans, index) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = ans;
        if (isMyTurn) {
            btn.onclick = () => submitAnswer(index);
        } else {
            btn.classList.add('disabled');
        }
        answersGrid.appendChild(btn);
    });

    // Timer
    gameState.timeRemaining = time;
    updateTimerDisplay();

    // Ensure clear any existing interval
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);

    if (gameState.isHost) {
        gameState.timerInterval = setInterval(() => {
            gameState.timeRemaining--;

            // Sync specific second updates to keep screens roughly aligned? 
            // Or just rely on end state. For now, local decrement on both sides would be smoother,
            // but for simplicity, let's have Host broadcast every second or just rely on independent timers (risky sync).
            // Better: Host broadcasts 'TIMER_TICK' every second.
            sendData('STATE_UPDATE', { event: 'TIMER_TICK', time: gameState.timeRemaining });
            updateTimerDisplay();

            if (gameState.timeRemaining <= 0) {
                clearInterval(gameState.timerInterval);
                handleTimeUp();
            }
        }, 1000);
    } else {
        // Client Listener for Ticks
        // Handled in syncState via 'TIMER_TICK'
    }
}

// Update syncState to handle TIMER_TICK
const originalSyncState = syncState; // avoid recursion issues if re-defined
// merged into main syncState below for clarity

function updateTimerDisplay() {
    const timerCircle = document.getElementById('execution-timer-circle');
    if (timerCircle) timerCircle.textContent = gameState.timeRemaining;

    const ring = document.querySelector('.progress-ring-circle');
    if (ring) {
        const progress = (gameState.timeRemaining / 30) * 100;
        ring.style.strokeDashoffset = 283 - (283 * progress / 100);
    }
}

function submitAnswer(index) {
    if (gameState.isHost) {
        checkAnswer(index); // Host answers directly
    } else {
        sendData('STATE_UPDATE', {
            event: 'CLIENT_ANSWER',
            answerIndex: index
        });
    }
}

function checkAnswer(index) {
    clearInterval(gameState.timerInterval);

    const correct = (index === gameState.currentQuestion.correct);
    let points = 0;

    if (correct) {
        points = 100 + (gameState.timeRemaining * 10);
        if (gameState.activePlayer === 'host') gameState.myScore += points;
        else gameState.opponentScore += points;
    } else {
        points = 25; // Points to NON-active player
        if (gameState.activePlayer === 'host') gameState.opponentScore += points;
        else gameState.myScore += points;
    }

    const resultPacket = {
        event: 'ROUND_RESULT',
        screen: 'round-result-screen',
        correct: correct,
        points: points,
        correctText: gameState.currentQuestion.answers[gameState.currentQuestion.correct],
        activePlayerRole: gameState.activePlayer,
        hostScore: gameState.myScore,
        clientScore: gameState.opponentScore
    };

    sendData('STATE_UPDATE', resultPacket);
    syncState(resultPacket);
}

function handleTimeUp() {
    checkAnswer(-1);
}

// ==========================================
// Results Phase
// ==========================================

function showRoundResult(payload) {
    showScreen('round-result-screen');

    const isActive = (gameState.myRole === payload.activePlayerRole);
    const success = payload.correct;

    const banner = document.querySelector('.round-result-banner');
    const title = banner.querySelector('h2');

    banner.classList.remove('success', 'failure');
    if (success) {
        banner.classList.add('success');
        title.textContent = isActive ? 'إجابة صحيحة! 🎉' : 'أجاب خصمك بشكل صحيح';
    } else {
        banner.classList.add('failure');
        title.textContent = isActive ? 'إجابة خاطئة 😔' : 'أخطأ خصمك!';
    }

    document.getElementById('result-points').textContent = `+${payload.points}`;
    document.getElementById('result-correct-answer').textContent = payload.correctText;

    // Scores Update
    // Host Score is consistently passed as 'hostScore', Client as 'clientScore'
    const p1ScoreEl = document.getElementById('r-p1-score');
    const p2ScoreEl = document.getElementById('r-p2-score');

    if (p1ScoreEl) p1ScoreEl.textContent = payload.hostScore;
    if (p2ScoreEl) p2ScoreEl.textContent = payload.clientScore;

    const nextBtn = document.getElementById('btn-next-round');
    if (gameState.isHost) {
        nextBtn.style.display = 'block';
        nextBtn.onclick = nextRound;
    } else {
        nextBtn.style.display = 'none';
    }
}

function nextRound() {
    if (gameState.currentRound < gameState.rounds) {
        gameState.currentRound++;
        startGameflow();
    } else {
        finishGame();
    }
}

function finishGame() {
    let winner = '';
    if (gameState.myScore > gameState.opponentScore) winner = 'host';
    else if (gameState.opponentScore > gameState.myScore) winner = 'client';
    else winner = 'draw';

    const packet = {
        event: 'GAME_OVER',
        screen: 'final-results-screen',
        winnerRole: winner,
        hostScore: gameState.myScore,
        clientScore: gameState.opponentScore
    };

    sendData('STATE_UPDATE', packet);
    syncState(packet);
}

function showFinalResults(payload) {
    showScreen('final-results-screen');

    const isMeWinner = (gameState.myRole === payload.winnerRole);
    const isDraw = (payload.winnerRole === 'draw');

    const title = document.querySelector('.winner-announcement h2');
    if (isDraw) {
        title.textContent = 'تعادل! 🤝';
    } else {
        title.textContent = isMeWinner ? 'مبروك! أنت الفائز 🏆' : 'حظ أوفر! فاز خصمك 👏';
    }

    document.getElementById('final-p1-score').textContent = payload.hostScore;
    document.getElementById('final-p2-score').textContent = payload.clientScore;
}

// ==========================================
// Utilities
// ==========================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        gameState.currentScreen = screenId;
    }
}

function updateBidUI() {
    const disp = document.getElementById('bid-display');
    if (disp) disp.textContent = gameState.myBid + ' ثانية';
}

// Patch syncState for tick
const _baseSyncState = syncState;
syncState = function (payload) {
    // Call original logic handling
    // (Since I defined it above, I can just merge the logic here or call it if I didn't overwrite it inside itself, which is tricky in JS scopes without care. 
    // I'll just add the TICK handling here and rely on the function definition hoisting)

    if (payload.event === 'TIMER_TICK') {
        gameState.timeRemaining = payload.time;
        updateTimerDisplay();
        return;
    }

    // Normal handling
    if (payload.screen && payload.screen !== gameState.currentScreen) {
        showScreen(payload.screen);
        if (payload.screen === 'bidding-screen') setupBiddingScreen(payload);
    }
    if (payload.event === 'OPPONENT_LOCKED_BID') {
        gameState.opponentBidLocked = true;
        gameState.opponentBid = payload.bidValue;
        document.querySelector('.player-bid-card.opponent-card').classList.add('locked');
        checkBothBidsLocked();
    }
    if (payload.event === 'START_EXECUTION') startExecutionPhase(payload.activePlayerRole, payload.question, payload.bidTime);
    if (payload.event === 'CLIENT_ANSWER' && gameState.isHost) checkAnswer(payload.answerIndex);
    if (payload.event === 'ROUND_RESULT') showRoundResult(payload);
    if (payload.event === 'GAME_OVER') showFinalResults(payload);
};
