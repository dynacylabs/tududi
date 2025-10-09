const passport = require('passport');
const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;
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

    passport.use(
        'oidc',
        new OpenIDConnectStrategy(
            strategyConfig,
            async (issuer, profile, done) => {
                try {
                    const sub = profile.id;
                    const email =
                        profile.emails && profile.emails[0]
                            ? profile.emails[0].value
                            : null;
                    const name = profile.displayName || email;

                    if (!email) {
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
        )
    );

    console.log('Passport configured for OIDC authentication');
}

module.exports = { initializePassport };
