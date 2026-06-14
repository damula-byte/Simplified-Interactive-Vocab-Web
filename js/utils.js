/* ==========================================================================
   UTILITY FUNCTIONS
   ========================================================================== */
const utils = {
    $(id) { return document.getElementById(id); },
    showError(msg) {
        const el = this.$('global-error');
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 5000);
    },
    showSpinner() { this.$('global-spinner').style.display = 'block'; },
    hideSpinner() { this.$('global-spinner').style.display = 'none'; },
    generateId(length = 6) { return Math.random().toString(36).substring(2, 2 + length).toUpperCase(); },
    shuffle(array) {
        let currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    },
    levenshtein(a, b) {
        a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
        if(a.length === 0) return b.length;
        if(b.length === 0) return a.length;
        const matrix = [];
        for(let i=0; i<=b.length; i++) matrix[i] = [i];
        for(let j=0; j<=a.length; j++) matrix[0][j] = j;
        for(let i=1; i<=b.length; i++) {
            for(let j=1; j<=a.length; j++) {
                if(b.charAt(i-1) === a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1];
                else matrix[i][j] = Math.min(matrix[i-1][j-1]+1, matrix[i][j-1]+1, matrix[i-1][j]+1);
            }
        }
        return matrix[b.length][a.length];
    },
    clearListeners() {
        state.listeners.forEach(l => l.ref.off(l.event, l.callback));
        state.listeners = [];
    },
    addListener(ref, event, callback) {
        ref.on(event, callback);
        state.listeners.push({ ref, event, callback });
    }
};
