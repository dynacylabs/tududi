#!/bin/bash

# OIDC Setup Helper Script
# This script helps configure OIDC authentication for Tududi

set -e

echo "================================"
echo "Tududi OIDC Setup Helper"
echo "================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file..."
    touch .env
fi

# Function to add or update env variable
add_or_update_env() {
    local key=$1
    local value=$2
    
    if grep -q "^${key}=" .env 2>/dev/null; then
        # Update existing
        sed -i "s|^${key}=.*|${key}=${value}|" .env
    else
        # Add new
        echo "${key}=${value}" >> .env
    fi
}

echo "Step 1: Enable OIDC"
echo "-------------------"
read -p "Enable OIDC authentication? (yes/no) [yes]: " enable_oidc
enable_oidc=${enable_oidc:-yes}

if [ "$enable_oidc" != "yes" ]; then
    echo "OIDC will not be enabled."
    add_or_update_env "OIDC_ENABLED" "false"
    exit 0
fi

add_or_update_env "OIDC_ENABLED" "true"

echo ""
echo "Step 2: OIDC Provider Configuration"
echo "------------------------------------"
read -p "Enter OIDC Issuer URL (e.g., https://auth.example.com): " oidc_issuer
add_or_update_env "OIDC_ISSUER" "$oidc_issuer"

read -p "Enter OIDC Client ID [tududi]: " oidc_client_id
oidc_client_id=${oidc_client_id:-tududi}
add_or_update_env "OIDC_CLIENT_ID" "$oidc_client_id"

read -p "Enter OIDC Client Secret: " oidc_client_secret
add_or_update_env "OIDC_CLIENT_SECRET" "$oidc_client_secret"

echo ""
echo "Step 3: Callback Configuration"
echo "-------------------------------"
read -p "Enter backend URL (e.g., http://localhost:3002) [http://localhost:3002]: " backend_url
backend_url=${backend_url:-http://localhost:3002}
oidc_redirect_uri="${backend_url}/api/oidc/callback"
add_or_update_env "OIDC_REDIRECT_URI" "$oidc_redirect_uri"

read -p "Enter frontend URL (e.g., http://localhost:8080) [http://localhost:8080]: " frontend_url
frontend_url=${frontend_url:-http://localhost:8080}
add_or_update_env "FRONTEND_URL" "$frontend_url"

echo ""
echo "Step 4: Scopes"
echo "--------------"
read -p "Enter OIDC scopes [openid profile email]: " oidc_scope
oidc_scope=${oidc_scope:-openid profile email}
add_or_update_env "OIDC_SCOPE" "$oidc_scope"

echo ""
echo "Step 5: Session Secret"
echo "----------------------"
if ! grep -q "^TUDUDI_SESSION_SECRET=" .env 2>/dev/null; then
    echo "Generating session secret..."
    session_secret=$(openssl rand -hex 32)
    add_or_update_env "TUDUDI_SESSION_SECRET" "$session_secret"
    echo "Session secret generated."
else
    echo "Session secret already configured."
fi

echo ""
echo "Configuration saved to .env file!"
echo ""
echo "================================"
echo "Next Steps:"
echo "================================"
echo ""
echo "1. Run database migration:"
echo "   npm run migration:run"
echo ""
echo "2. Configure your OIDC provider (e.g., Authelia) with:"
echo "   Client ID: $oidc_client_id"
echo "   Client Secret: $oidc_client_secret"
echo "   Redirect URI: $oidc_redirect_uri"
echo ""
echo "3. For Authelia, add this to configuration.yml:"
echo ""
echo "   identity_providers:"
echo "     oidc:"
echo "       clients:"
echo "         - id: $oidc_client_id"
echo "           secret: <hashed-secret>  # Hash with: docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password '$oidc_client_secret'"
echo "           redirect_uris:"
echo "             - $oidc_redirect_uri"
echo "           scopes:"
echo "             - openid"
echo "             - profile"
echo "             - email"
echo "           grant_types:"
echo "             - authorization_code"
echo "           response_types:"
echo "             - code"
echo ""
echo "4. Start the application:"
echo "   npm start"
echo ""
echo "5. Test OIDC:"
echo "   curl http://localhost:3002/api/oidc/status"
echo ""
echo "For detailed documentation, see:"
echo "- docs/OIDC_QUICKSTART.md"
echo "- docs/OIDC_SETUP.md"
echo ""
echo "Setup complete!"
