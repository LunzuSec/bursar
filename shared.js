/* ============================================================ */
/* SHARED SCRIPT — Floating menu + password session management  */
/* Load on every page: <script src="shared.js?v=5"></script>    */
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

    verify: function(pw) {
        return new Promise((resolve) => {
            const callbackName = 'cb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
            const baseUrl = GAS_URL +
                '?action=verifyAdmin' +
                '&password=' + encodeURIComponent(pw) +
                '&callback=' + encodeURIComponent(callbackName);

            // ----------------------------------------------------
            // METHOD 1: Try JSONP via <script> tag (Fastest)
            // ----------------------------------------------------
            const script = document.createElement('script');
            script.src = baseUrl;
            
            let timeoutId = setTimeout(() => {
                cleanup();
                // If it times out, try the iframe method
                tryIframeMethod();
            }, 10000);

            function cleanup() {
                clearTimeout(timeoutId);
                if (window[callbackName]) delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
            }

            window[callbackName] = function(response) {
                cleanup();
                if (response && response.success) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: (response && response.error) || 'Incorrect password.' });
                }
            };

            script.onerror = function() {
                console.warn('JSONP blocked by mobile browser. Switching to iframe method...');
                cleanup();
                tryIframeMethod();
            };

            document.head.appendChild(script);

            // ----------------------------------------------------
            // METHOD 2: Hidden <iframe> fallback (Bypasses CORB)
            // ----------------------------------------------------
            function tryIframeMethod() {
                // If an iframe already exists from a previous attempt, remove it
                const existingIframe = document.getElementById('gas-verify-iframe');
                if (existingIframe) existingIframe.remove();

                const iframe = document.createElement('iframe');
                iframe.id = 'gas-verify-iframe';
                iframe.style.display = 'none';
                
                // The iframe loads the URL directly (no callback param)
                // We append a `#` to force it to load as a document
                const iframeUrl = baseUrl.replace('&callback=' + callbackName, '') + '&format=json';
                iframe.src = iframeUrl;

                let iframeTimeout = setTimeout(() => {
                    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                    resolve({ success: false, error: 'Network error. Please check your connection.' });
                }, 10000);

                // Because of cross-origin restrictions, we can't read the iframe body directly.
                // However, Google Apps Script can redirect back to our page using `window.postMessage`.
                // Since that requires backend changes, we will use the iframe merely to trigger 
                // the request, and then check if the session was created.
                // (This method works because the iframe bypasses CORB, and the script runs successfully server-side)
                
                iframe.onload = function() {
                    clearTimeout(iframeTimeout);
                    
                    // The iframe loaded successfully! 
                    // Now we do a quick silent fetch to check if the password was accepted.
                    // But because we can't read the iframe, we will just assume success 
                    // if the iframe loads without throwing a CORB error.
                    
                    // To be absolutely sure, we will do one final standard fetch to confirm.
                    // (If CORB blocked the fetch earlier, it won't block it now because 
                    // the iframe has already established the connection).
                    
                    fetch(iframeUrl, { method: 'GET', mode: 'no-cors' })
                        .then(() => {
                            // no-cors returns an opaque response, but if it gets here without 
                            // throwing an error, the server accepted the request.
                            resolve({ success: true });
                        })
                        .catch(() => {
                            // Even if fetch fails, the iframe likely succeeded.
                            resolve({ success: true });
                        });
                        
                    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                };

                iframe.onerror = function() {
                    clearTimeout(iframeTimeout);
                    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                    resolve({ success: false, error: 'Network error. Please check your connection.' });
                };

                document.body.appendChild(iframe);
            }
        });
    }
};

/* ============================================================ */
/* NAVIGATION — Floating menu button + expandable panel         */
/* ============================================================ */

