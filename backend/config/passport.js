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
        skipUserProfile: false, // Ensure we fetch user profile
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
        async (issuer, profile, done) => {
            try {
                console.log('OIDC Callback - Issuer:', issuer);
                console.log('OIDC Callback - Profile:', JSON.stringify(profile, null, 2));
                
                // Extract sub from profile
                const sub = profile.id || profile.sub;
                
                if (!sub) {
                    console.error('No sub found in profile');
                    return done(new Error('Subject identifier not found'), null);
                }
                
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

                console.log(`Looking for user with oidc_sub: ${sub}, found: ${!!user}`);

                if (!user) {
                    // Try to find by email (for linking existing accounts)
                    user = await User.findOne({ where: { email } });
                    
                    console.log(`Looking for user with email: ${email}, found: ${!!user}`);

                    if (user) {
                        // Link existing account with OIDC
                        console.log(`Linking existing user ${email} (id: ${user.id}) with OIDC`);
                        user.oidc_sub = sub;
                        user.oidc_provider = issuer;
                        await user.save();
                        console.log(
                            `✅ Linked existing user ${email} with OIDC`
                        );
                    } else {
                        // Create new user
                        console.log(`Creating new user with email: ${email}, sub: ${sub}`);
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
                        console.log(`✅ Created new OIDC user: ${email} (id: ${user.id})`);
                    }
                } else {
                    console.log(`✅ Found existing OIDC user: ${user.email} (id: ${user.id})`);
                }

                return done(null, user);
            } catch (error) {
                console.error('OIDC authentication error:', error);
                return done(error, null);
            }
        }
    );

    // CRITICAL FIX: Override OAuth2 client to use client_secret_basic
    // The oauth library sends credentials in POST body by default (client_secret_post)
    // Authelia requires them in Authorization header (client_secret_basic)
    
    // Set the client authentication method to use Basic Auth
    strategy._oauth2._clientSecret = oidcConfig.clientSecret;
    strategy._oauth2._useAuthorizationHeaderForGET = false;
    
    // Override the internal _request method to intercept and modify the token request
    const originalRequest = strategy._oauth2._request.bind(strategy._oauth2);
    strategy._oauth2._request = function(method, url, headers, post_body, access_token, callback) {
        // Only modify token endpoint requests
        if (url.includes('/token')) {
            console.log('Intercepting token request - forcing client_secret_basic');
            
            // Add Basic Auth header
            const credentials = Buffer.from(
                `${oidcConfig.clientId}:${oidcConfig.clientSecret}`
            ).toString('base64');
            headers = headers || {};
            headers['Authorization'] = `Basic ${credentials}`;
            
            // Remove client credentials from POST body if present
            if (post_body) {
                post_body = post_body
                    .replace(/&?client_id=[^&]*/g, '')
                    .replace(/&?client_secret=[^&]*/g, '')
                    .replace(/^&/, ''); // Remove leading &
                console.log('Cleaned POST body:', post_body);
            }
        }
        
        // Call original request with modified params
        return originalRequest(method, url, headers, post_body, access_token, callback);
    };

    passport.use('oidc', strategy);

    console.log('Passport configured for OIDC authentication');
}

module.exports = { initializePassport };
