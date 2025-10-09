const passport = require('passport');
const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;
const oauth2 = require('oauth').OAuth2;
const { User } = require('../models');
const { getConfig } = require('../config/config');

function initializePassport() {
    const config = getConfig();

    if (!config.oidcEnabled) {
        console.log('OIDC is disabled. Skipping passport configuration.');
        return;
    }

    const oidcConfig = config.credentials.oidc;

    // Serialize user to session
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    // Deserialize user from session
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findByPk(id);
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    });

    // Configure OpenID Connect Strategy
    const strategyConfig = {
        issuer: oidcConfig.issuer,
        clientID: oidcConfig.clientId,
        clientSecret: oidcConfig.clientSecret,
        callbackURL: oidcConfig.callbackUrl,
        scope: ['openid', 'profile', 'email'],
    };

    // Add optional URLs if provided (for Authelia compatibility)
    if (oidcConfig.authorizationUrl) {
        strategyConfig.authorizationURL = oidcConfig.authorizationUrl;
    }
    if (oidcConfig.tokenUrl) {
        strategyConfig.tokenURL = oidcConfig.tokenUrl;
    }
    if (oidcConfig.userInfoUrl) {
        strategyConfig.userInfoURL = oidcConfig.userInfoUrl;
    }

    console.log('OIDC Strategy Config:', {
        issuer: strategyConfig.issuer,
        clientID: strategyConfig.clientID,
        callbackURL: strategyConfig.callbackURL,
        authorizationURL: strategyConfig.authorizationURL,
        tokenURL: strategyConfig.tokenURL,
        userInfoURL: strategyConfig.userInfoURL,
    });

    const strategy = new OpenIDConnectStrategy(
        strategyConfig,
        async (issuer, sub, profile, accessToken, refreshToken, done) => {
            try {
                console.log('OIDC Callback - Issuer:', issuer);
                console.log('OIDC Callback - Sub:', sub);
                console.log('OIDC Callback - Profile:', JSON.stringify(profile, null, 2));
                
                const email =
                    profile.emails && profile.emails[0]
                        ? profile.emails[0].value
                        : profile.email || null;
                const name = profile.displayName || profile.name || email;

                if (!email) {
                    console.error('No email provided by OIDC provider. Profile:', profile);
                    return done(
                        new Error('Email not provided by OIDC provider'),
                        null
                    );
                }

                // Try to find user by OIDC sub first
                let user = await User.findOne({
                    where: { oidc_sub: sub, oidc_provider: issuer },
                });

                if (!user) {
                    // Try to find by email (for linking existing accounts)
                    user = await User.findOne({ where: { email } });

                    if (user) {
                        // Link existing account with OIDC
                        user.oidc_sub = sub;
                        user.oidc_provider = issuer;
                        await user.save();
                        console.log(
                            `Linked existing user ${email} with OIDC`
                        );
                    } else {
                        // Create new user
                        user = await User.create({
                            email,
                            name,
                            oidc_sub: sub,
                            oidc_provider: issuer,
                            password_digest: null, // OIDC users don't need passwords
                            language: 'en',
                            appearance: 'light',
                            timezone: 'UTC',
                        });
                        console.log(`Created new OIDC user: ${email}`);
                    }
                }

                return done(null, user);
            } catch (error) {
                console.error('OIDC authentication error:', error);
                return done(error, null);
            }
        }
    );

    // Override the _oauth2.getOAuthAccessToken method to use client_secret_basic
    const originalGetOAuthAccessToken = strategy._oauth2.getOAuthAccessToken.bind(strategy._oauth2);
    strategy._oauth2.getOAuthAccessToken = function(code, params, callback) {
        // Force use of Basic Authentication for token endpoint
        this._useAuthorizationHeaderForGET = true;
        
        // Remove client_id and client_secret from POST body (they'll be in Authorization header)
        const modifiedParams = { ...params };
        delete modifiedParams.client_id;
        delete modifiedParams.client_secret;
        
        // Call original with modified params - credentials will be sent in Authorization header
        return originalGetOAuthAccessToken(code, modifiedParams, callback);
    };
    
    // Ensure the oauth2 client uses auth header
    strategy._oauth2.useAuthorizationHeaderforGET(true);

    passport.use('oidc', strategy);

    console.log('Passport configured for OIDC authentication');
}

module.exports = { initializePassport };
