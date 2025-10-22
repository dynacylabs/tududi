const express = require('express');
const passport = require('passport');
const { User } = require('../models');
const { getConfig } = require('../config/config');
const { isAdmin } = require('../services/rolesService');
const { logError } = require('../services/logService');
const packageJson = require('../../package.json');
const router = express.Router();

const config = getConfig();

// Get version
router.get('/version', (req, res) => {
    res.json({ version: packageJson.version });
});

// Get current user
router.get('/current_user', async (req, res) => {
    try {
        // Prevent caching of user data
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        console.log('=== Current User Check ===');
        console.log('Session ID:', req.sessionID);
        console.log('Session:', JSON.stringify(req.session, null, 2));
        console.log('Session userId:', req.session?.userId);
        console.log('Cookies:', req.headers.cookie);
        console.log('Request protocol:', req.protocol);
        console.log('Request secure:', req.secure);
        console.log('X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
        console.log('X-Forwarded-Host:', req.headers['x-forwarded-host']);
        console.log('Remote-User (from Authelia):', req.headers['remote-user']);
        console.log('User-Agent:', req.headers['user-agent']);
        console.log('Referer:', req.headers.referer);
        
        // Check both session.userId (regular login) and passport.user (OIDC login)
        const userId = req.session?.userId || req.session?.passport?.user;
        
        if (userId) {
            const user = await User.findByPk(userId, {
                attributes: [
                    'uid',
                    'email',
                    'name',
                    'surname',
                    'language',
                    'appearance',
                    'timezone',
                    'oidc_sub',
                    'oidc_provider',
                ],
            });
            if (user) {
                console.log('✅ User found:', user.email, `(ID: ${userId})`);
                
                // CRITICAL: If this is an OIDC user and Authelia is providing a Remote-User header,
                // verify that the authenticated SSO user matches the session user
                const remoteUser = req.headers['remote-user'];
                const isOidcUser = !!(user.oidc_sub && user.oidc_provider);
                
                if (isOidcUser && remoteUser) {
                    console.log(`🔍 SSO Validation: Session user="${user.email}" vs Authelia user="${remoteUser}"`);
                    
                    // Check if the remote user matches the session user
                    // Remote-User from Authelia might be username or email
                    const remoteUserMatches = 
                        user.email === remoteUser || 
                        user.name === remoteUser ||
                        user.email.split('@')[0] === remoteUser; // Check username part
                    
                    if (!remoteUserMatches) {
                        console.log(`⚠️ SSO user mismatch detected! Session has ${user.email} but Authelia authenticated ${remoteUser}`);
                        console.log('🔄 Clearing stale session - user needs to re-authenticate');
                        
                        // Destroy the stale session
                        req.session.destroy((err) => {
                            if (err) {
                                console.error('Error destroying session:', err);
                            }
                        });
                        
                        // Return null user to force re-authentication
                        return res.json({ user: null });
                    }
                    
                    console.log('✅ SSO user validated - session matches authenticated user');
                }
                
                const admin = await isAdmin(user.uid);
                return res.json({
                    user: {
                        uid: user.uid,
                        email: user.email,
                        name: user.name,
                        surname: user.surname,
                        language: user.language,
                        appearance: user.appearance,
                        timezone: user.timezone,
                        is_admin: admin,
                        is_oidc_user: isOidcUser,
                    },
                });
            } else {
                console.log('❌ User not found in database for userId:', userId);
            }
        } else {
            console.log('❌ No session or userId in session');
            console.log('Session keys:', req.session ? Object.keys(req.session) : 'null');
        }

        res.json({ user: null });
    } catch (error) {
        logError('Error fetching current user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        // Prevent caching of login response
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Invalid login parameters.' });
        }

        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(401).json({ errors: ['Invalid credentials'] });
        }

        const isValidPassword = await User.checkPassword(
            password,
            user.password_digest
        );
        if (!isValidPassword) {
            return res.status(401).json({ errors: ['Invalid credentials'] });
        }

        // Regenerate session to prevent session fixation attacks
        // and ensure a completely fresh session for the new user
        const oldSessionData = req.session;
        req.session.regenerate((err) => {
            if (err) {
                logError('Session regeneration error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            // Set the new user ID in the regenerated session
            req.session.userId = user.id;

            req.session.save(async (err) => {
                if (err) {
                    logError('Session save error:', err);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                const admin = await isAdmin(user.uid);
                res.json({
                    user: {
                        uid: user.uid,
                        email: user.email,
                        name: user.name,
                        surname: user.surname,
                        language: user.language,
                        appearance: user.appearance,
                        timezone: user.timezone,
                        is_admin: admin,
                    },
                });
            });
        });
    } catch (error) {
        logError('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Logout
router.get('/logout', (req, res) => {
    // Prevent caching of logout response
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

    req.session.destroy((err) => {
        if (err) {
            logError('Logout error:', err);
            return res.status(500).json({ error: 'Could not log out' });
        }

        // Clear the session cookie to ensure complete logout
        res.clearCookie('tududi.sid', {
            path: '/',
            httpOnly: true,
            secure: 'auto',
            sameSite: 'lax'
        });

        res.json({ message: 'Logged out successfully' });
    });
});

// OIDC Logout - destroys session and redirects to OIDC provider logout
router.get('/auth/oidc/logout', (req, res) => {
    const oidcConfig = config.credentials?.oidc;
    
    // Destroy the local session
    req.session.destroy((err) => {
        if (err) {
            logError('OIDC Logout error:', err);
            return res.status(500).json({ error: 'Could not log out' });
        }

        // Clear the session cookie to ensure complete logout
        res.clearCookie('tududi.sid', {
            path: '/',
            httpOnly: true,
            secure: 'auto',
            sameSite: 'lax'
        });

        // If OIDC is configured and has an end_session_endpoint or logout URL
        if (config.oidcEnabled && oidcConfig) {
            // Construct the OIDC provider logout URL
            // For Authelia, this is typically: https://auth.example.com/logout
            const logoutUrl = oidcConfig.logoutUrl || `${oidcConfig.issuer}/logout`;
            
            // Add post_logout_redirect_uri to return user to login page
            const postLogoutRedirectUri = encodeURIComponent(config.frontendUrl + '/login');
            const fullLogoutUrl = `${logoutUrl}?post_logout_redirect_uri=${postLogoutRedirectUri}`;
            
            console.log(`✅ OIDC logout - redirecting to: ${fullLogoutUrl}`);
            
            // Redirect to OIDC provider's logout endpoint
            return res.redirect(fullLogoutUrl);
        }

        // Fallback to regular logout if OIDC not configured
        res.json({ message: 'Logged out successfully' });
    });
});

// OIDC Local Logout - only destroys local session without logging out of OIDC provider
// This is useful when user wants to switch accounts without logging out of the SSO provider
router.get('/auth/oidc/logout/local', (req, res) => {
    console.log('⚠️ OIDC local logout - clearing Tududi session only');
    
    // Destroy the local session only
    req.session.destroy((err) => {
        if (err) {
            logError('OIDC Local Logout error:', err);
            return res.status(500).json({ error: 'Could not log out' });
        }

        // Clear the session cookie to ensure complete logout
        res.clearCookie('tududi.sid', {
            path: '/',
            httpOnly: true,
            secure: 'auto',
            sameSite: 'lax'
        });

        console.log('✅ Local session cleared, redirecting to login');
        // Redirect to login page, which will trigger OIDC re-authentication
        res.redirect(config.frontendUrl + '/login?oidc_local_logout=true');
    });
});

// OIDC Configuration endpoint
router.get('/auth/oidc/config', (req, res) => {
    res.json({
        enabled: config.oidcEnabled || false,
    });
});

// OIDC Login
router.get(
    '/auth/oidc/login',
    (req, res, next) => {
        if (!config.oidcEnabled) {
            return res.status(400).json({ error: 'OIDC is not enabled' });
        }
        next();
    },
    passport.authenticate('oidc')
);

// OIDC Callback
router.get(
    '/auth/oidc/callback',
    (req, res, next) => {
        if (!config.oidcEnabled) {
            return res.status(400).json({ error: 'OIDC is not enabled' });
        }
        next();
    },
    (req, res, next) => {
        passport.authenticate('oidc', (err, user, info) => {
            console.log('=== OIDC Callback Handler ===');
            console.log('Error:', err);
            console.log('User from SSO:', user ? `ID: ${user.id}, Email: ${user.email}` : 'null');
            console.log('Info:', info);
            console.log('Current session userId:', req.session?.userId);
            console.log('Session before login:', req.session);
            
            if (err) {
                console.error('OIDC authentication error:', err);
                console.error('Error details:', JSON.stringify(err, null, 2));
                return res.redirect(
                    config.frontendUrl + '/login?password=true&error=auth_failed'
                );
            }
            
            if (!user) {
                console.error('OIDC authentication failed - no user returned');
                console.error('Info:', info);
                return res.redirect(
                    config.frontendUrl + '/login?password=true&error=no_user'
                );
            }

            // Check if there's an existing session with a different user
            const existingUserId = req.session?.userId;
            if (existingUserId && existingUserId !== user.id) {
                console.log(`⚠️ Session switch detected: existing user ID ${existingUserId} → new user ID ${user.id} (${user.email})`);
                console.log('Destroying old session and creating new one');
            }

            // Regenerate session to prevent session fixation and ensure clean state
            // This is especially important when switching between SSO users
            req.session.regenerate((err) => {
                if (err) {
                    console.error('Session regeneration error:', err);
                    return res.redirect(
                        config.frontendUrl + '/login?password=true&error=session_regeneration_failed'
                    );
                }
                
                console.log('Session regenerated successfully');
                console.log('New Session ID:', req.sessionID);

                // Set session userId FIRST before passport login
                // This ensures the session has the correct user ID immediately
                req.session.userId = user.id;
                
                // Mark that this is an OIDC login for logout handling
                req.session.isOidcLogin = true;
                
                req.logIn(user, (err) => {
                    if (err) {
                        console.error('Session login error:', err);
                        return res.redirect(
                            config.frontendUrl + '/login?password=true&error=session_failed'
                        );
                    }
                    
                    console.log('User logged in via passport');
                    console.log('Session after login:', req.session);
                    
                    req.session.save((err) => {
                        if (err) {
                            console.error('Session save error:', err);
                            return res.redirect(
                                config.frontendUrl + '/login?password=true&error=session_save_failed'
                            );
                        }
                        
                        console.log('Session saved successfully');
                        console.log('Session cookie:', req.session.cookie);
                        console.log('Session cookie settings:', {
                            secure: req.session.cookie.secure,
                            httpOnly: req.session.cookie.httpOnly,
                            sameSite: req.session.cookie.sameSite,
                            domain: req.session.cookie.domain,
                            path: req.session.cookie.path,
                        });
                        console.log('Request headers:', {
                            'x-forwarded-proto': req.headers['x-forwarded-proto'],
                            'x-forwarded-host': req.headers['x-forwarded-host'],
                            'host': req.headers.host,
                        });
                        console.log(`✅ User ${user.email} (ID: ${user.id}) logged in successfully via OIDC`);
                        console.log('Redirecting to:', config.frontendUrl + '/today?oidc_success=true');
                        
                        // Redirect with a special parameter to clear the OIDC flow flag
                        res.redirect(config.frontendUrl + '/today?oidc_success=true');
                    });
                });
            });
        })(req, res, next);
    }
);

module.exports = router;
