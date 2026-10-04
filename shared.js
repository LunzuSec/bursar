/* ============================================================ */
/* SHARED SCRIPT — Navigation + password session management     */
/* Load on every page: <script src="shared.js"></script>        */
/*                                                              */
/* Provides:                                                    */
/*   - SharedNav.render({ current: 'home'|'admin'|'invoice'...  */
/*                        requireLock: false|true })            */
/*   - SharedSession.getPassword()                              */
/*   - SharedSession.setPassword(pw)                            */
/*   - SharedSession.clear()                                    */
/*   - SharedSession.isUnlocked()                               */
/* ============================================================ */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzVk1x1U6SDr9xrf32bbHJAb8dLi1QlMpo5n3Z9bcehIHUjAAoS57IhvtjmksSETIjCMg/exec';

/* ============================================================ */
/* SESSION — Password stored in sessionStorage (per browser tab) */
/* Falls back to localStorage if "remember me" is enabled        */
/* ============================================================ */

const SESSION_KEY = 'lunzuAdminPassword';
const SESSION_REMEMBER_KEY = 'lunzuAdminRemember';

const SharedSession = {
    getPassword: function() {
        // Prefer sessionStorage (per tab), fallback to localStorage
        let pw = '';
        try { pw = sessionStorage.getItem(SESSION_KEY) || ''; } catch (e) {}
        if (!pw) {
            try { pw = localStorage.getItem(SESSION_KEY) || ''; } catch (e) {}
        }
        return pw;
    },

    setPassword: function(pw, remember) {
        try { sessionStorage.setItem(SESSION_KEY, pw); } catch (e) {}
        if (remember) {
            try {
                localStorage.setItem(SESSION_KEY, pw);
                localStorage.setItem(SESSION_REMEMBER_KEY, '1');
            } catch (e) {}
        }
    },

    isRemembered: function() {
        try { return localStorage.getItem(SESSION_REMEMBER_KEY) === '1'; } catch (e) { return false; }
    },

    isUnlocked: function() {
        return !!this.getPassword();
    },

    clear: function() {
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(SESSION_REMEMBER_KEY);
        } catch (e) {}
    },

    /**
     * Verify the stored password against the backend.
     * Returns: { success: true } or { success: false, error: '...' }
     */
    verify: function(pw) {
        return new Promise((resolve) => {
            const callbackName = 'cb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
            const url = GAS_URL +
                '?action=verifyAdmin' +
                '&password=' + encodeURIComponent(pw) +
                '&callback=' + encodeURIComponent(callbackName);

            const script = document.createElement('script');
            script.src = url;
            const timeoutId = setTimeout(() => {
                if (window[callbackName]) {
                    delete window[callbackName];
                    if (script.parentNode) script.parentNode.removeChild(script);
                    resolve({ success: false, error: 'Request timed out.' });
                }
            }, 30000);

            window[callbackName] = function(response) {
                clearTimeout(timeoutId);
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
                if (response && response.success) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: (response && response.error) || 'Incorrect password.' });
                }
            };

            script.onerror = function() {
                clearTimeout(timeoutId);
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
                resolve({ success: false, error: 'Network error.' });
            };

            document.head.appendChild(script);
        });
    }
};

/* ============================================================ */
/* NAVIGATION — Render the top nav bar                          */
/* ============================================================ */

