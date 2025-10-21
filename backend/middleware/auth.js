const { User } = require('../models');

const requireAuth = async (req, res, next) => {
    try {
        // Skip authentication for health check, login routes, current_user, and OIDC routes
        const skipPaths = [
            '/api/health',
            '/api/login',
            '/api/current_user',
            '/api/auth/oidc/config',
            '/api/auth/oidc/login',
            '/api/auth/oidc/callback',
        ];
        if (skipPaths.includes(req.path) || req.originalUrl === '/api/health') {
            return next();
        }

        // Check both session.userId (regular login) and passport.user (OIDC login)
        const userId = req.session?.userId || req.session?.passport?.user;
        
        if (!req.session || !userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            req.session.destroy();
            return res.status(401).json({ error: 'User not found' });
        }
        
        // CRITICAL: If this is an OIDC user and Authelia is providing a Remote-User header,
        // verify that the authenticated SSO user matches the session user
        const remoteUser = req.headers['remote-user'];
        const isOidcUser = !!(user.oidc_sub && user.oidc_provider);
        
        if (isOidcUser && remoteUser) {
            // Check if the remote user matches the session user
            const remoteUserMatches = 
                user.email === remoteUser || 
                user.name === remoteUser ||
                user.email.split('@')[0] === remoteUser;
            
            if (!remoteUserMatches) {
                console.log(`⚠️ [Auth Middleware] SSO user mismatch! Session: ${user.email}, Authelia: ${remoteUser}`);
                req.session.destroy();
                return res.status(401).json({ error: 'Authentication required' });
            }
        }

        req.currentUser = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
};

module.exports = {
    requireAuth,
};
