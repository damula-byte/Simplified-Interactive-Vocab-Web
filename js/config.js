/* ==========================================================================
   CONFIG
   ========================================================================== */
// HOST: REPLACE THESE VALUES WITH YOUR FIREBASE PROJECT CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyDjwyPJ1yPujWEHmE2ukTzkCcK1UPQSE20",
  authDomain: "vocabgame-dfaa9.firebaseapp.com",
  databaseURL: "https://vocabgame-dfaa9-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "vocabgame-dfaa9",
  storageBucket: "vocabgame-dfaa9.firebasestorage.app",
  messagingSenderId: "1092398628769",
  appId: "1:1092398628769:web:09bf657ddf4c9bb8e015e0",
  measurementId: "G-KVB9Z7HMEQ"
};

// Default Vocab Sample
const sampleVocab = `abandon : to leave a place, thing, or person, usually forever
abundant : existing in large quantities; more than enough
ambiguous : having or expressing more than one possible meaning
benevolent : kind and helpful
lucid : clearly expressed and easy to understand
meticulous : very careful and with great attention to every detail
obscure : not known to many people
pragmatic : solving problems in a sensible way that suits the conditions
resilient : able to be happy, successful, etc. again after something difficult
tenacious : holding tightly onto something, or keeping an opinion in a determined way`;

// Modes where each student progresses through questions at their own pace
const TIMED_MODES = ['MULTIPLE_CHOICE', 'FILL_BLANK', 'SPEED_SPRINT'];
function isTimedMode(mode) { return TIMED_MODES.includes(mode); }
