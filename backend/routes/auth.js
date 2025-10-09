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
router.get('/oidc/config', (req, res) => {
    res.json({
        enabled: config.oidcEnabled || false,
    });
});

// OIDC Login
router.get(
    '/oidc/login',
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
    '/oidc/callback',
    (req, res, next) => {
        if (!config.oidcEnabled) {
            return res.status(400).json({ error: 'OIDC is not enabled' });
        }
        next();
    },
    passport.authenticate('oidc', { failureRedirect: '/login' }),
    async (req, res) => {
        try {
            // Set session
            req.session.userId = req.user.id;

            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Redirect to frontend
            res.redirect(config.frontendUrl + '/today');
        } catch (error) {
            console.error('OIDC callback error:', error);
            res.redirect('/login?error=auth_failed');
        }
    }
);

module.exports = router;
