# SSO Session Validation Fix

## Problem

When logging out of Authelia (SSO provider) and logging in as a different user, Tududi continued to show the old user's session instead of re-authenticating with the new user.

### Example Flow (Before Fix)
1. User A logs into Authelia → Tududi logs in User A ✅
2. User A logs out of Authelia (visits auth.austinconn.org/logout)
3. User B logs into Authelia 
4. User B visits todo.austinconn.org → **Still shows User A logged in** ❌

### Root Cause

Tududi's session cookie persisted even after Authelia logout. When User B authenticated through Authelia, Tududi saw its old session cookie for User A and never checked with the SSO provider to verify the user had changed.

## Solution

Added **SSO session validation** that compares the authenticated user from Authelia (via the `Remote-User` header) with the user in Tududi's session. If they don't match, the stale session is destroyed and the user is forced to re-authenticate.

## Changes Made

### 1. Updated `/current_user` Endpoint (`backend/routes/auth.js`)

Added validation logic:

```javascript
// Get the Remote-User header set by Authelia via nginx
const remoteUser = req.headers['remote-user'];
const isOidcUser = !!(user.oidc_sub && user.oidc_provider);

if (isOidcUser && remoteUser) {
    // Check if the remote user matches the session user
    const remoteUserMatches = 
        user.email === remoteUser || 
        user.name === remoteUser ||
        user.email.split('@')[0] === remoteUser;
    
    if (!remoteUserMatches) {
        // SSO user mismatch - destroy stale session
        req.session.destroy();
        return res.json({ user: null });
    }
}
```

### 2. Updated Auth Middleware (`backend/middleware/auth.js`)

Added the same validation to protected routes:

```javascript
const remoteUser = req.headers['remote-user'];
const isOidcUser = !!(user.oidc_sub && user.oidc_provider);

if (isOidcUser && remoteUser) {
    const remoteUserMatches = 
        user.email === remoteUser || 
        user.name === remoteUser ||
        user.email.split('@')[0] === remoteUser;
    
    if (!remoteUserMatches) {
        req.session.destroy();
        return res.status(401).json({ error: 'Authentication required' });
    }
}
```

## How It Works

1. **Nginx Proxy Manager** intercepts all requests to `todo.austinconn.org`
2. **Authelia** validates the user and sets the `Remote-User` header
3. **Tududi** receives the request with the `Remote-User` header
4. **Validation logic** compares:
   - `Remote-User` header (current SSO user from Authelia)
   - Session user (stored in Tududi's session)
5. If they **don't match**:
   - Tududi destroys the stale session
   - User is forced to re-authenticate
   - New session is created with correct user

## Expected Flow (After Fix)

1. User A logs into Authelia → Tududi logs in User A ✅
2. User A logs out of Authelia
3. User B logs into Authelia
4. User B visits todo.austinconn.org
5. Tududi detects mismatch: session=User A, Authelia=User B
6. Tududi destroys User A's session ✅
7. User B is redirected to OIDC login ✅
8. User B logs in → Tududi logs in User B ✅

## Testing

### Test Scenario 1: Switch Users
```
1. Login to Authelia as user_a@example.com
2. Visit todo.austinconn.org → Should show User A logged in
3. Go to auth.austinconn.org/logout
4. Login to Authelia as user_b@example.com
5. Visit todo.austinconn.org → Should show "Redirecting to SSO..." and log in User B
```

### Test Scenario 2: Same User Re-login
```
1. Login to Authelia as user_a@example.com
2. Visit todo.austinconn.org → Should show User A logged in
3. Go to auth.austinconn.org/logout
4. Login to Authelia as user_a@example.com (same user)
5. Visit todo.austinconn.org → Should work normally, staying logged in as User A
```

## Deployment

```bash
cd ~/myservices
git pull origin oidc-support
docker-compose build
docker-compose up -d
docker logs -f todo
```

## Logs to Look For

When switching users, you should see:

```
🔍 SSO Validation: Session user="userA@example.com" vs Authelia user="userB"
⚠️ SSO user mismatch detected! Session has userA@example.com but Authelia authenticated userB
🔄 Clearing stale session - user needs to re-authenticate
```

Then on re-authentication:

```
✅ User userB@example.com (ID: X) logged in successfully via OIDC
```

## Important Notes

- This only applies to **OIDC users** (users with `oidc_sub` and `oidc_provider`)
- **Password-based login users** are not affected by this validation
- The `Remote-User` header must be set by Authelia via nginx for this to work
- The validation checks multiple formats: email, username, and email prefix
