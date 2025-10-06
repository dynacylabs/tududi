const express = require('express');
const crypto = require('crypto');
const { User } = require('../models');
const { getConfig } = require('../config/config');
const { getOIDCClient, getAuthorizationUrl, handleCallback } = require('../services/oidcService');

const router = express.Router();

/**
 * Initiate OIDC login flow
 */
router.get('/oidc/login', (req, res) => {
    try {
        const config = getConfig();
        
        if (!config.oidc.enabled) {
            return res.status(400).json({ error: 'OIDC authentication is not enabled' });
        }

        const client = getOIDCClient();
        if (!client) {
            return res.status(500).json({ error: 'OIDC client not initialized' });
        }

        // Generate and store state parameter for CSRF protection
        const state = crypto.randomBytes(32).toString('hex');
        req.session.oidcState = state;

        // Generate authorization URL
        const authUrl = getAuthorizationUrl(state);
        
        res.json({ authUrl });
    } catch (error) {
        console.error('OIDC login error:', error);
        res.status(500).json({ error: 'Failed to initiate OIDC login' });
    }
});

/**
 * Handle OIDC callback
 */
router.get('/oidc/callback', async (req, res) => {
    try {
        const config = getConfig();
        
        if (!config.oidc.enabled) {
            return res.status(400).json({ error: 'OIDC authentication is not enabled' });
        }

        const client = getOIDCClient();
        if (!client) {
            return res.status(500).json({ error: 'OIDC client not initialized' });
        }

        // Verify state parameter
        const state = req.session.oidcState;
        if (!state || state !== req.query.state) {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }

        // Clear state from session
        delete req.session.oidcState;

        // Handle callback and get user info
        const { userinfo } = await handleCallback(req.query, state);

        // Extract user information from OIDC claims
        const email = userinfo.email || userinfo.preferred_username;
        const name = userinfo.name || userinfo.preferred_username || email;
        const oidcSub = userinfo.sub;

        if (!email) {
            return res.status(400).json({ error: 'Email not provided by OIDC provider' });
        }

        // Find or create user
        let user = await User.findOne({ where: { oidc_sub: oidcSub } });

        if (!user) {
            // Check if user exists with this email
            user = await User.findOne({ where: { email } });
            
            if (user) {
                // Link existing user to OIDC
                user.oidc_sub = oidcSub;
                user.oidc_provider = config.oidc.issuer;
                await user.save();
            } else {
                // Create new user
                user = await User.create({
                    email,
                    name,
                    oidc_sub: oidcSub,
                    oidc_provider: config.oidc.issuer,
                    // For OIDC users, we don't need a password
                    password_digest: crypto.randomBytes(32).toString('hex'),
                });
            }
        }

        // Update last login time and name if changed
        if (user.name !== name) {
            user.name = name;
        }
        await user.save();

        // Set session
        req.session.userId = user.id;
        req.session.authMethod = 'oidc';

        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Redirect to frontend
        const frontendUrl = config.frontendUrl || 'http://localhost:8080';
        res.redirect(`${frontendUrl}/oidc-callback?success=true`);
    } catch (error) {
        console.error('OIDC callback error:', error);
        const config = getConfig();
        const frontendUrl = config.frontendUrl || 'http://localhost:8080';
        res.redirect(`${frontendUrl}/oidc-callback?error=${encodeURIComponent(error.message)}`);
    }
});

/**
 * Check OIDC configuration status
 */
router.get('/oidc/status', (req, res) => {
    const config = getConfig();
    const client = getOIDCClient();
    
    res.json({
        enabled: config.oidc.enabled,
        configured: client !== null,
        issuer: config.oidc.enabled ? config.oidc.issuer : null,
    });
});

module.exports = router;