const SharedNav = {
    /**
     * Render the top navigation bar.
     * @param {Object} [opts]
     * @param {string} [opts.current]   which link to mark active: 'home'|'admin'|'invoice'|'receipts'|'downloads'|'subscribe'
     * @param {boolean} [opts.showAdmin=true]
     * @param {boolean} [opts.showLogout=true]
     */
    render: function(opts) {
        opts = opts || {};
        const current = opts.current || '';
        const showAdmin = opts.showAdmin !== false;
        const showLogout = opts.showLogout !== false;
        const unlocked = SharedSession.isUnlocked();

        // Remove existing nav if any (idempotent)
        const existing = document.querySelector('.shared-top-nav');
        if (existing) existing.remove();

        const nav = document.createElement('nav');
        nav.className = 'shared-top-nav';

        const brandIcon = current === 'admin' ? 'fa-user-shield' :
                         current === 'invoice' ? 'fa-file-invoice' :
                         current === 'receipts' ? 'fa-receipt' :
                         current === 'downloads' ? 'fa-download' :
                         current === 'subscribe' ? 'fa-envelope' :
                         'fa-school';
        const brandText = current === 'admin' ? 'ADMIN DASHBOARD' :
                         current === 'invoice' ? 'INVOICE GENERATOR' :
                         current === 'receipts' ? 'RECEIPTS' :
                         current === 'downloads' ? 'CLASS DOWNLOADS' :
                         current === 'subscribe' ? 'SUBSCRIBE' :
                         'LUNZU SEC. SCHOOL';

        const sessionPill = unlocked
            ? '<span class="shared-session-pill"><i class="fas fa-circle"></i> Admin Session</span>'
            : '<span class="shared-session-pill locked"><i class="fas fa-lock"></i> Locked</span>';

        let links = '<a href="https://lunzusec.github.io/School_results/index.html" class="nav-link' +
            (current === 'home' ? ' active' : '') + '"><i class="fas fa-home"></i> Home</a>';

        links += '<a href="index.html" class="nav-link' +
            (current === 'portal' ? ' active' : '') + '"><i class="fas fa-wallet"></i> Portal</a>';

        if (showAdmin) {
            links += '<a href="admin.html" class="nav-link primary' +
                (current === 'admin' ? ' active' : '') + '"><i class="fas fa-user-shield"></i> Admin</a>';
        }

        links += '<a href="javascript:window.location.reload()" class="nav-link">' +
            '<i class="fas fa-sync-alt"></i> Reload</a>';

        if (showLogout && unlocked) {
            links += '<a href="javascript:SharedSession.clear();window.location.reload()" class="nav-link logout">' +
                '<i class="fas fa-sign-out-alt"></i> Sign Out</a>';
        }

        nav.innerHTML =
            '<div class="nav-brand"><i class="fas ' + brandIcon + '"></i> <span>' + brandText + '</span>' +
            sessionPill + '</div>' +
            '<div class="nav-links">' + links + '</div>';

        // Insert as first child of body
        document.body.insertBefore(nav, document.body.firstChild);
    }
};

/* ============================================================ */
/* UNLOCK GATE — Show a password prompt if session is locked     */
/* ============================================================ */

/**
 * Ensure the page is unlocked. If a password is stored (sessionStorage
 * or localStorage), verify it silently. Otherwise, show a password modal.
 * Returns a Promise that resolves when unlocked, rejects if user cancels.
 *
 * @param {Object} [opts]
 * @param {string} [opts.title='Admin Access Required']
 * @param {string} [opts.subtitle='Enter the admin password to continue.']
 * @returns {Promise<string>} resolves with the verified password
 */
function ensureUnlocked(opts) {
    opts = opts || {};
    const title = opts.title || 'Admin Access Required';
    const subtitle = opts.subtitle || 'Enter the admin password to continue.';

    return new Promise((resolve, reject) => {
        // If we have a stored password, verify it in the background
        const stored = SharedSession.getPassword();
        if (stored) {
            SharedSession.verify(stored).then((res) => {
                if (res.success) {
                    resolve(stored);
                } else {
                    // Stored password invalid → clear it and show modal
                    SharedSession.clear();
                    showPasswordModal(title, subtitle, resolve, reject);
                }
            });
            return;
        }

        // No stored password → show modal
        showPasswordModal(title, subtitle, resolve, reject);
    });
}

/* ============================================================ */
/* PASSWORD MODAL — Rendered by ensureUnlocked()                */
/* ============================================================ */

