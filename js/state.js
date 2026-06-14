/* ==========================================================================
   FIREBASE & STATE INITIALIZATION
   ========================================================================== */
let db;
let dbRefs = {};

const state = {
    role: null, // 'HOST' or 'PLAYER'
    roomId: null,
    playerId: null,
    playerName: null,
    vocab: [],
    mode: null,
    score: 0,
    currentQuestionIndex: -1,
    questionSet: [],   // pre-generated questions for timed (self-paced) modes
    qIndex: 0,         // player's own progress index within questionSet
    answers: [],       // record of this player's answers for review at results screen
    lastResultsPlayers: [], // snapshot of all players (with answers) at the results screen
    timerInterval: null,
    listeners: []
};
