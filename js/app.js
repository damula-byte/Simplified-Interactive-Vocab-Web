/* ==========================================================================
   CORE APPLICATION LOGIC
   ========================================================================== */
const app = {
    init() {
        // Pre-fill textarea
        utils.$('host-vocab').value = sampleVocab;
        utils.$('host-vocab').addEventListener('input', this.updateVocabCount);
        this.updateVocabCount();

        // Check config
        if (firebaseConfig.projectId === "YOUR_PROJECT_ID") {
            this.showView('view-warning');
            return;
        }

        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.database();
            
            // Handle URL join
            const urlParams = new URLSearchParams(window.location.search);
            const roomParam = urlParams.get('room');
            if (roomParam) {
                utils.$('join-code').value = roomParam;
                this.showView('view-join');
                return;
            }

            // Handle Reconnect
            const savedSession = sessionStorage.getItem('vocabMasterSession');
            if (savedSession) {
                const s = JSON.parse(savedSession);
                if (Date.now() - s.timestamp < 24 * 60 * 60 * 1000) {
                    utils.$('join-name').value = s.playerName;
                    utils.$('join-code').value = s.roomId;
                    this.joinRoom();
                    return;
                }
            }

            this.showView('view-landing');
        } catch (e) {
            console.error("Firebase Init Error", e);
            utils.showError("Failed to connect to server. Check config.");
        }
    },

    showView(viewId) {
        document.querySelectorAll('.view').forEach(el => {
            el.classList.remove('active');
            setTimeout(() => el.style.display = 'none', 300); // Wait for fade
        });
        setTimeout(() => {
            const v = utils.$(viewId);
            v.style.display = 'block';
            // Trigger reflow to restart animation
            void v.offsetWidth;
            v.classList.add('active');
        }, 300);
    },

    updateVocabCount() {
        const text = utils.$('host-vocab').value;
        const pairs = text.split('\n').filter(l => l.includes(':')).length;
        utils.$('vocab-count').innerText = `Pairs detected: ${pairs}`;
        utils.$('vocab-count').style.color = pairs >= 4 ? 'var(--success)' : 'var(--danger)';
    },

    parseVocab() {
        const text = utils.$('host-vocab').value;
        const pairs = text.split('\n')
            .map(r => r.split(':'))
            .filter(r => r.length === 2 && r[0].trim() && r[1].trim())
            .map((r, i) => ({ id: `w${i}`, w: r[0].trim(), d: r[1].trim() }));
        return pairs;
    },

    /* --- HOST LOGIC --- */
    async createRoom() {
        const vocab = this.parseVocab();
        if (vocab.length < 4) {
            utils.showError("Please enter at least 4 word:definition pairs.");
            return;
        }

        utils.showSpinner();
        state.role = 'HOST';
        state.roomId = utils.generateId(6);
        state.vocab = vocab;
        state.mode = utils.$('host-mode').value;

        dbRefs.room = db.ref(`rooms/${state.roomId}`);
        
        try {
            await dbRefs.room.set({
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                vocab: state.vocab,
                mode: state.mode,
                gameState: 'LOBBY',
                currentQuestionIndex: -1,
                questionData: null
            });

            // Disconnect cleanup for host (removes room)
            dbRefs.room.onDisconnect().remove();

            // Listen for players
            utils.addListener(db.ref(`rooms/${state.roomId}/players`), 'value', snap => {
                const players = snap.val() || {};
                const list = Object.values(players).sort((a,b) => b.score - a.score);
                
                // Lobby rendering
                utils.$('lobby-player-count').innerText = list.length;
                utils.$('lobby-player-list').innerHTML = list.map(p => `<div class="player-list-item"><span>${p.name}</span><span>${p.score}</span></div>`).join('');
                utils.$('btn-start-game').disabled = list.length === 0;

                // Live stats rendering (host dashboard during PLAYING)
                if (isTimedMode(state.mode)) {
                    const total = state.questionSet.length || state.vocab.length;
                    utils.$('live-player-list').innerHTML = list.map(p => {
                        const qIdx = Math.min(p.qIndex || 0, total);
                        const pct = total > 0 ? Math.round((qIdx / total) * 100) : 0;
                        const done = qIdx >= total;
                        return `
                            <div class="player-list-item" style="flex-direction:column; align-items:stretch; gap:6px;">
                                <div style="display:flex; justify-content:space-between;">
                                    <span>${p.name} ${done ? '✅' : ''}</span>
                                    <strong>${p.score} pts</strong>
                                </div>
                                <div class="progress-bar" style="margin-bottom:0;">
                                    <div class="progress-fill" style="width:${pct}%; background:${done ? 'var(--success)' : 'var(--secondary)'};"></div>
                                </div>
                                <div style="font-size:0.8rem; color:var(--text-light);">Question ${qIdx}/${total}</div>
                            </div>
                        `;
                    }).join('');
                } else {
                    utils.$('live-player-list').innerHTML = list.map(p => `<div class="player-list-item"><span>${p.name}</span><strong>${p.score}</strong></div>`).join('');
                }
            });

            // Host: also listen to room-level state so host sees gameState changes (RESULTS, etc.)
            utils.addListener(db.ref(`rooms/${state.roomId}`), 'value', (snap) => {
                const r = snap.val();
                if(!r) return;
                if(r.gameState === 'RESULTS') {
                    // Show results with the latest players snapshot
                    this.showResults(r.players || {});
                }
            });

            utils.hideSpinner();
            utils.$('lobby-room-code').innerText = state.roomId;
            const link = `${window.location.origin}${window.location.pathname}?room=${state.roomId}`;
            utils.$('lobby-room-link').href = link;
            utils.$('lobby-room-link').innerText = link;
            
            utils.$('hdr-room').classList.remove('hidden');
            utils.$('hdr-room-code').innerText = state.roomId;

            this.showView('view-host-lobby');
        } catch (e) {
            utils.hideSpinner();
            utils.showError("Connection error. Please check your internet and rules.");
        }
    },

    async startGame() {
        if(state.role !== 'HOST') return;
        this.showView('view-game');
        utils.$('host-game-controls').classList.remove('hidden');
        utils.$('host-live-stats').classList.remove('hidden');

        if (isTimedMode(state.mode)) {
            // Self-paced: pre-generate the full question set, write once, players progress on their own.
            state.questionSet = this.generateQuestionSet(state.mode);
            utils.$('btn-next-q').classList.add('hidden'); // host doesn't control pacing
            utils.$('game-area').classList.add('hidden'); // host doesn't see a shared question
            utils.$('host-self-paced-note').classList.remove('hidden');
            utils.$('host-live-stats-title').innerText = 'Live Progress';
            await dbRefs.room.update({ gameState: 'PLAYING', questionSet: state.questionSet });
        } else {
            // Host-paced: broadcast one chunk at a time.
            state.currentQuestionIndex = 0;
            utils.$('btn-next-q').classList.remove('hidden');
            utils.$('game-area').classList.remove('hidden');
            utils.$('host-self-paced-note').classList.add('hidden');
            utils.$('host-live-stats-title').innerText = 'Live Scores';
            await dbRefs.room.update({ gameState: 'PLAYING' });
            this.nextQuestion();
        }
    },

    // Build one question object for a given vocab item + mode (used for timed/self-paced modes)
    buildQuestion(qType, vocabItem, index) {
        if (qType === 'MULTIPLE_CHOICE') {
            const correct = vocabItem;
            let wrongs = state.vocab.filter(v => v.id !== correct.id);
            wrongs = utils.shuffle(wrongs).slice(0, 3);
            let options = utils.shuffle([correct, ...wrongs]);
            return {
                def: correct.d,
                options: options.map(o => ({ id: o.id, w: o.w })),
                correctId: correct.id,
                duration: 10000 // 10 seconds
            };
        }
        else if (qType === 'FILL_BLANK') {
            const correct = vocabItem;
            let sentence = `Definition: ${correct.d}. Word: ______`;
            return { sentence: sentence, target: correct.w, duration: 15000 };
        }
        else if (qType === 'SPEED_SPRINT') {
            const correct = vocabItem;
            const isTrue = Math.random() < 0.5;
            let shownDef = correct.d;
            if (!isTrue) {
                const others = state.vocab.filter(v => v.id !== correct.id);
                if (others.length > 0) shownDef = utils.shuffle(others)[0].d;
            }
            return {
                word: correct.w,
                def: shownDef,
                isTrue: (shownDef === correct.d),
                duration: 6000 // 6 seconds - fast paced
            };
        }
        return null;
    },

    // Pre-generate the full question list for timed/self-paced modes
    generateQuestionSet(qType) {
        return utils.shuffle([...state.vocab]).map((item, i) => this.buildQuestion(qType, item, i));
    },

    async nextQuestion() {
        if(state.role !== 'HOST') return;

        let qData = null;
        let qType = state.mode;

        if (qType === 'DRAG_DROP' || qType === 'MATCHING') {
            // Give 4-6 words at a time
            if (state.currentQuestionIndex >= Math.ceil(state.vocab.length / 4)) { this.endGame(); return; }
            const chunk = state.vocab.slice(state.currentQuestionIndex * 4, (state.currentQuestionIndex * 4) + 4);
            qData = { items: chunk };
            state.currentQuestionIndex++;
        }

        await dbRefs.room.update({
            currentQuestionIndex: state.currentQuestionIndex,
            questionData: qData
        });
    },

    async endGame() {
        if(state.role !== 'HOST') return;
        if(confirm("Are you sure you want to end the game and show results?")) {
            await dbRefs.room.update({ gameState: 'RESULTS' });
            // Fallback: some hosting environments (GitHub Pages) may delay
            // realtime listeners firing for the host client. Immediately fetch
            // the latest players snapshot and show results locally so the
            // host sees the final screen reliably.
            try {
                const snap = await db.ref(`rooms/${state.roomId}/players`).once('value');
                const playersObj = snap.exists() ? snap.val() : {};
                this.showResults(playersObj);
            } catch (e) {
                console.warn('Failed to fetch players for results fallback', e);
            }
        }
    },

    async playAgain() {
        if(state.role !== 'HOST') return;
        // Reset scores and progress
        const snap = await db.ref(`rooms/${state.roomId}/players`).once('value');
        const updates = {};
        if(snap.exists()) {
            Object.keys(snap.val()).forEach(k => {
                updates[`${k}/score`] = 0;
                updates[`${k}/qIndex`] = 0;
                updates[`${k}/answers`] = [];
            });
        }
        await db.ref(`rooms/${state.roomId}/players`).update(updates);
        state.questionSet = [];
        state.currentQuestionIndex = -1;
        await dbRefs.room.update({ gameState: 'LOBBY', currentQuestionIndex: -1, questionData: null, questionSet: null });
        this.showView('view-host-lobby');
    },

    // Return to the lobby without resetting scores - lets the host review the room/player list
    async returnToLobby() {
        if(state.role !== 'HOST') return;
        // Reset everyone's question progress so a future round starts from question 1
        const snap = await db.ref(`rooms/${state.roomId}/players`).once('value');
        const updates = {};
        if(snap.exists()) {
            Object.keys(snap.val()).forEach(k => updates[`${k}/qIndex`] = 0);
        }
        await db.ref(`rooms/${state.roomId}/players`).update(updates);
        state.questionSet = [];
        state.currentQuestionIndex = -1;
        await dbRefs.room.update({ gameState: 'LOBBY', currentQuestionIndex: -1, questionData: null, questionSet: null });
        this.showView('view-host-lobby');
    },

    downloadCSV() {
        db.ref(`rooms/${state.roomId}/players`).once('value', snap => {
            if(!snap.exists()) return;
            const players = Object.values(snap.val()).sort((a,b) => b.score - a.score);
            let csv = 'Rank,Name,Score\n';
            players.forEach((p, i) => csv += `${i+1},"${p.name}",${p.score}\n`);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `VocabScores_${state.roomId}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    },

    /* --- PLAYER LOGIC --- */
    async joinRoom() {
        const name = utils.$('join-name').value.trim();
        const code = utils.$('join-code').value.trim().toUpperCase();

        if (!name || code.length !== 6) {
            utils.showError("Please enter a valid name and 6-letter code.");
            return;
        }

        utils.showSpinner();
        
        try {
            const roomSnap = await db.ref(`rooms/${code}`).once('value');
            if (!roomSnap.exists()) {
                utils.hideSpinner();
                utils.showError("Room not found or expired.");
                return;
            }

            const roomData = roomSnap.val();
            // Check age
            if (Date.now() - roomData.createdAt > 24 * 60 * 60 * 1000) {
                utils.hideSpinner();
                utils.showError("This room has expired.");
                return;
            }

            state.role = 'PLAYER';
            state.roomId = code;
            state.playerName = name;
            state.mode = roomData.mode;
            state.vocab = roomData.vocab;
            
            // Check for duplicate names and append number if needed
            let finalName = name;
            if(roomData.players) {
                const names = Object.values(roomData.players).map(p => p.name);
                let suffix = 1;
                while(names.includes(finalName)) {
                    finalName = `${name} ${suffix}`;
                    suffix++;
                }
            }
            state.playerName = finalName;

            // Manage session reconnect
            const sessionStr = sessionStorage.getItem('vocabMasterSession');
            if(sessionStr) {
                const s = JSON.parse(sessionStr);
                if(s.roomId === state.roomId && s.playerName === name) {
                    state.playerId = s.playerId; // Reusing ID
                }
            }
            
            if(!state.playerId) {
                state.playerId = utils.generateId(8);
                sessionStorage.setItem('vocabMasterSession', JSON.stringify({
                    roomId: state.roomId,
                    playerId: state.playerId,
                    playerName: state.playerName,
                    timestamp: Date.now()
                }));
            }

            dbRefs.player = db.ref(`rooms/${state.roomId}/players/${state.playerId}`);
            
            // Initial read to keep score if reconnecting
            const pSnap = await dbRefs.player.once('value');
            if(pSnap.exists()) {
                state.score = pSnap.val().score;
                state.answers = pSnap.val().answers || [];
            } else {
                state.score = 0;
                state.answers = [];
            }

            await dbRefs.player.update({
                name: state.playerName,
                score: state.score,
                qIndex: 0,
                answers: state.answers,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            });

            dbRefs.player.onDisconnect().remove();

            // UI Updates
            utils.hideSpinner();
            utils.$('hdr-room').classList.remove('hidden');
            utils.$('hdr-room-code').innerText = state.roomId;
            utils.$('hdr-name').classList.remove('hidden');
            utils.$('hdr-name').innerText = state.playerName;
            utils.$('hdr-score').classList.remove('hidden');
            this.updateScoreUI();

            // Listen to Room State
            utils.addListener(db.ref(`rooms/${state.roomId}`), 'value', snap => {
                if(!snap.exists()) {
                    utils.showError("The host has closed the room.");
                    utils.clearListeners();
                    setTimeout(() => location.reload(), 3000);
                    return;
                }
                const rData = snap.val();
                
                if (rData.gameState === 'LOBBY') {
                    state.questionSet = [];
                    state.qIndex = 0;
                    if (utils.$('view-player-lobby').style.display !== 'block') {
                        utils.$('player-lobby-code').innerText = state.roomId;
                        this.showView('view-player-lobby');
                    }
                } 
                else if (rData.gameState === 'PLAYING') {
                    utils.$('game-area').classList.remove('hidden');
                    if (isTimedMode(state.mode)) {
                        // Self-paced: only act on the first time we receive the question set
                        if (rData.questionSet && state.questionSet.length === 0) {
                            state.questionSet = rData.questionSet;
                            state.qIndex = 0;
                            if(utils.$('view-game').style.display !== 'block') this.showView('view-game');
                            gameModes.renderTimed(state.mode, state.questionSet, state.qIndex);
                        }
                    } else {
                        if(utils.$('view-game').style.display !== 'block') this.showView('view-game');
                        // Only re-render the current question when questionData actually changes.
                        // This prevents re-rendering when unrelated player data (scores/answers)
                        // updates the room and would otherwise wipe local inline feedback.
                        const qDataStr = rData.questionData ? JSON.stringify(rData.questionData) : null;
                        const lastQStr = state.lastQuestionData ? JSON.stringify(state.lastQuestionData) : null;
                        if (qDataStr !== lastQStr) {
                            state.lastQuestionData = rData.questionData || null;
                            if (rData.questionData) gameModes.render(state.mode, rData.questionData);
                        }
                    }
                }
                else if (rData.gameState === 'RESULTS') {
                    this.showResults(rData.players);
                }
            });

        } catch (e) {
            utils.hideSpinner();
            utils.showError("Connection error.");
            console.error(e);
        }
    },

    updateScore(points) {
        state.score += points;
        if(state.score < 0) state.score = 0;
        this.updateScoreUI();
        if(state.role === 'PLAYER' && dbRefs.player) {
            dbRefs.player.update({ score: state.score });
        }
    },

    // Record a single answer for later review on the results screen, and sync to Firebase
    recordAnswer(entry) {
        if(state.role !== 'PLAYER') return;
        state.answers.push(entry);
        if(dbRefs.player) {
            dbRefs.player.update({ answers: state.answers });
        }
    },

    // Self-paced modes: player presses "Next Question" to move themselves forward
    advanceQuestion() {
        if(state.role !== 'PLAYER') return;
        state.qIndex++;
        if(dbRefs.player) {
            dbRefs.player.update({ qIndex: state.qIndex });
        }
        if(state.qIndex >= state.questionSet.length) {
            // This player has finished all questions - show waiting screen
            gameModes.renderWaitingForOthers();
        } else {
            gameModes.renderTimed(state.mode, state.questionSet, state.qIndex);
        }
    },

    updateScoreUI() {
        utils.$('hdr-score-val').innerText = state.score;
        // Bump animation
        const s = utils.$('hdr-score');
        s.style.transform = 'scale(1.2)';
        setTimeout(() => s.style.transform = 'scale(1)', 200);
    },

    showResults(playersObj) {
        this.showView('view-results');
        utils.clearListeners(); // Stop game listeners

        const players = Object.values(playersObj || {}).sort((a,b) => b.score - a.score);
        state.lastResultsPlayers = players; // keep for answer review lookups
        
        // Podium
        const podContainer = utils.$('podium-container');
        podContainer.innerHTML = '';
        if(players.length > 0) {
            const p1 = players[0];
            const p2 = players.length > 1 ? players[1] : null;
            const p3 = players.length > 2 ? players[2] : null;

            if(p2) podContainer.innerHTML += `<div class="podium-step step-2"><div class="podium-name">${p2.name}</div><div class="podium-score">${p2.score}</div>2nd</div>`;
            podContainer.innerHTML += `<div class="podium-step step-1" style="height: 120%; z-index: 4;"><div class="podium-name">${p1.name}</div><div class="podium-score">${p1.score}</div>1st</div>`;
            if(p3) podContainer.innerHTML += `<div class="podium-step step-3"><div class="podium-name">${p3.name}</div><div class="podium-score">${p3.score}</div>3rd</div>`;
        }

        // List
        const listEl = utils.$('final-leaderboard');
        listEl.innerHTML = players.map((p, i) => `
            <div class="player-list-item" style="background: ${i===0?'#fef3c7':(i===1?'#f3f4f6':(i===2?'#ffedd5':'var(--surface)'))}">
                <span><strong>#${i+1}</strong> &nbsp; ${p.name}</span>
                <strong>${p.score}</strong>
            </div>
        `).join('');

        // Make leaderboard clickable for HOST role
        if(state.role === 'HOST') {
            const items = document.querySelectorAll('#final-leaderboard .player-list-item');
            items.forEach((item, i) => {
                item.classList.add('clickable-student');
                item.onclick = () => app.selectStudentForReview(i);
            });
            // Initially highlight first student
            if(items.length > 0) {
                items[0].classList.add('selected');
            }
        }

        // Actions & Message
        if(state.role === 'HOST') {
            utils.$('results-host-actions').classList.remove('hidden');
            utils.$('results-msg').innerText = "Awesome Job!";

            // Populate per-student review dropdown
            const select = utils.$('host-review-select');
            select.innerHTML = players.map((p, i) =>
                `<option value="${i}">${p.name} (${p.score} pts, ${(p.answers || []).length} answers)</option>`
            ).join('');
            
            // Listen for dropdown changes to update leaderboard selection
            select.addEventListener('change', (e) => {
                app.selectStudentForReview(parseInt(e.target.value, 10));
            });

            if(players.length > 0) {
                utils.$('host-review-card').classList.remove('hidden');
                this.renderAnswerReview(0, 'host-review-content');
            } else {
                utils.$('host-review-card').classList.add('hidden');
            }
        } else {
            utils.$('results-player-actions').classList.remove('hidden');
            const myRank = players.findIndex(p => p.name === state.playerName) + 1;
            if(myRank === 1) utils.$('results-msg').innerText = "You're the Champion! 🌟";
            else if(myRank <= 3) utils.$('results-msg').innerText = "Great job, you made the podium! 🎉";
            else utils.$('results-msg').innerText = "Good effort! Keep practicing! 💪";

            // Reset review panel to collapsed each time results are shown
            utils.$('player-review-card').classList.add('hidden');
            utils.$('btn-toggle-review').innerText = '📝 Review My Answers';
        }
    },

    // Toggle the player's own answer review panel
    toggleReview() {
        const card = utils.$('player-review-card');
        const btn = utils.$('btn-toggle-review');
        const isHidden = card.classList.contains('hidden');
        if(isHidden) {
            const me = (state.lastResultsPlayers || []).find(p => p.name === state.playerName) || { answers: state.answers };
            this.renderAnswerReview(me, 'player-review-content');
            card.classList.remove('hidden');
            btn.innerText = '🙈 Hide My Answers';
        } else {
            card.classList.add('hidden');
            btn.innerText = '📝 Review My Answers';
        }
    },

    // Teacher: Click on a student in the leaderboard to view their answers
    selectStudentForReview(index) {
        if(state.role !== 'HOST') return;
        
        // Update dropdown to match clicked student
        utils.$('host-review-select').value = index;
        
        // Update visual selection on leaderboard items
        const items = document.querySelectorAll('#final-leaderboard .player-list-item.clickable-student');
        items.forEach(item => item.classList.remove('selected'));
        if(items[index]) items[index].classList.add('selected');
        
        // Update review content
        this.renderAnswerReview(index, 'host-review-content');
    },

    // Render an answer-by-answer review into the given container.
    // playerOrIndex: either a player object, or an index into state.lastResultsPlayers (used by the host dropdown)
    renderAnswerReview(playerOrIndex, containerId) {
        const container = utils.$(containerId);
        let player = playerOrIndex;
        if(typeof playerOrIndex !== 'object') {
            const players = state.lastResultsPlayers || [];
            player = players[parseInt(playerOrIndex, 10)];
        }
        if(!player) { container.innerHTML = `<p class="review-empty">No data available.</p>`; return; }

        const answers = player.answers || [];
        if(answers.length === 0) {
            container.innerHTML = `<p class="review-empty">No individual answers were recorded for this game mode.</p>`;
            return;
        }

        container.innerHTML = answers.map((a, i) => `
            <div class="review-item ${a.isCorrect ? 'correct' : 'incorrect'}">
                <span class="review-points">${a.points > 0 ? '+' : ''}${a.points}</span>
                <div class="review-q">Q${i+1}. ${a.question}</div>
                <div class="review-a">Your answer: <strong>${a.yourAnswer}</strong></div>
                ${a.isCorrect ? '' : `<div class="review-a">Correct answer: <strong>${a.correctAnswer}</strong></div>`}
            </div>
        `).join('');
    }
};