function showPasswordModal(title, subtitle, resolve, reject) {
    // Remove existing modal if any
    const existing = document.getElementById('sharedPwModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sharedPwModal';
    overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);' +
        'display:flex;justify-content:center;align-items:center;z-index:99999;padding:20px;';

    overlay.innerHTML =
        '<div style="background:rgba(20,35,55,0.97);border:1px solid rgba(255,215,0,0.25);' +
        'border-radius:20px;padding:36px 32px;max-width:420px;width:100%;' +
        'box-shadow:0 25px 60px rgba(0,0,0,0.6);text-align:center;color:#fff;' +
        'font-family:\'Segoe UI\',Roboto,Arial,sans-serif;">' +
            '<h2 style="color:#fbbf24;font-size:22px;margin-bottom:10px;">🔒 ' + title + '</h2>' +
            '<p style="color:#cbd5e1;font-size:13px;margin-bottom:22px;">' + subtitle + '</p>' +
            '<input type="password" id="sharedPwInput" placeholder="Password" maxlength="40" ' +
            'autocomplete="off" style="width:100%;padding:14px 16px;border:1.5px solid rgba(255,255,255,0.2);' +
            'border-radius:12px;font-size:16px;text-align:center;letter-spacing:3px;margin-bottom:14px;' +
            'background:rgba(255,255,255,0.08);color:#fff;font-family:inherit;">' +
            '<label style="display:flex;align-items:center;justify-content:center;gap:8px;' +
            'color:#cbd5e1;font-size:12px;margin-bottom:14px;cursor:pointer;">' +
                '<input type="checkbox" id="sharedPwRemember" style="accent-color:#8b5cf6;"> ' +
                'Remember me on this device' +
            '</label>' +
            '<div id="sharedPwError" style="color:#fca5a5;font-size:13px;margin-bottom:12px;' +
            'display:none;padding:8px 12px;background:rgba(220,38,38,0.2);border-radius:8px;"></div>' +
            '<div style="display:flex;gap:10px;">' +
                '<button id="sharedPwCancel" style="flex:1;padding:12px;background:rgba(100,116,139,0.5);' +
                'color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;' +
                'font-family:inherit;">Cancel</button>' +
                '<button id="sharedPwSubmit" style="flex:1;padding:12px;' +
                'background:linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%);' +
                'color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;' +
                'font-family:inherit;box-shadow:0 4px 14px rgba(139,92,246,0.4);">Unlock</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    const input = document.getElementById('sharedPwInput');
    const remember = document.getElementById('sharedPwRemember');
    const err = document.getElementById('sharedPwError');
    const submit = document.getElementById('sharedPwSubmit');
    const cancel = document.getElementById('sharedPwCancel');

    // Prefill "remember me" if already set
    remember.checked = SharedSession.isRemembered();

    setTimeout(() => input.focus(), 100);

    async function trySubmit() {
        const pw = input.value.trim();
        if (!pw) {
            err.textContent = 'Please enter a password.';
            err.style.display = 'block';
            return;
        }
        submit.disabled = true;
        submit.textContent = 'Verifying...';
        err.style.display = 'none';

        const res = await SharedSession.verify(pw);
        submit.disabled = false;
        submit.textContent = 'Unlock';

        if (res.success) {
            SharedSession.setPassword(pw, remember.checked);
            overlay.remove();
            resolve(pw);
        } else {
            err.textContent = res.error || 'Incorrect password.';
            err.style.display = 'block';
            input.value = '';
            input.focus();
        }
    }

    submit.addEventListener('click', trySubmit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') trySubmit();
        if (e.key === 'Escape') doCancel();
    });
    cancel.addEventListener('click', doCancel);

    function doCancel() {
        overlay.remove();
        reject(new Error('Cancelled'));
    }
}

/* ============================================================ */
/* READY — Auto-render nav on any page that opts in             */
/* ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const currentPage = body.dataset.page || '';
    const showAdmin = body.dataset.showAdmin !== 'false';
    const showLogout = body.dataset.showLogout !== 'false';

    if (body.dataset.nav === 'true') {
        SharedNav.render({
            current: currentPage,
            showAdmin: showAdmin,
            showLogout: showLogout
        });
    }
});
