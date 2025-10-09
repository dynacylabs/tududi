const express = require('express');
const passport = require('passport');
const { User } = require('../models');
const { getConfig } = require('../config/config');
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
        if (req.session && req.session.userId) {
            const user = await User.findByPk(req.session.userId, {
                attributes: [
                    'uid',
                    'email',
                    'language',
                    'appearance',
                    'timezone',
                ],
            });
            if (user) {
                return res.json({ user });
            }
        }

        res.json({ user: null });
    } catch (error) {
        console.error('Error fetching current user:', error);
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

        res.json({
            user: {
                uid: user.uid,
                email: user.email,
                language: user.language,
                appearance: user.appearance,
                timezone: user.timezone,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ error: 'Could not log out' });
        }

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
            if (err) {
                console.error('OIDC authentication error:', err);
                console.error('Error details:', JSON.stringify(err, null, 2));
                return res.redirect(
                    config.frontendUrl + '/login?error=auth_failed'
                );
            }
            
            if (!user) {
                console.error('OIDC authentication failed - no user returned');
                console.error('Info:', info);
                return res.redirect(
                    config.frontendUrl + '/login?error=no_user'
                );
            }

            req.logIn(user, (err) => {
                if (err) {
                    console.error('Session login error:', err);
                    return res.redirect(
                        config.frontendUrl + '/login?error=session_failed'
                    );
                }
                
                // Set session userId explicitly
                req.session.userId = user.id;
                
                req.session.save((err) => {
                    if (err) {
                        console.error('Session save error:', err);
                        return res.redirect(
                            config.frontendUrl + '/login?error=session_save_failed'
                        );
                    }
                    
                    console.log(`User ${user.email} logged in successfully via OIDC`);
                    res.redirect(config.frontendUrl + '/today');
                });
            });
        })(req, res, next);
    }
);

module.exports = router;
