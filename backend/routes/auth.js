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
        console.log('=== Current User Check ===');
        console.log('Session ID:', req.sessionID);
        console.log('Session:', req.session);
        console.log('Session userId:', req.session?.userId);
        console.log('Cookies:', req.headers.cookie);
        
        if (req.session && req.session.userId) {
            const user = await User.findByPk(req.session.userId, {
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
                console.log('✅ User found:', user.email);
                const admin = await isAdmin(user.uid);
                const isOidcUser = !!(user.oidc_sub && user.oidc_provider);
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
                console.log('❌ User not found in database for userId:', req.session.userId);
            }
        } else {
            console.log('❌ No session or userId in session');
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

        req.session.userId = user.id;

        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

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
    } catch (error) {
        logError('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            logError('Logout error:', err);
            return res.status(500).json({ error: 'Could not log out' });
        }

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
                        console.log(`✅ User ${user.email} (ID: ${user.id}) logged in successfully via OIDC`);
                        console.log('Redirecting to:', config.frontendUrl + '/today');
                        
                        res.redirect(config.frontendUrl + '/today');
                    });
                });
            });
        })(req, res, next);
    }
);

module.exports = router;
