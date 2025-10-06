const { Issuer } = require('openid-client');
const { getConfig } = require('../config/config');

let oidcClient = null;

/**
 * Initialize OIDC client
 */
async function initializeOIDC() {
    const config = getConfig();
    
    if (!config.oidc.enabled) {
        console.log('OIDC authentication is disabled');
        return null;
    }

    if (!config.oidc.issuer || !config.oidc.clientId || !config.oidc.clientSecret) {
        console.warn('OIDC is enabled but configuration is incomplete. Skipping OIDC initialization.');
        return null;
    }

    try {
        console.log('Initializing OIDC client...');
        const issuer = await Issuer.discover(config.oidc.issuer);
        
        oidcClient = new issuer.Client({
            client_id: config.oidc.clientId,
            client_secret: config.oidc.clientSecret,
            redirect_uris: [config.oidc.redirectUri],
            response_types: ['code'],
        });

        console.log('OIDC client initialized successfully');
        return oidcClient;
    } catch (error) {
        console.error('Failed to initialize OIDC client:', error);
        throw error;
    }
}

/**
 * Get OIDC client instance
 */
function getOIDCClient() {
    return oidcClient;
}

/**
 * Generate authorization URL
 */
function getAuthorizationUrl(state) {
    if (!oidcClient) {
        throw new Error('OIDC client not initialized');
    }

    const config = getConfig();
    
    return oidcClient.authorizationUrl({
        scope: config.oidc.scope,
        state: state,
    });
}

/**
 * Handle OIDC callback
 */
async function handleCallback(callbackParams, state) {
    if (!oidcClient) {
        throw new Error('OIDC client not initialized');
    }

    const config = getConfig();
    
    const tokenSet = await oidcClient.callback(
        config.oidc.redirectUri,
        callbackParams,
        { state }
    );

    const userinfo = await oidcClient.userinfo(tokenSet);
    
    return {
        tokenSet,
        userinfo,
    };
}

module.exports = {
    initializeOIDC,
    getOIDCClient,
    getAuthorizationUrl,
    handleCallback,
};