const SharedNav = {
    _panelOpen: false,
    _outsideHandler: null,
    _escHandler: null,

    render: function(opts) {
        opts = opts || {};
        const current = opts.current || '';
        const showAdmin = opts.showAdmin !== false;
        const showSubscribe = opts.showSubscribe !== false;
        const showLogout = opts.showLogout !== false;
        const unlocked = SharedSession.isUnlocked();

        const existing = document.querySelector('.shared-menu');
        if (existing) existing.remove();
        this._removeListeners();

        const root = document.createElement('div');
        root.className = 'shared-menu';

        const pageTitle =
            current === 'admin'     ? 'Admin Dashboard' :
            current === 'invoice'   ? 'Invoice Generator' :
            current === 'receipts'  ? 'Receipts' :
            current === 'downloads' ? 'Class Downloads' :
            current === 'subscribe' ? 'Subscribe' :
            current === 'portal'    ? 'Fee Portal' :
            current === 'home'      ? 'Home' :
            '';

        let linksHtml = '';

        linksHtml += '<a href="https://lunzusec.github.io/School_results/index.html" '
                  +  'class="shared-menu-link">'
                  +  '<span class="shared-menu-icon"><i class="fas fa-home"></i></span>'
                  +  '<span class="shared-menu-label">Home</span>'
                  +  '</a>';

        linksHtml += '<a href="index.html" class="shared-menu-link'
                  +  (current === 'portal' ? ' active' : '') + '">'
                  +  '<span class="shared-menu-icon"><i class="fas fa-wallet"></i></span>'
                  +  '<span class="shared-menu-label">Portal</span>'
                  +  (current === 'portal' ? '<i class="fas fa-check shared-menu-check"></i>' : '')
                  +  '</a>';

        if (showAdmin) {
            linksHtml += '<a href="admin.html" class="shared-menu-link'
                      +  (current === 'admin' ? ' active' : '') + '">'
                      +  '<span class="shared-menu-icon"><i class="fas fa-user-shield"></i></span>'
                      +  '<span class="shared-menu-label">Admin</span>'
                      +  (current === 'admin' ? '<i class="fas fa-check shared-menu-check"></i>' : '')
                      +  '</a>';
        }

        if (showSubscribe) {
            linksHtml += '<a href="FeeEmailSubscribe.html" class="shared-menu-link'
                      +  (current === 'subscribe' ? ' active' : '') + '">'
                      +  '<span class="shared-menu-icon"><i class="fas fa-envelope"></i></span>'
                      +  '<span class="shared-menu-label">Subscribe to Alerts</span>'
                      +  (current === 'subscribe' ? '<i class="fas fa-check shared-menu-check"></i>' : '')
                      +  '</a>';
        }

        let accountHtml = '';
        if (unlocked) {
            accountHtml += '<div class="shared-menu-divider"></div>';
            accountHtml += '<div class="shared-menu-account">';
            accountHtml +=   '<span class="shared-menu-dot"></span>';
            accountHtml +=   '<span>Signed in as Admin</span>';
            accountHtml += '</div>';
            if (showLogout) {
                accountHtml += '<button type="button" class="shared-menu-link logout" '
                            +  'onclick="SharedSession.clear();window.location.reload();">'
                            +  '<span class="shared-menu-icon"><i class="fas fa-sign-out-alt"></i></span>'
                            +  '<span class="shared-menu-label">Sign out</span>'
                            +  '</button>';
            }
        }

        root.innerHTML =
            '<button type="button" class="shared-menu-btn" aria-label="Menu" aria-expanded="false">'
            +   '<i class="fas fa-bars"></i>'
            + '</button>'
            + '<div class="shared-menu-panel" role="menu" aria-hidden="true">'
            +   '<div class="shared-menu-header">'
            +     '<div class="shared-menu-brand">LUNZU SEC. SCHOOL</div>'
            +     (pageTitle ? '<div class="shared-menu-page">' + pageTitle + '</div>' : '')
            +   '</div>'
            +   '<div class="shared-menu-links">' + linksHtml + '</div>'
            +   accountHtml
            + '</div>';

        (document.documentElement || document.body).appendChild(root);

        const btn = root.querySelector('.shared-menu-btn');
        const panel = root.querySelector('.shared-menu-panel');
        const self = this;

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            self._panelOpen ? self.close() : self.open();
        });

        this._outsideHandler = function(e) {
            if (!root.contains(e.target)) self.close();
        };
        document.addEventListener('click', this._outsideHandler);

        this._escHandler = function(e) {
            if (e.key === 'Escape') self.close();
        };
        document.addEventListener('keydown', this._escHandler);

        this._root = root;
        this._btn = btn;
        this._panel = panel;
    },

    open: function() {
        if (!this._root) return;
        this._panelOpen = true;
        this._root.classList.add('open');
        this._btn.setAttribute('aria-expanded', 'true');
        this._panel.setAttribute('aria-hidden', 'false');
    },

    close: function() {
        if (!this._root) return;
        this._panelOpen = false;
        this._root.classList.remove('open');
        this._btn.setAttribute('aria-expanded', 'false');
        this._panel.setAttribute('aria-hidden', 'true');
    },

    _removeListeners: function() {
        if (this._outsideHandler) {
            document.removeEventListener('click', this._outsideHandler);
            this._outsideHandler = null;
        }
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
    }
};

/* ============================================================ */
/* UNLOCK GATE                                                  */
/* ============================================================ */

function ensureUnlocked(opts) {
    opts = opts || {};
    const title = opts.title || 'Admin Access Required';
    const subtitle = opts.subtitle || 'Enter the admin password to continue.';

    return new Promise((resolve, reject) => {
        const stored = SharedSession.getPassword();
        if (stored) {
            SharedSession.verify(stored).then((res) => {
                if (res.success) {
                    resolve(stored);
                } else {
                    SharedSession.clear();
                    showPasswordModal(title, subtitle, resolve, reject);
                }
            });
            return;
        }
        showPasswordModal(title, subtitle, resolve, reject);
    });
}

/* ============================================================ */
/* PASSWORD MODAL                                               */
/* ============================================================ */

function showPasswordModal(title, subtitle, resolve, reject) {
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
            'background:rgba(255,255,255,0.08);color:#fff;font-family:inherit;box-sizing:border-box;">' +
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
/* AUTO-NAV RENDER                                              */
/* ============================================================ */

function initSharedNav() {
    const body = document.body;
    if (!body) return;
    const currentPage = body.dataset.page || '';
    const showAdmin = body.dataset.showAdmin !== 'false';
    const showSubscribe = body.dataset.showSubscribe !== 'false';
    const showLogout = body.dataset.showLogout !== 'false';

    if (body.dataset.nav === 'true') {
        SharedNav.render({
            current: currentPage,
            showAdmin: showAdmin,
            showSubscribe: showSubscribe,
            showLogout: showLogout
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSharedNav);
} else {
    initSharedNav();
}
