/* ==========================================================================
   GAME MODES RENDER & LOGIC
   ========================================================================== */
const gameModes = {
    render(mode, data) {
        clearInterval(state.timerInterval);
        utils.$('game-timer').classList.add('hidden');
        utils.$('btn-next-q-player').classList.add('hidden');
        const container = utils.$('game-content');
        container.innerHTML = '';
        
        switch(mode) {
            case 'DRAG_DROP': this.renderDragDrop(data); break;
            case 'MATCHING': this.renderMatching(data); break;
        }
    },

    // Self-paced (timed) modes: render question `qIndex` from a pre-generated set
    renderTimed(mode, questionSet, qIndex) {
        clearInterval(state.timerInterval);
        utils.$('game-timer').classList.add('hidden');
        utils.$('btn-next-q-player').classList.add('hidden');
        const container = utils.$('game-content');
        container.innerHTML = '';

        const data = questionSet[qIndex];
        data.endTime = Date.now() + data.duration;

        // Progress indicator
        utils.$('game-progress').classList.remove('hidden');
        utils.$('game-progress-fill').style.width = `${(qIndex / questionSet.length) * 100}%`;

        switch(mode) {
            case 'MULTIPLE_CHOICE': this.renderMC(data); break;
            case 'FILL_BLANK': this.renderFillBlank(data); break;
            case 'SPEED_SPRINT': this.renderSpeedSprint(data); break;
        }
    },

    // Reveal the "Next Question" button for the player after they've answered/timed out
    showNextButton() {
        utils.$('btn-next-q-player').classList.remove('hidden');
    },

    // Reveal the "Next Question" button for the player after they've answered/timed out
    showNextButton() {
        utils.$('btn-next-q-player').classList.remove('hidden');
    },

    // For host-paced modes: let the player know their answer is locked in and they're waiting on the teacher
    showWaitingForHost() {
        const container = utils.$('game-content');
        const note = document.createElement('p');
        note.style.textAlign = 'center';
        note.style.color = 'var(--text-light)';
        note.style.marginTop = '12px';
        note.innerText = "Waiting for the teacher to move to the next question...";
        container.appendChild(note);
    },

    renderWaitingForOthers() {
        clearInterval(state.timerInterval);
        utils.$('game-timer').classList.add('hidden');
        utils.$('game-progress').classList.remove('hidden');
        utils.$('game-progress-fill').style.width = '100%';
        utils.$('btn-next-q-player').classList.add('hidden');
        utils.$('question-header').innerText = "All done! 🎉";
        utils.$('game-content').innerHTML = `
            <div style="text-align:center; padding: 20px;">
                <p style="font-size:1.1rem;">You've finished all the questions.</p>
                <p>Waiting for the teacher to end the game and show the leaderboard...</p>
            </div>
        `;
    },

    startTimer(endTime, onTimeout) {
        utils.$('game-timer').classList.remove('hidden');
        const fill = utils.$('game-timer-fill');
        const duration = endTime - Date.now();
        if(duration <= 0) { onTimeout(); return; }

        fill.style.width = '100%';
        
        state.timerInterval = setInterval(() => {
            const remain = endTime - Date.now();
            if(remain <= 0) {
                clearInterval(state.timerInterval);
                fill.style.width = '0%';
                onTimeout();
            } else {
                fill.style.width = `${(remain / duration) * 100}%`;
            }
        }, 100);
    },

    renderMC(data) {
        utils.$('question-header').innerText = "What is the word for:";
        const container = utils.$('game-content');
        
        let html = `<div style="font-size:1.2rem; margin-bottom:20px; font-weight:600;">${data.def}</div>`;
        data.options.forEach(opt => {
            html += `<button class="mc-option" data-id="${opt.id}">${opt.w}</button>`;
        });
        container.innerHTML = html;

        if (state.role === 'PLAYER') {
            let answered = false;
            
            const handleAns = (id, btn) => {
                if(answered) return;
                answered = true;
                clearInterval(state.timerInterval);
                const buttons = document.querySelectorAll('.mc-option');
                buttons.forEach(b => b.disabled = true);
                
                const correctOpt = data.options.find(o => o.id === data.correctId);
                const chosenOpt = data.options.find(o => o.id === id);
                let points = 0;
                let isCorrect = false;

                if(id === data.correctId) {
                    btn.classList.add('correct');
                    points = 10;
                    isCorrect = true;
                    app.updateScore(10);
                } else {
                    btn.classList.add('wrong');
                    // Highlight correct
                    const correctBtn = document.querySelector(`.mc-option[data-id="${data.correctId}"]`);
                    if(correctBtn) correctBtn.classList.add('correct');
                }

                app.recordAnswer({
                    type: 'MULTIPLE_CHOICE',
                    question: `Definition: ${data.def}`,
                    yourAnswer: chosenOpt ? chosenOpt.w : '(no answer)',
                    correctAnswer: correctOpt ? correctOpt.w : '',
                    isCorrect,
                    points
                });

                gameModes.showNextButton();
            };

            document.querySelectorAll('.mc-option').forEach(btn => {
                btn.onclick = () => handleAns(btn.dataset.id, btn);
            });

            this.startTimer(data.endTime, () => {
                if(!answered) {
                    answered = true;
                    document.querySelectorAll('.mc-option').forEach(b => {
                        b.disabled = true;
                        if(b.dataset.id === data.correctId) b.classList.add('correct');
                    });
                    const correctOpt = data.options.find(o => o.id === data.correctId);
                    app.recordAnswer({
                        type: 'MULTIPLE_CHOICE',
                        question: `Definition: ${data.def}`,
                        yourAnswer: '(no answer - time out)',
                        correctAnswer: correctOpt ? correctOpt.w : '',
                        isCorrect: false,
                        points: 0
                    });
                    gameModes.showNextButton();
                }
            });
        }
    },

    renderDragDrop(data) {
        utils.$('question-header').innerText = "Tap a word, then tap its definition (match them all)";
        const container = utils.$('game-content');
        
        const words = utils.shuffle([...data.items]);
        const defs = utils.shuffle([...data.items]);

        let html = `<div class="dd-container">
            <div class="dd-column" id="col-words">
                <div style="font-weight:600; text-align:center; color:var(--text-light); margin-bottom:4px;">Words</div>
                ${words.map(w => `<div class="dd-item word-item" data-id="${w.id}">${w.w}</div>`).join('')}
            </div>
            <div class="dd-column" id="col-defs">
                <div style="font-weight:600; text-align:center; color:var(--text-light); margin-bottom:4px;">Definitions</div>
                ${defs.map(d => `<div class="dd-item def-item" data-id="${d.id}" style="font-size:0.9rem;">${d.d}</div>`).join('')}
            </div>
        </div>
        <p id="dd-feedback" style="text-align:center; font-weight:bold; margin-top:16px;"></p>`;
        container.innerHTML = html;

        if (state.role === 'PLAYER') {
            let selectedWord = null;
            const totalWords = data.items.length;
            let attemptedCount = 0;

            const wordEls = () => document.querySelectorAll('.word-item');
            const defEls = () => document.querySelectorAll('.def-item');

            const finishIfDone = () => {
                if(attemptedCount >= totalWords) {
                    wordEls().forEach(el => el.style.pointerEvents = 'none');
                    defEls().forEach(el => el.style.pointerEvents = 'none');
                    gameModes.showWaitingForHost();
                }
            };

            wordEls().forEach(el => {
                el.onclick = () => {
                    // Already attempted - locked, ignore
                    if(el.classList.contains('matched') || el.classList.contains('wrong-choice')) return;

                    wordEls().forEach(w => {
                        if(!w.classList.contains('matched') && !w.classList.contains('wrong-choice')) {
                            w.classList.remove('selected');
                        }
                    });
                    el.classList.add('selected');
                    selectedWord = el;
                };
            });

            defEls().forEach(el => {
                el.onclick = () => {
                    if(!selectedWord) return;
                    // This definition has already been correctly used for another word
                    if(el.classList.contains('matched')) return;

                    selectedWord.classList.remove('selected');
                    attemptedCount++;

                    const wordItem = data.items.find(it => it.id === selectedWord.dataset.id);
                    const chosenDefItem = data.items.find(it => it.id === el.dataset.id);

                    let points = 0;
                    let isCorrect = false;

                    if(selectedWord.dataset.id === el.dataset.id) {
                        // Correct - lock both items in green
                        selectedWord.classList.add('matched');
                        el.classList.add('matched');
                        selectedWord.style.pointerEvents = 'none';
                        el.style.pointerEvents = 'none';
                        points = 5;
                        isCorrect = true;
                        app.updateScore(5);
                        utils.$('dd-feedback').innerText = "Correct! +5";
                        utils.$('dd-feedback').style.color = 'var(--success)';
                    } else {
                        // Wrong - lock the word in red, briefly flash the chosen def red
                        // but leave the def available since it may match another word
                        selectedWord.classList.add('wrong-choice');
                        selectedWord.style.pointerEvents = 'none';
                        el.classList.add('wrong-choice');
                        setTimeout(() => el.classList.remove('wrong-choice'), 500);
                        utils.$('dd-feedback').innerText = "Not quite!";
                        utils.$('dd-feedback').style.color = 'var(--danger)';
                    }

                    app.recordAnswer({
                        type: 'DRAG_DROP',
                        question: `Word: "${wordItem ? wordItem.w : ''}"`,
                        yourAnswer: chosenDefItem ? chosenDefItem.d : '',
                        correctAnswer: wordItem ? wordItem.d : '',
                        isCorrect,
                        points
                    });

                    selectedWord = null;
                    finishIfDone();
                };
            });
        }
    },

    renderMatching(data) {
        utils.$('question-header').innerText = "Find the matching pairs";
        const container = utils.$('game-content');
        
        let cards = [];
        data.items.forEach(item => {
            cards.push({ id: item.id, text: item.w, type: 'word' });
            cards.push({ id: item.id, text: item.d, type: 'def' });
        });
        cards = utils.shuffle(cards);

        let html = `<div class="matching-grid">`;
        cards.forEach((c, i) => {
            html += `<div class="match-card" data-index="${i}" data-id="${c.id}">${c.text}</div>`;
        });
        html += `</div>`;
        container.innerHTML = html;

        if (state.role === 'PLAYER') {
            let selected = null;
            let locked = false;

            document.querySelectorAll('.match-card').forEach(el => {
                el.onclick = () => {
                    if(locked || el.classList.contains('matched') || el === selected) return;
                    
                    el.classList.add('selected');

                    if(!selected) {
                        selected = el;
                    } else {
                        locked = true;
                        const itemA = data.items.find(it => it.id === selected.dataset.id);
                        if(selected.dataset.id === el.dataset.id) {
                            // Match
                            app.recordAnswer({
                                type: 'MATCHING',
                                question: `Pair: "${selected.innerText}" ↔ "${el.innerText}"`,
                                yourAnswer: 'Matched correctly',
                                correctAnswer: itemA ? `${itemA.w} = ${itemA.d}` : '',
                                isCorrect: true,
                                points: 5
                            });
                            setTimeout(() => {
                                el.classList.replace('selected', 'matched');
                                selected.classList.replace('selected', 'matched');
                                selected = null; locked = false;
                                app.updateScore(5);
                            }, 300);
                        } else {
                            // Mismatch
                            app.recordAnswer({
                                type: 'MATCHING',
                                question: `Attempted pair: "${selected.innerText}" ↔ "${el.innerText}"`,
                                yourAnswer: 'Not a matching pair',
                                correctAnswer: itemA ? `${itemA.w} = ${itemA.d}` : '',
                                isCorrect: false,
                                points: -1
                            });
                            app.updateScore(-1);
                            el.classList.add('shake');
                            selected.classList.add('shake');
                            setTimeout(() => {
                                el.classList.remove('selected', 'shake');
                                selected.classList.remove('selected', 'shake');
                                selected = null; locked = false;
                            }, 500);
                        }
                    }
                };
            });
        }
    },

    renderFillBlank(data) {
        utils.$('question-header').innerText = "Type the missing word";
        const container = utils.$('game-content');
        
        let html = `
            <div class="fitb-sentence">${data.sentence}</div>
            <div style="display:flex; gap:10px;">
                <input type="text" id="fitb-input" placeholder="Type here..." autocomplete="off">
                <button class="btn-primary" id="btn-submit-fitb" style="width:auto; margin-bottom:16px;">Submit</button>
            </div>
            <div id="fitb-feedback" style="font-weight:bold; margin-top:10px;"></div>
        `;
        container.innerHTML = html;

        if (state.role === 'PLAYER') {
            let answered = false;
            const input = utils.$('fitb-input');
            const btn = utils.$('btn-submit-fitb');
            const feedback = utils.$('fitb-feedback');

            input.focus();

            const checkAns = () => {
                if(answered) return;
                answered = true;
                clearInterval(state.timerInterval);
                input.disabled = true;
                btn.disabled = true;

                const val = input.value;
                const dist = utils.levenshtein(val, data.target);
                let points = 0;
                let isCorrect = false;

                if(dist === 0) {
                    feedback.innerText = "Correct! +15";
                    feedback.style.color = 'var(--success)';
                    points = 15;
                    isCorrect = true;
                    app.updateScore(15);
                } else if (dist === 1 || dist === 2 && data.target.length > 5) {
                    feedback.innerText = `Close enough! (Target: ${data.target}) +5`;
                    feedback.style.color = 'var(--gold)';
                    points = 5;
                    isCorrect = true;
                    app.updateScore(5);
                } else {
                    feedback.innerText = `Wrong. Correct word: ${data.target}`;
                    feedback.style.color = 'var(--danger)';
                }

                app.recordAnswer({
                    type: 'FILL_BLANK',
                    question: data.sentence,
                    yourAnswer: val || '(no answer)',
                    correctAnswer: data.target,
                    isCorrect,
                    points
                });

                gameModes.showNextButton();
            };

            btn.onclick = checkAns;
            input.addEventListener('keypress', (e) => { if(e.key === 'Enter') checkAns(); });

            this.startTimer(data.endTime, () => {
                if(!answered) checkAns();
            });
        }
    },

    renderSpeedSprint(data) {
        utils.$('question-header').innerText = "Real match or fake? Decide fast!";
        const container = utils.$('game-content');

        let html = `
            <div style="text-align:center;">
                <div style="font-size:2rem; font-weight:800; color:var(--primary); margin-bottom:10px;">${data.word}</div>
                <div style="font-size:1.1rem; margin-bottom:20px; padding: 16px; background:#f8fafc; border-radius:8px; border:2px solid var(--border);">${data.def}</div>
            </div>
            <div class="grid-2">
                <button class="btn-primary" id="btn-true" style="background:var(--success);">✅ MATCH</button>
                <button class="btn-danger" id="btn-false">❌ FAKE</button>
            </div>
        `;
        container.innerHTML = html;

        if (state.role === 'PLAYER') {
            let answered = false;
            const btnTrue = utils.$('btn-true');
            const btnFalse = utils.$('btn-false');

            const handleAns = (choseTrue, btn) => {
                if(answered) return;
                answered = true;
                clearInterval(state.timerInterval);
                btnTrue.disabled = true;
                btnFalse.disabled = true;

                const correct = (choseTrue === data.isTrue);
                let points = 0;
                if(correct) {
                    btn.style.outline = '4px solid var(--success)';
                    points = 8;
                    app.updateScore(8);
                } else {
                    btn.style.outline = '4px solid var(--danger)';
                    points = -3;
                    app.updateScore(-3);
                }

                app.recordAnswer({
                    type: 'SPEED_SPRINT',
                    question: `${data.word}: "${data.def}"`,
                    yourAnswer: choseTrue ? '✅ MATCH' : '❌ FAKE',
                    correctAnswer: data.isTrue ? '✅ MATCH' : '❌ FAKE',
                    isCorrect: correct,
                    points
                });

                gameModes.showNextButton();
            };

            btnTrue.onclick = () => handleAns(true, btnTrue);
            btnFalse.onclick = () => handleAns(false, btnFalse);

            this.startTimer(data.endTime, () => {
                if(!answered) {
                    answered = true;
                    btnTrue.disabled = true;
                    btnFalse.disabled = true;
                    app.recordAnswer({
                        type: 'SPEED_SPRINT',
                        question: `${data.word}: "${data.def}"`,
                        yourAnswer: '(no answer - time out)',
                        correctAnswer: data.isTrue ? '✅ MATCH' : '❌ FAKE',
                        isCorrect: false,
                        points: 0
                    });
                    gameModes.showNextButton();
                }
            });
        }
    }
};
