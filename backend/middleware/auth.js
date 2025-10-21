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
