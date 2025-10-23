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
        
        // CRITICAL: If this is an OIDC user, verify SSO authentication state
        const remoteUser = req.headers['remote-user'];
        const isOidcUser = !!(user.oidc_sub && user.oidc_provider);
        
        if (isOidcUser) {
            // First check: Validate session OIDC sub matches user's OIDC sub
            // This catches cases where the session is stale or belongs to a different SSO user
            const sessionOidcSub = req.session?.oidc_sub;
            if (sessionOidcSub && sessionOidcSub !== user.oidc_sub) {
                console.log(`⚠️ [Auth Middleware] SESSION OIDC SUB MISMATCH!`);
                console.log(`   Path: ${req.path}`);
                console.log(`   Session OIDC sub: ${sessionOidcSub}`);
                console.log(`   User's OIDC sub: ${user.oidc_sub}`);
                console.log(`   User email: ${user.email} (ID: ${userId})`);
                console.log(`   🔄 Destroying invalid session`);
                
                const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
                res.clearCookie('tududi.sid', {
                    path: '/',
                    httpOnly: true,
                    secure: isSecure,
                    sameSite: 'lax'
                });
                
                req.session.destroy((err) => {
                    if (err) {
                        console.error('Error destroying session:', err);
                    }
                });
                
                return res.status(401).json({ 
                    error: 'Authentication required',
                    reason: 'sso_session_mismatch'
                });
            }
            
            // Second check: If Remote-User header is provided by Authelia, validate it matches the session user
            if (remoteUser) {
                // Check if the remote user matches the session user
                // Remote-User from Authelia might be username or email
                const remoteUserMatches = 
                    user.email === remoteUser || 
                    user.name === remoteUser ||
                    user.email.split('@')[0] === remoteUser;
                
                if (!remoteUserMatches) {
                    console.log(`⚠️ [Auth Middleware] SSO USER MISMATCH DETECTED!`);
                    console.log(`   Path: ${req.path}`);
                    console.log(`   Tududi session: ${user.email} (ID: ${userId})`);
                    console.log(`   Authelia authenticated: ${remoteUser}`);
                    console.log(`   🔄 Destroying stale session`);
                    
                    // Clear the session cookie immediately
                    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
                    res.clearCookie('tududi.sid', {
                        path: '/',
                        httpOnly: true,
                        secure: isSecure,
                        sameSite: 'lax'
                    });
                    
                    req.session.destroy((err) => {
                        if (err) {
                            console.error('Error destroying session:', err);
                        }
                    });
                    
                    return res.status(401).json({ 
                        error: 'Authentication required',
                        reason: 'sso_user_mismatch'
                    });
                }
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
